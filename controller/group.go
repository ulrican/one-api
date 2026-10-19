package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/logger"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
	"github.com/songquanpeng/one-api/model"
)

// GetGroups 返回全部分组名（兼容旧接口 GET /api/group/，EditUser/EditChannel 用）
func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range billingratio.GroupRatio {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

// groupManageRow 用户组管理列表项（Task4-11）
type groupManageRow struct {
	Name        string  `json:"name"`
	Ratio       float64 `json:"ratio"`
	MemberCount int64   `json:"member_count"`
}

// GetGroupManage GET /api/group/manage（AdminAuth）
// 返回 [{name, ratio, member_count}]：倍率来自 SnapshotGroupRatio，成员数来自 users 表
func GetGroupManage(c *gin.Context) {
	ratioMap := billingratio.SnapshotGroupRatio()
	counts, err := model.CountUsersByGroup()
	if err != nil {
		logger.SysError("GetGroupManage count users: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "查询用户组成员数失败",
		})
		return
	}
	rows := make([]groupManageRow, 0, len(ratioMap))
	for name, ratio := range ratioMap {
		cnt := counts[name]
		rows = append(rows, groupManageRow{
			Name:        name,
			Ratio:       ratio,
			MemberCount: cnt,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
}

// moveGroupRequest POST /api/group/move（AdminAuth）
type moveGroupRequest struct {
	FromGroup string `json:"from_group" binding:"required"`
	ToGroup   string `json:"to_group" binding:"required"`
}

// MoveGroup POST /api/group/move
// 把 from_group 全部用户迁到 to_group（to_group 必须已存在于 GroupRatio）
// Redis user_group:<id> 缓存短 TTL 自然过期，迁移后延迟生效属可接受
func MoveGroup(c *gin.Context) {
	req := moveGroupRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if req.FromGroup == "" || req.ToGroup == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "from_group 和 to_group 不能为空",
		})
		return
	}
	if req.FromGroup == req.ToGroup {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "from_group 和 to_group 不能相同",
		})
		return
	}
	// 目标组必须已存在于分组倍率配置（SnapshotGroupRatio）
	if _, ok := billingratio.SnapshotGroupRatio()[req.ToGroup]; !ok {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "目标组 " + req.ToGroup + " 不存在于分组倍率配置",
		})
		return
	}
	moved, err := model.MoveUserGroup(req.FromGroup, req.ToGroup)
	if err != nil {
		logger.SysError("MoveGroup failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "迁移失败：" + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"moved": moved,
		},
	})
}
