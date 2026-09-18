package model

import (
	"time"
)

// F10 登录会话登记（简化版）：仅作展示记录，吊销靠 user_settings.session_epoch
type UserSession struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	SessionId    string `json:"session_id" gorm:"uniqueIndex;type:varchar(64)"`
	UserId       int    `json:"user_id" gorm:"index"`
	Ip           string `json:"ip" gorm:"type:varchar(64)"`
	UserAgent    string `json:"user_agent" gorm:"type:varchar(255)"`
	CreatedAt    int64  `json:"created_at"`
	LastActiveAt int64  `json:"last_active_at"`
}

func RecordUserSession(sessionId string, userId int, ip string, userAgent string) error {
	if sessionId == "" || userId <= 0 {
		return nil
	}
	now := time.Now().Unix()
	var count int64
	_ = DB.Model(&UserSession{}).Where("session_id = ?", sessionId).Count(&count).Error
	if count > 0 {
		return DB.Model(&UserSession{}).Where("session_id = ?", sessionId).
			Update("last_active_at", now).Error
	}
	return DB.Create(&UserSession{
		SessionId:    sessionId,
		UserId:       userId,
		Ip:           ip,
		UserAgent:    userAgent,
		CreatedAt:    now,
		LastActiveAt: now,
	}).Error
}

func DeleteUserSession(sessionId string) error {
	if sessionId == "" {
		return nil
	}
	return DB.Where("session_id = ?", sessionId).Delete(&UserSession{}).Error
}

func DeleteOtherUserSessions(userId int, keepSessionId string) error {
	return DB.Where("user_id = ? AND session_id <> ?", userId, keepSessionId).
		Delete(&UserSession{}).Error
}

// GetUserSessions：本人会话列表（最近活跃在前），并清理 30 天前旧记录
func GetUserSessions(userId int) ([]*UserSession, error) {
	cutoff := time.Now().Unix() - 30*24*3600
	if err := DB.Where("user_id = ? AND last_active_at < ?", userId, cutoff).
		Delete(&UserSession{}).Error; err != nil {
		return nil, err
	}
	var sessions []*UserSession
	err := DB.Where("user_id = ?", userId).Order("last_active_at desc").Limit(50).Find(&sessions).Error
	return sessions, err
}
