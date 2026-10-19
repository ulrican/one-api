package model

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/random"
)

const (
	OrderStatusPending = 0 // 未支付
	OrderStatusPaid    = 1 // 已支付
	OrderStatusExpired = 2 // 已超时
)

// 订单超时时间（秒）：超时未支付订单视为已超时（后台扫描 + 查询时惰性判定双保险）
const OrderExpireSeconds = 30 * 60

// 回调/下单金额允许的浮点误差（金额均为两位小数，0.001 足够）
const orderAmountEpsilon = 0.001

// Order 充值订单表（二开扩展表，不动核心表）
type Order struct {
	Id            int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	TradeNo       string  `json:"trade_no" gorm:"uniqueIndex;type:varchar(64)"` // 系统内部订单号
	OutTradeNo    string  `json:"out_trade_no" gorm:"type:varchar(128);index"`  // 支付平台单号
	UserId        int     `json:"user_id" gorm:"index"`
	Amount        float64 `json:"amount" gorm:"type:decimal(10,2)"`       // 支付金额（人民币元）
	Quota         int64   `json:"quota"`                                   // 到账额度
	Status        int     `json:"status" gorm:"default:0"`                 // 0 未支付 1 已支付 2 已超时
	PaymentMethod string  `json:"payment_method" gorm:"type:varchar(20)"`  // alipay / wxpay
	PackageId     int     `json:"package_id" gorm:"default:0;index"`       // Task4-11 套餐购买订单：>0 时回调不开通额度而是开通套餐
	CreatedAt     int64   `json:"created_at" gorm:"bigint;index"`
	UpdatedAt     int64   `json:"updated_at" gorm:"bigint"`
}

func GenerateTradeNo() string {
	return fmt.Sprintf("%d%s", helper.GetTimestamp(), random.GetRandomString(10))
}

func InsertOrder(order *Order) error {
	err := DB.Create(order).Error
	return err
}

