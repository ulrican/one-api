package monitor

import (
	"fmt"
	"time"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/message"
	"github.com/songquanpeng/one-api/model"
)

// F10 配额警告：独立协程定期扫描 user_settings（阈值>0 且配置了通知方式），
// 用户配额低于阈值时投递通知；冷却 24h。只读 DB，不进 relay 数据面链路。

const quotaWarningCooldown = 24 * time.Hour

type quotaWarnRow struct {
	UserId                int    `gorm:"column:user_id"`
	NotifyType            string `gorm:"column:notify_type"`
	NotifyPayload         string `gorm:"column:notify_payload"`
	QuotaWarningThreshold int64  `gorm:"column:quota_warning_threshold"`
	Email                 string `gorm:"column:email"`
	Quota                 int64  `gorm:"column:quota"`
}

func scanAndWarnQuota() {
	rows := make([]quotaWarnRow, 0)
	cutoff := time.Now().Unix() - int64(quotaWarningCooldown.Seconds())
	err := model.DB.Table("user_settings us").
		Select("us.user_id, us.notify_type, us.notify_payload, us.quota_warning_threshold, u.email, u.quota").
		Joins("JOIN users u ON u.id = us.user_id").
		Where("us.quota_warning_threshold > 0 AND us.notify_type <> '' AND u.status = ? AND u.quota < us.quota_warning_threshold", model.UserStatusEnabled).
		Where("us.last_notified_at = 0 OR us.last_notified_at < ?", cutoff).
		Limit(100).
		Scan(&rows).Error
	if err != nil {
		logger.SysErrorf("quota warning scan failed: %s", err.Error())
		return
	}
	for _, row := range rows {
		title := fmt.Sprintf("【%s】配额不足提醒", config.SystemName)
		content := fmt.Sprintf("您的剩余额度为 %.4f 美元（阈值 %.4f 美元），请及时充值或兑换，以免影响 API 调用。",
			float64(row.Quota)/config.QuotaPerUnit,
			float64(row.QuotaWarningThreshold)/config.QuotaPerUnit)
		if err := message.SendUserNotifyQuiet(row.NotifyType, row.NotifyPayload, row.Email, title, content); err != nil {
			// 投递失败不更新冷却时间，下轮重试
			continue
		}
		if err := model.UpdateUserSettingLastNotifiedAt(row.UserId, time.Now().Unix()); err != nil {
			logger.SysErrorf("update last_notified_at failed (user %d): %s", row.UserId, err.Error())
		}
	}
}

func WarnQuotaUsers(intervalSeconds int) {
	if intervalSeconds <= 0 {
		intervalSeconds = 600
	}
	logger.SysLogf("quota warning monitor started, interval %ds", intervalSeconds)
	for {
		scanAndWarnQuota()
		time.Sleep(time.Duration(intervalSeconds) * time.Second)
	}
}
