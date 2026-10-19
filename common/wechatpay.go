package common

import (
	"bytes"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
)

// 微信支付 API v3（直连商户）封装，仅覆盖本站所需能力：
//   - BuildWeChatNativeOrder  Native 扫码下单，返回 code_url 供前端生成二维码
//   - DecryptWeChatCallback   回调 resource 解密（AES-256-GCM，APIv3 密钥为共享密钥）
//   - QueryWeChatOrder        主动查单（回调入账前复核，只信任我方 TLS 直连查询结果）
//
// 安全策略说明：回调不实现平台证书验签（需下载/轮换平台证书），改为
// "解密 resource（持 APIv3 密钥方可解密，等同认证）→ 主动查单复核金额与状态"
// 双保险，配合订单事务内金额强校验（model.FinishOrderTrade）防伪造与篡改。
//
// 文档：https://pay.weixin.qq.com/docs/merchant/apis/native-payment/native.html

const wechatPayApiBase = "https://api.mch.weixin.qq.com"

// TradeQueryState 支付平台查单结果三分类（对齐 pay-demo.md 已验证的状态映射）：
//   - Paid    支付成功，可入账
//   - Pending 未支付的正常中间态（买家未扫码/未付款），继续等待，不算错误
//   - Closed  终态（已关闭/撤销/支付失败/已退款），该订单不可能再支付成功
type TradeQueryState int

const (
	TradeQueryPaid TradeQueryState = iota
	TradeQueryPending
	TradeQueryClosed
)

// normalizePemPrivateKey 归一化商户私钥：
// 兼容 1) 标准多行 PEM 2) 粘贴到单行输入框丢失换行的 PEM 3) 纯 base64 密文体。
// 返回标准 PKCS#1/PKCS#8 PEM 块。
func normalizePemPrivateKey(raw string) (*pem.Block, error) {
	// 先在原文上判定 PEM 类型与头尾标记（标记 "PRIVATE KEY" 等本身含空格，
	// 不能先删除全部空白，否则标记被破坏无法匹配，整串会被误当 base64 解码失败）
	s := raw
	blockType := "PRIVATE KEY" // PKCS#8（微信商户 apiclient_key.pem 默认格式）
	if strings.Contains(s, "BEGIN RSA PRIVATE KEY") {
		blockType = "RSA PRIVATE KEY" // PKCS#1
	} else if strings.Contains(s, "BEGIN EC PRIVATE KEY") {
		blockType = "EC PRIVATE KEY"
	}
	// 提取 base64 密文体：有头尾标记则取中间，否则整段视为密文体
	body := s
	beginMarker := "-----BEGIN " + blockType + "-----"
	endMarker := "-----END " + blockType + "-----"
	if i := strings.Index(s, beginMarker); i >= 0 {
		body = s[i+len(beginMarker):]
		if j := strings.Index(body, endMarker); j >= 0 {
			body = body[:j]
		}
	}
	// 仅对密文体去除全部空白（换行/回车/制表/空格），得到连续 base64 串
	var sb strings.Builder
	for _, r := range body {
		if !unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	body = sb.String()
	if body == "" {
		return nil, errors.New("私钥内容为空")
	}
	return &pem.Block{Type: blockType, Bytes: []byte(body)}, nil
}

// parseRsaPrivateKeyDer 从 DER 解析 RSA 私钥（先 PKCS#8 后 PKCS#1）
func parseRsaPrivateKeyDer(der []byte) (*rsa.PrivateKey, error) {
	if key, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, errors.New("私钥不是 RSA 密钥")
	}
	if key, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return key, nil
	}
	return nil, errors.New("私钥格式无效（需 PKCS#8 或 PKCS#1）")
}

// parseWeChatPrivateKey 解析商户私钥，返回 *rsa.PrivateKey（兼容 PKCS#8 / PKCS#1）
func parseWeChatPrivateKey(raw string) (*rsa.PrivateKey, error) {
	block, err := normalizePemPrivateKey(raw)
	if err != nil {
		return nil, err
	}
	// 归一化后 Bytes 仍是 base64 文本，先解码
	der, err := base64.StdEncoding.DecodeString(string(block.Bytes))
	if err != nil {
		return nil, fmt.Errorf("私钥 base64 解码失败: %w", err)
	}
	return parseRsaPrivateKeyDer(der)
}

