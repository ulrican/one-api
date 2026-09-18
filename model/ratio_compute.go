package model

import (
	"fmt"
	"math"

	"github.com/songquanpeng/one-api/common/logger"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
)

// Task4-3 模型倍率自动计算 Service。
//
// 换算口径（与 relay/billing/ratio 既有常量一致）：
//
//	1 modelRatio = $0.002/1K tokens = ¥14/1M tokens（RMB=500/7≈71.428 是 1K 口径）
//	modelRatio      = priceInput(¥/1M) / 14
//	completionRatio = priceOutput(¥/1M) / priceInput(¥/1M)
//
// 只改倍率"来源"，不改 relay/ 数据面读函数；异步、低频执行，绝不在转发链路调用。

const rmbPerMillionTokens = 14.0

// RatioChange 单个模型的重算变更（dry_run 预览与实际执行共用同一结果结构）
type RatioChange struct {
	ModelId            string   `json:"model_id"`
	PriceInput         float64  `json:"price_input"`
	PriceOutput        float64  `json:"price_output"`
	OldModelRatio      *float64 `json:"old_model_ratio"` // null = 原 map 无此模型（新增）
	NewModelRatio      float64  `json:"new_model_ratio"`
	OldCompletionRatio *float64 `json:"old_completion_ratio"` // null = 原 map 无此模型（新增）
	NewCompletionRatio *float64 `json:"new_completion_ratio"` // null = 输出无价目，本次不动输出倍率
}

// AutoRecomputeRatios 扫全部 token 计价且 price_input>0 的市场模型，
// 跳过 model_ratio_locks 中已锁定的模型，按七牛价格重算倍率。
// dryRun=true 只返回变更清单，不写内存 map、不持久化；
// dryRun=false 时批量合并内存 map 并通过 UpdateOption 持久化 + 热生效。
func AutoRecomputeRatios(dryRun bool) ([]RatioChange, error) {
	var items []*MarketModel
	if err := DB.Where("price_unit = ? AND price_input > 0", MarketPriceUnitToken).
		Find(&items).Error; err != nil {
		return nil, err
	}
	locked, err := GetModelRatioLockMap()
	if err != nil {
		return nil, fmt.Errorf("load ratio locks failed: %w", err)
	}

	changes := make([]RatioChange, 0)
	modelUpdates := make(map[string]float64)
	completionUpdates := make(map[string]float64)

	for _, m := range items {
		if _, isLocked := locked[m.ModelId]; isLocked {
			continue // 人工锁定，自动流程绝不覆盖
		}

		newMr := roundRatio(m.PriceInput / rmbPerMillionTokens)
		newCr := roundRatio(m.PriceOutput / m.PriceInput)

		change := RatioChange{
			ModelId:       m.ModelId,
			PriceInput:    m.PriceInput,
			PriceOutput:   m.PriceOutput,
			NewModelRatio: newMr,
		}
		hasChange := false

		if oldMr, ok := billingratio.PeekModelRatio(m.ModelId); !ok {
			hasChange = true // 原 map/默认均无 → 新增
		} else {
			change.OldModelRatio = &oldMr
			if math.Abs(oldMr-newMr) > 1e-9 {
				hasChange = true
			}
		}

		// price_output<=0（免费输出/无价目）时不动 completionRatio，避免覆盖人工配置
		if m.PriceOutput > 0 {
			if oldCr, ok := billingratio.PeekCompletionRatio(m.ModelId); !ok {
				change.NewCompletionRatio = &newCr
				hasChange = true
			} else {
				change.OldCompletionRatio = &oldCr
				if math.Abs(oldCr-newCr) > 1e-9 {
					change.NewCompletionRatio = &newCr
					hasChange = true
				}
			}
		}

		if !hasChange {
			continue
		}
		changes = append(changes, change)
		if !dryRun {
			modelUpdates[m.ModelId] = newMr
			if change.NewCompletionRatio != nil {
				completionUpdates[m.ModelId] = *change.NewCompletionRatio
			}
		}
	}

	if dryRun || len(changes) == 0 {
		return changes, nil
	}

	// 批量合并 + 同一把锁内序列化，再走 UpdateOption 落 option 表并热更新（与运营端手改同一路径）
	if len(modelUpdates) > 0 {
		jsonStr := billingratio.ApplyModelRatioUpdates(modelUpdates)
		if err := UpdateOption("ModelRatio", jsonStr); err != nil {
			return changes, fmt.Errorf("persist ModelRatio failed: %w", err)
		}
	}
	if len(completionUpdates) > 0 {
		jsonStr := billingratio.ApplyCompletionRatioUpdates(completionUpdates)
		if err := UpdateOption("CompletionRatio", jsonStr); err != nil {
			return changes, fmt.Errorf("persist CompletionRatio failed: %w", err)
		}
	}
	return changes, nil
}

// LockModelRatio 写锁定行，并把人工指定倍率（非 nil 项）立即写入内存 map + 持久化，
// 使锁定在当下即生效而不必等下次重算。modelRatio/completionRatio 传 nil 表示该项不动。
func LockModelRatio(modelId string, modelRatio, completionRatio *float64, lockedBy int, note string) error {
	if modelId == "" {
		return fmt.Errorf("model_id is required")
	}
	var mrSnap, crSnap float64
	if modelRatio != nil {
		mrSnap = *modelRatio
	} else if v, ok := billingratio.PeekModelRatio(modelId); ok {
		mrSnap = v
	}
	if completionRatio != nil {
		crSnap = *completionRatio
	} else if v, ok := billingratio.PeekCompletionRatio(modelId); ok {
		crSnap = v
	}
	if err := UpsertModelRatioLock(modelId, mrSnap, crSnap, lockedBy, note); err != nil {
		return err
	}
	if modelRatio != nil {
		jsonStr := billingratio.ApplyModelRatioUpdates(map[string]float64{modelId: *modelRatio})
		if err := UpdateOption("ModelRatio", jsonStr); err != nil {
			return err
		}
	}
	if completionRatio != nil {
		jsonStr := billingratio.ApplyCompletionRatioUpdates(map[string]float64{modelId: *completionRatio})
		if err := UpdateOption("CompletionRatio", jsonStr); err != nil {
			return err
		}
	}
	return nil
}

// UnlockModelRatio 解锁（删行）。倍率本身保留现值，下次自动重算才会按价格覆盖。
func UnlockModelRatio(modelId string) error {
	return DeleteModelRatioLock(modelId)
}

// AsyncAutoRecomputeRatios 触发点统一入口：异步执行 + recover 兜底，
// 渠道保存/每日同步后调用，任何异常都不影响主流程。
func AsyncAutoRecomputeRatios() {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.SysError(fmt.Sprintf("auto recompute ratios panic recovered: %v", r))
			}
		}()
		changes, err := AutoRecomputeRatios(false)
		if err != nil {
			logger.SysError("auto recompute ratios failed: " + err.Error())
			return
		}
		if len(changes) > 0 {
			logger.SysLogf("auto recompute ratios succeeded: %d models updated", len(changes))
		}
	}()
}

func roundRatio(v float64) float64 {
	return math.Round(v*1e6) / 1e6
}
