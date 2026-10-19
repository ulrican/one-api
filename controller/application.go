package controller

// Task4-6 应用管理：底层复用令牌（tokens 表，app_type 非空即应用）。
// 与 /api/token/ 接口族平行，CRUD 全部限定 user_id 作用域且 app_type != ''，
// 因此应用与旧令牌在两套管理接口中天然隔离；relay 鉴权链路不区分二者。

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/model"
)

// 应用类型枚举（存 tokens.app_type）
const (
	AppTypeChat  = "chat"  // 聊天助手
	AppTypeAgent = "agent" // 智能体
	AppTypeAPI   = "api"   // API 接入
	AppTypeOther = "other" // 其他
)

func isValidAppType(t string) bool {
	switch t {
	case AppTypeChat, AppTypeAgent, AppTypeAPI, AppTypeOther:
		return true
	}
	return false
}

// getApplicationByIds 按 id+userId 取应用，且必须 app_type != ''
func getApplicationByIds(id int, userId int) (*model.Token, error) {
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		return nil, err
	}
	if token.AppType == "" {
		return nil, fmt.Errorf("应用不存在")
	}
	return token, nil
}

func GetAllApplications(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	order := c.Query("order")
	applications, err := model.GetAllUserApplications(userId, p*config.ItemsPerPage, config.ItemsPerPage, order)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": applications})
}

func SearchApplications(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	keyword := c.Query("keyword")
	applications, err := model.SearchUserApplications(userId, keyword)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": applications})
}

func AddApplication(c *gin.Context) {
	app := model.Token{}
	if err := c.ShouldBindJSON(&app); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if app.Name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用名称不能为空"})
		return
	}
	if len(app.Name) > 30 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用名称过长"})
		return
	}
	if !isValidAppType(app.AppType) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用类型无效"})
		return
	}
	userId := c.GetInt(ctxkey.Id)
	cleanApp := model.Token{
		UserId:         userId,
		Name:           app.Name,
		AppType:        app.AppType,
		Key:            random.GenerateKey(),
		Status:         model.TokenStatusEnabled,
		CreatedTime:    helper.GetTimestamp(),
		AccessedTime:   helper.GetTimestamp(),
		ExpiredTime:    app.ExpiredTime,
		RemainQuota:    app.RemainQuota,
		UnlimitedQuota: app.UnlimitedQuota,
		Models:         app.Models,
	}
	if err := cleanApp.Insert(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": cleanApp})
}

func UpdateApplication(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	statusOnly := c.Query("status_only")
	app := model.Token{}
	if err := c.ShouldBindJSON(&app); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if app.Name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用名称不能为空"})
		return
	}
	if len(app.Name) > 30 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用名称过长"})
		return
	}
	if !isValidAppType(app.AppType) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用类型无效"})
		return
	}
	cleanApp, err := getApplicationByIds(app.Id, userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if app.Status == model.TokenStatusEnabled {
		now := helper.GetTimestamp()
		if cleanApp.Status == model.TokenStatusExpired && cleanApp.ExpiredTime != -1 && cleanApp.ExpiredTime <= now {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用已过期，无法启用，请先修改过期时间，或者设置为永不过期"})
			return
		}
		if cleanApp.Status == model.TokenStatusExhausted && cleanApp.RemainQuota <= 0 && !cleanApp.UnlimitedQuota {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "应用额度已用尽，无法启用，请先修改剩余额度，或者设置为无限额度"})
			return
		}
	}
	if statusOnly != "" {
		cleanApp.Status = app.Status
	} else {
		cleanApp.Name = app.Name
		cleanApp.AppType = app.AppType
		cleanApp.ExpiredTime = app.ExpiredTime
		cleanApp.RemainQuota = app.RemainQuota
		cleanApp.UnlimitedQuota = app.UnlimitedQuota
		cleanApp.Models = app.Models
	}
	if err = cleanApp.UpdateApplication(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": cleanApp})
}

func DeleteApplication(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt(ctxkey.Id)
	app, err := getApplicationByIds(id, userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err = app.Delete(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}
