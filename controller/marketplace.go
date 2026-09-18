package controller

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// Task4-1 模型广场：公开查询接口（无需鉴权）+ 管理员手动同步。
// 列表 Redis 缓存 60s，缓存使用前判 common.RedisEnabled；同步成功后清前缀。

const marketplaceCacheTTL = 60 * time.Second

// MarketPriceDTO 摘要价
type MarketPriceDTO struct {
	Unit   string  `json:"unit"`
	Input  float64 `json:"input"`
	Output float64 `json:"output"`
	IsFree bool    `json:"is_free"`
}

// MarketModelCardDTO 列表卡片（不含长描述全文与 detail_json）
type MarketModelCardDTO struct {
	ModelId          string           `json:"model_id"`
	Name             string           `json:"name"`
	Region           string           `json:"region"`
	IssuerName       string           `json:"issuer_name"`
	IssuerAvatar     string           `json:"issuer_avatar"`
	Avatar           string           `json:"avatar"`
	ShortDescription string           `json:"short_description"`
	HotTags          []string         `json:"hot_tags"`
	Features         []string         `json:"features"`
	InputModalities  []string         `json:"input_modalities"`
	OutputModalities []string         `json:"output_modalities"`
	ContextLength    int64            `json:"context_length"`
	Rank             int              `json:"rank"`
	Price            MarketPriceDTO   `json:"price"`
	RetirementAt     string           `json:"retirement_at"`
}

// MarketModelDetailDTO 详情（扁平字段 + 七牛原始对象）
type MarketModelDetailDTO struct {
	MarketModelCardDTO
	MaxOutputTokens int64           `json:"max_output_tokens"`
	Protocols       []string        `json:"protocols"`
	Capabilities    []string        `json:"capabilities"`
	ReleaseAt       string          `json:"release_at"`
	Filing          string          `json:"filing"`
	PricingPageUrl  string          `json:"pricing_page_url"`
	SuggestedModel  string          `json:"suggested_model"`
	ModelAlias      []string        `json:"model_alias"`
	Detail          json.RawMessage `json:"detail"`
}

type marketFacetsDTO struct {
	Issuers      []string          `json:"issuers"`
	Counts       map[string]int64  `json:"counts"`
	LastSyncTime string            `json:"last_sync_time"`
}

type marketListData struct {
	Total    int64                 `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"page_size"`
	Facets   marketFacetsDTO       `json:"facets"`
	Items    []*MarketModelCardDTO `json:"items"`
}

var (
	marketAllowedRegions   = map[string]bool{"all": true, "domestic": true, "overseas": true}
	marketAllowedModality  = map[string]bool{"text": true, "image": true, "video": true, "audio": true, "file": true}
	marketAllowedSorts     = map[string]bool{"rank": true, "price_asc": true, "context_desc": true}
)

