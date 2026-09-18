package controller

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
)

// Task4-3 模型倍率自动计算：管理端接口（路由组已挂 AdminAuth）。
// 只改倍率"来源"（七牛价格自动算 + 人工锁定 + 分组倍率维护），
// 不触碰 relay/ 数据面计费链路与现有手动倍率维护方式。

type ratioRecomputeRequest struct {
	DryRun bool `json:"dry_run"`
}

type ratioLockRequest struct {
	ModelId         string   `json:"model_id"`
	ModelRatio      *float64 `json:"model_ratio"`      // 不传 = 输入倍率保持现值（仅加锁）
	CompletionRatio *float64 `json:"completion_ratio"` // 不传 = 输出倍率保持现值（仅加锁）
	Note            string   `json:"note"`
}

type ratioGroupsRequest struct {
	Groups map[string]float64 `json:"groups"`
}

// AutoRecomputeRatios POST /api/ratio/auto-recompute
// body: {"dry_run": true|false}；dry_run 仅预览变更不落库
func AutoRecomputeRatios(c *gin.Context) {
	req := ratioRecomputeRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		// 兼容空 body：默认 dry_run=false
		req.DryRun = false
	}
	changes, err := model.AutoRecomputeRatios(req.DryRun)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"dry_run": req.DryRun,
			"count":   len(changes),
			"changes": changes,
		},
	})
}

// GetRatioLocks GET /api/ratio/locks
func GetRatioLocks(c *gin.Context) {
	locks, err := model.GetAllModelRatioLocks()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    locks,
	})
}

// LockModelRatio POST /api/ratio/lock
// 写锁定行并立即应用人工倍率（提供了哪项就应用哪项），重复锁定同 model_id 等于更新
func LockModelRatio(c *gin.Context) {
	req := ratioLockRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if req.ModelId == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model_id is required",
		})
		return
	}
	if req.ModelRatio != nil && *req.ModelRatio < 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model_ratio must be >= 0",
		})
		return
	}
	if req.CompletionRatio != nil && *req.CompletionRatio < 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "completion_ratio must be >= 0",
		})
		return
	}
	err := model.LockModelRatio(req.ModelId, req.ModelRatio, req.CompletionRatio, c.GetInt("id"), req.Note)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// UnlockModelRatio DELETE /api/ratio/lock?model_id=xxx
// 用 query 而非 path 参数：七牛 model_id 含 "/"（如 deepseek/deepseek-v3.1），path 段会被截断
func UnlockModelRatio(c *gin.Context) {
	modelId := c.Query("model_id")
	if modelId == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model_id is required",
		})
		return
	}
	if err := model.UnlockModelRatio(modelId); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// GetGroupRatios GET /api/ratio/groups
func GetGroupRatios(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    billingratio.SnapshotGroupRatio(),
	})
}

// UpdateGroupRatios POST /api/ratio/groups
// body: {"groups": {"default": 1, "vip": 0.8}}；整体替换，default 必须存在且 >= 0.1
func UpdateGroupRatios(c *gin.Context) {
	req := ratioGroupsRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if len(req.Groups) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "groups is required",
		})
		return
	}
	for name, r := range req.Groups {
		if name == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "group name must not be empty",
			})
			return
		}
		if r < 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "group ratio must be >= 0: " + name,
			})
			return
		}
	}
	defaultRatio, ok := req.Groups["default"]
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "default group is required",
		})
		return
	}
	if defaultRatio < 0.1 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "default group ratio must be >= 0.1",
		})
		return
	}

	jsonBytes, err := json.Marshal(req.Groups)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if err := model.UpdateOption("GroupRatio", string(jsonBytes)); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    req.Groups,
	})
}
