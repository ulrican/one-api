package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// payOrderReconcileThrottle 主动查单节流：tradeNo -> 上次主动查单 unix 秒。
// 前端约 2s 轮询一次，若每次都直连支付平台查单压力过大；同一订单至少间隔 5s 才查一次。
var payOrderReconcileThrottle sync.Map

func parseAmountOptions() []float64 {
	options := make([]float64, 0)
	if err := json.Unmarshal([]byte(config.TopupAmountOptions), &options); err != nil {
		return make([]float64, 0)
	}
	return options
}

// GetPayConfig 用户端支付配置（决定钱包页渲染方式）
func GetPayConfig(c *gin.Context) {
	// Task4-10b：直连模式微信 Native 恒可用（凭证内置），支付宝订单码仅 AlipayEnabled 时开放；
	// 易支付模式维持两种方式（由易支付网关侧支持情况决定）
	methods := []string{"alipay", "wxpay"}
	if config.PaymentMode == "direct" {
		methods = []string{"wxpay"}
		if config.AlipayEnabled {
			methods = []string{"alipay", "wxpay"}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled":        config.PayEnabled,
			"payment_mode":   config.PaymentMode, // epay | direct
			"amount_options": parseAmountOptions(),
			"min_top_up":     config.MinTopUp,
			"max_top_up":     config.MaxTopUp,
			"price":          config.PayPrice,
			"methods":        methods,
		},
	})
}

type createPayOrderRequest struct {
	Amount float64 `json:"amount"` // 人民币元
	Method string  `json:"method"` // alipay / wxpay
}

// CreatePayOrder 创建充值订单并返回支付跳转地址
func CreatePayOrder(c *gin.Context) {
	if !config.PayEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "在线支付未启用",
		})
		return
	}
	req := createPayOrderRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) || req.Amount < config.MinTopUp || req.Amount > config.MaxTopUp {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("充值金额需在 %.2f ~ %.2f 元之间", config.MinTopUp, config.MaxTopUp),
		})
		return
	}
	if config.PayPrice <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "充值价格未配置，请联系管理员",
		})
		return
	}
	quota := int64(req.Amount / config.PayPrice * config.QuotaPerUnit)
	if quota <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "充值金额过小，无法兑换额度",
		})
		return
	}
	id := c.GetInt("id")
	// 直连带账模式：下单前先校验对应支付方式参数完整，避免先插订单再报错留下脏单
	if config.PaymentMode == "direct" {
		if err := validateDirectPayParams(req.Method); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	}
	order := &model.Order{
		TradeNo:       model.GenerateTradeNo(),
		UserId:        id,
		Amount:        req.Amount,
		Quota:         quota,
		Status:        model.OrderStatusPending,
		PaymentMethod: req.Method,
		CreatedAt:     helper.GetTimestamp(),
		UpdatedAt:     helper.GetTimestamp(),
	}
	if err := model.InsertOrder(order); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "订单创建失败：" + err.Error(),
		})
		return
	}

	// 根据 PaymentMode 发起支付（Task4-11：抽取 launchPay 供充值单/套餐单共用）
	launchPay(c, order, req.Method)
}

// launchPay 根据 PaymentMode 发起支付并返回支付凭据：
// direct=直连（微信 Native 二维码 / 支付宝收银台跳转），默认=易支付跳转
func launchPay(c *gin.Context, order *model.Order, method string) {
	if config.PaymentMode == "direct" {
		createDirectPayOrder(c, order, method)
		return
	}
	// 默认：易支付模式
	payUrl, err := common.BuildEpaySubmitURL(
		config.PayAddress, config.EpayId, config.EpaySecret, method,
		order.TradeNo,
		config.ServerAddress+"/api/user/pay/notify",
		config.ServerAddress+"/topup",
		fmt.Sprintf("充值额度 %s", common.LogQuota(order.Quota)),
		order.Amount,
	)
	if err != nil {
		logger.SysError("failed to build pay url: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "支付网关配置错误，请联系管理员",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"pay_url":  payUrl,
			"trade_no": order.TradeNo,
			"quota":    order.Quota,
			"amount":   order.Amount,
		},
	})
}

