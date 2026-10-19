package common

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// 支付宝电脑网站支付（alipay.trade.page.pay）封装，仅覆盖本站所需能力：
//   - BuildAlipayPagePayURL  生成收银台跳转 URL（RSA2 签名）
//   - VerifyAlipayNotify     异步回调验签（支付宝公钥 RSA-SHA256）
//
// 签名规则：剔除 sign 与空值参数，按参数名 ASCII 升序拼成
// k1=v1&k2=v2... 后用应用私钥做 SHA256withRSA（RSA2）签名，base64 输出。
// 注意与易支付不同：sign_type 本身参与支付宝下单签名，但回调验签需剔除。
//
// 文档：https://opendocs.alipay.com/open/028r8t

const alipayGateway = "https://openapi.alipay.com/gateway.do"

// alipaySignParams 按支付宝规则计算待签名串并签名，返回 base64 签名值
func alipaySignParams(params map[string]string, privateKey *rsa.PrivateKey) (string, error) {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, k+"="+params[k])
	}
	h := sha256.Sum256([]byte(strings.Join(pairs, "&")))
	sig, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// BuildAlipayPagePayURL 生成支付宝电脑网站支付跳转 URL。
// totalAmount 格式化为两位小数字符串。
func BuildAlipayPagePayURL(appId string, privateKeyPem string,
	outTradeNo string, notifyUrl string, returnUrl string, subject string, totalAmount float64) (string, error) {
	if appId == "" || privateKeyPem == "" {
		return "", errors.New("支付宝参数未配置完整（APPID/应用私钥）")
	}
	privateKey, err := parseWeChatPrivateKey(privateKeyPem) // 同为 RSA 私钥归一化解析（PKCS#8/PKCS#1 兼容）
	if err != nil {
		return "", err
	}
	bizContent, _ := json.Marshal(map[string]string{
		"out_trade_no": outTradeNo,
		"product_code": "FAST_INSTANT_TRADE_PAY",
		"total_amount": fmt.Sprintf("%.2f", totalAmount),
		"subject":      subject,
	})
	cstZone := time.FixedZone("CST", 8*3600) // 支付宝网关要求北京时间
	params := map[string]string{
		"app_id":      appId,
		"method":      "alipay.trade.page.pay",
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().In(cstZone).Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  notifyUrl,
		"return_url":  returnUrl,
		"biz_content": string(bizContent),
	}
	sign, err := alipaySignParams(params, privateKey)
	if err != nil {
		return "", err
	}
	values := url.Values{}
	for k, v := range params {
		values.Set(k, v)
	}
	values.Set("sign", sign)
	return alipayGateway + "?" + values.Encode(), nil
}

