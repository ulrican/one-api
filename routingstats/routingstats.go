package routingstats

// F9b 数据面路由增强：渠道路由统计（纯内存，异步采集）。
// - 延迟避险：每渠道最近 LatencySampleSize 次成功调用平均耗时参与选路加权
// - 动态剔除：连续失败（仅 429/5xx 计入）达到阈值且窗口内未恢复的渠道，选路时跳过
// 采集入口：controller/relay.go 每次转发尝试；消费方：model 选路 + controller/channel_metrics。
// 全部为内存原子操作，不触 DB/网络，符合数据面无阻塞约束。

import (
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
)

// LatencySampleSize 参与平均延迟计算的样本数（设计要求“最近 5 次调用的平均延迟”）
const LatencySampleSize = 5

// ChannelStat 渠道路由统计快照
type ChannelStat struct {
	AvgLatencyMs     int64 `json:"avg_latency_ms"`
	SampleCount      int   `json:"sample_count"`
	ConsecutiveFails int   `json:"consecutive_fails"`
	LastFailAt       int64 `json:"last_fail_at"` // unix 毫秒，0=无失败记录
	Excluded         bool  `json:"excluded"`
}

type channelStat struct {
	latencies        []int64 // 最近成功调用耗时（毫秒），环形截断至 LatencySampleSize
	consecutiveFails int
	lastFailAtMs     int64
}

var (
	store            = make(map[int]*channelStat)
	storeMutex       sync.RWMutex
	resultChan       chan result
	excludeThreshold = config.RoutingExcludeThreshold
	excludeWindow    = time.Duration(config.RoutingExcludeWindowSeconds) * time.Second
)

type result struct {
	channelId int
	latencyMs int64
	success   bool
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func apply(channelId int, latencyMs int64, success bool) {
	stat := store[channelId]
	if stat == nil {
		stat = &channelStat{}
		store[channelId] = stat
	}
	if success {
		stat.latencies = append(stat.latencies, latencyMs)
		if len(stat.latencies) > LatencySampleSize {
			stat.latencies = stat.latencies[len(stat.latencies)-LatencySampleSize:]
		}
		stat.consecutiveFails = 0
		return
	}
	stat.consecutiveFails++
	stat.lastFailAtMs = nowMs()
}

func consume() {
	for r := range resultChan {
		storeMutex.Lock()
		apply(r.channelId, r.latencyMs, r.success)
		storeMutex.Unlock()
	}
}

func init() {
	resultChan = make(chan result, 1024)
	go consume()
}

// Record 记录一次转发调用的结果（异步，立即返回；队列满时丢弃样本，统计可牺牲）
func Record(channelId int, latencyMs int64, success bool) {
	select {
	case resultChan <- result{channelId: channelId, latencyMs: latencyMs, success: success}:
	default:
	}
}

// IsExcluded 渠道是否应被选路剔除：连败达阈值且最后一次失败仍在窗口内
func IsExcluded(channelId int) bool {
	storeMutex.RLock()
	defer storeMutex.RUnlock()
	stat := store[channelId]
	if stat == nil || stat.consecutiveFails < excludeThreshold {
		return false
	}
	return time.Since(time.UnixMilli(stat.lastFailAtMs)) < excludeWindow
}

// AvgLatencyMs 最近 LatencySampleSize 次成功调用平均耗时（毫秒）；count=0 表示无样本
func AvgLatencyMs(channelId int) (int64, int) {
	storeMutex.RLock()
	defer storeMutex.RUnlock()
	stat := store[channelId]
	if stat == nil || len(stat.latencies) == 0 {
		return 0, 0
	}
	var sum int64
	for _, l := range stat.latencies {
		sum += l
	}
	return sum / int64(len(stat.latencies)), len(stat.latencies)
}

// Snapshot 全渠道统计快照（管理端展示用）
func Snapshot() map[int]ChannelStat {
	storeMutex.RLock()
	defer storeMutex.RUnlock()
	snapshot := make(map[int]ChannelStat, len(store))
	now := time.Now()
	for id, stat := range store {
		s := ChannelStat{
			ConsecutiveFails: stat.consecutiveFails,
			LastFailAt:       stat.lastFailAtMs,
			SampleCount:      len(stat.latencies),
		}
		if s.SampleCount > 0 {
			var sum int64
			for _, l := range stat.latencies {
				sum += l
			}
			s.AvgLatencyMs = sum / int64(s.SampleCount)
		}
		if stat.consecutiveFails >= excludeThreshold && now.Sub(time.UnixMilli(stat.lastFailAtMs)) < excludeWindow {
			s.Excluded = true
		}
		snapshot[id] = s
	}
	return snapshot
}
