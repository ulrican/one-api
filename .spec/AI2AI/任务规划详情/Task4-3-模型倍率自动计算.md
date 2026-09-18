# Task4-3 · 模型倍率自动计算（基于七牛价格 + 手动锁定 + 分组倍率维护）

> 来源：Me2AI/任务清单.md Task4-3（L143-149）。定位：管控面增强，**不修改 relay/ 数据面计费链路**，只改变倍率"来源"——从纯人工运营设置改为"七牛价格自动算 + 人工可锁定 + 分组倍率独立维护"。不删除现有手动倍率维护方式。
>
> **本文件为实现方案，待站长确认后才进入编码。**

---

## 1. 需求摘要

1. 新增/更新渠道模型时，根据模型价格自动计算 `ModelRatio` 和 `CompletionRatio`，规则与现有系统一致。
2. 支持手动调整；**调整后该模型倍率不再被自动覆盖**（锁定）。
3. 提供分组倍率（GroupRatio）的维护入口（运营设置 → 模型倍率 / 分组倍率两个区块并存）。
4. 不删除当前运营设置中的手动倍率维护方式，新方案验证 OK 后由站长明确通知清除。

---

## 2. 现有代码与计费链路（不改动）

| 模块 | 文件 | 现状 |
|:---|:---|:---|
| ModelRatio | `relay/billing/ratio/model.go` L27- | 硬编码 map，单位：`1 = $0.002/1K tokens = ¥14/1M tokens` |
| CompletionRatio | `relay/billing/ratio/model.go` | 硬编码 map，`completionRatio = output价/input价` |
| GroupRatio | `relay/billing/ratio/group.go` | `default/vip/svip`，默认全 1 |
| 计费调用 | `relay/controller/helper.go` L100-128 | `quota = (promptTokens + completionTokens * completionRatio) * modelRatio * groupRatio` |
| Option 持久化 | `model/option.go` L70-72 L107-108 | `ModelRatio` / `CompletionRatio` / `GroupRatio` 三 key 存 option 表，`AddNewMissingRatio` 合并硬编码默认 |
| 同步机制 | `model/option.go#SyncOptions` | 后台定期 `loadOptionsFromDatabase()`，运营端改完立即热生效 |
| 七牛价格源（Task4-1） | `model/market_model.go` | `MarketModel{ PriceInput, PriceOutput }` 单位：¥/百万 token，193 条 |

**关键转换公式（与系统既有规则一致）：**

```
modelRatio      = priceInput(¥/1M tokens) / 14        // 1 modelRatio = ¥14/1M tokens
completionRatio = priceOutput(¥/1M) / priceInput(¥/1M) // 输出/输入 价差比
```

> 注：美元单价按 `unit_price_usd` 字段同样可算（USD 系：`modelRatio = priceUSD/1M / 0.002`）。本期统一用人民币价（与 Task4-1 DB 存储字段一致）。

---

## 3. 总体设计

```
┌─────────────────────────────────────────────────────────────────┐
│  触发点1：Task4-2 新增/编辑渠道（保存模型列表）                  │
│  触发点2：每日 market_models 同步后（Task4-1 已有协程）           │
│  触发点3：管理端"重算倍率"按钮（手动批量）                       │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
        ┌────────────────────────────────────────────┐
        │  AutoRatioService.ComputeAndSave          │
        │  1. 读 market_models 价目                  │
        │  2. 跳过 ratio_lock 表中已锁定模型          │
        │  3. 计算 modelRatio / completionRatio      │
        │  4. 合并进 ratio.ModelRatio（不覆盖锁定的）│
        │  5. 持久化到 option 表 + UpdateOptionMap   │
        └────────────────────────────────────────────┘
```

---

## 4. 数据层设计

### 4.1 新增扩展表 `model_ratio_locks`（不改任何现有表）