// GetMarketModels GET /api/marketplace/models（公开）
func GetMarketModels(c *gin.Context) {
	if !config.MarketplaceEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "disabled"})
		return
	}

	q := model.MarketModelQuery{
		Region:   c.DefaultQuery("region", "all"),
		Keyword:  strings.TrimSpace(c.Query("q")),
		Issuer:   strings.TrimSpace(c.Query("issuer")),
		Modality: strings.TrimSpace(c.Query("modality")),
		Feature:  strings.TrimSpace(c.Query("feature")),
		Sort:     c.DefaultQuery("sort", "rank"),
	}
	if !marketAllowedRegions[q.Region] {
		q.Region = "all"
	}
	if q.Modality != "" && !marketAllowedModality[q.Modality] {
		q.Modality = ""
	}
	if !marketAllowedSorts[q.Sort] {
		q.Sort = "rank"
	}
	q.Page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	q.PageSize, _ = strconv.Atoi(c.DefaultQuery("page_size", "24"))
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.PageSize <= 0 {
		q.PageSize = 24
	}
	if q.PageSize > 60 {
		q.PageSize = 60
	}

	cacheKey := marketplaceListCacheKey(c)
	if common.RedisEnabled {
		if cached, err := common.RedisGet(cacheKey); err == nil && cached != "" {
			var data marketListData
			if json.Unmarshal([]byte(cached), &data) == nil {
				c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
				return
			}
		}
	}

	items, total, err := model.SearchMarketModels(q)
	if err != nil {
		logger.SysError("search market models failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	facets, err := buildMarketFacets()
	if err != nil {
		logger.SysError("build market facets failed: " + err.Error())
	}

	cards := make([]*MarketModelCardDTO, 0, len(items))
	for _, m := range items {
		cards = append(cards, toMarketCardDTO(m))
	}
	data := marketListData{
		Total:    total,
		Page:     q.Page,
		PageSize: q.PageSize,
		Facets:   facets,
		Items:    cards,
	}

	if common.RedisEnabled {
		if bytes, err := json.Marshal(data); err == nil {
			_ = common.RedisSet(cacheKey, string(bytes), marketplaceCacheTTL)
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
}

// GetMarketModelDetail GET /api/marketplace/detail?id=model_id（公开）
// query 形式承载含斜杠的七牛 model_id（如 deepseek/deepseek-v3.1）
func GetMarketModelDetail(c *gin.Context) {
	if !config.MarketplaceEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "disabled"})
		return
	}
	id := strings.TrimSpace(c.Query("id"))
	if id == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid parameter: id"})
		return
	}
	m, err := model.GetMarketModelByModelId(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "model not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	detail := json.RawMessage(m.DetailJson)
	if len(strings.TrimSpace(m.DetailJson)) == 0 {
		detail = json.RawMessage("{}")
	}
	dto := MarketModelDetailDTO{
		MarketModelCardDTO: *toMarketCardDTO(m),
		MaxOutputTokens:    m.MaxOutputTokens,
		Protocols:          splitCSV(m.Protocols),
		Capabilities:       splitCSV(m.Capabilities),
		ReleaseAt:          m.ReleaseAt,
		Filing:             m.Filing,
		PricingPageUrl:     m.PricingPageUrl,
		SuggestedModel:     m.SuggestedModel,
		ModelAlias:         splitCSV(m.ModelAlias),
		Detail:             detail,
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": dto})
}

// SyncMarketplace POST /api/marketplace/sync（AdminAuth；不受功能开关控制）
func SyncMarketplace(c *gin.Context) {
	n, err := model.SyncMarketplaceModels()
	if err != nil {
		logger.SysError("manual marketplace sync failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"synced": n}})
}

func toMarketCardDTO(m *model.MarketModel) *MarketModelCardDTO {
	return &MarketModelCardDTO{
		ModelId:          m.ModelId,
		Name:             m.Name,
		Region:           m.Region,
		IssuerName:       m.IssuerName,
		IssuerAvatar:     m.IssuerAvatar,
		Avatar:           m.Avatar,
		ShortDescription: truncateRunes(m.Description, 120),
		HotTags:          parseJSONArray(m.HotTags),
		Features:         parseJSONArray(m.Features),
		InputModalities:  splitCSV(m.InputModalities),
		OutputModalities: splitCSV(m.OutputModalities),
		ContextLength:    m.ContextLength,
		Rank:             m.Rank,
		Price: MarketPriceDTO{
			Unit:   m.PriceUnit,
			Input:  m.PriceInput,
			Output: m.PriceOutput,
			IsFree: m.IsFree == 1,
		},
		RetirementAt: m.RetirementAt,
	}
}

func buildMarketFacets() (marketFacetsDTO, error) {
	facets := marketFacetsDTO{
		Issuers: []string{},
		Counts:  map[string]int64{},
	}
	config.OptionMapRWMutex.RLock()
	facets.LastSyncTime = config.OptionMap["MarketplaceLastSyncTime"]
	config.OptionMapRWMutex.RUnlock()
	issuerFacets, err := model.GetMarketIssuerFacets()
	if err != nil {
		return facets, err
	}
	for _, f := range issuerFacets {
		facets.Issuers = append(facets.Issuers, f.IssuerName)
	}
	all, domestic, overseas, err := model.CountMarketModelsByRegion()
	if err != nil {
		return facets, err
	}
	facets.Counts["all"] = all
	facets.Counts["domestic"] = domestic
	facets.Counts["overseas"] = overseas
	return facets, nil
}

func marketplaceListCacheKey(c *gin.Context) string {
	// 以 query 原始参数组合做 hash，新增筛选参数自动纳入
	keys := make([]string, 0)
	for k, vs := range c.Request.URL.Query() {
		for _, v := range vs {
			keys = append(keys, k+"="+v)
		}
	}
	sort.Strings(keys)
	sum := md5.Sum([]byte(strings.Join(keys, "&")))
	return "marketplace:list:" + hex.EncodeToString(sum[:])
}

func parseJSONArray(s string) []string {
	result := make([]string, 0)
	if strings.TrimSpace(s) == "" {
		return result
	}
	if err := json.Unmarshal([]byte(s), &result); err != nil {
		return []string{}
	}
	return result
}

func splitCSV(s string) []string {
	result := make([]string, 0)
	if strings.TrimSpace(s) == "" {
		return result
	}
	for _, v := range strings.Split(s, ",") {
		v = strings.TrimSpace(v)
		if v != "" {
			result = append(result, v)
		}
	}
	return result
}

func truncateRunes(s string, n int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= n {
		return string(runes)
	}
	return string(runes[:n]) + "…"
}
