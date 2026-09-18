package monitor

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
)

// F11 渠道故障 webhook 告警。
// 邮件/MessagePusher 通知为 monitor/channel.go 原有行为；本文件仅新增 webhook 投递，
// 全部 best-effort 异步执行，调用点本身已在异步 goroutine 中（relay 错误处理/渠道测试），
// webhook 发送再起 goroutine 双重保险，绝不阻塞管控/数据面。

const (
	AlertEventChannelDisabled       = "channel_disabled"        // 渠道因连续错误被自动禁用
	AlertEventChannelMetricDisabled = "channel_metric_disabled" // 渠道因成功率过低被自动禁用
	AlertEventChannelEnabled        = "channel_enabled"         // 渠道恢复启用
)

var (
	alertCooldownMu sync.Mutex
	alertCooldownAt = make(map[int]int64) // channelId → 上次告警 unix 时间戳（仅故障类事件）
)

// AlertChannelEvent 投递渠道事件 webhook。
// 故障类事件（disabled）受 ChannelAlertCooldownMinutes 冷却限制；恢复事件（enabled）即时投递。
func AlertChannelEvent(eventType string, channelId int, channelName string, reason string) {
	if !config.ChannelAlertEnabled || config.ChannelAlertWebhookUrl == "" {
		return
	}
	now := time.Now().Unix()
	if eventType != AlertEventChannelEnabled {
		alertCooldownMu.Lock()
		last := alertCooldownAt[channelId]
		if last > 0 && now-last < int64(config.ChannelAlertCooldownMinutes)*60 {
			alertCooldownMu.Unlock()
			logger.SysLogf("channel alert suppressed by cooldown: channel #%d event %s", channelId, eventType)
			return
		}
		alertCooldownAt[channelId] = now
		alertCooldownMu.Unlock()
	}
	payload := map[string]any{
		"event":        eventType,
		"channel_id":   channelId,
		"channel_name": channelName,
		"reason":       reason,
		"timestamp":    now,
	}
	go postAlertWebhook(config.ChannelAlertWebhookUrl, payload)
}

func postAlertWebhook(url string, payload map[string]any) {
	body, err := json.Marshal(payload)
	if err != nil {
		logger.SysErrorf("marshal channel alert payload failed: %s", err.Error())
		return
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		logger.SysErrorf("build channel alert request failed: %s", err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		logger.SysErrorf("send channel alert webhook failed: %s", err.Error())
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode >= 300 {
		logger.SysErrorf("channel alert webhook returned status %d", resp.StatusCode)
	}
}
