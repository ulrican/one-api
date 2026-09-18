package model

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/marketplace"
)

// ErrMarketplaceNoSecret 七牛 API Key 未配置
var ErrMarketplaceNoSecret = errors.New("七牛 API Key 未配置，请在运营设置中填写 QiniuApiSecret")

// Task4-1 七牛模型库每日同步：
//   - 仅主节点运行；启动空表立即同步一次，之后每天 03:00（本地时间）同步
//   - 同步失败不删旧数据、不覆盖 last_sync_time，等下个周期/管理端手动触发
//   - 成功后写 MarketplaceLastSyncTime 并清 marketplace:list:* 缓存

const marketplaceCachePrefix = "marketplace:list:"

// StartMarketplaceSync 启动模型库每日同步协程（仅主节点）
func StartMarketplaceSync() {
	if !config.IsMasterNode {
		return
	}
	go func() {
		// 新部署/新启用后空表立即同步，不必等夜间
		if cnt, err := CountMarketModels(); err == nil && cnt == 0 {
			syncMarketplaceOnce("startup")
		}
		for {
			timer := time.NewTimer(durationUntilNextMarketplaceSync())
			<-timer.C
			if config.MarketplaceEnabled {
				syncMarketplaceOnce("daily")
			}
			timer.Stop()
		}
	}()
}

// durationUntilNextMarketplaceSync 距下次 03:00 的时长（已过则顺延到明天）
func durationUntilNextMarketplaceSync() time.Duration {
	now := time.Now()
	next := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next.Sub(now)
}

func syncMarketplaceOnce(trigger string) {
	n, err := SyncMarketplaceModels()
	if err != nil {
		logger.SysError("marketplace models sync failed (" + trigger + "): " + err.Error())
		return
	}
	logger.SysLogf("marketplace models sync succeeded (%s): %d models upserted", trigger, n)
}

// SyncMarketplaceModels 从七牛拉取两页数据，差集打标后全量落库（协程与管理端手动接口共用）。
// 返回 upsert 模型总数。使用系统配置 QiniuApiSecret 作为凭证。
func SyncMarketplaceModels() (int, error) {
	if config.QiniuApiSecret == "" {
		return 0, ErrMarketplaceNoSecret
	}
	return SyncMarketplaceModelsWithSecret(config.QiniuApiSecret)
}

// SyncMarketplaceModelsWithSecret 使用指定凭证执行同步（Task4-2 渠道模型库复用）。
// secret 为七牛 API Key（Bearer Token），由调用方提供：
//   - 系统级每日同步/管理端 /api/marketplace/sync：传 config.QiniuApiSecret
//   - 渠道模型库 /api/channel/library/sync：传 channel_model_sources 解密后的 api_secret
func SyncMarketplaceModelsWithSecret(secret string) (int, error) {
	if secret == "" {
		return 0, ErrMarketplaceNoSecret
	}
	domestic, err := marketplace.FetchQiniuModels(secret, false)
	if err != nil {
		return 0, err
	}
	all, err := marketplace.FetchQiniuModels(secret, true)
	if err != nil {
		return 0, err
	}

	domesticIds := make(map[string]bool, len(domestic))
	for _, m := range domestic {
		if m.Model.Id != "" {
			domesticIds[m.Model.Id] = true
		}
	}

	// 并集去重：以 overseas=true 全集为主，补入国内集合中独有的模型
	unified := make(map[string]*marketplace.QiniuModel, len(all)+len(domestic))
	order := make([]string, 0, len(all)+len(domestic))
	for _, m := range all {
		if m.Model.Id == "" {
			continue
		}
		unified[m.Model.Id] = m
		order = append(order, m.Model.Id)
	}
	for _, m := range domestic {
		if m.Model.Id == "" {
			continue
		}
		if _, exists := unified[m.Model.Id]; !exists {
			unified[m.Model.Id] = m
			order = append(order, m.Model.Id)
		}
	}

	now := time.Now().Unix()
	rows := make([]MarketModel, 0, len(order))
	for _, id := range order {
		region := MarketRegionOverseas
		if domesticIds[id] {
			region = MarketRegionDomestic
		}
		rows = append(rows, buildMarketModel(unified[id], region, now))
	}

	if err := ReplaceAllMarketModels(rows); err != nil {
		return 0, err
	}

	lastSync := time.Now().Format("2006-01-02 15:04:05")
	if err := UpdateOption("MarketplaceLastSyncTime", lastSync); err != nil {
		logger.SysError("failed to save MarketplaceLastSyncTime: " + err.Error())
	}
	if common.RedisEnabled {
		if err := common.RedisDelByPrefix(marketplaceCachePrefix); err != nil {
			logger.SysError("failed to clear marketplace list cache: " + err.Error())
		}
	}
	// Task4-3 价目同步成功后异步重算倍率（每日同步/启动空表同步/模型库渠道 sync 共用本入口，
	// 内部自带去重——无变更不写库，已锁定模型自动跳过）
	AsyncAutoRecomputeRatios()
	return len(rows), nil
}

