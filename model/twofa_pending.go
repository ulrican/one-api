package model

import (
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common"
)

// F12 两步验证登录中间态：密码校验通过后签发一次性 pending token，5 分钟内有效。
// Redis 优先（多节点共享）；无 Redis 时进程内 map（单节点，与 F10 epoch 缓存同模式）。

const twofaPendingTTLSeconds = 300

type twofaPendingItem struct {
	userId  int
	expires time.Time
}

var (
	twofaPendingCache   sync.Map // token(string) -> twofaPendingItem
	twofaPendingCleanMu sync.Mutex
)

func twofaPendingKey(token string) string {
	return fmt.Sprintf("2fa_pending:%s", token)
}

// SaveTwoFAPending 存储 pending 登录态
func SaveTwoFAPending(token string, userId int) error {
	if common.RedisEnabled {
		return common.RedisSet(twofaPendingKey(token), strconv.Itoa(userId),
			time.Duration(twofaPendingTTLSeconds)*time.Second)
	}
	// 内存模式：惰性清理过期项
	twofaPendingCleanMu.Lock()
	now := time.Now()
	twofaPendingCache.Range(func(k, v any) bool {
		if now.After(v.(twofaPendingItem).expires) {
			twofaPendingCache.Delete(k)
		}
		return true
	})
	twofaPendingCleanMu.Unlock()
	twofaPendingCache.Store(token, twofaPendingItem{
		userId:  userId,
		expires: time.Now().Add(time.Duration(twofaPendingTTLSeconds) * time.Second),
	})
	return nil
}

// PeekTwoFAPending 查询 pending 对应的 userId 但不消费（用于先验码、后消费的流程）
func PeekTwoFAPending(token string) (int, bool) {
	if common.RedisEnabled {
		v, err := common.RedisGet(twofaPendingKey(token))
		if err != nil || v == "" {
			return 0, false
		}
		uid, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return uid, true
	}
	item, ok := twofaPendingCache.Load(token)
	if !ok {
		return 0, false
	}
	it := item.(twofaPendingItem)
	if time.Now().After(it.expires) {
		return 0, false
	}
	return it.userId, true
}

// ConsumeTwoFAPending 一次性消费 pending token：返回 userId，消费后立即失效
func ConsumeTwoFAPending(token string) (int, bool) {
	if common.RedisEnabled {
		v, err := common.RedisGet(twofaPendingKey(token))
		if err != nil || v == "" {
			return 0, false
		}
		_ = common.RedisDel(twofaPendingKey(token))
		uid, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return uid, true
	}
	item, ok := twofaPendingCache.LoadAndDelete(token)
	if !ok {
		return 0, false
	}
	it := item.(twofaPendingItem)
	if time.Now().After(it.expires) {
		return 0, false
	}
	return it.userId, true
}
