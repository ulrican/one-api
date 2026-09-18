package model

import (
	"github.com/songquanpeng/one-api/common/helper"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Task4-1 模型广场：七牛模型库每日同步扩展表（不动核心表，192 行级小表，
// 复杂嵌套结构以 detail_json 原始 JSON 留存，列表筛选字段扁平成列）。

const (
	MarketRegionDomestic = "domestic" // 国内模型（出现在 overseas=false 集合）
	MarketRegionOverseas = "overseas" // 纯海外模型（仅出现在 overseas=true 集合）

	MarketPriceUnitToken   = "token"   // ¥/百万 token
	MarketPriceUnitImage   = "image"   // ¥/张
	MarketPriceUnitSecond  = "second"  // ¥/秒
	MarketPriceUnitUnknown = "unknown" // 无价目

	MarketNoPrice = -1.0 // 无价目哨兵值（排序时垫底）
)

// MarketModel 模型广场模型表
type MarketModel struct {
	Id               int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	ModelId          string  `json:"model_id" gorm:"uniqueIndex;type:varchar(128)"` // 七牛模型 id（如 deepseek/deepseek-v3.1）
	Name             string  `json:"name" gorm:"type:varchar(128)"`
	Region           string  `json:"region" gorm:"type:varchar(16);index"` // domestic / overseas
	IssuerName       string  `json:"issuer_name" gorm:"type:varchar(64);index"`
	IssuerAvatar     string  `json:"issuer_avatar" gorm:"type:varchar(512)"`
	Avatar           string  `json:"avatar" gorm:"type:text"` // 实测存在 data:image/png;base64 内联图标（>3KB）
	Description      string  `json:"description" gorm:"type:text"`
	HotTags          string  `json:"hot_tags" gorm:"type:varchar(255)"` // code JSON 数组，如 ["hot","new"]
	Features         string  `json:"features" gorm:"type:varchar(255)"` // code JSON 数组（如 ["reasoning"]）
	InputModalities  string  `json:"input_modalities" gorm:"type:varchar(128)"`
	OutputModalities string  `json:"output_modalities" gorm:"type:varchar(128)"`
	ContextLength    int64   `json:"context_length" gorm:"bigint"`
	MaxOutputTokens  int64   `json:"max_output_tokens" gorm:"bigint"`
	Protocols        string  `json:"protocols" gorm:"type:varchar(128)"`
	Rank             int     `json:"rank" gorm:"index"` // 官方排序权重，越小越靠前
	PriceInput       float64 `json:"price_input" gorm:"type:decimal(12,6);index"`
	PriceOutput      float64 `json:"price_output" gorm:"type:decimal(12,6);index"`
	PriceUnit        string  `json:"price_unit" gorm:"type:varchar(16)"`
	IsFree           int     `json:"is_free" gorm:"tinyint;index"`
	Capabilities     string  `json:"capabilities" gorm:"type:varchar(128)"` // function_calling,reasoning,schema_output,content_cache
	ReleaseAt        string  `json:"release_at" gorm:"type:varchar(32)"`
	RetirementAt     string  `json:"retirement_at" gorm:"type:varchar(32)"`
	Filing           string  `json:"filing" gorm:"type:varchar(255)"`
	PricingPageUrl   string  `json:"pricing_page_url" gorm:"type:varchar(512)"`
	SuggestedModel   string  `json:"suggested_model" gorm:"type:varchar(128)"`
	ModelAlias       string  `json:"model_alias" gorm:"type:varchar(255)"`
	DetailJson       string  `json:"detail_json" gorm:"type:longtext"` // 七牛完整原始对象 JSON
	CreatedAt        int64   `json:"created_at" gorm:"bigint"`
	UpdatedAt        int64   `json:"updated_at" gorm:"bigint"`
}

func (MarketModel) TableName() string {
	return "market_models"
}

// MarketModelQuery 列表查询条件（全部可选）
type MarketModelQuery struct {
	Region   string // all(默认) / domestic / overseas
	Keyword  string // name / model_id / description 模糊匹配
	Issuer   string // issuer_name 精确匹配
	Modality string // text/image/video/audio/file，匹配 input_modalities
	Feature  string // 能力 code 精确（features JSON LIKE）
	Sort     string // rank(默认) / price_asc / context_desc
	Page     int
	PageSize int
}

// MarketIssuerFacet 厂商筛选项（按模型数降序）
type MarketIssuerFacet struct {
	IssuerName string `json:"issuer_name"`
	Count      int64  `json:"count"`
}

func marketModelListQuery(q MarketModelQuery) *gorm.DB {
	tx := DB.Model(&MarketModel{})
	if q.Region == MarketRegionDomestic || q.Region == MarketRegionOverseas {
		tx = tx.Where("region = ?", q.Region)
	}
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		tx = tx.Where("name LIKE ? OR model_id LIKE ? OR description LIKE ?", like, like, like)
	}
	if q.Issuer != "" {
		tx = tx.Where("issuer_name = ?", q.Issuer)
	}
	if q.Modality != "" {
		tx = tx.Where("input_modalities LIKE ?", "%"+q.Modality+"%")
	}
	if q.Feature != "" {
		// features 存 code JSON 数组：["reasoning","tool_call"]
		tx = tx.Where("features LIKE ?", "%\""+q.Feature+"\"%")
	}
	return tx
}