| 列 | 类型 | 说明 |
|:---|:---|:---|
| `model_id` | varchar(128) PK | 模型 ID（与 `ratio.ModelRatio` key 一致） |
| `model_ratio` | float | 手动锁定的输入倍率 |
| `completion_ratio` | float | 手动锁定的输出倍率 |
| `locked_by` | int | 操作人 user_id |
| `locked_at` | bigint | 锁定时间 |
| `note` | varchar(256) | 备注（可选） |

> 锁定 = 该模型 ID 的倍率由人工把持，自动计算流程跳过；解锁即从该表删除，下次自动流程重算填入。

### 4.2 分组倍率

`GroupRatio` 已存在 option 表，无需新建表；**本期只新增前端维护 UI**（见 5.2）。

---

## 5. 接口设计（全部 AdminAuth）

### 5.1 倍率自动计算

| 接口 | 用途 |
|:---|:---|
| `POST /api/ratio/auto-recompute` | 触发一次全量重算（扫所有 market_models，跳过 locked）；body：`{dry_run:bool}` 返回变更清单 |
| `POST /api/ratio/lock` | 锁定某模型倍率；body `{model_id, model_ratio, completion_ratio, note?}` |
| `DELETE /api/ratio/lock/{model_id}` | 解锁，下次自动流程覆盖 |
| `GET  /api/ratio/locks` | 分页查锁定清单（含 model_id/ratio/locked_by/locked_at） |

### 5.2 分组倍率维护（独立区块）

| 接口 | 用途 |
|:---|:---|
| `GET  /api/ratio/groups` | 返回 `{default:1, vip:1, svip:1, ...}`（包一层 success 结构） |
| `POST /api/ratio/groups` | 整体替换 GroupRatio map；body `{groups:{name:ratio}}`，后端调 `ratio.UpdateGroupRatioByJSONString` 并持久化到 option 表 |

> 已有 `/api/option` 也能改 GroupRatio，但本期单独抽接口，便于前端做分组倍率专用维护页（带校验：default 必须 ≥ 0.1，新增/删除分组按钮）。

---

## 6. 关键流程

### 6.1 自动重算（伪代码）

```go
func AutoRecompute(dryRun bool) ([]RatioChange, error) {
    models, _ := model.GetAllMarketModels()
    locked, _ := model.GetAllRatioLocks()      // map[model_id]struct{}
    changes := []RatioChange{}
    for _, m := range models {
        if _, ok := locked[m.ID]; ok { continue }   // 跳过锁定
        if m.PriceInput <= 0 { continue }            // 免费模型不动 ratio
        mr := m.PriceInput / 14.0
        cr := 1.0
        if m.PriceInput > 0 {
            cr = m.PriceOutput / m.PriceInput
        }
        // 仅记录变更，避免无意义写
        if ratio.GetModelRatio(m.ID) != mr || ratio.GetCompletionRatio(m.ID) != cr {
            changes = append(changes, RatioChange{m.ID, oldMr, mr, oldCr, cr})
            if !dryRun {
                ratio.SetModelRatio(m.ID, mr)             // 新增 setter，写 map + 加锁
                ratio.SetCompletionRatio(m.ID, cr)
            }
        }
    }
    if !dryRun && len(changes) > 0 {
        // 持久化到 option 表 + 热更新 OptionMap
        model.UpdateOption("ModelRatio", ratio.ModelRatio2JSONString())
        model.UpdateOption("CompletionRatio", ratio.CompletionRatio2JSONString())
    }
    return changes, nil
}
```

### 6.2 锁定/解锁

- 锁定：写 `model_ratio_locks`，同时把当前 `ratio.GetModelRatio(model_id)` 写入 `model_ratio` 列做快照。
- 解锁：从 `model_ratio_locks` 删除；下一次自动流程（每日同步后或手动触发）会重算并覆盖。

### 6.3 触发时机

