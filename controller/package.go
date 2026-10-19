package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
	"github.com/songquanpeng/one-api/model"
)

// ---------- 管理端：套餐 CRUD（Task4-11）----------

// GetAllPackagesAdmin GET /api/package/（AdminAuth）全量套餐列表
func GetAllPackagesAdmin(c *gin.Context) {
	packages, err := model.GetAllPackages()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": packages})
}

// validatePackage 校验套餐字段；开通组必须已存在于分组倍率配置
func validatePackage(pkg *model.Package) string {
	if pkg.Name == "" {
		return "套餐名称不能为空"
	}
	if pkg.GroupName == "" {
		return "开通用户组不能为空"
	}
	if _, ok := billingratio.SnapshotGroupRatio()[pkg.GroupName]; !ok {
		return "开通用户组 " + pkg.GroupName + " 不存在于分组倍率配置"
	}
	if pkg.Price < 0 {
		return "套餐价格不能为负数"
	}
	if pkg.DurationDays < 0 {
		return "有效期天数不能为负数"
	}
	return ""
}

// AddPackage POST /api/package/（AdminAuth）
func AddPackage(c *gin.Context) {
	pkg := model.Package{}
	if err := c.ShouldBindJSON(&pkg); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if msg := validatePackage(&pkg); msg != "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	if err := model.InsertPackage(&pkg); err != nil {
		logger.SysError("AddPackage failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐创建失败：" + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": pkg})
}

// UpdatePackage PUT /api/package/（AdminAuth）全量更新
func UpdatePackage(c *gin.Context) {
	pkg := model.Package{}
	if err := c.ShouldBindJSON(&pkg); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if pkg.Id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐 id 非法"})
		return
	}
	if msg := validatePackage(&pkg); msg != "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	if err := model.UpdatePackage(&pkg); err != nil {
		logger.SysError("UpdatePackage failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐更新失败：" + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": pkg})
}

// DeletePackageById DELETE /api/package/:id（AdminAuth）
func DeletePackageById(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐 id 非法"})
		return
	}
	if err := model.DeletePackage(id); err != nil {
		logger.SysError("DeletePackage failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐删除失败：" + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// ---------- 用户端：套餐购买（Task4-11）----------

// GetAvailablePackages GET /api/package/available（UserAuth）enabled 套餐列表（购买页）
func GetAvailablePackages(c *gin.Context) {
	packages, err := model.GetEnabledPackages()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": packages})
}

// GetMyPackages GET /api/package/my（UserAuth）本人当前有效套餐
func GetMyPackages(c *gin.Context) {
	ups, err := model.GetUserActivePackages(c.GetInt("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": ups})
}

type purchasePackageRequest struct {
	PackageId int    `json:"package_id" binding:"required"`
	Method    string `json:"method" binding:"required"` // alipay / wxpay
}

// PurchasePackage POST /api/package/purchase（UserAuth）
// 创建套餐购买订单（orders.package_id>0），支付链路与充值单完全一致；
// 支付回调入账时由 FinishOrderTrade 事务内开通套餐并切换用户组
func PurchasePackage(c *gin.Context) {
	if !config.PayEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "在线支付未启用"})
		return
	}
	req := purchasePackageRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.Method != "alipay" && req.Method != "wxpay" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "不支持的支付方式：" + req.Method})
		return
	}
	pkg, err := model.GetPackageById(req.PackageId)
	if err != nil || !pkg.Enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐不存在或已下架"})
		return
	}
	// 直连带账模式：下单前先校验对应支付方式参数完整，避免先插订单再报错留下脏单
	if config.PaymentMode == "direct" {
		if err := validateDirectPayParams(req.Method); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	order := &model.Order{
		TradeNo:       model.GenerateTradeNo(),
		UserId:        c.GetInt("id"),
		Amount:        pkg.Price,
		Quota:         0,
		Status:        model.OrderStatusPending,
		PaymentMethod: req.Method,
		PackageId:     pkg.Id,
		CreatedAt:     helper.GetTimestamp(),
		UpdatedAt:     helper.GetTimestamp(),
	}
	if err := model.InsertOrder(order); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单创建失败：" + err.Error()})
		return
	}
	launchPay(c, order, req.Method)
}