// BuildAlipayPreCreate 支付宝当面付预下单（alipay.trade.precreate），返回订单码二维码内容 qr_code。
// 与微信 Native 一致由前端渲染二维码，用户使用支付宝 App 扫码完成支付。
// alipayPublicKeyPem 用于对网关同步响应做 RSA-SHA256 验签，防止二维码被中间人伪造；
// 异步通知仍走 VerifyAlipayNotify（同一支付宝公钥）。
// 文档：https://opendocs.alipay.com/open/02ekfg（当面付/扫码支付）
func BuildAlipayPreCreate(appId string, privateKeyPem string, alipayPublicKeyPem string,
	outTradeNo string, notifyUrl string, subject string, totalAmount float64) (string, error) {
	if appId == "" || privateKeyPem == "" {
		return "", errors.New("支付宝参数未配置完整（APPID/应用私钥）")
	}
	privateKey, err := parseWeChatPrivateKey(privateKeyPem)
	if err != nil {
		return "", err
	}
	bizContent, _ := json.Marshal(map[string]string{
		"out_trade_no": outTradeNo,
		"total_amount": fmt.Sprintf("%.2f", totalAmount),
		"subject":      subject,
	})
	cstZone := time.FixedZone("CST", 8*3600) // 支付宝网关要求北京时间
	params := map[string]string{
		"app_id":      appId,
		"method":      "alipay.trade.precreate",
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().In(cstZone).Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  notifyUrl,
		"biz_content": string(bizContent),
	}
	sign, err := alipaySignParams(params, privateKey)
	if err != nil {
		return "", err
	}
	data, err := alipayPostForm(params, sign)
	if err != nil {
		return "", err
	}

	// 解析外层信封：{ "alipay_trade_precreate_response": {...}, "sign": "..." }
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(data, &envelope); err != nil {
		return "", fmt.Errorf("支付宝下单响应解析失败: %w, body: %s", err, string(data))
	}
	bizRaw, ok := envelope["alipay_trade_precreate_response"]
	if !ok {
		return "", fmt.Errorf("支付宝下单响应缺少业务内容: %s", string(data))
	}
	var signStr string
	if s, ok := envelope["sign"]; ok {
		_ = json.Unmarshal(s, &signStr)
	}
	// 响应验签：JSON 响应的待验签内容是 xxx_response 节点的**原始 JSON 文本**
	// （json.RawMessage 保留网关下发的原始字节，字段顺序/中文/转义均不得二次序列化），
	// 不能用回调 form 的 k=v 排序拼接方式，否则签名必然不一致。
	// 参考支付宝开放平台「接口同步返回验签」规则与官方 SDK 对 JSON 报文的处理。
	if err := verifyAlipayJSONResponse(alipayPublicKeyPem, bizRaw, signStr); err != nil {
		return "", fmt.Errorf("支付宝下单响应验签失败: %w, body: %s", err, string(data))
	}

	var result struct {
		Code    string `json:"code"`
		Msg     string `json:"msg"`
		SubCode string `json:"sub_code"`
		SubMsg  string `json:"sub_msg"`
		QRCode  string `json:"qr_code"`
	}
	if err := json.Unmarshal(bizRaw, &result); err != nil {
		return "", err
	}
	if result.Code != "10000" {
		// 常见：ACQ.NOT_SIGN 未签约当面付；aop.invalid-* 参数/签名问题
		return "", fmt.Errorf("支付宝下单失败：%s %s %s", result.Code, result.SubCode, result.SubMsg)
	}
	if result.QRCode == "" {
		return "", errors.New("支付宝下单响应缺少 qr_code 订单码")
	}
	return result.QRCode, nil
}

