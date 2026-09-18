package common

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
)

// Task4-2 渠道功能增强：渠道访问凭证（API Key/Secret）AES-256-GCM 加解密工具。
// 密钥来源优先级：CRYPTO_SECRET > SESSION_SECRET > 默认值（仅开发环境兜底，生产必须设置）。
// 存储格式：base64(nonce || ciphertext_with_tag)；空串入参原样返回空串。

func cryptoKey() []byte {
	src := os.Getenv("CRYPTO_SECRET")
	if src == "" {
		src = os.Getenv("SESSION_SECRET")
	}
	if src == "" {
		src = "one-api-default-crypto-key-please-change"
	}
	sum := sha256.Sum256([]byte(src))
	return sum[:]
}

// EncryptSecret 加密并返回 base64 字符串。空串入参返回空串。
func EncryptSecret(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	key := cryptoKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(append(nonce, sealed...)), nil
}

// DecryptSecret 解密 base64 字符串。空串入参返回空串。
// 解密失败返回 error（不静默返回原文，避免把密文当明文使用造成安全隐患）。
func DecryptSecret(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	key := cryptoKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(raw) < ns {
		return "", errors.New("ciphertext too short")
	}
	nonce, sealed := raw[:ns], raw[ns:]
	plain, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
