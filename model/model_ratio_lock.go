package model

import (
	"errors"

	"github.com/songquanpeng/one-api/common/helper"
	"gorm.io/gorm/clause"
)

// Task4-3 模型倍率自动计算：手动锁定扩展表。
// 不动 users/channels 等核心表；锁定 = 该 model_id 的倍率由人工把持，
// 自动重算流程跳过；解锁 = 删行，下次重算按七牛价格覆盖。

// ModelRatioLock 模型倍率手动锁定记录
type ModelRatioLock struct {
	ModelId         string  `json:"model_id" gorm:"primaryKey;type:varchar(128)"` // 与 ratio.ModelRatio 的 key 一致
	ModelRatio      float64 `json:"model_ratio" gorm:"type:decimal(12,6)"`        // 锁定时的输入倍率快照
	CompletionRatio float64 `json:"completion_ratio" gorm:"type:decimal(12,6)"`   // 锁定时的输出倍率快照
	LockedBy        int     `json:"locked_by"`                                    // 操作人 user_id
	LockedAt        int64   `json:"locked_at" gorm:"bigint"`
	Note            string  `json:"note" gorm:"type:varchar(256)"`
}

func (ModelRatioLock) TableName() string {
	return "model_ratio_locks"
}

// UpsertModelRatioLock 新增/更新一条锁定（同 model_id 重复调用等于更新锁定值，幂等）
func UpsertModelRatioLock(modelId string, modelRatio, completionRatio float64, lockedBy int, note string) error {
	if modelId == "" {
		return errors.New("model_id is required")
	}
	now := helper.GetTimestamp()
	row := ModelRatioLock{
		ModelId:         modelId,
		ModelRatio:      modelRatio,
		CompletionRatio: completionRatio,
		LockedBy:        lockedBy,
		LockedAt:        now,
		Note:            note,
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "model_id"}},
		// 更新时刷新锁定值/操作人/时间；首次锁定的 locked_at/locked_by 会被最新操作者覆盖，符合"重新锁定"语义
		DoUpdates: clause.AssignmentColumns([]string{
			"model_ratio", "completion_ratio", "locked_by", "locked_at", "note",
		}),
	}).Create(&row).Error
}

// DeleteModelRatioLock 解锁；未命中不视为错误
func DeleteModelRatioLock(modelId string) error {
	return DB.Where("model_id = ?", modelId).Delete(&ModelRatioLock{}).Error
}

// GetAllModelRatioLocks 全量锁定清单（小表，分页由前端处理）
func GetAllModelRatioLocks() ([]*ModelRatioLock, error) {
	var locks []*ModelRatioLock
	err := DB.Order("locked_at DESC, model_id ASC").Find(&locks).Error
	if err != nil {
		return nil, err
	}
	return locks, nil
}

// GetModelRatioLockMap 重算流程用：model_id -> 锁定记录
func GetModelRatioLockMap() (map[string]*ModelRatioLock, error) {
	locks, err := GetAllModelRatioLocks()
	if err != nil {
		return nil, err
	}
	result := make(map[string]*ModelRatioLock, len(locks))
	for _, l := range locks {
		result[l.ModelId] = l
	}
	return result, nil
}

// IsModelRatioLocked 判断单个模型是否已锁定（管理端展示用）
func IsModelRatioLocked(modelId string) (bool, error) {
	var count int64
	err := DB.Model(&ModelRatioLock{}).Where("model_id = ?", modelId).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
