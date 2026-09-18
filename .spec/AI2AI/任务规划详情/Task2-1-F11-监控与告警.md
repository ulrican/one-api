# Task2-1 F11 · 监控与告警（渠道故障 Webhook 告警 + 渠道可用率展示）

> 来源：Task2-1-二开功能规划.md §7 F11（P2）。定位：管理面运维能力。配额提醒协程已在 F10 实施（per-user），本任务只做渠道侧。`relay/` 零改动、无新表。

## 1. 现状核对（2026-09-06）

| 关注点 | 现状 |
| :--- | :--- |
| 渠道禁用通知 | `monitor/channel.go` `DisableChannel/MetricDisableChannel/EnableChannel` 已发邮件/MessagePusher 给 root（`notifyRootUser`） |
| 触发点 | `controller/relay.go` `processChannelRelayError`（**已在 `go` goroutine 中调用** L63/L90）、`channel-test.go` 全量测试 goroutine、`channel-billing.go` 余额检查——均为异步上下文，不阻塞 relay |
| 自动禁用门控 | `config.AutomaticDisableChannelEnabled`（option 管理端可配）；`ShouldDisableChannel` 判定错误类型 |
| 成功率指标 | `monitor/metric.go` 内存滑动窗口 `store map[int][]bool`（容量 MetricQueueSize=10）；**仅 env `ENABLE_METRIC=true` 时 init 启动消费者 + Emit 生效**；低成功率触发 `MetricDisableChannel` |
| store 并发 | 仅 metric 消费者单 goroutine 读写；无 HTTP 读取路径，当前无锁 |
| options | `model/option.go` initOptionMap 注册默认值 + updateOptionMap switch 写 config 变量；管理端 OperationSetting.js 暴露开关/输入 |
| 管理端渠道页 | `components/ChannelsTable.js`（F9 已有勾选批量/标签列）；渠道数据由 `GET /api/channel/` 全量返回 |
| Webhook 先例 | F10 `common/message/notify_user.go` webhook 通道（10s 超时 postJSON，私有函数） |

## 2. 设计方案

### 2.1 新增 options（config.go 变量 + model/option.go 注册，无新表）

| Key | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `ChannelAlertEnabled` | bool | false | 渠道告警总开关（webhook；邮件通知为原有行为不受此开关影响） |
| `ChannelAlertWebhookUrl` | string | "" | 告警 webhook 地址，空则不投递 webhook |
| `ChannelAlertCooldownMinutes` | int | 30 | 同一渠道告警冷却分钟数（防刷屏） |
| `ChannelMetricEnabled` | bool | true | 渠道可用率统计开关（内存滑动窗口，与 env ENABLE_METRIC 为"或"关系） |

> 均经 `GET /api/option/` 管理端接口下发；webhook url 不含 "Secret"/"Token" 字样，正常下发（管理端接口本身 AdminAuth）。

### 2.2 渠道告警（`monitor/alert.go` 新文件）

- `AlertChannelEvent(eventType string, channelId int, channelName string, reason string)`：
  - 门控：`config.ChannelAlertEnabled && config.ChannelAlertWebhookUrl != ""`，否则直接返回（邮件仍走原 notifyRootUser，行为不变）。
  - **冷却**：包级 `map[int]int64`（channelId → 上次告警 unix）+ sync.Mutex；`channel_disabled` / `channel_metric_disabled` 事件在冷却窗口（ChannelAlertCooldownMinutes）内跳过；`channel_enabled`（恢复）事件**不受冷却限制**（恢复必须即时通知）。
  - 投递：`go func()` 异步 POST JSON `{event, channel_id, channel_name, reason, timestamp}` 到 webhook，`&http.Client{Timeout:10s}`；失败仅记日志（与现有邮件通知一致的 best-effort 语义）。
- 挂载点（`monitor/channel.go` 三个函数内，邮件逻辑保持不变，追加一行 webhook 调用）：
  - `DisableChannel` → event `channel_disabled`
  - `MetricDisableChannel` → event `channel_metric_disabled`
  - `EnableChannel` → event `channel_enabled`
- **不改 relay/、不改 controller 调用点**（事件已在 monitor 包内收敛）。

### 2.3 渠道可用率（`monitor/metric.go` 改造）

- init 消费者 goroutine **总是启动**（去掉 `config.EnableMetric` 门控；无数据时阻塞在 select，开销可忽略）；`Emit` 门控改为 `config.EnableMetric || config.ChannelMetricEnabled`（运行时读 config，option 改完即时生效，无需重启）。
- `store` 加 `sync.RWMutex` 保护（新增 HTTP 读取路径）。
- 新增 `GetChannelMetrics() map[int]ChannelMetricSnapshot`：`{channelId: {total, success, fail, success_rate}}`，基于当前窗口切片计算。
- 新增接口 `GET /api/channel/metrics`（AdminAuth，channelRoute 组；controller 放 `controller/channel_metrics.go` 新文件）：返回 `{success, data: {metrics: {...}, window_size: MetricQueueSize, enabled: bool}}`。