// SearchMarketModels 分页查询模型列表
func SearchMarketModels(q MarketModelQuery) ([]*MarketModel, int64, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.PageSize <= 0 {
		q.PageSize = 24
	}
	if q.PageSize > 60 {
		q.PageSize = 60
	}
	tx := marketModelListQuery(q)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	// 注意：rank 是 MySQL 8.0 保留字（RANK 窗口函数），裸写会语法错误，必须反引号
	order := "`rank` ASC, `id` ASC"
	switch q.Sort {
	case "price_asc":
		// 无价目(-1)垫底；其余按摘要输入价升序（0 元免费自然在前）
		order = "CASE WHEN `price_input` < 0 THEN 1 ELSE 0 END ASC, `price_input` ASC, `rank` ASC"
	case "context_desc":
		order = "`context_length` DESC, `rank` ASC"
	}
	var items []*MarketModel
	err := marketModelListQuery(q).
		Order(order).
		Offset((q.Page - 1) * q.PageSize).
		Limit(q.PageSize).
		Find(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// GetMarketModelByModelId 按七牛 model_id 查询单行（详情接口）
func GetMarketModelByModelId(modelId string) (*MarketModel, error) {
	var m MarketModel
	err := DB.Where("model_id = ?", modelId).First(&m).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// CountMarketModels 全表行数（启动时空表判定）
func CountMarketModels() (int64, error) {
	var count int64
	err := DB.Model(&MarketModel{}).Count(&count).Error
	return count, err
}

// CountMarketModelsByRegion 分区计数（Tab 角标：全部/国内/海外，不受筛选影响）
func CountMarketModelsByRegion() (all int64, domestic int64, overseas int64, err error) {
	type row struct {
		Region string
		Cnt    int64
	}
	var rows []row
	err = DB.Model(&MarketModel{}).
		Select("region, count(*) as cnt").
		Group("region").
		Scan(&rows).Error
	if err != nil {
		return 0, 0, 0, err
	}
	for _, r := range rows {
		all += r.Cnt
		switch r.Region {
		case MarketRegionDomestic:
			domestic = r.Cnt
		case MarketRegionOverseas:
			overseas = r.Cnt
		}
	}
	return all, domestic, overseas, nil
}

// GetMarketIssuerFacets 全量厂商名（按模型数降序），供筛选下拉
func GetMarketIssuerFacets() ([]*MarketIssuerFacet, error) {
	var facets []*MarketIssuerFacet
	err := DB.Model(&MarketModel{}).
		Select("issuer_name, count(*) as count").
		Where("issuer_name <> ''").
		Group("issuer_name").
		Order("count DESC, issuer_name ASC").
		Scan(&facets).Error
	if err != nil {
		return nil, err
	}
	return facets, nil
}

// marketModelUpsertColumns 冲突时全量更新的列（created_at 保留插入时旧值）
var marketModelUpsertColumns = []string{
	"name", "region", "issuer_name", "issuer_avatar", "avatar", "description",
	"hot_tags", "features", "input_modalities", "output_modalities",
	"context_length", "max_output_tokens", "protocols", "rank",
	"price_input", "price_output", "price_unit", "is_free", "capabilities",
	"release_at", "retirement_at", "filing", "pricing_page_url",
	"suggested_model", "model_alias", "detail_json", "updated_at",
}

// ReplaceAllMarketModels 全量同步写：单事务内分批 upsert，随后删除本批之外的旧行
// （处理官方下架模型）。任一步失败整体回滚，旧数据保持不动。
func ReplaceAllMarketModels(models []MarketModel) error {
	if len(models) == 0 {
		// 防御：空结果绝不清表（同步失败语义由调用方保证，这里双保险）
		return nil
	}
	now := helper.GetTimestamp()
	ids := make([]string, 0, len(models))
	for i := range models {
		models[i].CreatedAt = now
		models[i].UpdatedAt = now
		ids = append(ids, models[i].ModelId)
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		// SQLite 单语句变量上限较低（旧版 999），按 50 行分批
		for start := 0; start < len(models); start += 50 {
			end := start + 50
			if end > len(models) {
				end = len(models)
			}
			batch := models[start:end]
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "model_id"}},
				DoUpdates: clause.AssignmentColumns(marketModelUpsertColumns),
			}).Create(&batch).Error; err != nil {
				return err
			}
		}
		// 删除本批 model_id 集合之外的旧行（官方下架）
		if err := tx.Where("model_id NOT IN ?", ids).Delete(&MarketModel{}).Error; err != nil {
			return err
		}
		return nil
	})
}
