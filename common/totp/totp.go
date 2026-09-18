// Package totp 实现 RFC 6238 TOTP（Google Authenticator 兼容），纯标准库，无第三方依赖。
package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	periodSeconds = 30 // TOTP 时间步长
	codeDigits    = 6
	skewSteps     = 1 // 允许前后各 1 个时间步（时钟漂移容忍）
	secretBytes   = 20 // 160 bit，base32 编码后 32 字符
)

var b32Encoding = base32.StdEncoding.WithPadding(base32.NoPadding)

// GenerateSecret 生成新的 base32 密钥（32 字符，A-Z2-7）
func GenerateSecret() (string, error) {
	buf := make([]byte, secretBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.ToUpper(b32Encoding.EncodeToString(buf)), nil
}

// ProvisioningURI 生成 otpauth:// 二维码内容
func ProvisioningURI(issuer, account, secret string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// hotp RFC 4226 HMAC-SHA1 动态截断
func hotp(secret string, counter uint64) (string, error) {
	key, err := b32Encoding.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", err
	}
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (int(sum[offset]&0x7f) << 24) |
		(int(sum[offset+1]) << 16) |
		(int(sum[offset+2]) << 8) |
		int(sum[offset+3])
	code %= 1000000
	return fmt.Sprintf("%06d", code), nil
}

// Validate 校验 6 位数字验证码（当前时间步 ±skewSteps）
func Validate(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != codeDigits {
		return false
	}
	for _, ch := range code {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	currentStep := time.Now().Unix() / periodSeconds
	for i := -skewSteps; i <= skewSteps; i++ {
		step := currentStep + int64(i)
		if step < 0 {
			continue
		}
		expected, err := hotp(secret, uint64(step))
		if err != nil {
			return false
		}
		if hmac.Equal([]byte(expected), []byte(code)) {
			return true
		}
	}
	return false
}
