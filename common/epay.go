package common

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// 易支付协议（Epay）封装：
//   - BuildEpaySubmitURL 生成支付跳转地址（submit.php）
//   - VerifyEpaySign 校验异步回调签名
//
// 签名规则：剔除 sign / sign_type 与空值参数，按参数名 ASCII 升序拼成
// k1=v1&k2=v2... 后拼接商户密钥，取 MD5 小写。

func epaySign(params map[string]string, secret string) string {
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
	raw := strings.Join(pairs, "&") + secret
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// BuildEpaySubmitURL 生成易支付下单跳转 URL。
// method: alipay / wxpay
func BuildEpaySubmitURL(payAddress string, pid string, secret string, method string,
	outTradeNo string, notifyUrl string, returnUrl string, name string, money float64) (string, error) {
	payAddress = strings.TrimRight(payAddress, "/")
	if payAddress == "" || pid == "" || secret == "" {
		return "", fmt.Errorf("支付网关未配置")
	}
	if method != "alipay" && method != "wxpay" {
		return "", fmt.Errorf("不支持的支付方式：%s", method)
	}
	params := map[string]string{
		"pid":          pid,
		"type":         method,
		"out_trade_no": outTradeNo,
		"notify_url":   notifyUrl,
		"return_url":   returnUrl,
		"name":         name,
		"money":        fmt.Sprintf("%.2f", money),
	}
	params["sign"] = epaySign(params, secret)
	params["sign_type"] = "MD5"

	values := url.Values{}
	for k, v := range params {
		values.Set(k, v)
	}
	return payAddress + "/submit.php?" + values.Encode(), nil
}

// VerifyEpaySign 校验易支付异步回调签名。
// params 为回调携带的全部参数（GET query 或 POST form）。
func VerifyEpaySign(params map[string]string, secret string) bool {
	sign := params["sign"]
	if sign == "" || secret == "" {
		return false
	}
	return epaySign(params, secret) == strings.ToLower(sign)
}
