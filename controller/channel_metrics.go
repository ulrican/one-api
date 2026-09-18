package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/monitor"
	"github.com/songquanpeng/one-api/routingstats"
)

// F11 渠道可用率：GET /api/channel/metrics（AdminAuth）
// 返回内存滑动窗口内各渠道调用成功率；enabled=false 表示统计未开启（窗口无数据）。
// F9b：data.routing 增加路由统计（平均延迟/连败/剔除状态）。
func GetChannelMetrics(c *gin.Context) {
	metrics := monitor.GetChannelMetrics()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled":     config.EnableMetric || config.ChannelMetricEnabled,
			"window_size": config.MetricQueueSize,
			"metrics":     metrics,
			"routing":     routingstats.Snapshot(),
		},
	})
}
