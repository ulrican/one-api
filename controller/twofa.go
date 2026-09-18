package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/i18n"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/common/totp"
	"github.com/songquanpeng/one-api/model"
)

// F12 两步验证（TOTP）。
// 自助管理接口挂 selfRoute（UserAuth）；登录校验接口 /api/user/login/2fa 为公开接口。

// GetTwoFAStatus GET /api/user/2fa/status
func GetTwoFAStatus(c *gin.Context) {
	userId := c.GetInt("id")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    gin.H{"enabled": model.TwoFAEnabled(userId)},
	})
}

// SetupTwoFA POST /api/user/2fa/setup：生成密钥与 otpauth 链接（未启用前可重复调用轮换）
func SetupTwoFA(c *gin.Context) {
	userId := c.GetInt("id")
	if existing, err := model.GetTwoFA(userId); err == nil && existing != nil && existing.Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "两步验证已启用，请先停用后再重新设置"})
		return
	}
	secret, err := totp.GenerateSecret()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "生成密钥失败：" + err.Error()})
		return
	}
	if err := model.UpsertTwoFASetup(userId, secret); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	issuer := config.SystemName
	if issuer == "" {
		issuer = "FluxAI"
	}
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "",
		"data":       gin.H{"secret": secret, "otpauth_url": totp.ProvisioningURI(issuer, user.Username, secret)},
	})
}

type twofaCodeRequest struct {
	Code string `json:"code"`
}

// EnableTwoFA POST /api/user/2fa/enable
func EnableTwoFA(c *gin.Context) {
	userId := c.GetInt("id")
	var req twofaCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": i18n.Translate(c, "invalid_parameter")})
		return
	}
	record, err := model.GetTwoFA(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if record == nil || record.Secret == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请先发起两步验证设置"})
		return
	}
	if record.Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "两步验证已启用"})
		return
	}
	if !totp.Validate(record.Secret, req.Code) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "验证码错误或已过期，请确认设备时间准确后重试"})
		return
	}
	if err := model.EnableTwoFA(userId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "两步验证已启用"})
}

// DisableTwoFA POST /api/user/2fa/disable
func DisableTwoFA(c *gin.Context) {
	userId := c.GetInt("id")
	var req twofaCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": i18n.Translate(c, "invalid_parameter")})
		return
	}
	record, err := model.GetTwoFA(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if record == nil || !record.Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "两步验证未启用"})
		return
	}
	if !totp.Validate(record.Secret, req.Code) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "验证码错误或已过期"})
		return
	}
	if err := model.DeleteTwoFA(userId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "两步验证已停用"})
}

type twofaLoginRequest struct {
	TwoFAToken string `json:"twofa_token"`
	Code       string `json:"code"`
}

// LoginTwoFA POST /api/user/login/2fa：密码校验通过后的第二步验证码登录
func LoginTwoFA(c *gin.Context) {
	var req twofaLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TwoFAToken == "" || req.Code == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": i18n.Translate(c, "invalid_parameter")})
		return
	}
	userId, ok := model.PeekTwoFAPending(req.TwoFAToken)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "验证会话已过期，请重新登录"})
		return
	}
	record, err := model.GetTwoFA(userId)
	if err != nil || record == nil || !record.Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "两步验证状态异常，请重新登录"})
		return
	}
	if !totp.Validate(record.Secret, req.Code) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "验证码错误或已过期"})
		return
	}
	// 验证码通过后再原子消费 pending token，保证一次性（错误验证码不会烧毁登录态）
	if _, consumed := model.ConsumeTwoFAPending(req.TwoFAToken); !consumed {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "验证会话已过期，请重新登录"})
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	SetupLogin(user, c)
}

// issueTwoFAPending 密码校验通过但用户已启用 2FA 时，签发一次性 pending token
func issueTwoFAPending(userId int) (string, error) {
	token := random.GetUUID()
	if err := model.SaveTwoFAPending(token, userId); err != nil {
		return "", err
	}
	return token, nil
}
