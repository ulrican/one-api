package model

import (
	"errors"
	"time"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/helper"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Task4-2 渠道功能增强：模型库渠道（七牛/其他）凭证扩展表。
// 不动 channels 核心表，独立存储模型库渠道访问凭证（AES-256-GCM 加密）。
//
// 渠道类型 52（七牛模型库 QiniuLibrary）/ 53（其他模型库 OtherLibrary）保存到 channels 表后，
// 由 controller/channel_library.go 在渠道保存/sync 接口里 upsert 本表记录，
// 凭证以密文形式落库，读取时解密为明文返回给管理员。

const (
	LibrarySourceQiniu = "qiniu_library" // 七牛模型库
	LibrarySourceOther = "other_library" // 其他模型库（预留）
)

// ChannelModelSource 模型库渠道凭证扩展表
type ChannelModelSource struct {
	Id           int64     `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId    int       `json:"channel_id" gorm:"uniqueIndex"` // 关联 channels.id（uniqueIndex 已含索引，勿再加 index 否则列重复）
	SourceType   string    `json:"source_type" gorm:"type:varchar(20);index"` // qiniu_library / other_library
	ApiBaseUrl   string    `json:"api_base_url" gorm:"type:varchar(512)"` // 可选自定义网关地址（默认走七牛官方）
	ApiKey       string    `json:"-" gorm:"type:varchar(512)"` // 密文存储（AES-256-GCM），不直接 JSON 暴露
	ApiSecret    string    `json:"-" gorm:"type:varchar(512)"` // 密文存储（AES-256-GCM）
	LastSyncAt   int64     `json:"last_sync_at" gorm:"bigint"`
	CreatedAt    int64     `json:"created_at" gorm:"bigint"`
	UpdatedAt    int64     `json:"updated_at" gorm:"bigint"`
}

func (ChannelModelSource) TableName() string {
	return "channel_model_sources"
}

// ChannelModelSourceView 给前端的视图结构（含明文凭证，仅管理员可访问）
type ChannelModelSourceView struct {
	ChannelId  int    `json:"channel_id"`
	SourceType string `json:"source_type"`
	ApiBaseUrl string `json:"api_base_url"`
	ApiKey     string `json:"api_key"`     // 明文（仅管理员可见）
	ApiSecret  string `json:"api_secret"`  // 明文（仅管理员可见）
	LastSyncAt int64  `json:"last_sync_at"`
}

// ToView 将密文凭证解密后转成视图对象（用于管理员接口返回）
func (s *ChannelModelSource) ToView() (*ChannelModelSourceView, error) {
	apiKey, err := common.DecryptSecret(s.ApiKey)
	if err != nil {
		return nil, err
	}
	apiSecret, err := common.DecryptSecret(s.ApiSecret)
	if err != nil {
		return nil, err
	}
	return &ChannelModelSourceView{
		ChannelId:  s.ChannelId,
		SourceType: s.SourceType,
		ApiBaseUrl: s.ApiBaseUrl,
		ApiKey:     apiKey,
		ApiSecret:  apiSecret,
		LastSyncAt: s.LastSyncAt,
	}, nil
}

// GetChannelModelSource 按 channel_id 取扩展记录（含明文凭证解密）
func GetChannelModelSource(channelId int) (*ChannelModelSourceView, error) {
	var s ChannelModelSource
	err := DB.Where("channel_id = ?", channelId).First(&s).Error
	if err != nil {
		return nil, err
	}
	return s.ToView()
}

// GetChannelModelSourceRaw 按 channel_id 取原始密文记录（不解密）
func GetChannelModelSourceRaw(channelId int) (*ChannelModelSource, error) {
	var s ChannelModelSource
	err := DB.Where("channel_id = ?", channelId).First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpsertChannelModelSource 新增/更新模型库凭证（明文入参，内部加密后落库）
func UpsertChannelModelSource(channelId int, sourceType, apiBaseUrl, apiKey, apiSecret string) error {
	if channelId <= 0 {
		return errors.New("channel_id is required")
	}
	if sourceType == "" {
		sourceType = LibrarySourceQiniu
	}

	encKey, err := common.EncryptSecret(apiKey)
	if err != nil {
		return err
	}
	encSecret, err := common.EncryptSecret(apiSecret)
	if err != nil {
		return err
	}

	now := helper.GetTimestamp()
	row := ChannelModelSource{
		ChannelId:  channelId,
		SourceType: sourceType,
		ApiBaseUrl: apiBaseUrl,
		ApiKey:     encKey,
		ApiSecret:  encSecret,
		UpdatedAt:  now,
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		var existing ChannelModelSource
		findErr := tx.Where("channel_id = ?", channelId).First(&existing).Error
		if findErr == nil {
			// 更新：仅刷新非空字段，避免覆盖未提供的凭证
			updates := map[string]interface{}{
				"source_type": sourceType,
				"updated_at":  now,
			}
			if apiBaseUrl != "" {
				updates["api_base_url"] = apiBaseUrl
			}
			if apiKey != "" {
				updates["api_key"] = encKey
			}
			if apiSecret != "" {
				updates["api_secret"] = encSecret
			}
			return tx.Model(&ChannelModelSource{}).
				Where("channel_id = ?", channelId).
				Updates(updates).Error
		}
		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			row.CreatedAt = now
			return tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "channel_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"source_type", "api_base_url", "api_key", "api_secret", "updated_at"}),
			}).Create(&row).Error
		}
		return findErr
	})
}

// TouchChannelModelSourceSync 更新最后同步时间戳（不影响凭证）
func TouchChannelModelSourceSync(channelId int) error {
	now := time.Now().Unix()
	return DB.Model(&ChannelModelSource{}).
		Where("channel_id = ?", channelId).
		Updates(map[string]interface{}{
			"last_sync_at": now,
			"updated_at":   now,
		}).Error
}

// DeleteChannelModelSource 删除扩展记录（渠道删除时同步清理）
func DeleteChannelModelSource(channelId int) error {
	return DB.Where("channel_id = ?", channelId).Delete(&ChannelModelSource{}).Error
}
