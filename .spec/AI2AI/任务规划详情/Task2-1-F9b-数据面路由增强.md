# Task2-1 F9b · 数据面路由增强（延时避险 / 动态剔除 / 正则模型映射）

> 任务来源：.trae/rules/one-api-dev.md 步骤 4「渠道智能路由与自动降级」。用户于 2026-09-06 明确解禁启动。
> 设计意图：①实时延时避险（最近 5 次调用平均延迟参与选路）；②动态剔除（过去 10 分钟内连续 429/5xx ≥3 次的渠道跳过）；③增强型模型映射（正则重写，如 `gpt-4-.* → gpt-4o-mini`）。

## 1. 现状核对（2026-09-06 代码核对）

| 项 | 现状 |
| :--- | :--- |
| 选路入口 | `middleware/distributor.go` → `model.CacheGetRandomSatisfiedChannel`（内存缓存模式，Redis 开启即启用）/ `model.GetRandomSatisfiedChannel`（DB 模式）；两者均为「最高优先级层内纯随机」，健康状态不参与 |
| 重试 | `controller/relay.go Relay()`：失败后按 `config.RetryTimes` 换渠道重试（`ignoreFirstPriority` 逐级降档） |
| F11 指标 | `monitor/metric.go` 内存滑动窗口（每渠道最近 MetricQueueSize=10 次成败），`monitor.Emit(channelId, success)` 由 controller/relay.go 调用；**重试成功路径漏记 success**；无延迟维度、无时间窗、无剔除能力 |
| 延迟数据 | 仅渠道手动/定时测试（`controller/channel-test.go` → `UpdateResponseTime` 写 DB）；真实流量延迟无采集 |
| 模型映射 | `relay/controller/helper.go getMappedModelName` 仅**精确匹配**（map 直查）；text/image 走该函数，audio.go 自行直查 |
| 导入方向 | monitor → model（monitor/channel.go 调 model.UpdateChannelStatusById），故 **model 选路代码不能 import monitor**，路由统计需独立叶子包 |
| 后台定时测试 | 上游已有 `CHANNEL_TEST_FREQUENCY` env → `controller.AutomaticallyTestChannels`（异步测试 + 更新 ResponseTime） |

## 2. 方案设计

### 2.0 核心原则

- 统计**全内存、原子、异步**（有界 buffered chan + 常驻消费 goroutine，模式同 F11 metric），选路查询 O(候选数) 纯内存，**零 DB/HTTP**。
- 全部候选被剔除时**回退原始候选集**（可用性优先），不会因剔除导致无可用渠道。
- 不新增主动 ping 协程：延迟以**真实流量端到端耗时**采样（更实时、零额外上游负载），主动探测复用上游已有的手动/定时渠道测试能力。
- DB 变更：**无**。新增 options/表：**无**。仅 env 可调参数。

### 2.1 新增 `routingstats` 叶子包（新文件，避免 model↔monitor 导入环）

`routingstats/routingstats.go`：

- `Record(channelId int, latencyMs int64, success bool)`：异步投递（buffered chan），记录：
  - **延迟环形缓冲**：每渠道最近 `LatencySampleSize=5` 次成功调用耗时（失败耗时不计入平均，避免快速失败污染）。
  - **连续失败计数**：success → 清零；fail → +1 并记 `lastFailAtMs`。
- `IsExcluded(channelId) bool`：`ConsecutiveFails >= threshold && now-lastFailAt < window`。窗口过期视为恢复（重新参与选路，下次成功即清零）。
- `AvgLatencyMs(channelId) (avg int64, count int)`。
- `Snapshot() map[int]ChannelStat`：`{avg_latency_ms, sample_count, consecutive_fails, last_fail_at, excluded}`（管理端展示用）。
- 参数（`common/config/config.go` 新增，env 可覆盖）：
  - `RoutingExcludeThreshold = env.Int("ROUTING_EXCLUDE_THRESHOLD", 3)`
  - `RoutingExcludeWindowSeconds = env.Int("ROUTING_EXCLUDE_WINDOW_SECONDS", 600)`
  - 延迟样本数固定 5（规则要求“最近 5 次调用平均延迟”）。
- 清理：渠道删除后残留的内存条目自然过期无害（快照仅对现存渠道展示，由前端按渠道列表过滤）。

### 2.2 选路集成（`model/channel_route.go` 新文件 + 两处小改）

