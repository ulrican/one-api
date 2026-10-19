package controller

import (
	"fmt"
	"math/rand"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// CheckIn 每日签到：基础随机额度 + 当月累计签到阶梯额外奖励，幂等防重
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
	now := time.Now()
	today := now.Format("2006-01-02")
	yearMonth := now.Format("2006-01")
	key := fmt.Sprintf("checkin:%d:%s", userId, today)

	// 幂等防重：Redis SETNX 优先，无 Redis 时退化为 user_checkin_days 表查重
	checked := false
	if common.RedisEnabled {
		ok, err := common.RedisSetNX(key, "1", 26*time.Hour)
		if err != nil {
			logger.SysError("checkin redis setnx failed: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败，请稍后重试"})
			return
		}
		checked = !ok
	} else {
		has, err := model.HasUserCheckedDate(userId, today)
		if err != nil {
			logger.SysError("checkin db check failed: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败，请稍后重试"})
			return
		}
		checked = has
	}

	if checked {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "今日已签到，请勿重复签到",
		})
		return
	}

	// 基础随机奖励
	if config.CheckInMinReward > config.CheckInMaxReward {
		config.CheckInMinReward, config.CheckInMaxReward = config.CheckInMaxReward, config.CheckInMinReward
	}
	baseReward := config.CheckInMinReward
	if config.CheckInMaxReward > config.CheckInMinReward {
		baseReward = config.CheckInMinReward + rand.Int63n(config.CheckInMaxReward-config.CheckInMinReward+1)
	}
	if baseReward <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到奖励配置异常"})
		return
	}

	// 阶梯额外奖励：本月累计签到（含本次）达到某阶梯天数且该阶梯当月未领过，则发放
	monthTotal, err := model.CountUserCheckinDaysOfMonth(userId, yearMonth)
	if err != nil {
		logger.SysError("checkin count month failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败，请稍后重试"})
		return
	}
	monthTotal += 1 // 本次签到后累计

	tierReward := int64(0)
	tierHit := 0
	if len(config.CheckInTiers) > 0 {
		tiers := make([]config.CheckInTier, len(config.CheckInTiers))
		copy(tiers, config.CheckInTiers)
		sort.Slice(tiers, func(i, j int) bool { return tiers[i].Days < tiers[j].Days })
		earnedTiers, _ := model.GetUserCheckinDaysOfMonth(userId, yearMonth)
		earnedSet := make(map[int]bool, len(earnedTiers))
		for _, r := range earnedTiers {
			if r.TierHit > 0 {
				earnedSet[r.TierHit] = true
			}
		}
		for i := len(tiers) - 1; i >= 0; i-- {
			if tiers[i].Days <= int(monthTotal) && !earnedSet[tiers[i].Days] && tiers[i].Quota > 0 {
				tierReward = tiers[i].Quota
				tierHit = tiers[i].Days
				break
			}
		}
	}

	totalReward := baseReward + tierReward

	// 事务：写签到明细 + 加额度
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		record := &model.UserCheckinDay{
			UserId:      userId,
			CheckDate:   today,
			BaseQuota:   baseReward,
			TierQuota:   tierReward,
			TierHit:     tierHit,
			CreatedTime: helper.GetTimestamp(),
		}
		if err := model.InsertUserCheckinDayTx(tx, record); err != nil {
			return err
		}
		return model.IncreaseUserQuotaWithTx(tx, userId, totalReward)
	})
	if err != nil {
		// 签到失败回滚 Redis 占位，允许重试
		if common.RedisEnabled {
			_ = common.RedisDel(key)
		}
		logger.SysError("checkin db transaction failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "签到失败：" + err.Error()})
		return
	}

	// 日志记录
	msg := fmt.Sprintf("每日签到赠送 %s", common.LogQuota(baseReward))
	if tierHit > 0 {
		msg += fmt.Sprintf("；连续签到第%d天额外赠送 %s", tierHit, common.LogQuota(tierReward))
	}
	model.RecordLog(ctx, userId, model.LogTypeCheckIn, msg)

	// 清理用户额度缓存
	if common.RedisEnabled {
		_ = common.RedisDel(fmt.Sprintf("user_quota:%d", userId))
	}

	continuous := model.CountContinuousCheckinDays(userId, today)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"base_reward":     baseReward,
			"tier_reward":     tierReward,
			"tier_hit":        tierHit,
			"total_reward":    totalReward,
			"continuous_days": continuous,
			"month_total":     monthTotal,
		},
	})
}

// GetCheckInStatus 查询签到状态、当月日历、连续签到与阶梯进度
func GetCheckInStatus(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	now := time.Now()
	today := now.Format("2006-01-02")
	yearMonth := now.Format("2006-01")

	checked, _ := model.HasUserCheckedDate(userId, today)
	continuous := model.CountContinuousCheckinDays(userId, today)
	monthTotal, _ := model.CountUserCheckinDaysOfMonth(userId, yearMonth)

	// 当月日历
	records, _ := model.GetUserCheckinDaysOfMonth(userId, yearMonth)
	recordMap := make(map[string]*model.UserCheckinDay, len(records))
	earnedSet := make(map[int]bool, len(records))
	monthReward := int64(0)
	for _, r := range records {
		recordMap[r.CheckDate] = r
		monthReward += r.BaseQuota + r.TierQuota
		if r.TierHit > 0 {
			earnedSet[r.TierHit] = true
		}
	}

	// 生成当月每天
	daysInMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.Local).Day()
	calendar := make([]gin.H, 0, daysInMonth)
	for d := 1; d <= daysInMonth; d++ {
		dateStr := fmt.Sprintf("%s-%02d", yearMonth, d)
		r := recordMap[dateStr]
		item := gin.H{
			"date":      dateStr,
			"day":       d,
			"checked":   r != nil,
			"tier_hit":  0,
			"reward":    int64(0),
			"is_today":  dateStr == today,
			"is_future": d > now.Day(),
		}
		if r != nil {
			item["tier_hit"] = r.TierHit
			item["reward"] = r.BaseQuota + r.TierQuota
		}
		calendar = append(calendar, item)
	}

	// 阶梯配置 + 已领状态
	tiers := make([]gin.H, 0, len(config.CheckInTiers))
	for _, t := range config.CheckInTiers {
		tiers = append(tiers, gin.H{
			"days":   t.Days,
			"quota":  t.Quota,
			"earned": earnedSet[t.Days],
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled":         config.CheckInEnabled,
			"checked":         checked,
			"min_reward":      config.CheckInMinReward,
			"max_reward":      config.CheckInMaxReward,
			"today":           today,
			"year_month":      yearMonth,
			"continuous_days": continuous,
			"month_total":     monthTotal,
			"month_reward":    monthReward,
			"calendar":        calendar,
			"tiers":           tiers,
		},
	})
}