// weChatAuthHeader 生成 API v3 请求签名 Authorization 头
func weChatAuthHeader(method string, pathWithQuery string, body string, mchId string, serialNo string, privateKey *rsa.PrivateKey) (string, error) {
	timestamp := time.Now().Unix()
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(nonceBytes)
	message := method + "\n" + pathWithQuery + "\n" +
		fmt.Sprintf("%d", timestamp) + "\n" + nonce + "\n" + body + "\n"
	h := sha256.Sum256([]byte(message))
	sig, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	signature := base64.StdEncoding.EncodeToString(sig)
	return fmt.Sprintf(
		`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%d",serial_no="%s"`,
		mchId, nonce, signature, timestamp, serialNo), nil
}

// weChatDoRequest 发起带签名的 API v3 请求，返回响应体
func weChatDoRequest(method string, pathWithQuery string, body string, mchId string, serialNo string, privateKey *rsa.PrivateKey) ([]byte, error) {
	auth, err := weChatAuthHeader(method, pathWithQuery, body, mchId, serialNo, privateKey)
	if err != nil {
		return nil, err
	}
	var req *http.Request
	req, err = http.NewRequest(method, wechatPayApiBase+pathWithQuery, bytes.NewBufferString(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", auth)
	req.Header.Set("User-Agent", "one-api")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("微信支付接口返回 %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}

// BuildWeChatNativeOrder 微信 Native 扫码下单，返回 code_url（前端渲染二维码）
// total 为支付金额（分）。outTradeNo 为系统内部订单号（trade_no）。
func BuildWeChatNativeOrder(appId string, mchId string, serialNo string, privateKeyPem string,
	outTradeNo string, notifyUrl string, description string, total int64) (string, error) {
	if appId == "" || mchId == "" || serialNo == "" || privateKeyPem == "" {
		return "", errors.New("微信支付参数未配置完整（APPID/商户号/证书序列号/私钥）")
	}
	privateKey, err := parseWeChatPrivateKey(privateKeyPem)
	if err != nil {
		return "", err
	}
	reqBody, _ := json.Marshal(map[string]interface{}{
		"appid":        appId,
		"mchid":        mchId,
		"description":  description,
		"out_trade_no": outTradeNo,
		"notify_url":   notifyUrl,
		"amount": map[string]interface{}{
			"total":    total,
			"currency": "CNY",
		},
	})
	data, err := weChatDoRequest(http.MethodPost, "/v3/pay/transactions/native", string(reqBody), mchId, serialNo, privateKey)
	if err != nil {
		return "", err
	}
	var result struct {
		CodeUrl string `json:"code_url"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	if result.CodeUrl == "" {
		return "", fmt.Errorf("微信下单响应缺少 code_url: %s", string(data))
	}
	return result.CodeUrl, nil
}

// QueryWeChatOrder 主动查单（按商户订单号），返回交易号、实付金额（元）与状态三分类。
// 状态映射对齐 pay-demo.md 1.6：SUCCESS→Paid；NOTPAY/USERPAYING→Pending（下单即有交易，未付款属正常）；
// CLOSED/REVOKED/PAYERROR→Closed（终态不可再支付）；REFUND→Closed（充值场景退款绝不入账，
// 与 demo 的 REFUND→PAID 通用商城语义不同，这里是额度入账领域，退款入账等于送额度）；
// 未知状态保守按 Pending 等待下一轮，避免误关单。
func QueryWeChatOrder(mchId string, serialNo string, privateKeyPem string, outTradeNo string) (transactionId string, paidAmount float64, state TradeQueryState, err error) {
	privateKey, err := parseWeChatPrivateKey(privateKeyPem)
	if err != nil {
		return "", 0, TradeQueryPending, err
	}
	path := "/v3/pay/transactions/out-trade-no/" + url.PathEscape(outTradeNo) + "?mchid=" + url.QueryEscape(mchId)
	data, err := weChatDoRequest(http.MethodGet, path, "", mchId, serialNo, privateKey)
	if err != nil {
		return "", 0, TradeQueryPending, err
	}
	var result struct {
		TradeState    string `json:"trade_state"`
		TransactionId string `json:"transaction_id"`
		Amount        struct {
			Total int64 `json:"total"`
		} `json:"amount"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", 0, TradeQueryPending, err
	}
	switch result.TradeState {
	case "SUCCESS":
		return result.TransactionId, float64(result.Amount.Total) / 100, TradeQueryPaid, nil
	case "NOTPAY", "USERPAYING":
		return "", 0, TradeQueryPending, nil
	case "CLOSED", "REVOKED", "PAYERROR", "REFUND":
		return "", 0, TradeQueryClosed, nil
	default:
		// 未知状态保守等待，不做终态判定
		return "", 0, TradeQueryPending, nil
	}
}

// DecryptWeChatCallback 解密回调 resource（AEAD_AES_256_GCM），返回解密后的明文 JSON
// 解密成功即证明回调方持有 APIv3 密钥（仅微信支付与商户知晓），等同于身份认证。
func DecryptWeChatCallback(ciphertextBase64 string, nonce string, associatedData string, apiV3Key string) ([]byte, error) {
	if len(apiV3Key) != 32 {
		return nil, errors.New("微信支付 APIv3 密钥长度须为 32 字节")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return nil, err
	}
	// 密文末 16 字节为 GCM tag
	if len(ciphertext) < 16 {
		return nil, errors.New("微信回调密文过短")
	}
	block, err := aes.NewCipher([]byte(apiV3Key))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCMWithNonceSize(block, len(nonce))
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, []byte(nonce), ciphertext, []byte(associatedData))
	if err != nil {
		return nil, fmt.Errorf("微信回调解密失败: %w", err)
	}
	return plaintext, nil
}

// ParseWeChatTransaction 解析回调/查单明文中的交易要素
type WeChatTransaction struct {
	OutTradeNo    string `json:"out_trade_no"`
	TransactionId string `json:"transaction_id"`
	TradeState    string `json:"trade_state"`
	Amount        struct {
		Total      int64 `json:"total"`       // 订单金额（分）
		PayerTotal int64 `json:"payer_total"` // 用户实付（分）
	} `json:"amount"`
}

// rsaVerifyPKCS1v15Base64 通用 RSA-SHA256 base64 签名验证（支付宝回调复用）
func rsaVerifyPKCS1v15Base64(publicKey *rsa.PublicKey, message string, signatureBase64 string) error {
	sig, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil {
		return err
	}
	h := sha256.Sum256([]byte(message))
	return rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, h[:], sig)
}

// parsePemPublicKey 归一化解析 PEM 公钥（兼容纯 base64 公钥体），返回 *rsa.PublicKey
func parsePemPublicKey(raw string) (*rsa.PublicKey, error) {
	var sb strings.Builder
	for _, r := range raw {
		if !unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	s := sb.String()
	blockType := "PUBLIC KEY"
	body := s
	if i := strings.Index(s, "-----BEGIN "+blockType+"-----"); i >= 0 {
		marker := "-----BEGIN " + blockType + "-----"
		body = strings.TrimPrefix(s[i:], marker)
		if j := strings.Index(body, "-----END "+blockType+"-----"); j >= 0 {
			body = body[:j]
		}
	} else if i := strings.Index(s, "-----BEGIN RSA PUBLIC KEY-----"); i >= 0 {
		blockType = "RSA PUBLIC KEY"
		body = strings.TrimPrefix(s[i:], "-----BEGIN RSA PUBLIC KEY-----")
		if j := strings.Index(body, "-----END RSA PUBLIC KEY-----"); j >= 0 {
			body = body[:j]
		}
	}
	if body == "" {
		return nil, errors.New("公钥内容为空")
	}
	der, err := base64.StdEncoding.DecodeString(body)
	if err != nil {
		return nil, fmt.Errorf("公钥 base64 解码失败: %w", err)
	}
	if key, err := x509.ParsePKIXPublicKey(der); err == nil {
		if rsaKey, ok := key.(*rsa.PublicKey); ok {
			return rsaKey, nil
		}
		return nil, errors.New("公钥不是 RSA 密钥")
	}
	// 退化尝试 PKCS#1
	rsaKey, err := x509.ParsePKCS1PublicKey(der)
	if err != nil {
		return nil, errors.New("公钥格式无效（需 PKIX 或 PKCS#1）")
	}
	return rsaKey, nil
}