// PayNotify 易支付异步回调（公开接口，仅靠签名校验防护）
func PayNotify(c *gin.Context) {
	ctx := c.Request.Context()
	params := make(map[string]string)
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	if c.Request.Method == http.MethodPost {
		_ = c.Request.ParseForm()
		for k, v := range c.Request.PostForm {
			if len(v) > 0 {
				params[k] = v[0]
			}
		}
	}
	// 1. 强制验签，防伪造回调
	if !common.VerifyEpaySign(params, config.EpaySecret) {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	// 2. 非成功状态直接确认，避免支付平台重试风暴
	if params["trade_status"] != "TRADE_SUCCESS" {
		c.String(http.StatusOK, "success")
		return
	}
	tradeNo := params["out_trade_no"]
	if tradeNo == "" {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	// 3. 校验平台商户号归属，防止用其他商户的签名回调蒙混（需与验签密钥同源配置）
	if config.EpayId != "" && params["pid"] != config.EpayId {
		logger.SysError(fmt.Sprintf("pay notify pid mismatch: got %q, want %q, order %s", params["pid"], config.EpayId, tradeNo))
		c.String(http.StatusBadRequest, "fail")
		return
	}
	// 4. 解析实付金额并交由事务内与订单金额强一致校验
	paidAmount, err := strconv.ParseFloat(params["money"], 64)
	if err != nil || math.IsNaN(paidAmount) || paidAmount <= 0 {
		logger.SysError(fmt.Sprintf("pay notify invalid money %q, order %s", params["money"], tradeNo))
		c.String(http.StatusBadRequest, "fail")
		return
	}
	// 5. 事务 + 行锁 + 幂等完成订单并入账（普通充值加额度 / 套餐单开通套餐，均事务内完成）
	order, credited, err := model.FinishOrderTrade(ctx, tradeNo, params["trade_no"], paidAmount)
	if err != nil {
		logger.SysError("pay notify failed: " + err.Error())
		c.String(http.StatusInternalServerError, "fail")
		return
	}
	// 6. 仅首次入账需要刷新用户缓存（额度 + 用户组），网关下次鉴权回源 DB 立即生效
	if credited && order != nil && common.RedisEnabled {
		if err := common.RedisDel(fmt.Sprintf("user_quota:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user quota cache: " + err.Error())
		}
		if err := common.RedisDel(fmt.Sprintf("user_group:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user group cache: " + err.Error())
		}
	}
	c.String(http.StatusOK, "success")
}

// GetPayOrderStatus 前端轮询订单状态（校验订单归属 + 惰性过期）
func GetPayOrderStatus(c *gin.Context) {
	tradeNo := c.Query("trade_no")
	order, err := model.GetOrderByTradeNo(tradeNo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "订单不存在",
		})
		return
	}
	if order.UserId != c.GetInt("id") {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无权查看该订单",
		})
		return
	}
	model.TryExpireOrder(order)
	// 直连模式兜底：订单仍待支付时主动向支付平台查单。
	// 场景：① 本机/内网部署收不到支付平台异步回调（如 localhost 验证）；
	// ② 生产环境回调延迟或丢失。查得已支付则按与回调完全相同的事务链路入账。
	if config.PaymentMode == "direct" && order.Status == model.OrderStatusPending {
		if reconciled := reconcileDirectOrder(c, order); reconciled != nil {
			order = reconciled
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"status":     order.Status,
			"quota":      order.Quota,
			"amount":     order.Amount,
			"created_at": order.CreatedAt,
		},
	})
}

