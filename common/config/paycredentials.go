package config

import (
	"embed"
	"strings"
)

// Task4-10b：微信支付（Native 扫码）/ 支付宝（当面付订单码）商户凭证代码内置。
// 这些信息不再通过设置页面/数据库维护（model/option.go 中已移除对应映射，DB 无法覆盖），
// 商户私钥与证书文件通过 go:embed 打包进二进制，可随镜像直接发布到阿里云服务器，
// 不依赖部署机上的任何本地证书路径。
//
// 凭证轮换方式：替换本文件常量或 paycerts/ 下文件后重新编译发版。

//go:embed paycerts
var payCertsFS embed.FS

// readEmbeddedCert 读取随二进制发布的证书/私钥文件内容
func readEmbeddedCert(name string) string {
	data, err := payCertsFS.ReadFile(name)
	if err != nil {
		// 证书缺失属于发布物完整性问题，启动期应立即暴露
		panic("payment credential file missing: " + name + ": " + err.Error())
	}
	return strings.TrimSpace(string(data))
}

// ---- 微信支付（直连商户 APIv3）----
const (
	WeChatPayAppIDConst    = "wx0656eee3e5815e5e"                       // 绑定的公众号/小程序 AppID
	WeChatPayMchIDConst    = "1746857564"                               // 微信支付商户号
	WeChatPaySerialConst   = "2CEC729AAFD3F51FF52EA155A192CDD907277AF9" // 商户 API 证书序列号
	WeChatPayApiV3KeyConst = "ZHYF6666666666666666666666666666"         // APIv3 密钥（32 字节，回调 AES-256-GCM 解密）
)

// WeChatPayPrivateKeyConst 商户私钥（PKCS#8 PEM，原 apiclient_key.pem）
var WeChatPayPrivateKeyConst = readEmbeddedCert("paycerts/wx/apiclient_key.pem")

// ---- 支付宝（当面付 alipay.trade.precreate，公钥模式）----
const (
	AlipayAppIDConst = "2021006163665024" // 支付宝应用 APPID

	// AlipayPrivateKeyConst 应用私钥（PKCS#8 base64 体，common.parseWeChatPrivateKey 兼容纯 base64）
	AlipayPrivateKeyConst = "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3utSUQk/lVsaSownMGpJgMp2qbKaFAc20IO8Jq/AYMHzjhvQPxfkkcbw7PkQuWX8Ib0DxaRZYpU52OmYOwGyti+s27wEFtrdrPCvNuYfSggrKXGYKlK2JIB+LsNEuiaustOIBCLdxo6QijoCCTEpvLUkqk2OyxBDF27rfwsbfOueLdxZKC1o5RRmhv4KlxrPZ0yHiJ1nW9qljIQGStF6QOlGOnQqJXiRbpThby/cQh6W+M9bVxa3XiE4o88qsoLeJbfkm4CiiW641e0HOowUYZfWY7Ed92mMnBdvsE75h8ztAFrPqVjFGB3mSqWHIdQpJsODwRblxXFnfHXk3q98BAgMBAAECggEBAJs9usb27Ok8FBbsuaeCwDGWMxBAM8doybWsqi1C4WCe/7eEXQ5C2gvIKiLortV2+1ZWIsqYX7BRJOXS3E8Umf9dnUZSVkvMolhyhBSU8kWVaaaowfOowqR9xwnSQj2PR8ZrJBd5lP7pJROp0r3F1pLv8cWOugvfjMiRq+nLexw8B3WQZpmFImpZRaVOeNel+W9Ny3r8O2B9dlyDrRAYvoANU9ZgqsAhS2VP9C2AXkxSjeUZNjcdhhfpt/v0r0pu/c4uvCdiVvkgraynL6mdUIaJgNXJnOic93CCm1XMOLW+h9ls70fUof2+7T8JX68ImsvEp/qs5dNCVJUNfCy4u1ECgYEA/PZ+JsRS+dMXq7xiXWknfsoe1qeCGpxoUQgphDWNLSA7yjKk9G4VEY3i+CXU2a+W+7DQT3M+vrY52azwdQv4ubQX+8F1KVNnMyV9LKPSrUDP1PHXiTNBKqThT3RR7p7XatjQZHBpdE7X83pQgCfqsy8Cj8HlzFHn29hnoqsCtt0CgYEAue+K8HKDRa0CHb5v+8zRy/EUjjQwPuzGPilQt04oKnLKvyt2RD/7mS7axOKH8iCIZUNnWcNq6uhCW2bCBO1wULpeBxg/hnz12G1zxQJw6fxitWNNAJgBzEWb0Z8roCnkKMu9FPpD09fZ5WwLUBs01pPpvO7eaO+dgi0I7Tl0vHUCgYEAy9yargNqG4vTd8PKQh2MhtG9KKC2aVvDdgpt6u59Z/CiPsGxzosoz4zZbcKPVx/7PbuxJVZrKqcQ2CxXXPzY5lANRAcUtMlSUhXUWzVrg9THqYV9fkSgMA3Qxoenv/ajBKjWyRsO4Xzo7H+WgLGqo90u40wQNimMAdDVNHM9LMECgYA1ZD7OauOdJ1/7MIsxkBAScwjHCN9twknu4ahG6s+H2Oy1VoKgeIsD4rt5W99TvNnN0jwkP4Q9LjKX0nsWNSRSWiHUAbeEI+/olQ1wXhIUbp/dnEUpTXz+rmJfIEjDtiPJPy/tjSva8hmk0pCxEQ7sKw8sbJ87HMtq7QmqLRyDXQKBgH+7uuksHd0RZDEjcR2kzy+qjjUwVYldsQDzMxNLSrHC+NeHz0uyh/bZbz//TR2t+inV8Z0QCBb9XwH2i9go3DIOzkCMp38sHMbC2JwNymfccIlU1x+jqfn5ND+7qW/eGbKCYEkMrJNobLH83qanxR4fCNWnrBFA3eiu4W5IUBu5"

	// AlipayPublicKeyConst 支付宝公钥（SPKI/PKIX base64 体，回调与下单响应 RSA-SHA256 验签）
	AlipayPublicKeyConst = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmLowWiMkrMtNNtuws3rUu5bfeeyuUdJQ0/YGLYaltHnmuJEn2/TtvklDVR3ZoHoQW2HVnUGMhSLUff6wjJLL6p50wzjxFzWDAeaaqQZv9MBPfMpW6s5jF5FBHzVxwSVOV1r671A0Zu8CkemIhuA9pBThLlkfFOya8kYsQlmFn5ifXGKztXzbmKSsLfu3Ze+C8Eth0oHIeLy09sch55yRVvTea01KAJsPRowXmdW9KJ7oCT67YWibh88U5rI/K47AnQPsUpty5yXaBUp6P+vlTtxVttYscUyPETHQKtZz4AYiYGFd/TFw1HzvcxBWTquJWUYjPtRf6k1AJalABx87FQIDAQAB"
)