// alipayPostForm 以 application/x-www-form-urlencoded 向支付宝网关发起 POST。
// 关键：空格必须编码为 %20 而不是 Go 默认的 '+'。
// Go 的 Encode 仅会把值里的空格输出为 '+'（字面量 '+' 已被编为 %2B，
// 静态参数名均为 ASCII 无空格），因此整体替换安全。
// 实测：subject 含空格时若用 '+'，支付宝网关报 40002 isv.invalid-signature
// （其解码后待签串与原始值不一致）。
func alipayPostForm(params map[string]string, sign string) ([]byte, error) {
	values := url.Values{}
	for k, v := range params {
		values.Set(k, v)
	}
	values.Set("sign", sign)
	body := strings.ReplaceAll(values.Encode(), "+", "%20")

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Post(alipayGateway, "application/x-www-form-urlencoded;charset=utf-8", strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// QueryAlipayOrder 支付宝统一收单线下交易查询（alipay.trade.query）。
// 返回支付宝流水号、实付金额（元）与状态三分类（对齐 pay-demo.md 2.6/3.3 已验证映射）：
//   - TRADE_SUCCESS / TRADE_FINISHED → Paid
//   - WAIT_BUYER_PAY → Pending
//   - TRADE_CLOSED → Closed（终态）
//   - 40004 + ACQ.TRADE_NOT_EXIST → Pending（买家未扫码前支付宝侧交易不存在，
//     属正常现象，不可当异常抛错——当面付与微信 Native 不同，扫码后才创建交易）
//   - 其余（签名/权限/系统错误）→ 返回 error
//
// 用于前端轮询时的主动查单（本机/内网收不到异步回调、回调延迟丢失时兜底）。
func QueryAlipayOrder(appId string, privateKeyPem string, alipayPublicKeyPem string,
	outTradeNo string) (tradeNo string, paidAmount float64, state TradeQueryState, err error) {
	privateKey, err := parseWeChatPrivateKey(privateKeyPem)
	if err != nil {
		return "", 0, TradeQueryPending, err
	}
	bizContent, _ := json.Marshal(map[string]string{
		"out_trade_no": outTradeNo,
	})
	cstZone := time.FixedZone("CST", 8*3600)
	params := map[string]string{
		"app_id":      appId,
		"method":      "alipay.trade.query",
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().In(cstZone).Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"biz_content": string(bizContent),
	}
	sign, err := alipaySignParams(params, privateKey)
	if err != nil {
		return "", 0, TradeQueryPending, err
	}
	data, err := alipayPostForm(params, sign)
	if err != nil {
		return "", 0, TradeQueryPending, err
	}
	var envelope struct {
		Response json.RawMessage `json:"alipay_trade_query_response"`
		Sign     string          `json:"sign"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return "", 0, TradeQueryPending, fmt.Errorf("支付宝查单响应解析失败: %w, body: %s", err, string(data))
	}
	if err := verifyAlipayJSONResponse(alipayPublicKeyPem, envelope.Response, envelope.Sign); err != nil {
		return "", 0, TradeQueryPending, fmt.Errorf("支付宝查单响应验签失败: %w", err)
	}
	var result struct {
		Code        string `json:"code"`
		SubCode     string `json:"sub_code"`
		SubMsg      string `json:"sub_msg"`
		TradeStatus string `json:"trade_status"` // TRADE_SUCCESS / TRADE_FINISHED / WAIT_BUYER_PAY / TRADE_CLOSED
		TradeNo     string `json:"trade_no"`
		TotalAmount string `json:"total_amount"`
	}
	if err := json.Unmarshal(envelope.Response, &result); err != nil {
		return "", 0, TradeQueryPending, err
	}
	switch {
	case result.Code == "10000" && (result.TradeStatus == "TRADE_SUCCESS" || result.TradeStatus == "TRADE_FINISHED"):
		amount, err := strconv.ParseFloat(result.TotalAmount, 64)
		if err != nil {
			return "", 0, TradeQueryPending, fmt.Errorf("支付宝查单金额解析失败：%q", result.TotalAmount)
		}
		return result.TradeNo, amount, TradeQueryPaid, nil
	case result.Code == "10000" && result.TradeStatus == "WAIT_BUYER_PAY":
		return "", 0, TradeQueryPending, nil
	case result.Code == "10000" && result.TradeStatus == "TRADE_CLOSED":
		return "", 0, TradeQueryClosed, nil
	case result.Code == "40004" && result.SubCode == "ACQ.TRADE_NOT_EXIST":
		// 买家还没扫码，支付宝侧尚未生成交易，正常待支付
		return "", 0, TradeQueryPending, nil
	default:
		return "", 0, TradeQueryPending, fmt.Errorf("支付宝查单异常 code=%s sub_code=%s %s", result.Code, result.SubCode, result.SubMsg)
	}
}

// verifyAlipayJSONResponse 对支付宝开放平台 JSON 同步响应做 RSA2 验签。
// rawBizJSON 必须是 xxx_response 节点的原始 JSON 文本（不得重新 marshal/改顺序）。
func verifyAlipayJSONResponse(alipayPublicKeyPem string, rawBizJSON []byte, sign string) error {
	if sign == "" || alipayPublicKeyPem == "" {
		return errors.New("响应验签参数缺失（sign 或支付宝公钥未配置）")
	}
	publicKey, err := parsePemPublicKey(alipayPublicKeyPem)
	if err != nil {
		return err
	}
	return rsaVerifyPKCS1v15Base64(publicKey, string(rawBizJSON), sign)
}

// VerifyAlipayNotify 支付宝异步回调验签。
// params 为回调携带的全部参数（POST form），使用支付宝公钥验签。
func VerifyAlipayNotify(params map[string]string, alipayPublicKeyPem string) error {
	sign := params["sign"]
	if sign == "" || alipayPublicKeyPem == "" {
		return errors.New("回调验签参数缺失（sign 或支付宝公钥未配置）")
	}
	publicKey, err := parsePemPublicKey(alipayPublicKeyPem)
	if err != nil {
		return err
	}
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || k == "sign_type" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, k+"="+params[k])
	}
	return rsaVerifyPKCS1v15Base64(publicKey, strings.Join(pairs, "&"), sign)
}
