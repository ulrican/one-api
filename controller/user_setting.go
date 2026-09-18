package controller

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/message"
	"github.com/songquanpeng/one-api/model"
)

// F10 个人中心：通知设置 + 登录会话管理（selfRoute，UserAuth）

var validNotifyTypes = map[string]bool{
	"":                        true,
	message.NotifyTypeEmail:   true,
	message.NotifyTypeBark:    true,
	message.NotifyTypeGotify:  true,
	message.NotifyTypeWebhook: true,
}

type userSettingDTO struct {
	NotifyType            string `json:"notify_type"`
	NotifyPayload         string `json:"notify_payload"`
	QuotaWarningThreshold int64  `json:"quota_warning_threshold"`
}

func GetSelfSetting(c *gin.Context) {
	userId := c.GetInt("id")
	us, err := model.GetUserSetting(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": userSettingDTO{
			NotifyType:            us.NotifyType,
			NotifyPayload:         us.NotifyPayload,
			QuotaWarningThreshold: us.QuotaWarningThreshold,
		},
	})
}

func UpdateSelfSetting(c *gin.Context) {
	userId := c.GetInt("id")
	var req userSettingDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：" + err.Error()})
		return
	}
	if !validNotifyTypes[req.NotifyType] {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "不支持的通知方式"})
		return
	}
	if req.NotifyPayload != "" {
		var m map[string]any
		if err := json.Unmarshal([]byte(req.NotifyPayload), &m); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "通知参数必须是合法 JSON"})
			return
		}
	}
	if req.QuotaWarningThreshold < 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "配额警告阈值不能为负数"})
		return
	}
	us := &model.UserSetting{
		UserId:                userId,
		NotifyType:            req.NotifyType,
		NotifyPayload:         req.NotifyPayload,
		QuotaWarningThreshold: req.QuotaWarningThreshold,
	}
	if err := model.UpsertUserSetting(us); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": userSettingDTO{
		NotifyType:            us.NotifyType,
		NotifyPayload:         us.NotifyPayload,
		QuotaWarningThreshold: us.QuotaWarningThreshold,
	}})
}

// TestSelfNotify：用已保存的配置投递一条测试通知
func TestSelfNotify(c *gin.Context) {
	userId := c.GetInt("id")
	us, err := model.GetUserSetting(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if us.NotifyType == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请先选择并保存通知方式"})
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	err = message.SendUserNotify(us.NotifyType, us.NotifyPayload, user.Email, "【测试通知】配置成功", "这是一条测试通知，收到即表示通知渠道配置正确。")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "投递失败：" + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "测试通知已发送"})
}

func GetSelfSessions(c *gin.Context) {
	userId := c.GetInt("id")
	session := sessions.Default(c)
	currentSid, _ := session.Get("session_id").(string)
	list, err := model.GetUserSessions(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(list))
	for _, s := range list {
		items = append(items, gin.H{
			"id":             s.Id,
			"ip":             s.Ip,
			"user_agent":     s.UserAgent,
			"created_at":     s.CreatedAt,
			"last_active_at": s.LastActiveAt,
			"current":        s.SessionId == currentSid && currentSid != "",
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": items})
}

// DeleteOtherSessions：注销其他会话（吊销其他设备的登录态，当前设备保持有效）
func DeleteOtherSessions(c *gin.Context) {
	userId := c.GetInt("id")
	session := sessions.Default(c)
	currentSid, _ := session.Get("session_id").(string)
	if currentSid == "" {
		// access token 调用或存量会话：无法识别当前会话，吊销全部会话
		if err := model.DeleteOtherUserSessions(userId, ""); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	} else if err := model.DeleteOtherUserSessions(userId, currentSid); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	newEpoch, err := model.BumpSessionEpoch(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if currentSid != "" {
		// 续期当前设备 cookie 中的 epoch，避免自身被吊销
		session.Set("epoch", newEpoch)
		if err := session.Save(); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "其他会话已全部注销", "data": gin.H{"epoch": newEpoch, "time": time.Now().Unix()}})
}
