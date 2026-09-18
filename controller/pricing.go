package controller

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
)

const pricingCacheKey = "pricing:models"

// PricingItem 公开模型价格项
type PricingItem struct {
	Model              string   `json:"model"`
	Groups             []string `json:"groups"`
	InputPriceUSD      float64  `json:"input_price_usd"`       // 每 1K 输入 token 美元价
	OutputPriceUSD     float64  `json:"output_price_usd"`      // 每 1K 输出 token 美元价
	InputPriceRMB      float64  `json:"input_price_rmb"`       // 每 1K 输入 token 人民币价
	OutputPriceRMB     float64  `json:"output_price_rmb"`      // 每 1K 输出 token 人民币价
	CompletionRatio    float64  `json:"completion_ratio"`      // 输出倍率（相对输入）
	ModelRatio         float64  `json:"model_ratio"`           // 模型倍率（1 === $0.002 / 1K tokens）
}

// GetPricing 公开模型价格页接口（无需鉴权）
func GetPricing(c *gin.Context) {
	// Redis 缓存（60s），避免高频查询 DB
	if common.RedisEnabled {
		if cached, err := common.RedisGet(pricingCacheKey); err == nil && cached != "" {
			var items []PricingItem
			if json.Unmarshal([]byte(cached), &items) == nil {
				c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": items})
				return
			}
		}
	}

	models, err := model.GetAllEnabledPricingModels()
	if err != nil {
		logger.SysError("get pricing models failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	items := make([]PricingItem, 0, len(models))
	const usdPerRatioUnit = 0.002 // 1 ratio unit === $0.002 / 1K tokens
	const usd2rmb = 7.0
	for _, m := range models {
		modelRatio := billingratio.GetModelRatio(m.Model, 0)
		completionRatio := billingratio.GetCompletionRatio(m.Model, 0)
		inputUSD := modelRatio * usdPerRatioUnit
		outputUSD := inputUSD * completionRatio
		items = append(items, PricingItem{
			Model:           m.Model,
			Groups:          m.Groups,
			InputPriceUSD:   roundTo(inputUSD, 6),
			OutputPriceUSD:  roundTo(outputUSD, 6),
			InputPriceRMB:   roundTo(inputUSD*usd2rmb, 6),
			OutputPriceRMB:  roundTo(outputUSD*usd2rmb, 6),
			CompletionRatio: completionRatio,
			ModelRatio:      modelRatio,
		})
	}

	if common.RedisEnabled && len(items) > 0 {
		if bytes, err := json.Marshal(items); err == nil {
			_ = common.RedisSet(pricingCacheKey, string(bytes), 60*time.Second)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": items})
}

func roundTo(v float64, n int) float64 {
	shift := 1.0
	for i := 0; i < n; i++ {
		shift *= 10
	}
	return float64(int64(v*shift+0.5)) / shift
}
