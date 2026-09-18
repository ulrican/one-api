package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/channeltype"
	"gorm.io/gorm"
)

// Task4-2 渠道功能增强：模型库渠道（七牛/其他）凭证管理与模型列表查询。
// 不动 channels 核心表，凭证独立存储于 channel_model_sources 扩展表（AES-256-GCM 加密）。
//
// 接口设计：
//   - GET  /api/channel/library/models  拉取模型库模型列表（默认读 market_models 秒级响应）
//   - POST /api/channel/library/sync    触发七牛 API 全量同步并 upsert 凭证

// LibraryModelDTO 模型库模型下拉项（精简字段，供前端选择）
type LibraryModelDTO struct {
	ModelId     string  `json:"model_id"`
	Name        string  `json:"name"`
	IssuerName  string  `json:"issuer_name"`
	PriceInput  float64 `json:"price_input"`
	PriceOutput float64 `json:"price_output"`
}

// librarySyncRequest 同步请求体（管理员提交）
type librarySyncRequest struct {
	ChannelId  int    `json:"channel_id"`   // 可选：已保存的渠道 id，提供则从 DB 取凭证
	SourceType string `json:"source_type"` // qiniu_library / other_library，默认 qiniu_library
	ApiBaseUrl string `json:"api_base_url"`
	ApiKey     string `json:"api_key"`  // 七牛 Bearer Token（与 api_secret 一致，兼容前端两个字段）
	ApiSecret  string `json:"api_secret"` // 七牛 API Key（实际作为 Bearer Token 使用）
}

// GetChannelSource GET /api/channel/library/source?channel_id=123
// 返回已保存的渠道凭证（AES 解密后明文，仅管理员可访问）。
// 编辑渠道时回填表单使用；若该 channel_id 未保存凭证则返回空对象。
func GetChannelSource(c *gin.Context) {
	channelIdStr := strings.TrimSpace(c.Query("channel_id"))
	channelId, err := strconv.Atoi(channelIdStr)
	if err != nil || channelId <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid channel_id"})
		return
	}
	view, err := model.GetChannelModelSource(channelId)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "",
				"data":    nil,
			})
			return
		}
		logger.SysError("channel library get source failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    view,
	})
}

// GetLibraryModels GET /api/channel/library/models?source_type=qiniu_library
// 拉取模型库支持的模型列表，供管理员在渠道编辑页选择。
//   - source_type=qiniu_library：从 market_models 表读取（与广场同源，秒级响应）
//   - source_type=other_library：返回空列表 + 提示信息（预留框架，未接入实际第三方）
func GetLibraryModels(c *gin.Context) {
	sourceType := strings.TrimSpace(c.DefaultQuery("source_type", model.LibrarySourceQiniu))
	switch sourceType {
	case model.LibrarySourceQiniu:
		// 复用广场列表查询，取较大一页（200 条）覆盖主流模型
		items, _, err := model.SearchMarketModels(model.MarketModelQuery{
			Page:     1,
			PageSize: 200,
			Sort:     "rank",
		})
		if err != nil {
			logger.SysError("channel library list models failed: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
		list := make([]*LibraryModelDTO, 0, len(items))
		for _, m := range items {
			list = append(list, &LibraryModelDTO{
				ModelId:     m.ModelId,
				Name:        m.Name,
				IssuerName:  m.IssuerName,
				PriceInput:  m.PriceInput,
				PriceOutput: m.PriceOutput,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    list,
		})
	case model.LibrarySourceOther:
		// 预留框架：返回空列表 + 提示
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "其他模型库待接入",
			"data":    []*LibraryModelDTO{},
		})
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid source_type: " + sourceType,
		})
	}
}

