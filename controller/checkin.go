package controller

import (
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// CheckIn 每日签到：随机额度奖励，幂等防重（Redis SETNX，无 Redis 时退化为日志查重）
func CheckIn(c *gin.Context) {
	ctx := c.Request.Context()
	if !config.CheckInEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "签到功能未开启",
		})
		return
	}
	userId := c.GetInt(ctxkey.Id)
	today := time.Now().Format("20060102")
	key := fmt.Sprintf("checkin:%d:%s", userId, today)

	checked := false
	if common.RedisEnabled {
		ok, err := common.RedisSetNX(key, "1", 26*time.Hour)
		if err != nil {
			logger.SysError("checkin redis setnx failed: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败，请稍后重试"})
			return
		}
		checked = !ok // SETNX 返回 false 表示已存在 → 今日已签到
	} else {
		// 无 Redis 时用 logs 表查重（不建索引，小数据量可接受）
		startOfDay := time.Now().Truncate(24 * time.Hour).Unix()
		var count int64
		model.LOG_DB.Model(&model.Log{}).Where("user_id = ? and type = ? and created_at >= ?", userId, model.LogTypeCheckIn, startOfDay).Count(&count)
		checked = count > 0
	}

	if checked {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "今日已签到，请勿重复签到",
		})
		return
	}

	if config.CheckInMinReward > config.CheckInMaxReward {
		config.CheckInMinReward, config.CheckInMaxReward = config.CheckInMaxReward, config.CheckInMinReward
	}
	reward := config.CheckInMinReward
	if config.CheckInMaxReward > config.CheckInMinReward {
		reward = config.CheckInMinReward + rand.Int63n(config.CheckInMaxReward-config.CheckInMinReward+1)
	}
	if reward <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到奖励配置异常"})
		return
	}

	if err := model.IncreaseUserQuota(userId, reward); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败：" + err.Error()})
		return
	}
	model.RecordLog(ctx, userId, model.LogTypeCheckIn, fmt.Sprintf("每日签到赠送 %s", common.LogQuota(reward)))
	// 清理用户额度缓存，网关下次鉴权回源 DB 立即生效
	if common.RedisEnabled {
		_ = common.RedisDel(fmt.Sprintf("user_quota:%d", userId))
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"reward":    reward,
			"timestamp": helper.GetTimestamp(),
		},
	})
}

// GetCheckInStatus 查询签到状态与奖励区间
func GetCheckInStatus(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	today := time.Now().Format("20060102")
	key := fmt.Sprintf("checkin:%d:%s", userId, today)
	checked := false
	if common.RedisEnabled {
		if v, err := common.RedisGet(key); err == nil && v != "" {
			checked = true
		}
	} else {
		startOfDay := time.Now().Truncate(24 * time.Hour).Unix()
		var count int64
		model.LOG_DB.Model(&model.Log{}).Where("user_id = ? and type = ? and created_at >= ?", userId, model.LogTypeCheckIn, startOfDay).Count(&count)
		checked = count > 0
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled":      config.CheckInEnabled,
			"checked":      checked,
			"min_reward":   config.CheckInMinReward,
			"max_reward":   config.CheckInMaxReward,
		},
	})
}
