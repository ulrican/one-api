package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// F12 两步验证（TOTP）扩展表，一用户一行。不修改 users 核心表。
type UserTwoFA struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"uniqueIndex"`
	Secret    string `json:"-" gorm:"type:varchar(64)"` // base32 密钥，绝不下发
	Enabled   bool   `json:"enabled" gorm:"default:false"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

// GetTwoFA 查询用户 2FA 记录；无记录返回 nil, nil
func GetTwoFA(userId int) (*UserTwoFA, error) {
	var t UserTwoFA
	err := DB.Where("user_id = ?", userId).First(&t).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

// TwoFAEnabled 判断用户是否已启用两步验证
func TwoFAEnabled(userId int) bool {
	t, err := GetTwoFA(userId)
	if err != nil || t == nil {
		return false
	}
	return t.Enabled
}

// UpsertTwoFASetup 保存 setup 阶段密钥（Enabled=false，允许重复调用轮换密钥）
func UpsertTwoFASetup(userId int, secret string) error {
	now := time.Now().Unix()
	var t UserTwoFA
	err := DB.Where("user_id = ?", userId).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		t = UserTwoFA{UserId: userId, Secret: secret, Enabled: false, CreatedAt: now, UpdatedAt: now}
		return DB.Create(&t).Error
	}
	if err != nil {
		return err
	}
	return DB.Model(&UserTwoFA{}).Where("user_id = ?", userId).
		Updates(map[string]any{"secret": secret, "enabled": false, "updated_at": now}).Error
}

// EnableTwoFA 确认验证码正确后启用
func EnableTwoFA(userId int) error {
	return DB.Model(&UserTwoFA{}).Where("user_id = ?", userId).
		Updates(map[string]any{"enabled": true, "updated_at": time.Now().Unix()}).Error
}

// DeleteTwoFA 停用并删除记录
func DeleteTwoFA(userId int) error {
	return DB.Where("user_id = ?", userId).Delete(&UserTwoFA{}).Error
}