// reconcileDirectOrder 主动查单并在已支付时完成订单入账。
// 返回非 nil 表示订单状态已变化（入账成功或过期），调用方用返回值刷新响应；
// 未支付/查单失败/节流跳过时返回 nil（保持原待支付状态，等下一次轮询）。
func reconcileDirectOrder(c *gin.Context, order *model.Order) *model.Order {
	ctx := c.Request.Context()
	// 下单后 3s 内不查，给二维码展示与用户扫码留时间
	now := helper.GetTimestamp()
	if now-order.CreatedAt < 3 {
		return nil
	}
	if last, ok := payOrderReconcileThrottle.Load(order.TradeNo); ok {
		if ts, _ := last.(int64); now-ts < 5 {
			return nil
		}
	}
	payOrderReconcileThrottle.Store(order.TradeNo, now)

	var platformTradeNo string
	var paidAmount float64
	var state common.TradeQueryState
	var err error
	switch order.PaymentMethod {
	case "wxpay":
		platformTradeNo, paidAmount, state, err = common.QueryWeChatOrder(
			config.WeChatPayMchId, config.WeChatPaySerialNo, config.WeChatPayPrivateKey, order.TradeNo)
	case "alipay":
		platformTradeNo, paidAmount, state, err = common.QueryAlipayOrder(
			config.AlipayAppId, config.AlipayPrivateKey, config.AlipayPublicKey, order.TradeNo)
	default:
		return nil
	}
	if err != nil {
		// 真实异常（网络失败/验签失败/权限错误）才记录日志；
		// 未支付等正常中间态已在 common 层归为 Pending，不会走到这里刷屏
		logger.SysError(fmt.Sprintf("reconcile order %s (%s) query: %s", order.TradeNo, order.PaymentMethod, err.Error()))
		return nil
	}
	switch state {
	case common.TradeQueryPaid:
		// 已支付：走与回调完全相同的事务链路入账
	case common.TradeQueryClosed:
		// 平台终态（已关闭/撤销/支付失败/退款）：订单不可能再支付，本地同步过期
		//（对齐 pay-demo.md 5.3：trade_state=CLOSED 需重新下单）
		if model.MarkOrderExpired(order.TradeNo) {
			logger.SysLog(fmt.Sprintf("order %s closed by platform (%s), marked expired", order.TradeNo, order.PaymentMethod))
			if updated, gerr := model.GetOrderByTradeNo(order.TradeNo); gerr == nil {
				return updated
			}
		}
		return nil
	default:
		// Pending（NOTPAY/WAIT_BUYER_PAY/交易未创建）：正常待支付，静默等下一轮轮询
		return nil
	}
	finished, credited, ferr := model.FinishOrderTrade(ctx, order.TradeNo, platformTradeNo, paidAmount)
	if ferr != nil {
		logger.SysError("reconcile finish order failed: " + ferr.Error())
		return nil
	}
	if credited && finished != nil && common.RedisEnabled {
		if err := common.RedisDel(fmt.Sprintf("user_quota:%d", finished.UserId)); err != nil {
			logger.SysError("failed to refresh user quota cache: " + err.Error())
		}
		if err := common.RedisDel(fmt.Sprintf("user_group:%d", finished.UserId)); err != nil {
			logger.SysError("failed to refresh user group cache: " + err.Error())
		}
	}
	return finished
}

// GetUserOrders 本人订单历史
func GetUserOrders(c *gin.Context) {
	id := c.GetInt("id")
	orders, err := model.GetUserOrders(id, 50)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    orders,
	})
}

// ---------- 直接到账（微信/支付宝原生支付）----------

// validateDirectPayParams 直连带账模式下单前校验。
// Task4-10b：凭证全部代码内置，这里校验发布物完整性（常量/embed PEM 非空）+ 支付宝启用开关。
func validateDirectPayParams(method string) error {
	switch method {
	case "wxpay":
		if config.WeChatPayAppId == "" || config.WeChatPayMchId == "" || config.WeChatPayApiV3Key == "" ||
			config.WeChatPaySerialNo == "" || config.WeChatPayPrivateKey == "" {
			return fmt.Errorf("微信支付内置凭证缺失，请联系管理员检查发布物中的支付凭证")
		}
	case "alipay":
		if !config.AlipayEnabled {
			return fmt.Errorf("支付宝支付未开启")
		}
		if config.AlipayAppId == "" || config.AlipayPrivateKey == "" || config.AlipayPublicKey == "" {
			return fmt.Errorf("支付宝内置凭证缺失，请联系管理员检查发布物中的支付凭证")
		}
	default:
		return fmt.Errorf("不支持的支付方式：%s", method)
	}
	return nil
}

// createDirectPayOrder 直接到账模式：根据支付方式调用微信/支付宝 API
func createDirectPayOrder(c *gin.Context, order *model.Order, method string) {
	switch method {
	case "wxpay":
		createWeChatNativeOrder(c, order)
	case "alipay":
		createAlipayPrecreateOrder(c, order)
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "不支持的支付方式：" + method,
		})
	}
}

