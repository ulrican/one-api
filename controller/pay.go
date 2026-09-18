package controller

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

func parseAmountOptions() []float64 {
	options := make([]float64, 0)
	if err := json.Unmarshal([]byte(config.TopupAmountOptions), &options); err != nil {
		return make([]float64, 0)
	}
	return options
}

// GetPayConfig 用户端支付配置（决定钱包页渲染方式）
func GetPayConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled":        config.PayEnabled,
			"amount_options": parseAmountOptions(),
			"min_top_up":     config.MinTopUp,
			"max_top_up":     config.MaxTopUp,
			"price":          config.PayPrice,
			"methods":        []string{"alipay", "wxpay"},
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
	payUrl, err := common.BuildEpaySubmitURL(
		config.PayAddress, config.EpayId, config.EpaySecret, req.Method,
		order.TradeNo,
		config.ServerAddress+"/api/user/pay/notify",
		config.ServerAddress+"/topup",
		fmt.Sprintf("充值额度 %s", common.LogQuota(quota)),
		req.Amount,
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
			"quota":    quota,
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
	// 5. 事务 + 行锁 + 幂等完成订单并原子加额度（未支付/已超时订单均可入账；充值日志在事务内写入）
	userId, _, credited, err := model.FinishOrderTrade(ctx, tradeNo, params["trade_no"], paidAmount)
	if err != nil {
		logger.SysError("pay notify failed: " + err.Error())
		c.String(http.StatusInternalServerError, "fail")
		return
	}
	// 6. 仅首次入账需要删除用户额度缓存，网关下次鉴权回源 DB 立即生效；重复回调无需重复处理
	if credited && common.RedisEnabled {
		if err := common.RedisDel(fmt.Sprintf("user_quota:%d", userId)); err != nil {
			logger.SysError("failed to refresh user quota cache: " + err.Error())
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