### 2.4 前端

- **ChannelsTable.js**：新增"可用率"列——进入页面拉 `/api/channel/metrics`，30s 轮询（卸载清除 timer）；按 channel id join；显示 `成功率%`（total=0 显示 `-`），<80% 红色标签 / ≥80% 绿色标签（用 SUI Label 语义色，不硬编码）；窗口样本数 title 提示。
- **OperationSetting.js**：新增"监控告警"配置段（标准 SUI Form）：
  - 渠道告警开关（ChannelAlertEnabled）
  - Webhook URL 输入（ChannelAlertWebhookUrl）
  - 告警冷却分钟（ChannelAlertCooldownMinutes，number）
  - 可用率统计开关（ChannelMetricEnabled）
- i18n zh/en 键 `channel.alert.*` / `channel.metric.*`。

## 3. 验收标准

1. 配置 webhook 指向 mock-openai `/hook`，构造渠道自动禁用事件（渠道 key 错误触发 401 → ShouldDisableChannel）→ mock 收到 `channel_disabled` 报文；冷却窗口内再次触发不重复投递；手动/自动恢复收到 `channel_enabled`。
2. `GET /api/channel/metrics` 返回各渠道窗口统计；relay 成功/失败调用后成功率随之变化；关闭 ChannelMetricEnabled 后 Emit 停止（指标不再增长）。
3. 开关默认关闭时行为与改造前完全一致；`relay/` 零改动；核心表零改动。
4. 生产构建通过；双主题无穿帮。

## 4. 实施记录（2026-09-06 完成）

**后端**
- `common/config/config.go`：新增 `ChannelAlertEnabled`(false)、`ChannelAlertWebhookUrl`("")、`ChannelAlertCooldownMinutes`(30)、`ChannelMetricEnabled`(true)。
- `model/option.go`：4 个 key 注册默认值（bool/string 分支），管理端 option 接口即时下发、运行时生效。
- `monitor/alert.go`（新文件）：`AlertChannelEvent(eventType, channelId, channelName, reason)`；包级 `map[int]int64`+Mutex 冷却（故障类事件受冷却限制，`channel_enabled` 恢复类即时）；`go func()` 异步 POST，10s 超时，best-effort 仅记日志；payload `{event, channel_id, channel_name, reason, timestamp}`。
- `monitor/channel.go`：`DisableChannel`/`MetricDisableChannel`/`EnableChannel` 各追加一行 Alert 调用（邮件逻辑不变）。
- `monitor/metric.go`（重写）：消费者 goroutine 常驻；门控 `metricEnabled() = config.EnableMetric || config.ChannelMetricEnabled`（运行时读 config，option 即时生效）；store 加 RWMutex；`GetChannelMetrics() map[int]ChannelMetricSnapshot{Total,Success,Fail,SuccessRate}`。
- `controller/channel_metrics.go`（新文件）：`GET /api/channel/metrics`（AdminAuth）→ `{success, data:{enabled, window_size, metrics}}`。
- `router/api.go`：channelRoute 组注册 `GET /metrics`。
- **`relay/` 零改动、核心表零改动**。

**前端（web/default）**
- `components/ChannelsTable.js`：新增"可用率"列（进入页面拉 metrics，30s 轮询，卸载清 timer）；total=0 显示 `-`；彩色 Label（≥80% green / ≥50% yellow / <50% red）+ SUI Popup 悬停显示成功/失败/总数；空表 colSpan 同步。
- `components/OperationSetting.js`：新增"监控设置"段 4 项（告警开关、Webhook URL、冷却分钟、指标开关）。
- i18n zh/en 键已补齐。

**验证（E2E 40/40，详见系统测试记录第 13 节）**
- 批量测试接口触发坏渠道自动禁用 → webhook 收到 `channel_disabled`（reason 含 401）；冷却窗口内重复事件被抑制（日志 `channel alert suppressed by cooldown`）；恢复（key 修复后批量测试禁用渠道）→ 收到 `channel_enabled`。
- metrics API 字段校验通过；relay 成功调用后指标增长；`ChannelMetricEnabled=false` 后两次 relay 指标冻结。
- **测试约束（重要）**：渠道缓存 60s 定时同步（`model/cache.go` SyncChannelCache，SYNC_FREQUENCY 控制），无事件失效；新建渠道最长 60s 后才进 relay 路由。告警触发因此一律走**批量测试接口**（`/api/channel/test?scope=all|disabled`，直读 DB，内含自动禁用/恢复判定）；指标/中继测试使用缓存内既有健康渠道。

**双主题**：亮/暗走查通过（Popup 深色气泡、设置段开关/输入框可读）。

