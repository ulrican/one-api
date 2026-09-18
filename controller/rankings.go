package controller

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

const rankingsCacheTTL = 60 * time.Second

// RankingItem 排行榜项（模型维度或厂商维度共用）
type RankingItem struct {
	Name         string  `json:"name"`
	Provider     string  `json:"provider,omitempty"` // 仅模型维度返回
	RequestCount int64   `json:"request_count"`
	Quota        int64   `json:"quota"`
	Tokens       int64   `json:"tokens"`
	Share        float64 `json:"share"` // 请求数占比 0-100
}

// RankingsResponse 同时返回模型维度与厂商维度两组聚合
type RankingsResponse struct {
	Range     string         `json:"range"`
	Start     int64          `json:"start"`
	End       int64          `json:"end"`
	Models    []RankingItem  `json:"models"`
	Providers []RankingItem  `json:"providers"`
}

// GetRankings 公开排行榜接口（无需鉴权）
// Query: range=today|week|month|year（默认 today）, limit=20（≤100）
func GetRankings(c *gin.Context) {
	if !config.RankingEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "disabled"})
		return
	}

	timeRange := c.DefaultQuery("range", "today")
	limit := 20
	start, end := computeRangeBounds(timeRange, time.Now())
	cacheKey := "rankings:" + timeRange

	// Redis 缓存
	if common.RedisEnabled {
		if cached, err := common.RedisGet(cacheKey); err == nil && cached != "" {
			var resp RankingsResponse
			if json.Unmarshal([]byte(cached), &resp) == nil {
				c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": resp})
				return
			}
		}
	}

	// 全量查询（最多 100 条，用于厂商二次聚合）
	stats, err := model.GetGlobalModelStats(start, end, 100)
	if err != nil {
		logger.SysError("get rankings failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 计算总请求数
	var totalRequests int64
	for _, s := range stats {
		totalRequests += s.RequestCount
	}

	// 构造模型维度
	models := make([]RankingItem, 0, len(stats))
	// 厂商维度聚合
	providerMap := make(map[string]*RankingItem)
	var providerOrder []string

	for _, s := range stats {
		provider := inferProvider(s.ModelName)
		share := 0.0
		if totalRequests > 0 {
			share = float64(s.RequestCount) / float64(totalRequests) * 100
		}
		// 取前 limit 条作为模型维度展示
		if len(models) < limit {
			models = append(models, RankingItem{
				Name:         s.ModelName,
				Provider:     provider,
				RequestCount: s.RequestCount,
				Quota:        s.Quota,
				Tokens:       s.Tokens,
				Share:        roundTo(share, 2),
			})
		}
		// 厂商聚合
		if p, ok := providerMap[provider]; ok {
			p.RequestCount += s.RequestCount
			p.Quota += s.Quota
			p.Tokens += s.Tokens
		} else {
			providerMap[provider] = &RankingItem{
				Name:         provider,
				RequestCount: s.RequestCount,
				Quota:        s.Quota,
				Tokens:       s.Tokens,
			}
			providerOrder = append(providerOrder, provider)
		}
	}

	// 厂商维度按请求量降序排序
	providers := make([]RankingItem, 0, len(providerOrder))
	for _, name := range providerOrder {
		p := providerMap[name]
		share := 0.0
		if totalRequests > 0 {
			share = float64(p.RequestCount) / float64(totalRequests) * 100
		}
		p.Share = roundTo(share, 2)
		providers = append(providers, *p)
	}
	// 简单插入排序（厂商数量有限）
	for i := 1; i < len(providers); i++ {
		for j := i; j > 0 && providers[j].RequestCount > providers[j-1].RequestCount; j-- {
			providers[j], providers[j-1] = providers[j-1], providers[j]
		}
	}
	// 厂商维度也截断到 limit
	if len(providers) > limit {
		providers = providers[:limit]
	}

	resp := RankingsResponse{
		Range:     timeRange,
		Start:     start,
		End:       end,
		Models:    models,
		Providers: providers,
	}

	// 写 Redis 缓存
	if common.RedisEnabled {
		if bytes, err := json.Marshal(resp); err == nil {
			_ = common.RedisSet(cacheKey, string(bytes), rankingsCacheTTL)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": resp})
}

// computeRangeBounds 根据 range 返回 [start, end] 时间戳（秒）
func computeRangeBounds(timeRange string, now time.Time) (int64, int64) {
	now = now.Local()
	end := now.Unix()
	var start time.Time
	switch timeRange {
	case "week":
		// ISO 周一起始；Sunday=0 时回退 6 天
		daysSinceMonday := int(now.Weekday()) - 1
		if daysSinceMonday < 0 {
			daysSinceMonday = 6
		}
		start = time.Date(now.Year(), now.Month(), now.Day()-daysSinceMonday, 0, 0, 0, 0, now.Location())
	case "month":
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	case "year":
		start = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	default: // today
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	}
	return start.Unix(), end
}

// inferProvider 模型名前缀推断厂商（硬编码规则，不写 DB）
func inferProvider(modelName string) string {
	name := strings.ToLower(modelName)
	switch {
	case strings.HasPrefix(name, "gpt-") || strings.HasPrefix(name, "o1-") || strings.HasPrefix(name, "o3-") ||
		strings.HasPrefix(name, "o4-") || strings.HasPrefix(name, "text-embedding-") ||
		strings.HasPrefix(name, "dall-e-") || strings.HasPrefix(name, "whisper") ||
		strings.HasPrefix(name, "tts-") || strings.HasPrefix(name, "chatgpt-"):
		return "OpenAI"
	case strings.HasPrefix(name, "claude-"):
		return "Anthropic"
	case strings.HasPrefix(name, "gemini-"):
		return "Google"
	case strings.HasPrefix(name, "glm-") || strings.HasPrefix(name, "cogview-"):
		return "Zhipu"
	case strings.HasPrefix(name, "qwen-") || strings.HasPrefix(name, "qwq-") || strings.HasPrefix(name, "qwen2-"):
		return "Alibaba"
	case strings.HasPrefix(name, "deepseek-"):
		return "DeepSeek"
	case strings.HasPrefix(name, "moonshot-") || strings.HasPrefix(name, "kimi-"):
		return "Moonshot"
	case strings.HasPrefix(name, "yi-"):
		return "01.AI"
	case strings.HasPrefix(name, "baichuan-"):
		return "Baichuan"
	case strings.HasPrefix(name, "mistral-") || strings.HasPrefix(name, "mixtral-"):
		return "Mistral"
	case strings.HasPrefix(name, "llama-") || strings.HasPrefix(name, "meta-"):
		return "Meta"
	default:
		return "Other"
	}
}