// normalizeMarketSentinel 七牛占位哨兵值归零：
// 全 9 序列（≥4 位，如 9999/99999/99999999999）或 ≥10 亿（如 gpt-image 的 1e9）。
func normalizeMarketSentinel(v int64) int64 {
	if v <= 0 {
		return 0
	}
	if v >= 1_000_000_000 {
		return 0
	}
	x := v
	digits := 0
	for x > 0 {
		if x%10 != 9 {
			return v
		}
		x /= 10
		digits++
	}
	if digits >= 4 {
		return 0
	}
	return v
}

// buildMarketModel 七牛原始模型 → 库行（扁平列 + detail_json）
func buildMarketModel(qm *marketplace.QiniuModel, region string, now int64) MarketModel {
	m := qm.Model
	priceIn, priceOut, priceUnit, isFree := marketplace.ExtractSummaryPrice(m.PricingRulesV2)

	caps := make([]string, 0, 4)
	if m.Architecture.FunctionCalling.Supported {
		caps = append(caps, "function_calling")
	}
	if m.Architecture.Reasoning.Supported {
		caps = append(caps, "reasoning")
	}
	if m.Architecture.SchemaOutput.Supported {
		caps = append(caps, "schema_output")
	}
	if m.Architecture.ContentCache.Supported {
		caps = append(caps, "content_cache")
	}

	hotTagCodes, _ := json.Marshal(marketplace.MapHotTags(m.HotTags))
	featureCodes, _ := json.Marshal(marketplace.MapFeatures(m.Features))

	// 七牛对生图/视频等不适用模型用哨兵值占位（实测：9999/99999/9999999/
	// 99999999/99999999999 全 9 序列，以及 1000000000），统一归零避免污染排序与展示
	contextLength := normalizeMarketSentinel(m.ModelConstraints.ContextLength)
	maxOutput := normalizeMarketSentinel(m.ModelConstraints.MaxCompletionTokens)
	if maxOutput <= 0 {
		maxOutput = normalizeMarketSentinel(m.ModelConstraints.MaxTokens)
	}

	freeFlag := 0
	if isFree {
		freeFlag = 1
	}

	return MarketModel{
		ModelId:          m.Id,
		Name:             m.Name,
		Region:           region,
		IssuerName:       m.Issuer.Name,
		IssuerAvatar:     m.Issuer.Avatar,
		Avatar:           m.Avatar,
		Description:      m.Description,
		HotTags:          string(hotTagCodes),
		Features:         string(featureCodes),
		InputModalities:  strings.Join(m.Architecture.InputModalities, ","),
		OutputModalities: strings.Join(m.Architecture.OutputModalities, ","),
		ContextLength:    contextLength,
		MaxOutputTokens:  maxOutput,
		Protocols:        strings.Join(m.SupportApiProtocols, ","),
		Rank:             m.Rank,
		PriceInput:       priceIn,
		PriceOutput:      priceOut,
		PriceUnit:        priceUnit,
		IsFree:           freeFlag,
		Capabilities:     strings.Join(caps, ","),
		ReleaseAt:        m.ReleaseAt,
		RetirementAt:     m.RetirementAt,
		Filing:           m.ModelFiling.FilingNo,
		PricingPageUrl:   m.PricingPageUrl,
		SuggestedModel:   m.SuggestedModel,
		ModelAlias:       strings.Join([]string(m.ModelAlias), ","),
		DetailJson:       strings.TrimSpace(string(qm.Raw)),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
}
