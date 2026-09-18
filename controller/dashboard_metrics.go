package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
)

// F8 数据看板增强：RPM/TPM 实时指标 + 最近 7 天模型维度调用分析（Top N）

const dashboardTopModelsCacheTTL = 60 * time.Second

func GetUserDashboardMetrics(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	now := time.Now()

	// RPM/TPM：最近 60 秒实时统计（不缓存，保证与日志抽样一致）
	rpm, tpm := model.SumUserRecentUsage(userId, now.Add(-time.Minute).Unix())

	// 模型维度：最近 7 天 Top 10（Redis 缓存 60s，无 Redis 直查 DB）
	end := now.Unix()
	start := now.AddDate(0, 0, -6).Unix()
	stats := make([]*model.ModelStat, 0)
	cacheKey := fmt.Sprintf("dash_metrics:top_models:%d", userId)
	cached := false
	if common.RedisEnabled {
		if val, err := common.RedisGet(cacheKey); err == nil && val != "" {
			if err = json.Unmarshal([]byte(val), &stats); err == nil {
				cached = true
			}
		}
	}
	if !cached {
		var err error
		stats, err = model.GetUserModelStats(userId, start, end, 10)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		if common.RedisEnabled {
			if data, err := json.Marshal(stats); err == nil {
				_ = common.RedisSet(cacheKey, string(data), dashboardTopModelsCacheTTL)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"rpm":        rpm,
			"tpm":        tpm,
			"top_models": stats,
			"start":      start,
			"end":        end,
		},
	})
}
