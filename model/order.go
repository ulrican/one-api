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

// FinishOrderTrade 完成订单（支付平台异步回调入账）：
//  1. 事务 + 行锁（FOR UPDATE）防并发回调重复入账
//  2. 幂等：订单已支付（平台重复回调）直接返回 credited=false，不再加额度、不写日志
//  3. 未支付/已超时订单均可正常入账：超时只影响前端展示，用户晚支付的成功回调
//     必须入账，避免"用户已扣款但额度不到账"
//  4. 强校验回调金额与订单金额一致（签名之外的第二道防线）
//  5. 事务内原子增加用户额度（gorm.Expr）并写入充值日志（同事务提交，杜绝重复回调写重复日志）
//
// 返回 (userId, quota, credited, err)：credited=true 表示本次为首次入账，调用方需刷新用户额度缓存。
func FinishOrderTrade(ctx context.Context, tradeNo string, outTradeNo string, paidAmount float64) (int, int64, bool, error) {
	var userId int
	var quota int64
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
			userId = order.UserId
			quota = order.Quota
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
		// 原子增加用户额度（SQL 表达式，禁止先查后算）；用户不存在时 RowsAffected=0，不能假装成功
		res := tx.Model(&User{}).Where("id = ?", order.UserId).
			UpdateColumn("quota", gorm.Expr("quota + ?", order.Quota))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("订单 %s 对应用户 %d 不存在，入账失败", tradeNo, order.UserId)
		}
		// 充值日志随事务一起提交：重复回调不会写第二条日志
		topupLog := &Log{
			UserId:    order.UserId,
			Username:  GetUsernameById(order.UserId),
			CreatedAt: helper.GetTimestamp(),
			Type:      LogTypeTopup,
			Content:   fmt.Sprintf("在线支付充值 %d 额度（订单号 %s）", order.Quota, tradeNo),
			Quota:     int(order.Quota),
		}
		if err := tx.Create(topupLog).Error; err != nil {
			return err
		}
		userId = order.UserId
		quota = order.Quota
		credited = true
		return nil
	})
	if err != nil {
		return 0, 0, false, err
	}
	if latePaid {
		logger.SysError(fmt.Sprintf("order %s paid after expiry: user %d +quota %d", tradeNo, userId, quota))
	} else if credited {
		logger.SysLog(fmt.Sprintf("order %s finished: user %d +quota %d", tradeNo, userId, quota))
	}
	return userId, quota, credited, nil
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
