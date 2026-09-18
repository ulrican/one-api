package monitor

import (
	"sync"

	"github.com/songquanpeng/one-api/common/config"
)

// F11：渠道可用率统计。
// 内存滑动窗口（每渠道最近 MetricQueueSize 次调用成败），env ENABLE_METRIC 与
// option ChannelMetricEnabled 任一开启即统计（Emit 运行时读 config，option 即时生效）。
// 消费者 goroutine 常驻（无数据时阻塞在 select，开销可忽略）。

// ChannelMetricSnapshot 渠道窗口指标快照
type ChannelMetricSnapshot struct {
	Total       int     `json:"total"`
	Success     int     `json:"success"`
	Fail        int     `json:"fail"`
	SuccessRate float64 `json:"success_rate"`
}

var (
	store      = make(map[int][]bool)
	storeMutex sync.RWMutex

	metricSuccessChan = make(chan int, config.MetricSuccessChanSize)
	metricFailChan    = make(chan int, config.MetricFailChanSize)
)

func metricEnabled() bool {
	return config.EnableMetric || config.ChannelMetricEnabled
}

func consumeSuccess(channelId int) {
	storeMutex.Lock()
	defer storeMutex.Unlock()
	if len(store[channelId]) > config.MetricQueueSize {
		store[channelId] = store[channelId][1:]
	}
	store[channelId] = append(store[channelId], true)
}

func consumeFail(channelId int) (bool, float64) {
	storeMutex.Lock()
	defer storeMutex.Unlock()
	if len(store[channelId]) > config.MetricQueueSize {
		store[channelId] = store[channelId][1:]
	}
	store[channelId] = append(store[channelId], false)
	successCount := 0
	for _, success := range store[channelId] {
		if success {
			successCount++
		}
	}
	successRate := float64(successCount) / float64(len(store[channelId]))
	if len(store[channelId]) < config.MetricQueueSize {
		return false, successRate
	}
	if successRate < config.MetricSuccessRateThreshold {
		store[channelId] = make([]bool, 0)
		return true, successRate
	}
	return false, successRate
}

func metricSuccessConsumer() {
	for {
		select {
		case channelId := <-metricSuccessChan:
			consumeSuccess(channelId)
		}
	}
}

func metricFailConsumer() {
	for {
		select {
		case channelId := <-metricFailChan:
			disable, successRate := consumeFail(channelId)
			if disable {
				go MetricDisableChannel(channelId, successRate)
			}
		}
	}
}

func init() {
	// F11：消费者常驻；是否统计由 Emit 在运行时按 config 门控
	go metricSuccessConsumer()
	go metricFailConsumer()
}

func Emit(channelId int, success bool) {
	if !metricEnabled() {
		return
	}
	go func() {
		if success {
			metricSuccessChan <- channelId
		} else {
			metricFailChan <- channelId
		}
	}()
}

// GetChannelMetrics 返回所有渠道当前窗口的成功率快照（F11 管理端可用率展示）
func GetChannelMetrics() map[int]ChannelMetricSnapshot {
	storeMutex.RLock()
	defer storeMutex.RUnlock()
	result := make(map[int]ChannelMetricSnapshot, len(store))
	for channelId, records := range store {
		if len(records) == 0 {
			continue
		}
		successCount := 0
		for _, s := range records {
			if s {
				successCount++
			}
		}
		total := len(records)
		result[channelId] = ChannelMetricSnapshot{
			Total:       total,
			Success:     successCount,
			Fail:        total - successCount,
			SuccessRate: float64(successCount) / float64(total),
		}
	}
	return result
}