- 新增 `model/channel_route.go`：`pickChannelWithRoutingStats(channels []*Channel) *Channel`
  1. 过滤 `routingstats.IsExcluded`；若全被剔除 → 用原始候选（可用性优先）。
  2. 层内**延迟加权随机**：有样本渠道 weight = 1/max(avgLatencyMs,1)；无样本渠道 weight = 1/minAvg（与最快者同等机会，避免新渠道饿死）；无任何样本 → 原始均匀随机（行为完全兼容现状）。
- `model/cache.go CacheGetRandomSatisfiedChannel`（内存模式，主路径）：首优优先级层与 `ignoreFirstPriority` 降档段均改为调用上述函数（候选集构建逻辑不变）。
- `model/ability.go GetRandomSatisfiedChannel`（DB 模式）：同条件查询去掉 `RAND()/First`，取全部最高优先级候选 abilities → 批量载入 channels → 调上述函数。仍为常数次索引查询。

### 2.3 采样埋点（`controller/relay.go`，管控面入口，非 relay/ 目录）

- 每次尝试（首发 + 重试）计时 `relayHelper`：
  - 成功 → `routingstats.Record(ch, latency, true)`；**并补上重试成功路径缺失的 `monitor.Emit(ch, true)`**（修复 F11 窗口漏计）。
  - 失败且 `statusCode == 429 || statusCode/100 == 5` → `Record(ch, latency, false)`；其他 4xx（客户端错误）不计入渠道健康。
- `monitor.Emit(false)` 原有逻辑不动（F11 自动禁用行为不变）。

### 2.4 正则模型映射（relay/ 内最小改动，纯内存字符串匹配）

- `relay/controller/helper.go getMappedModelName`：精确匹配优先（现状不变）；未命中时扫描**正则形 key**（含 `.*+?[]()|^$` 元字符），按 key 长度降序（更长更具体）→ 字典序稳定排序，首个匹配生效；`sync.Map` 缓存编译后的 regexp，非法 pattern 跳过并记日志。
- `relay/controller/audio.go`：直查 map 改为调用 `getMappedModelName`（与 text/image 行为统一，获得正则能力）。
- 语义不变量：**渠道选择仍按用户原始请求模型**（abilities 精确匹配），映射发生在选中渠道之后（与现有精确映射一致）。正则 key 仅改写发往上游的模型名。
- 修改理由：F9b 即数据面功能本体，正则映射为规则明确要求；两处改动均为纯内存匹配，无 DB/HTTP、无新增同步阻塞。

### 2.5 管理端可见性（可选低风险增强）

- `controller/channel_metrics.go`（F11 已有 `GET /api/channel/metrics`）：data 增加路由统计 `routing`（来自 `routingstats.Snapshot()`，仅含现存渠道）。
- 前端 `ChannelsTable.js` 可用率 Popup 增加平均延迟 / 连续失败展示；`EditChannel.js` 模型映射输入框 placeholder 提示正则支持；i18n zh/en 同步。

## 3. 改动清单

| 类型 | 文件 | 内容 |
| :--- | :--- | :--- |
| 新增 | `routingstats/routingstats.go` | 内存路由统计（延迟环 5 样本 + 连败计数 + 剔除判定） |
| 新增 | `model/channel_route.go` | `pickChannelWithRoutingStats`（剔除过滤 + 延迟加权随机） |
| 修改 | `model/cache.go` | 内存选路接入新挑选函数 |
| 修改 | `model/ability.go` | DB 选路接入新挑选函数 |
| 修改 | `controller/relay.go` | 每次尝试采样延迟/成败；补重试成功 Emit |
| 修改 | `relay/controller/helper.go` | getMappedModelName 支持正则 key |
| 修改 | `relay/controller/audio.go` | 映射统一走 getMappedModelName |
| 修改 | `common/config/config.go` | 新增 2 个 env 参数 |
| 修改 | `controller/channel_metrics.go` | 暴露 routing 快照 |
| 修改 | `web/default/src/components/ChannelsTable.js`、`pages/Channel/EditChannel.js`、i18n zh/en | 延迟展示 + 正则提示 |

## 4. 验收标准

1. **动态剔除**：坏渠道（上游恒 429）与好渠道同组同优先级同模型 → 连续 3 次 429 后，坏渠道被剔除，后续请求全部由好渠道秒级成功；`GET /api/channel/metrics` 中坏渠道 `consecutive_fails>=3 && excluded=true`；剔除窗口过期后 `excluded` 恢复 false。
2. **延时避险**：慢渠道（上游延迟 ~800ms）与快渠道同层 → 样本累积后，快渠道获得绝大多数流量（延迟加权生效）；metrics 中慢渠道 `avg_latency_ms≈800`。
3. **正则映射**：渠道 Models 含 `mock-regex-a/b`，映射 `{"mock-regex-.*":"gpt-4o-mini","mock-regex-a":"gpt-4o"}` → 请求 a 上游收到 `gpt-4o`（精确优先），请求 b 收到 `gpt-4o-mini`（正则命中）。
4. **兼容回归**：无统计样本时选路行为与现状一致；`relay/` 目录仅 helper.go/audio.go 两处纯内存小改；无剔除/无样本时网关转发正常。
5. 全部候选被剔除时回退不报错；无 DB 变更、无新表、无新 options；生产构建通过。