func GetOrderByTradeNo(tradeNo string) (*Order, error) {
	if tradeNo == "" {
		return nil, errors.New("订单号不能为空")
	}
	var order Order
	err := DB.Where("trade_no = ?", tradeNo).First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func GetUserOrders(userId int, limit int) ([]*Order, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var orders []*Order
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(limit).Find(&orders).Error
	return orders, err
}

// TryExpireOrder 惰性过期：未支付订单超过时限置为已超时
func TryExpireOrder(order *Order) {
	if order.Status != OrderStatusPending {
		return
	}
	if helper.GetTimestamp()-order.CreatedAt < OrderExpireSeconds {
		return
	}
	err := DB.Model(&Order{}).Where("trade_no = ? and status = ?", order.TradeNo, OrderStatusPending).
		Update("status", OrderStatusExpired).Error
	if err == nil {
		order.Status = OrderStatusExpired
	}
}

// MarkOrderExpired 平台侧已终态（已关闭/撤销/支付失败/退款）时，立即将本地待支付订单
// 标记为已超时（对齐 pay-demo.md 5.3：平台 CLOSED 需同步关闭本地订单，用户需重新下单）。
// 仅条件更新 status=pending → expired：订单若已被回调/查单入账（paid）则不生效，
// 返回是否发生了状态变更。
func MarkOrderExpired(tradeNo string) bool {
	res := DB.Model(&Order{}).
		Where("trade_no = ? and status = ?", tradeNo, OrderStatusPending).
		Update("status", OrderStatusExpired)
	if res.Error != nil {
		logger.SysError("failed to mark order expired: " + res.Error.Error())
		return false
	}
	return res.RowsAffected > 0
}

// FinishOrderTrade 完成订单（支付平台异步回调入账）：
//  1. 事务 + 行锁（FOR UPDATE）防并发回调重复入账
//  2. 幂等：订单已支付（平台重复回调）直接返回 credited=false，不再入账、不写日志
//  3. 未支付/已超时订单均可正常入账：超时只影响前端展示，用户晚支付的成功回调
//     必须入账，避免"用户已扣款但额度不到账"
//  4. 强校验回调金额与订单金额一致（签名之外的第二道防线）
//  5. 普通充值单：事务内原子增加用户额度（gorm.Expr）并写入充值日志；
//     套餐购买单（Task4-11，package_id>0）：事务内开通套餐（失效旧实例 + 写
//     user_packages + 切换 users.group），不开通额度
//
// 返回 (order, credited, err)：credited=true 表示本次为首次入账，调用方需刷新用户缓存。
func FinishOrderTrade(ctx context.Context, tradeNo string, outTradeNo string, paidAmount float64) (*Order, bool, error) {
	var finished *Order
	var credited bool
	var latePaid bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order Order
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("trade_no = ?", tradeNo).First(&order).Error
		if err != nil {
			return errors.New("订单不存在：" + tradeNo)
		}
		if order.Status == OrderStatusPaid { // 幂等：重复回调直接返回成功，不重复入账
			finished = &order
			return nil
		}
		if order.Status != OrderStatusPending && order.Status != OrderStatusExpired {
			return fmt.Errorf("订单状态异常：%d", order.Status)
		}
		if math.Abs(paidAmount-order.Amount) > orderAmountEpsilon {
			return fmt.Errorf("回调金额 %.2f 与订单金额 %.2f 不一致（订单 %s）", paidAmount, order.Amount, tradeNo)
		}
		latePaid = order.Status == OrderStatusExpired
		// 更新订单状态并记录平台单号（条件带 status，双保险防并发重复入账）
		err = tx.Model(&Order{}).
			Where("trade_no = ? and status in ?", order.TradeNo, []int{OrderStatusPending, OrderStatusExpired}).
			Updates(map[string]interface{}{
				"status":       OrderStatusPaid,
				"out_trade_no": outTradeNo,
				"updated_at":   helper.GetTimestamp(),
			}).Error
		if err != nil {
			return err
		}
		// 用户存在性校验（事务内）：不能依赖 quota/group 更新的 RowsAffected——
		// MySQL 默认返回"实际变更行数"，quota+0（套餐单）或组值未变（续费同组）都会是 0
		var payer User
		if err := tx.Select("id").Where("id = ?", order.UserId).First(&payer).Error; err != nil {
			return fmt.Errorf("订单 %s 对应用户 %d 不存在，入账失败", tradeNo, order.UserId)
		}
		logContent := fmt.Sprintf("在线支付充值 %d 额度（订单号 %s）", order.Quota, tradeNo)
		if order.PackageId > 0 {
			// Task4-11 套餐订单：事务内开通套餐并切换用户组（不开通额度）
			var pkg Package
			if err := tx.Where("id = ?", order.PackageId).First(&pkg).Error; err != nil {
				return fmt.Errorf("订单 %s 对应套餐 %d 不存在：%w", tradeNo, order.PackageId, err)
			}
			// 失效同组旧有效实例 → 写新实例 → 切换用户组
			if err := DeactivateUserPackages(tx, order.UserId, pkg.GroupName); err != nil {
				return err
			}
			now := helper.GetTimestamp()
			var expireAt int64
			if pkg.DurationDays > 0 {
				expireAt = now + int64(pkg.DurationDays)*86400
			}
			up := &UserPackage{
				UserId:       order.UserId,
				PackageId:    pkg.Id,
				GroupName:    pkg.GroupName,
				OrderTradeNo: order.TradeNo,
				StartAt:      now,
				ExpireAt:     expireAt,
				Status:       UserPackageStatusActive,
				CreatedAt:    now,
			}
			if err := tx.Create(up).Error; err != nil {
				return err
			}
			if err := tx.Model(&User{}).Where("id = ?", order.UserId).
				Update("group", pkg.GroupName).Error; err != nil {
				return err
			}
			logContent = fmt.Sprintf("购买套餐「%s」（订单号 %s）", pkg.Name, tradeNo)
		} else {
			// 普通充值单：原子增加用户额度（SQL 表达式，禁止先查后算）
			if err := tx.Model(&User{}).Where("id = ?", order.UserId).
				UpdateColumn("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
				return err
			}
		}
		topupLog := &Log{
			UserId:    order.UserId,
			Username:  GetUsernameById(order.UserId),
			CreatedAt: helper.GetTimestamp(),
			Type:      LogTypeTopup,
			Content:   logContent,
			Quota:     int(order.Quota),
		}
		if err := tx.Create(topupLog).Error; err != nil {
			return err
		}
		finished = &order
		credited = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	if latePaid {
		logger.SysError(fmt.Sprintf("order %s paid after expiry: user %d +quota %d", tradeNo, finished.UserId, finished.Quota))
	} else if credited {
		logger.SysLog(fmt.Sprintf("order %s finished: user %d +quota %d", tradeNo, finished.UserId, finished.Quota))
	}
	return finished, credited, nil
}

// StartOrderExpireSweeper 后台定时把超时未支付订单批量置为已超时，
// 避免用户放弃支付后订单永久挂起在 pending 状态（订单历史不再恒显"待支付"）。
// 超时只改展示状态：晚到的支付成功回调仍可正常入账（见 FinishOrderTrade）。
func StartOrderExpireSweeper() {
	go func() {
		expireDueOrders() // 启动先跑一次
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			expireDueOrders()
		}
	}()
}

func expireDueOrders() {
	deadline := helper.GetTimestamp() - OrderExpireSeconds
	res := DB.Model(&Order{}).
		Where("status = ? and created_at <= ?", OrderStatusPending, deadline).
		Limit(500).
		Update("status", OrderStatusExpired)
	if res.Error != nil {
		logger.SysError("failed to expire overdue orders: " + res.Error.Error())
		return
	}
	if res.RowsAffected > 0 {
		logger.SysLog(fmt.Sprintf("%d overdue orders marked expired", res.RowsAffected))
	}
}
