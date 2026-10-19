package model

import (
	"errors"

	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
)

const (
	UserPackageStatusExpired = 0 // 已失效（到期或被新套餐替换）
	UserPackageStatusActive  = 1 // 有效
)

// Package 套餐模版（Task4-11 二开扩展表，不动核心表）。
// 购买套餐后开通 users.group 指定分组（如 vip/svip），
// 从而获得分组倍率（GroupRatio）与渠道可见性（abilities.group）的自助升级。
type Package struct {
	Id           int     `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string  `json:"name" gorm:"type:varchar(64);not null"`
	GroupName    string  `json:"group_name" gorm:"type:varchar(32);not null;index"` // 开通的用户组，须存在于 GroupRatio
	Price        float64 `json:"price" gorm:"type:decimal(10,2)"`                   // 售价（人民币元）
	DurationDays int     `json:"duration_days"`                                     // 有效期天数，0 = 永久
	Description  string  `json:"description" gorm:"type:varchar(255)"`
	Enabled      bool    `json:"enabled" gorm:"default:true"`
	CreatedAt    int64   `json:"created_at"`
	UpdatedAt    int64   `json:"updated_at"`
}

// UserPackage 用户套餐实例（到期判定数据源，model.GetUserGroup 惰性降级依据）
type UserPackage struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId       int    `json:"user_id" gorm:"index"`
	PackageId    int    `json:"package_id" gorm:"index"`
	GroupName    string `json:"group_name" gorm:"type:varchar(32);index"`
	OrderTradeNo string `json:"order_trade_no" gorm:"type:varchar(64)"`
	StartAt      int64  `json:"start_at"`
	ExpireAt     int64  `json:"expire_at"` // 0 = 永久
	Status       int    `json:"status" gorm:"default:1;index"`
	CreatedAt    int64  `json:"created_at"`
}

func GetAllPackages() ([]*Package, error) {
	var packages []*Package
	err := DB.Order("id desc").Find(&packages).Error
	return packages, err
}

func GetEnabledPackages() ([]*Package, error) {
	var packages []*Package
	err := DB.Where("enabled = ?", true).Order("price asc").Find(&packages).Error
	return packages, err
}

func GetPackageById(id int) (*Package, error) {
	if id <= 0 {
		return nil, errors.New("套餐 id 非法")
	}
	var pkg Package
	err := DB.First(&pkg, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &pkg, nil
}

func InsertPackage(pkg *Package) error {
	now := helper.GetTimestamp()
	pkg.CreatedAt = now
	pkg.UpdatedAt = now
	return DB.Create(pkg).Error
}

// UpdatePackage 全量更新（Save），保证 enabled=false 等零值字段也能落库
func UpdatePackage(pkg *Package) error {
	pkg.UpdatedAt = helper.GetTimestamp()
	return DB.Save(pkg).Error
}

func DeletePackage(id int) error {
	return DB.Delete(&Package{}, "id = ?", id).Error
}

// GetUserActivePackages 本人当前有效套餐（含永久），TopUp 页展示当前身份/到期时间
func GetUserActivePackages(userId int) ([]*UserPackage, error) {
	var ups []*UserPackage
	err := DB.Where("user_id = ? and status = ? and (expire_at = 0 or expire_at > ?)",
		userId, UserPackageStatusActive, helper.GetTimestamp()).
		Order("id desc").Find(&ups).Error
	return ups, err
}

// DeactivateUserPackages 事务内失效同组旧有效实例（套餐开通/到期降级共用）
func DeactivateUserPackages(tx *gorm.DB, userId int, groupName string) error {
	err := tx.Model(&UserPackage{}).
		Where("user_id = ? and group_name = ? and status = ?", userId, groupName, UserPackageStatusActive).
		Update("status", UserPackageStatusExpired).Error
	if err != nil {
		logger.SysError("failed to deactivate user packages: " + err.Error())
	}
	return err
}