## 5. 实施状态（2026-09-06 完成并通过 E2E）

**后端**（按 §3 清单全部落地）：
- `routingstats/routingstats.go`（新包，规避 model↔monitor 导入环）：Record 异步（buffered chan 1024 + 常驻消费，队列满丢弃样本）、成功延迟环 5 样本、连败计数 + lastFailAtMs；IsExcluded 按 threshold(3)/window(600s) 判定（窗口过期自动恢复）；AvgLatencyMs/Snapshot。
- `model/channel_route.go`（新文件）：`pickChannelWithRoutingStats`——先剔除后加权；无样本渠道与候选中最快均值同权重（防饿死）；全剔除回退原候选；零样本均匀随机（兼容原版行为）。
- `model/cache.go`：内存选路首优层与 `ignoreFirstPriority` 降档段均接入新挑选函数（移除原 rand.Intn/`random.RandRange` 逻辑）。
- `model/ability.go`：DB 选路改为查询全部最高优先级候选（不再 `RAND()/First`）→ 批量载入 channels → 内存挑选。
- `controller/relay.go`：首发与每次重试均采样——成功记延迟（并补上重试成功路径缺失的 `monitor.Emit(true)`，修复 F11 窗口漏计）；失败仅 429/5xx 记连败，其他 4xx 不计。
- `relay/controller/helper.go`：`getMappedModelName` 支持正则 key（含元字符判定，长度降序→字典序稳定匹配，sync.Map 缓编译 + 编译失败负缓存）；`relay/controller/audio.go` 映射统一走该函数。
- `common/config/config.go`：新增 `ROUTING_EXCLUDE_THRESHOLD`（默认 3）、`ROUTING_EXCLUDE_WINDOW_SECONDS`（默认 600）。
- `controller/channel_metrics.go`：`GET /api/channel/metrics` data 新增 `routing`（`{channelId: {avg_latency_ms, sample_count, consecutive_fails, last_fail_at, excluded}}`）。

**前端**（web/default）：ChannelsTable 可用率 Popup 增加平均延迟/连续失败/剔除状态行（无 F11 数据仅有路由数据时显示"无样本"Label）；EditChannel 模型映射 placeholder 提示正则；i18n zh/en 同步（`channel.table.routing_*`、`success_rate_no_data`）。

**E2E（Temp/e2e_f9b/e2e_f9b.ps1，19/19 通过；容器 env ROUTING_EXCLUDE_WINDOW_SECONDS=60、RetryTimes 选项临时置 3）**：
- 动态剔除：坏渠道（mock 恒 429）连败达 3 → excluded=true → 30 次请求客户端全 200（重试自动降级到好渠道）→ 剔除后 10 连发连败计数冻结（坏渠道零流量）→ 66s 后窗口过期 excluded=false。
- 延时避险：慢渠道（mock 延迟 800ms）vs 快渠道同层，40 发快渠道 ≥32 次（实测 majority 达标）；metrics 慢渠道 avg_latency_ms∈[500,1200]、快渠道 ≤300。
- 正则映射：`{"mock-regex-.*":"gpt-4o-mini","mock-regex-a":"gpt-4o"}` → 请求 mock-regex-a 上游收到 gpt-4o（精确优先）、mock-regex-b 收到 gpt-4o-mini（正则命中，mock 回显 model 字段断言）。
- 回归与清理：存量渠道 gpt-4o-mini 转发 200；测试渠道/token 清理、RetryTimes 还原 0、metrics 接口正常。

**UI 走查**：渠道页可用率 Popup 双主题显示平均延迟/连败行正常（暗/亮截图通过）；EditChannel 模型重定向 placeholder 正则提示可见。

**踩坑记录**：
- 重建容器时误带 `--log-dir /app/logs` 参数 → alpine 末层无 /app 目录，启动即 crash loop（`mkdir /app/logs: no such file or directory`）；one-api-custom 镜像 docker run **不可带 --log-dir**。
- 首次构建报 `model/ability.go: undefined: err`（重构时删除了 `var err` 但尾部仍引用），修正后通过。
