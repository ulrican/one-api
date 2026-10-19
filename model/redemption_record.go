package model

import (
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"gorm.io/gorm"
)

// Task4-4：兑换码充值记录（redemption_records）
// 与在线支付订单 orders 平行：用户每次提交兑换码核销（成功/失败）都落一条流水，
// 供充值页「兑换记录」展示。不修改 redemptions 原表结构。
const (
	RedemptionRecordStatusSuccess = 1
	RedemptionRecordStatusFailed  = 2
)

type RedemptionRecord struct {
	Id           int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId       int     `json:"user_id" gorm:"index"`
	RedemptionId int     `json:"redemption_id" gorm:"index"` // 兑换码不存在时为 0
	RKey         string  `json:"r_key" gorm:"type:varchar(64);index"`
	Name         string  `json:"name" gorm:"type:varchar(64)"`
	Quota        int64   `json:"quota"`
	Amount       float64 `json:"amount" gorm:"type:decimal(10,2)"` // 按核销时 PayPrice 折算的金额快照
	Status       int     `json:"status" gorm:"index"`             // 1 成功 / 2 失败
	Remark       string  `json:"remark" gorm:"type:varchar(255)"`
	CreatedTime  int64   `json:"created_time" gorm:"bigint;index"`
}

// newRedemptionRecord 构造一条记录并按当前在线支付单价折算金额。
// Amount = Quota * PayPrice / QuotaPerUnit（与 controller/pay.go 在线支付换算反向一致）；
// 未配置单价（PayPrice<=0）时存 0，前端展示为「-」。
func newRedemptionRecord(userId int, redemptionId int, key, name string, quota int64, status int, remark string) *RedemptionRecord {
	var amount float64
	if status == RedemptionRecordStatusSuccess && config.PayPrice > 0 {
		amount = float64(quota) * config.PayPrice / float64(config.QuotaPerUnit)
	}
	return &RedemptionRecord{
		UserId:       userId,
		RedemptionId: redemptionId,
		RKey:         key,
		Name:         name,
		Quota:        quota,
		Amount:       amount,
		Status:       status,
		Remark:       remark,
		CreatedTime:  helper.GetTimestamp(),
	}
}

// insertRedemptionRecordTx 在指定事务内写记录（成功流水与加额度同事务，保证不丢不重）
func insertRedemptionRecordTx(tx *gorm.DB, record *RedemptionRecord) error {
	return tx.Create(record).Error
}

// InsertRedemptionRecord 事务外写记录（失败流水在核销事务回滚后单独落库）
func InsertRedemptionRecord(record *RedemptionRecord) error {
	return DB.Create(record).Error
}

func GetUserRedemptionRecords(userId int, startIdx int, num int) ([]*RedemptionRecord, error) {
	var records []*RedemptionRecord
	err := DB.Where("user_id = ?", userId).
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&records).Error
	return records, err
}

func CountUserRedemptionRecords(userId int) (int64, error) {
	var count int64
	err := DB.Model(&RedemptionRecord{}).Where("user_id = ?", userId).Count(&count).Error
	return count, err
}
