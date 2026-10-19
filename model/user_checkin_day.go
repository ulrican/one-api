package model

import (
	"time"

	"gorm.io/gorm"
)

// UserCheckinDay 签到日历表（一用户一天一行，记录每日签到奖励与阶梯命中）
// 与 logs 表 LogTypeCheckIn 平行：本表结构化存储，方便查询当月日历、连续签到、已领阶梯。
// 不修改 users/logs 等核心表。
type UserCheckinDay struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId      int    `json:"user_id" gorm:"index;uniqueIndex:idx_user_date,priority:1"`
	CheckDate   string `json:"check_date" gorm:"type:char(10);index;uniqueIndex:idx_user_date,priority:2"` // "2006-01-02"
	BaseQuota   int64  `json:"base_quota"`  // 基础随机奖励
	TierQuota   int64  `json:"tier_quota"`  // 阶梯额外奖励（0=未命中阶梯）
	TierHit     int    `json:"tier_hit"`    // 命中的阶梯天数（3/7/14/21/30），0=未命中
	CreatedTime int64  `json:"created_time" gorm:"bigint;index"`
}

// InsertUserCheckinDayTx 在事务内写入签到明细
func InsertUserCheckinDayTx(tx *gorm.DB, record *UserCheckinDay) error {
	return tx.Create(record).Error
}

// GetUserCheckinDaysOfMonth 取某用户指定年月（"2006-01"）的全部签到明细
func GetUserCheckinDaysOfMonth(userId int, yearMonth string) ([]*UserCheckinDay, error) {
	var records []*UserCheckinDay
	err := DB.Where("user_id = ? AND check_date LIKE ?", userId, yearMonth+"%").
		Order("check_date asc").
		Find(&records).Error
	return records, err
}

// CountUserCheckinDaysOfMonth 当月累计签到天数
func CountUserCheckinDaysOfMonth(userId int, yearMonth string) (int64, error) {
	var count int64
	err := DB.Model(&UserCheckinDay{}).
		Where("user_id = ? AND check_date LIKE ?", userId, yearMonth+"%").
		Count(&count).Error
	return count, err
}

// HasUserCheckedDate 某日是否已签到
func HasUserCheckedDate(userId int, date string) (bool, error) {
	var count int64
	err := DB.Model(&UserCheckinDay{}).
		Where("user_id = ? AND check_date = ?", userId, date).
		Count(&count).Error
	return count > 0, err
}

// CountContinuousCheckinDays 计算从 today 往回的连续签到天数
// 今天已签到则含今天，否则从昨天起算（返回 0 表示今天及昨天都没签）
func CountContinuousCheckinDays(userId int, today string) int {
	cont := 0
	cur, err := time.Parse("2006-01-02", today)
	if err != nil {
		return 0
	}
	for {
		dateStr := cur.Format("2006-01-02")
		ok, err := HasUserCheckedDate(userId, dateStr)
		if err != nil || !ok {
			break
		}
		cont++
		cur = cur.AddDate(0, 0, -1)
	}
	return cont
}