// createWeChatNativeOrder 微信 Native 支付（扫码支付）
// 文档：https://pay.weixin.qq.com/docs/merchant/apis/native-payment/native.html
// 成功响应 pay_type=qrcode，前端根据 code_url 渲染二维码
func createWeChatNativeOrder(c *gin.Context, order *model.Order) {
	total := int64(math.Round(order.Amount * 100)) // 单位：分
	codeUrl, err := common.BuildWeChatNativeOrder(
		config.WeChatPayAppId, config.WeChatPayMchId, config.WeChatPaySerialNo, config.WeChatPayPrivateKey,
		order.TradeNo,
		config.ServerAddress+"/api/user/pay/wechat/notify",
		fmt.Sprintf("充值额度 %s", common.LogQuota(order.Quota)),
		total,
	)
	if err != nil {
		logger.SysError("failed to create wechat native order: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "微信下单失败，请稍后重试或联系管理员",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"pay_type": "qrcode",
			"code_url": codeUrl,
			"trade_no": order.TradeNo,
			"quota":    order.Quota,
			"amount":   order.Amount,
		},
	})
}

// createAlipayPrecreateOrder 支付宝当面付订单码（alipay.trade.precreate）
// 文档：https://opendocs.alipay.com/open/02ekfg
// 成功响应 pay_type=qrcode，前端按 qr_code 渲染二维码（与微信 Native 同一扫码弹窗）
func createAlipayPrecreateOrder(c *gin.Context, order *model.Order) {
	qrCode, err := common.BuildAlipayPreCreate(
		config.AlipayAppId, config.AlipayPrivateKey, config.AlipayPublicKey,
		order.TradeNo,
		config.ServerAddress+"/api/user/pay/alipay/notify",
		fmt.Sprintf("充值额度 %s", common.LogQuota(order.Quota)),
		order.Amount,
	)
	if err != nil {
		logger.SysError("failed to precreate alipay order: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "支付宝下单失败，请稍后重试或联系管理员",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"pay_type": "qrcode",
			"code_url": qrCode,
			"trade_no": order.TradeNo,
			"quota":    order.Quota,
			"amount":   order.Amount,
		},
	})
}

// weChatNotifyFail 微信回调失败应答（4xx/5xx 时微信支付会按退避策略重试通知）
func weChatNotifyFail(c *gin.Context, httpStatus int, message string) {
	c.JSON(httpStatus, gin.H{
		"code":    "FAIL",
		"message": message,
	})
}

