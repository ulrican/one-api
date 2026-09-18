package model

import (
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/logger"
	"gorm.io/gorm"
)

// F10 个人中心增强：用户扩展设置（通知渠道/配额警告阈值/会话吊销版本号）
// 一用户一行，惰性创建；不改 users 核心表
// 通知方式常量定义在 common/message（NotifyTypeEmail/Bark/Gotify/Webhook），
// 本包已依赖 message，不可反向引用

type UserSetting struct {
	Id                   int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId               int    `json:"user_id" gorm:"uniqueIndex;default:0"`
	NotifyType           string `json:"notify_type" gorm:"type:varchar(20);default:''"`
	NotifyPayload        string `json:"notify_payload" gorm:"type:text"`
	QuotaWarningThreshold int64 `json:"quota_warning_threshold" gorm:"default:0"`
	LastNotifiedAt       int64  `json:"last_notified_at" gorm:"default:0"`
	SessionEpoch         int64  `json:"session_epoch" gorm:"default:0"`
}

func (us *UserSetting) GetPayloadMap() map[string]string {
	m := make(map[string]string)
	_ = json.Unmarshal([]byte(us.NotifyPayload), &m)
	return m
}

func GetUserSetting(userId int) (*UserSetting, error) {
	if userId <= 0 {
		return &UserSetting{UserId: userId}, nil
	}
	var us UserSetting
	err := DB.Where("user_id = ?", userId).First(&us).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return &UserSetting{UserId: userId}, nil
		}
		return nil, err
	}
	return &us, nil
}

// UpsertUserSetting：存在则按列更新（零值可清空），不存在则创建
func UpsertUserSetting(us *UserSetting) error {
	var existing UserSetting
	err := DB.Where("user_id = ?", us.UserId).First(&existing).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return DB.Create(us).Error
		}
		return err
	}
	existing.NotifyType = us.NotifyType
	existing.NotifyPayload = us.NotifyPayload
	existing.QuotaWarningThreshold = us.QuotaWarningThreshold
	err = DB.Model(&existing).Select("notify_type", "notify_payload", "quota_warning_threshold").Updates(&existing).Error
	if err == nil {
		*us = existing
	}
	return err
}

func UpdateUserSettingLastNotifiedAt(userId int, ts int64) error {
	return DB.Model(&UserSetting{}).Where("user_id = ?", userId).
		Update("last_notified_at", ts).Error
}

// ---------- SessionEpoch（会话吊销版本号，带缓存） ----------

var (
	sessionEpochCache   sync.Map // map[int]epochCacheItem
	sessionEpochCacheTTL = 60 * time.Second
)

type epochCacheItem struct {
	value   int64
	expires time.Time
}

// GetSessionEpoch：读用户会话版本号；Redis 缓存 60s，无 Redis 用进程内缓存。
// 无记录返回 0（存量会话兼容：epoch=0 不做校验）。
func GetSessionEpoch(userId int) int64 {
	if common.RedisEnabled {
		if v, err := common.RedisGet(fmt.Sprintf("session_epoch:%d", userId)); err == nil {
			n, _ := strconv.ParseInt(v, 10, 64)
			return n
		}
	} else {
		if item, ok := sessionEpochCache.Load(userId); ok {
			it := item.(epochCacheItem)
			if time.Now().Before(it.expires) {
				return it.value
			}
			sessionEpochCache.Delete(userId)
		}
	}
	var us UserSetting
	err := DB.Select("session_epoch").Where("user_id = ?", userId).First(&us).Error
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			logger.SysErrorf("GetSessionEpoch(user %d): %s", userId, err.Error())
		}
		return 0
	}
	setSessionEpochCache(userId, us.SessionEpoch)
	return us.SessionEpoch
}

func setSessionEpochCache(userId int, epoch int64) {
	if common.RedisEnabled {
		_ = common.RedisSet(fmt.Sprintf("session_epoch:%d", userId), strconv.FormatInt(epoch, 10), sessionEpochCacheTTL)
	} else {
		sessionEpochCache.Store(userId, epochCacheItem{value: epoch, expires: time.Now().Add(sessionEpochCacheTTL)})
	}
}

// BumpSessionEpoch：版本号 +1 并写透缓存；返回新版本号
func BumpSessionEpoch(userId int) (int64, error) {
	var us UserSetting
	err := DB.Where("user_id = ?", userId).First(&us).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			us = UserSetting{UserId: userId, SessionEpoch: 1}
			if err = DB.Create(&us).Error; err != nil {
				return 0, err
			}
			setSessionEpochCache(userId, us.SessionEpoch)
			return us.SessionEpoch, nil
		}
		return 0, err
	}
	newEpoch := us.SessionEpoch + 1
	err = DB.Model(&UserSetting{}).Where("user_id = ?", userId).Update("session_epoch", newEpoch).Error
	if err != nil {
		return 0, err
	}
	setSessionEpochCache(userId, newEpoch)
	return newEpoch, nil
}