// SyncLibraryModels POST /api/channel/library/sync
// 触发模型库全量同步：从七牛拉取模型列表 → 写入 market_models 表 → 更新 channel_model_sources.last_sync_at。
// 凭证来源优先级：
//  1. body 显式传入的 api_secret（前端表单刚填写，尚未保存）
//  2. channel_id 关联的 channel_model_sources 解密后的 api_secret（已保存的凭证）
func SyncLibraryModels(c *gin.Context) {
	var req librarySyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.SourceType == "" {
		req.SourceType = model.LibrarySourceQiniu
	}
	if req.SourceType != model.LibrarySourceQiniu {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "暂不支持该模型库类型：source_type=" + req.SourceType,
		})
		return
	}

	// 凭证解析：body 优先，否则从 DB 取（已保存的渠道）
	apiSecret := strings.TrimSpace(req.ApiSecret)
	apiKey := strings.TrimSpace(req.ApiKey)
	apiBaseUrl := strings.TrimSpace(req.ApiBaseUrl)

	if apiSecret == "" && req.ChannelId > 0 {
		view, err := model.GetChannelModelSource(req.ChannelId)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			logger.SysError("channel library load source failed: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
		if view != nil {
			if apiSecret == "" {
				apiSecret = view.ApiSecret
			}
			if apiKey == "" {
				apiKey = view.ApiKey
			}
			if apiBaseUrl == "" {
				apiBaseUrl = view.ApiBaseUrl
			}
		}
	}

	if apiSecret == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "缺少 api_secret（七牛 API Key），请先在表单填写或保存渠道凭证",
		})
		return
	}

	// 触发七牛全量同步（复用 Task4-1 同步核心逻辑，仅切换凭证）
	n, err := model.SyncMarketplaceModelsWithSecret(apiSecret)
	if err != nil {
		logger.SysError("channel library sync failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 若提供 channel_id，则 upsert 凭证并更新 last_sync_at
	if req.ChannelId > 0 {
		if err := model.UpsertChannelModelSource(req.ChannelId, req.SourceType, apiBaseUrl, apiKey, apiSecret); err != nil {
			logger.SysError("channel library upsert source failed: " + err.Error())
		}
		if err := model.TouchChannelModelSourceSync(req.ChannelId); err != nil {
			logger.SysError("channel library touch sync time failed: " + err.Error())
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    gin.H{"synced": n},
	})
}

// libraryCredentialProbe 渠道新增/更新请求体中的模型库独立凭证（Task4-2）。
// 指针字段区分"未携带"（列表页启停等最小 PUT）与"显式提交"（编辑页保存）。
type libraryCredentialProbe struct {
	LibraryApiKey     *string `json:"library_api_key"`
	LibraryApiSecret  *string `json:"library_api_secret"`
	LibraryApiBaseUrl *string `json:"library_api_base_url"`
}

// deref 取显式提交的凭证；未携带的字段返回空串（由 model 层 Upsert 跳过，保留旧值）。
// 注意：不回退到渠道 key/base_url——列表页启停等最小 PUT 不携带 library_* 时，
// 应完全跳过凭证 upsert，避免用渠道 key 覆盖已保存的加密凭证。
func (p libraryCredentialProbe) deref() (apiKey, apiSecret, apiBaseUrl string, hasAny bool) {
	if p.LibraryApiKey != nil {
		apiKey = *p.LibraryApiKey
		hasAny = true
	}
	if p.LibraryApiSecret != nil {
		apiSecret = *p.LibraryApiSecret
		hasAny = true
	}
	if p.LibraryApiBaseUrl != nil {
		apiBaseUrl = *p.LibraryApiBaseUrl
		hasAny = true
	}
	return apiKey, apiSecret, apiBaseUrl, hasAny
}

// saveLibraryCredentialForChannel 渠道新增/更新时同步 upsert 模型库凭证扩展表。
// 仅对模型库渠道类型（52 七牛 / 53 其他）且请求显式携带 library_* 字段时生效；
// 空串字段由 model 层跳过（保留旧值）。失败仅记日志，不阻断渠道主流程保存。
func saveLibraryCredentialForChannel(channelId int, channelType int, apiKey, apiSecret, apiBaseUrl string) {
	if channelId <= 0 ||
		(channelType != channeltype.QiniuLibrary && channelType != channeltype.OtherLibrary) {
		return
	}
	sourceType := model.LibrarySourceQiniu
	if channelType == channeltype.OtherLibrary {
		sourceType = model.LibrarySourceOther
	}
	if err := model.UpsertChannelModelSource(channelId, sourceType, apiBaseUrl, apiKey, apiSecret); err != nil {
		logger.SysError("channel library upsert source failed: " + err.Error())
	}
}