// WeChatPayNotify 微信支付异步回调（公开接口）。
// 安全策略（三道防线，免平台证书验签）：
//  1. 回调 resource 用 APIv3 密钥 AES-256-GCM 解密，解密成功即认证（密钥仅微信支付与商户知晓）；
//  2. 入账前主动调微信查单接口复核交易状态与金额，只信任我方 TLS 直连查询结果；
//  3. model.FinishOrderTrade 事务内强校验回调金额与订单金额一致 + 行锁幂等。
func WeChatPayNotify(c *gin.Context) {
	ctx := c.Request.Context()
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		weChatNotifyFail(c, http.StatusBadRequest, "读取请求体失败")
		return
	}
	var envelope struct {
		EventType string `json:"event_type"`
		Resource  struct {
			Ciphertext     string `json:"ciphertext"`
			Nonce          string `json:"nonce"`
			AssociatedData string `json:"associated_data"`
		} `json:"resource"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil || envelope.Resource.Ciphertext == "" {
		weChatNotifyFail(c, http.StatusBadRequest, "回调报文格式错误")
		return
	}
	// 1. 解密 resource（认证回调来源）
	plaintext, err := common.DecryptWeChatCallback(
		envelope.Resource.Ciphertext, envelope.Resource.Nonce, envelope.Resource.AssociatedData,
		config.WeChatPayApiV3Key)
	if err != nil {
		logger.SysError("wechat pay notify decrypt failed: " + err.Error())
		weChatNotifyFail(c, http.StatusBadRequest, "回调解密失败")
		return
	}
	var transaction common.WeChatTransaction
	if err := json.Unmarshal(plaintext, &transaction); err != nil || transaction.OutTradeNo == "" {
		weChatNotifyFail(c, http.StatusBadRequest, "回调明文解析失败")
		return
	}
	// 非支付成功事件直接确认，避免重试风暴（如 REFUND 事件、CLOSED 等终态）
	if transaction.TradeState != "SUCCESS" {
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
		return
	}
	// 2. 主动查单复核（状态 + 金额），防止伪造/篡改；仅平台确认已支付（Paid）才入账
	transactionId, paidAmount, queryState, err := common.QueryWeChatOrder(
		config.WeChatPayMchId, config.WeChatPaySerialNo, config.WeChatPayPrivateKey, transaction.OutTradeNo)
	if err != nil || queryState != common.TradeQueryPaid {
		logger.SysError(fmt.Sprintf("wechat pay notify query recheck failed: state=%d err=%v", queryState, err))
		weChatNotifyFail(c, http.StatusInternalServerError, "查单复核失败")
		return
	}
	// 3. 事务 + 行锁 + 幂等完成订单并入账（普通充值加额度 / 套餐单开通套餐）
	order, credited, err := model.FinishOrderTrade(ctx, transaction.OutTradeNo, transactionId, paidAmount)
	if err != nil {
		logger.SysError("wechat pay notify finish order failed: " + err.Error())
		weChatNotifyFail(c, http.StatusInternalServerError, "订单入账失败")
		return
	}
	if credited && order != nil && common.RedisEnabled {
		if err := common.RedisDel(fmt.Sprintf("user_quota:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user quota cache: " + err.Error())
		}
		if err := common.RedisDel(fmt.Sprintf("user_group:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user group cache: " + err.Error())
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
}

// AlipayNotify 支付宝异步回调（公开接口，RSA2 验签防护）
func AlipayNotify(c *gin.Context) {
	ctx := c.Request.Context()
	_ = c.Request.ParseForm()
	params := make(map[string]string)
	for k, v := range c.Request.PostForm {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	// 1. 强制 RSA2 验签，防伪造回调
	if err := common.VerifyAlipayNotify(params, config.AlipayPublicKey); err != nil {
		logger.SysError("alipay notify verify failed: " + err.Error())
		c.String(http.StatusBadRequest, "failure")
		return
	}
	// 2. 校验商户归属（app_id 必须与配置一致，防止用其他应用的合法签名蒙混）
	if params["app_id"] != config.AlipayAppId {
		logger.SysError(fmt.Sprintf("alipay notify app_id mismatch: got %q, want %q", params["app_id"], config.AlipayAppId))
		c.String(http.StatusBadRequest, "failure")
		return
	}
	// 3. 非成功状态直接确认，避免重试风暴
	if params["trade_status"] != "TRADE_SUCCESS" && params["trade_status"] != "TRADE_FINISHED" {
		c.String(http.StatusOK, "success")
		return
	}
	outTradeNo := params["out_trade_no"]
	if outTradeNo == "" {
		c.String(http.StatusBadRequest, "failure")
		return
	}
	// 4. 解析实付金额，事务内与订单金额强一致校验
	paidAmount, err := strconv.ParseFloat(params["total_amount"], 64)
	if err != nil || math.IsNaN(paidAmount) || paidAmount <= 0 {
		logger.SysError(fmt.Sprintf("alipay notify invalid total_amount %q, order %s", params["total_amount"], outTradeNo))
		c.String(http.StatusBadRequest, "failure")
		return
	}
	// 5. 事务 + 行锁 + 幂等完成订单并入账（普通充值加额度 / 套餐单开通套餐）
	order, credited, err := model.FinishOrderTrade(ctx, outTradeNo, params["trade_no"], paidAmount)
	if err != nil {
		logger.SysError("alipay notify finish order failed: " + err.Error())
		c.String(http.StatusInternalServerError, "failure")
		return
	}
	// 6. 仅首次入账需要刷新用户缓存（额度 + 用户组）
	if credited && order != nil && common.RedisEnabled {
		if err := common.RedisDel(fmt.Sprintf("user_quota:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user quota cache: " + err.Error())
		}
		if err := common.RedisDel(fmt.Sprintf("user_group:%d", order.UserId)); err != nil {
			logger.SysError("failed to refresh user group cache: " + err.Error())
		}
	}
	c.String(http.StatusOK, "success")
}
