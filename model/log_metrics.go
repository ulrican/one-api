package model

import (
	"github.com/songquanpeng/one-api/common"
)

// F8 数据看板增强：RPM/TPM 实时指标 + 模型维度聚合分析

// SumUserRecentUsage 统计用户 since 时间戳之后的消费请求数与总 token 数（type=LogTypeConsume）。
// 走 logs 表 idx_created_at_type 索引，实时查询不缓存，保证与日志抽样一致。
func SumUserRecentUsage(userId int, since int64) (requests int64, tokens int64) {
	ifnull := "ifnull"
	if common.UsingPostgreSQL {
		ifnull = "COALESCE"
	}
	var result struct {
		Requests int64 `gorm:"column:requests"`
		Tokens   int64 `gorm:"column:tokens"`
	}
	err := LOG_DB.Raw(`
		SELECT count(1) as requests,
		`+ifnull+`(sum(prompt_tokens + completion_tokens), 0) as tokens
		FROM logs
		WHERE type = ? AND user_id = ? AND created_at >= ?
	`, LogTypeConsume, userId, since).Scan(&result).Error
	if err != nil {
		return 0, 0
	}
	return result.Requests, result.Tokens
}

// ModelStat 模型维度聚合统计（F8 模型维度调用分析）
type ModelStat struct {
	ModelName    string `gorm:"column:model_name" json:"model_name"`
	RequestCount int64  `gorm:"column:request_count" json:"request_count"`
	Quota        int64  `gorm:"column:quota" json:"quota"`
	Tokens       int64  `gorm:"column:tokens" json:"tokens"`
}

// GetUserModelStats 统计用户 [start, end] 时间段内按模型聚合的请求量/消费额/Token 数，
// 按请求量降序取 Top N。
func GetUserModelStats(userId int, start int64, end int64, limit int) ([]*ModelStat, error) {
	ifnull := "ifnull"
	if common.UsingPostgreSQL {
		ifnull = "COALESCE"
	}
	if limit <= 0 {
		limit = 10
	}
	var stats []*ModelStat
	err := LOG_DB.Raw(`
		SELECT model_name,
		count(1) as request_count,
		`+ifnull+`(sum(quota), 0) as quota,
		`+ifnull+`(sum(prompt_tokens + completion_tokens), 0) as tokens
		FROM logs
		WHERE type = ? AND user_id = ? AND created_at BETWEEN ? AND ?
		GROUP BY model_name
		ORDER BY request_count DESC
		LIMIT ?
	`, LogTypeConsume, userId, start, end, limit).Scan(&stats).Error
	return stats, err
}
