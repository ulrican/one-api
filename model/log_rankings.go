package model

import (
	"github.com/songquanpeng/one-api/common"
)

// F15 排行榜：全局（不限 user_id）按模型聚合的请求量/消费额/Token 数统计

// GlobalModelStat 全局模型维度聚合统计（F15 排行榜）
type GlobalModelStat struct {
	ModelName    string `gorm:"column:model_name" json:"model_name"`
	RequestCount int64  `gorm:"column:request_count" json:"request_count"`
	Quota        int64  `gorm:"column:quota" json:"quota"`
	Tokens       int64  `gorm:"column:tokens" json:"tokens"`
}

// GetGlobalModelStats 统计全局 [start, end] 时间段内按模型聚合的请求量/消费额/Token 数，
// 按请求量降序取 Top N。走 logs 表 idx_created_at_type 索引，type=LogTypeConsume。
func GetGlobalModelStats(start int64, end int64, limit int) ([]*GlobalModelStat, error) {
	ifnull := "ifnull"
	if common.UsingPostgreSQL {
		ifnull = "COALESCE"
	}
	if limit <= 0 {
		limit = 20
	}
	var stats []*GlobalModelStat
	err := LOG_DB.Raw(`
		SELECT model_name,
		count(1) as request_count,
		`+ifnull+`(sum(quota), 0) as quota,
		`+ifnull+`(sum(prompt_tokens + completion_tokens), 0) as tokens
		FROM logs
		WHERE type = ? AND created_at BETWEEN ? AND ?
		GROUP BY model_name
		ORDER BY request_count DESC
		LIMIT ?
	`, LogTypeConsume, start, end, limit).Scan(&stats).Error
	return stats, err
}
