package model

// F9b 数据面路由增强：候选渠道挑选（动态剔除 + 延迟加权随机）。
// 纯内存查询（routingstats），不触 DB/网络；供内存缓存与 DB 两条选路复用。

import (
	"math/rand"

	"github.com/songquanpeng/one-api/routingstats"
)

// pickChannelWithRoutingStats 从同层候选渠道中挑选：
//  1. 剔除连败达阈值且窗口未过的渠道；若全部被剔除则回退原始候选（可用性优先）
//  2. 有延迟样本的渠道按 1/avgLatency 加权随机；无样本渠道按候选中最快均值赋权（防饿死）
//  3. 所有候选均无样本时退化为均匀随机（与原版行为一致）
func pickChannelWithRoutingStats(channels []*Channel) *Channel {
	if len(channels) == 0 {
		return nil
	}
	if len(channels) == 1 {
		return channels[0]
	}
	// 1. 动态剔除
	candidates := make([]*Channel, 0, len(channels))
	for _, ch := range channels {
		if !routingstats.IsExcluded(ch.Id) {
			candidates = append(candidates, ch)
		}
	}
	if len(candidates) == 0 {
		candidates = channels
	}
	// 2. 延迟加权
	type weightedChannel struct {
		channel *Channel
		weight  float64
	}
	minAvg := int64(0)
	latencies := make(map[int]int64, len(candidates))
	for _, ch := range candidates {
		avg, count := routingstats.AvgLatencyMs(ch.Id)
		if count > 0 {
			latencies[ch.Id] = avg
			if minAvg == 0 || avg < minAvg {
				minAvg = avg
			}
		}
	}
	if len(latencies) == 0 {
		// 无任何样本：均匀随机（原版行为）
		return candidates[rand.Intn(len(candidates))]
	}
	total := 0.0
	weights := make([]float64, len(candidates))
	for i, ch := range candidates {
		avg, ok := latencies[ch.Id]
		if !ok {
			avg = minAvg // 无样本渠道与最快渠道同权重
		}
		if avg < 1 {
			avg = 1
		}
		weights[i] = 1 / float64(avg)
		total += weights[i]
	}
	// 3. 加权随机
	r := rand.Float64() * total
	for i, ch := range candidates {
		r -= weights[i]
		if r <= 0 {
			return ch
		}
	}
	return candidates[len(candidates)-1]
}