| 触发点 | 实现 |
|:---|:---|
| Task4-2 渠道保存后 | `controller/channel.go#Update` 末尾异步 `go ratio.AutoRecompute(false)` |
| Task4-1 每日同步后 | `model/market_sync.go` 同步协程末尾 `go ratio.AutoRecompute(false)` |
| 管理端手动触发 | `POST /api/ratio/auto-recompute?dry_run=false` |

> 自动计算流程**异步、低频**，不在 relay/ 数据面调用，不影响主链路性能。

---

## 7. 前端改造

### 7.1 运营设置新增"倍率自动计算"区块（不删现有手动倍率区块）

`web/default/src/pages/Setting/OperationSetting.js` 新增卡片：

- 全量重算按钮（先 dry_run 弹变更预览 Modal → 确认后实际执行）
- 锁定模型列表（表格：model_id / 当前 modelRatio / 当前 completionRatio / 锁定时间 / 解锁按钮 / 新增锁定按钮）

### 7.2 运营设置新增"分组倍率维护"独立卡片

- 表格：分组名 / 倍率 / 操作（编辑、删除）
- 新增分组按钮（输入名 + 倍率）
- 保存调 `POST /api/ratio/groups`

### 7.3 现有"模型倍率"区块

保留不动，作为最终查看/应急手动调整入口（在该 UI 改某个模型倍率 = 调 `POST /api/ratio/lock`，自动锁定防覆盖）。

---

## 8. 实施批次

| # | 内容 | 文件 |
|:---|:---|:---|
| 1 | 锁定扩展表 + model 层 | `model/model_ratio_lock.go`(新)、`model/main.go` |
| 2 | ratio setter/getter 扩展 | `relay/billing/ratio/model.go`（新增 `SetModelRatio`/`SetCompletionRatio`，不改现有读函数） |
| 3 | 自动重算 Service | `service/ratio_compute.go`(新) |
| 4 | 后端接口 + 路由 | `controller/ratio.go`(新)、`router/api.go` |
| 5 | 触发点接线 | `controller/channel.go`（Update 后）、`model/market_sync.go`（同步后） |
| 6 | 前端 OperationSetting 两个新区块 | `web/default/src/pages/Setting/OperationSetting.js`、`locales/zh/en` |
| 7 | 验证：dry_run 预览 → 实算 → 锁定/解锁 → 分组倍率 → 计费链路对账 | — |

---

## 9. 兼容性与边界

1. **不修改 relay/ 数据面**：`GetModelRatio` / `GetCompletionRatio` / `GetGroupRatio` 读函数签名不变，计费链路无感。
2. **不删除硬编码默认**：`AddNewMissingRatio` 机制保留，自动算的值合并进 map，未在 DB 的模型仍走硬编码默认。
3. **免费模型**：`price_input == 0` 时跳过（保持硬编码 0 或现有值），不自动写 0 避免覆盖人工配置。
4. **锁定幂等**：重复调 `POST /api/ratio/lock` 同一 model_id 等于更新锁定值。
5. **与 Task4-2 依赖**：Task4-2 渠道保存触发自动算，**Task4-2 未完成前**，Task4-3 仍可通过每日同步触发与手动按钮独立运行。

---

## 10. 待确认

1. **锁定存哪里**：新建 `model_ratio_locks` 表（本方案） vs 复用 option 表加 `ModelRatioLocked` JSON 字段（更轻但难查询）？
2. **触发频度**：每日同步后自动算一次 + 手动按钮，是否足够？渠道保存时是否必须立即算（异步协程无感）？
3. **美元价回退**：某模型只有 `unit_price_usd` 无人民币价时，是否按 `$0.002/1K = 1` 转换？或直接跳过？
4. **分组倍率默认值**：`default` 是否强制 = 1 不可删？`vip/svip` 当前也 = 1，是否允许删除？
5. **Task4-2 未落地时**：Task4-3 是否先独立上线（只靠每日同步 + 手动按钮触发）？
