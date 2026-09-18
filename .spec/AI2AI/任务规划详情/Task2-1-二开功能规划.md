# Task2-1 · one-api 二开功能规划（参考 new-api）

> 任务来源：Me2AI/任务清单.md 阶段二 Task2-1「参考 new-api，规划 one-api 的功能改造」。
> 本文档为阶段二（功能改造）的总规划，后续每个功能项（F1~Fxx）开发时再逐项拆分详细任务规划。
> 探索方式：浏览器只读走查 new-api 实例（http://47.107.148.79:3000/ ，管理员 root、普通用户 test01，2026-09-05），结合代码核对 one-api 现状。

---

## 1. 规划依据

1. **new-api 实测功能地图**（见 §2），覆盖用户端与管理端全部菜单及系统设置各 Tab。
2. **one-api 现状基线**（见 §3，来源于 AI2AI/项目架构信息.md 与代码核对）。
3. **技术约束**（.trae/rules/one-api.md、one-api-dev.md）：
   - 不修改 `relay/` 数据面同步链路；不在数据面引入耗时 DB/HTTP 查询。
   - 不改原版核心表结构（users/channels/tokens/logs/options/abilities），扩展能力以**新增扩展表 + options 配置项**为主。
   - C 端新页面统一放 `web/default/src/pages/User/` 方向演进；管理端保留原版 SUI 页面。
   - 支付安全：回调强制验签、事务 + `FOR UPDATE` 行锁、幂等防重、原子加额度（`gorm.Expr`）、刷新 Redis（`cleanUserCache`）。
   - 以新增文件/模块为主，少改原文件，便于 upstream 合入。

---

## 2. new-api 功能盘点（实测结果）

### 2.1 功能地图总览

```
new-api
├── 公开层：产品首页 / 模型广场(/pricing) / 排行榜(/rankings) / 文档(外链) / 关于
├── 用户端
│   ├── 概览（用量概览、性能健康：成功率/延迟/吞吐、公告、FAQ、Uptime Kuma 运行时间）
│   ├── 数据看板（Tab：模型调用分析/分流/用户统计；RPM/TPM；柱状图/面积图切换）
│   ├── API 密钥（分组、模型限制、IP 白名单 CIDR、过期时间、批量创建 N 个、无限额度）
│   ├── 使用日志（RPM/TPM 统计摘要、全部/仅自己、Token 详情展开）+ 任务日志（绘图/任务插件）
│   ├── 钱包（余额卡、在线充值、兑换码、订单历史、推荐计划 aff 邀请返利）
│   ├── 个人资料（绑定：邮箱/GitHub/微信/Telegram/Passkey/2FA；通知方式：邮箱/Webhook/Bark/Gotify；
│   │            配额警告阈值；登录会话管理；语言偏好；删除账户）
│   └── Playground 内嵌对话 + 第三方客户端集成菜单（Cherry Studio / LobeChat / OpenCat 等）
├── 管理端
│   ├── 渠道管理（优先级+权重、响应时间、批量操作、标签模式、自动测试、模型映射/参数覆盖）
│   ├── 模型元数据管理（/models/metadata）
│   ├── 用户管理（分组、角色、邀请信息列、多维筛选）
│   ├── 兑换码管理、订阅套餐管理（Stripe Price ID / Creem Product ID、升/降级分组、限购、余额兑换）
│   ├── 系统信息、任务插件（绘图/音乐等异步任务插件体系）
│   └── 系统设置（分组化 Tab，见 2.2）
└── 系统设置 Tab：站点与品牌 / 身份验证 / 计费与支付 / 模型与路由 / 安全与限制 / 控制台内容 / 运维
```

### 2.2 关键商业功能细节（对二开最有参考价值）

| 功能域 | new-api 实测细节 |
| :--- | :--- |
| 支付网关 | 支持 **Epay（易支付）/ Stripe / Creem / Waffo**；含通用设置、支付方式管理（支付宝/微信/自定义）、充值金额选项、金额折扣 |
| 额度设置 | 新用户配额、预消耗配额、邀请者奖励、受邀者奖励、免费模型预消耗开关、充值链接、文档链接 |
| 签到奖励 | 开关 + 每日签到随机额度奖励 |
| 敏感词 | 过滤开关、检查用户提示开关、阻止词库 |
| 监控与警报 | 配额提醒（token 阈值）、模型性能指标开关、刷新间隔、聚合时间桶、保留天数 |
| 身份验证 | 密码登录/注册、邮箱验证/域限制、GitHub/Discord/OIDC/Telegram/LinuxDO/微信 OAuth、Passkey、Turnstile 人机验证 |
| 运维 | 速率限制、SSRF 保护、令牌限制、SMTP、Worker 代理、日志维护、性能设置 |
| 模型广场 | 按分组/供应商/标签/定价类型（按量/按次/任务）/端点类型筛选；标准/充值两种价格模式；列表/卡片视图 |
| 排行榜 | 今天/本周/本月/今年；热门模型、LLM 排行、厂商市场份额、上升/下降趋势 |
| 邀请返利 | 钱包页"推荐计划"：`?aff=` 邀请链接、待确认金额/总收入/邀请人数 |
| 订阅套餐 | 套餐标题/价格/额度 USD/升级分组/降级分组/限购/排序/有效期/额度重置/允许余额兑换/第三方支付绑定 |

> 注：该实例未启用在线充值（钱包页提示"尚未启用在线充值"）、未发现签到前端入口（仅设置项），说明这些功能均为**开关控制的可选能力**。

---

## 3. one-api 现状基线与差距对照

| 功能域 | one-api 现状（已核对代码） | 差距 |
| :--- | :--- | :--- |
| 在线支付 | 无任何支付代码；仅兑换码充值（`controller/user.go TopUp`）+ 管理员手动充值（`AdminTopUp`）+ `top_up_link` 外跳 | **缺在线支付全链路**（P0） |
| 邀请返利 | `users` 表已有 `AffCode`/`InviterId` 字段；注册时已发 `QuotaForInvitee/QuotaForInviter` 奖励（`model/user.go#L52-145`） | 后端基础已有，缺推荐计划 UI、邀请统计接口、注册页 aff 自动带入（P0，低成本） |
| 签到 | 无 | 全新（P0，小成本） |
| 模型广场 | `/api/models`（登录）、`/api/user/available_models` 已有；无公开价格页 | 缺公开 /pricing 页 + 价格聚合接口（P0） |
| 令牌增强 | `tokens` 表已有 `Models`（模型限制）、`Subnet`（IP 限制）、`UnlimitedQuota` 字段；无批量创建 | 主要是**前端暴露** + 批量创建接口（P1，低成本） |
| Playground/Chat | 仅 `chat_link` 外跳 iframe | 缺内嵌 Playground（P1） |
| 数据看板 | Dashboard 已有趋势图/指标卡（Task 阶段一完成，双主题） | 缺 RPM/TPM、模型维度分析（P1） |
| 渠道管理 | 基础增删改查 + `monitor/` 渠道状态 | 缺权重/响应时间列/批量测试/标签；智能路由增强（P1，涉及 relay 谨慎） |
| 个人中心 | 绑定 GitHub/微信/邮箱（原版能力）、基础设置页 | 缺通知渠道扩展（Bark/Gotify/Webhook）、配额警告阈值、会话管理（P1） |
| 2FA/Passkey | 无 | P2 |
| 订阅套餐 | 无 | P2 |
| 任务插件/任务日志 | 无 | P2 |
| 排行榜 | 无（日志数据已具备） | P2 |
| 敏感词 | 无 | P2（涉及 relay 链路，需谨慎评估） |
| 监控告警 | `monitor/` 基础渠道监控 | P2 |

---

## 4. 改造总清单与优先级

> 优先级定义：**P0** 商业化闭环（对齐 Me2AI 路线图核心目标）；**P1** 体验与运营增强；**P2** 进阶能力（按需启动）。

| 编号 | 功能 | 决策 | 优先级 | 主要涉及（后端 / 前端 / DB） |
| :--- | :--- | :--- | :--- | :--- |
| F1 | 在线充值体系（易支付 Epay：微信/支付宝通道） | 做 | P0 | 新增 `controller/pay.go`、`model/order.go`、`common/epay.go` / `web/default pages/User/Wallet` / 新表 `orders` |
| F2 | 钱包页（余额 + 充值 + 兑换码 + 订单历史） | 做 | P0 | `controller/user.go`（订单查询接口）/ 新页面 / 无新表（查 orders） |
| F3 | 模型广场（公开价格页） | 做 | P0 | 新增 `GET /api/pricing` / 新页面 `pages/Pricing` / 无新表（聚合 abilities + 倍率配置） |
| F4 | 邀请返利（推荐计划） | 做 | P0 | 新增邀请统计接口 / 钱包页推荐模块 + 注册页 aff 带入 / 无新表（复用 AffCode/InviterId） |
| F5 | 每日签到 | 做 | P0 | 新增 `POST /api/user/check_in` + options 配置 / 钱包页签到卡 / 复用 logs 表记录（新 LogType） |
| F6 | 令牌增强（模型限制/IP 白名单/批量创建） | 做 | P1 | 补充令牌创建/编辑接口参数 / Token 页表单与列 / **无表变更**（字段已有） |
| F7 | Playground 内嵌对话 | 做 | P1 | 无后端改动（直连 `/v1`）/ 新页面 `pages/Playground` / 无新表 |
| F8 | 数据看板增强（RPM/TPM、模型维度） | 做 | P1 | 日志聚合接口扩展 / Dashboard 页增强 / 无新表 |
| F9 | 渠道管理增强（管理面 9a + 数据面 9b） | 做（9a 管理面；9b 数据面路由增强**已解禁追加并完成**） | P1 | channels 运维面 / 渠道页增强 / abilities 复用；9b 新增 `routingstats/` 叶子包（内存统计不阻塞数据面）+ 选路动态剔除/延时加权 + 正则模型映射，`relay/` 改动限于 `helper.go` 映射函数 |
| F10 | 个人中心增强（通知渠道/配额警告阈值/会话管理） | 做 | P1 | 新增通知配置接口 / Setting 页增强 / 新表 `user_settings`（或 options KV） |
| F11 | 监控与告警（渠道故障告警、配额提醒） | 做 | P2 | `monitor/` 扩展 / 管理端设置 UI / 无新表 |
| F12 | 两步验证 2FA（TOTP） | 做 | P2 | `middleware/auth` 扩展 / Setting 页 / users 扩展表 |
| F13 | 订阅套餐（Stripe 等） | **延后**（已确认，后续阶段立项） | P2 | 新表 `packages` + `subscriptions` / 套餐页 |
| F14 | 任务插件与任务日志（绘图等异步任务） | **延后**（已确认，后续阶段立项） | P2 | 新表 `tasks` / 任务日志页 |
| F15 | 排行榜 | 做（**已完成**） | P2 | logs 聚合接口 / 公开页 |
| F16 | 模型元数据管理 | 暂缓 | P2 | 新表 `model_metadata` / 管理页 |
| F17 | 敏感词过滤 | 暂缓评估 | P2 | 涉及 relay 请求链路，违反"数据面不加耗时处理"原则，需另行评估（可用异步旁路统计替代） |
| F18 | 第三方客户端集成菜单 | 做（**已完成**） | P2 | 纯前端（客户端跳转链接拼参） |
| — | Discord/LinuxDO/OIDC OAuth、Worker 代理、SSRF 保护 | 不做 | - | 受众小/复杂度高，暂不纳入 |

---

## 5. P0 阶段详细规划（商业化闭环）

### F1 在线充值体系（易支付 Epay）

**改造内容**：支持易支付协议（Epay，兼容微信/支付宝通道）的在线充值：创建订单 → 跳转/扫码支付 → 异步回调加额度 → 订单状态查询。

**后端**（全部新增文件，不改原文件）：
1. `model/order.go`：`orders` 扩展表
   - 字段：`Id`、`TradeNo`（uniqueIndex）、`OutTradeNo`、`UserId`（index）、`Amount`（decimal(10,2)，元）、`Quota`、`Status`（0 未支付/1 已支付/2 已超时）、`PaymentMethod`（epay-wxpay/epay-alipay）、`CreatedAt`/`UpdatedAt`
   - 方法：`InsertOrder`、`GetOrderByTradeNo`、`FinishOrder`（事务 + `FOR UPDATE` 行锁 + 幂等判断 `Status==1` 直接返回成功 + `gorm.Expr("quota + ?")` 原子加额度）
2. `controller/pay.go` 三接口：
   - `POST /api/user/pay/create`（UserAuth）：参数校验（金额 ∈ 充值选项、≥ 最低充值）→ 生成订单 → 调用易支付下单 → 返回支付 URL/二维码参数
   - `GET|POST /api/user/pay/notify`（公开 + 验签）：**MD5/RSA 强制验签** → 事务完成订单 → `cleanUserCache(userId)` → 返回 `success`
   - `GET /api/user/pay/status?trade_no=`（UserAuth）：前端轮询
3. `common/epay.go`：易支付协议封装（提交参数、MD5 签名生成/验证）。
4. options 新增配置项（`model/option.go` 注册）：`PayEnabled`、`PayAddress`、`EpayId`、`EpaySecret`、`Price`（**纯人民币计价**：Price = 每 1 美元额度的人民币售价，即内部额度换算 `quota = amount(元) / Price × QuotaPerUnit`）、`MinTopUp`、`TopupAmountOptions`（充值人民币金额预设，JSON）、`TopupDiscount`（金额折扣，可选）
5. 路由注册（`router/api.go` 新增 selfRoute 组）。
6. 订单超时：后台 goroutine 定时将超时未支付订单置为 2（仅管控面，异步）。

**前端**：
- `pages/User/Wallet`（新页面，替代现有 `/topup` 静态槽位方案）：
  - 余额 Hero 卡 + 充值金额选择（预设金额 + 自定义）+ 支付方式选择（alipay/wxpay）+ 支付按钮（弹窗展示支付二维码/跳转）+ 轮询支付状态
  - 订单历史列表（金额/额度/方式/状态/时间）
- **兼容性**：`PayEnabled=false`（默认）时页面回退为现有 `top_up_link` 外跳模式（保留现有行为，零破坏）。

**验收标准**：
1. 开启 PayEnabled 后，用户可在钱包页完成易支付模拟全流程：创建订单 → 支付 → 回调加额度 → 订单状态更新为已支付 → 余额立即生效（无需刷新登录态）。
2. 伪造回调（错误签名）返回 fail 且不加额度；同一订单重复回调不重复加额度（幂等）。
3. 关闭 PayEnabled 后页面回退外跳，与改造前行为一致；`relay/` 目录零改动；原版文件改动仅 `router/api.go`、`model/option.go` 两处注册点。
4. 生产构建通过，双主题无穿帮。

### F2 钱包页整合

并入 F1 前端实施（余额卡数据复用 `/api/user/self`；订单历史 `GET /api/user/orders`；兑换码沿用现有 `/api/user/topup`）。原 TopUp 页路由 `/topup` 重定向至钱包页或由导航直达新页（实施时定，倾向**保留 `/topup` 路由 + 页面内容升级为钱包页**，避免外链/书签失效）。

### F3 模型广场（公开价格页）

**改造内容**：公开只读页面展示可用模型与价格（输入/输出价，换算自倍率），支持搜索、分组/端点类型筛选、卡片/列表视图（对标 new-api /pricing 做简化版）。

**后端**：新增公开接口 `GET /api/pricing`（`router/api.go` 公开组）：聚合 `abilities`（可用模型清单）+ 模型倍率配置（`common/model-ratio.go` 的 ModelRatio/CompletionRatio）+ 分组倍率，输出 `{model, enable_groups, quota_type, model_ratio, completion_ratio, input_price, output_price}`。加 Redis 缓存（60s），不触 DB 高频查询。

**前端**：`pages/Pricing`（公开路由 `/pricing`，导航加入"模型价格"入口，登录前后均可见）。

**验收标准**：
1. 未登录可访问 `/pricing` 并看到模型价格；价格与实际计费倍率一致（抽样 3 个模型对照日志扣费）。
2. 接口有缓存，压测下无慢查询；双主题正常。

> **实施状态（已完成）**：`GET /api/pricing` 已上线（公开组，Redis 缓存 60s，无 Redis 降级查 DB）；`pages/Pricing` 公开路由 + 搜索框 + 价格表（人民币计价），导航"价格"入口登录前后均可见。无新表，复用 abilities + ModelRatio/CompletionRatio。

### F4 邀请返利（推荐计划）

**改造内容**：用户端"推荐计划"模块（邀请链接、邀请人数、累计奖励）+ 注册页自动带入 aff。

**后端**：新增 `GET /api/user/aff`（UserAuth）：统计 `inviter_id = 当前用户` 的邀请人数、累计奖励金额（从 logs type=system 邀请赠送记录聚合）；提供 `POST /api/user/aff_reset`（可选，重置邀请码）。
**前端**：钱包页"推荐计划"卡片（链接 `origin/register?aff={code}` + 复制按钮 + 三个统计数字）；注册页读取 `?aff=` 并随注册表单提交（`RegisterForm.js` 透传 aff 参数，后端 Register 已支持 inviterId 入参）。

**验收标准**：通过邀请链接注册新用户，邀请人获得 QuotaForInviter 奖励且推荐计划数字 +1；直接访问注册页不受影响。

> **实施状态（已完成）**：`GET /api/user/aff` 返回 `{aff_code, invite_count, total_reward}`（invite_count 查 users.inviter_id 计数，total_reward = count × QuotaForInviter）；钱包页推荐计划卡（邀请人数/累计奖励/复制链接）；注册返利复用 `model/user.go Insert()` 既有逻辑。无新表。

### F5 每日签到

**改造内容**：每日签到随机额度奖励（new-api 同款开关化能力）。

**后端**：`POST /api/user/check_in`（UserAuth）：
- Redis key `checkin:{uid}:{yyyymmdd}` SETNX 防重复（TTL 24h+）
- 随机额度 ∈ [CheckInMinReward, CheckInMaxReward]，`gorm.Expr` 原子加额度 + `cleanUserCache`
- 写入 logs（复用现有日志表，新增 `LogTypeCheckIn` 常量，不建新表）
- options：`CheckInEnabled`（默认 false）、`CheckInMinReward`、`CheckInMaxReward`

**前端**：钱包页签到卡（今日已签到/未签到状态、奖励区间提示、签到按钮），关闭时隐藏。

**验收标准**：开启后每日仅可签到一次；重复请求返回已签到；关闭后入口消失；额度变更后网关鉴权立即读到新额度（Redis 已清）。

> **实施状态（已完成）**：`POST /api/user/check_in` + `GET /api/user/check_in/status` 已上线；Redis SETNX `checkin:{uid}:{yyyymmdd}` TTL 26h 防重（无 Redis 退化为 logs 表查重）；随机奖励 `gorm.Expr` 原子加额度 + `RecordLog(LogTypeCheckIn=6)` + 清用户缓存；管理端 OperationSetting 新增签到开关/最小/最大奖励配置。E2E 验证：首次签到奖励 7214 到账，二次返回"今日已签到"。

---

## 6. P1 阶段详细规划（体验与运营增强）

### F6 令牌增强
- **内容**：创建/编辑令牌弹窗暴露"模型限制"（下拉多选，来自 `/api/user/available_models`）、"IP 白名单"（subnet 文本，支持 CIDR）、"无限额度"开关、**批量创建 N 个**（名称加随机后缀）；列表增加"模型/IP 限制"列。
- **后端**：`controller/token.go` 增加批量创建参数（循环 Insert，复用现有校验）；**无表变更**（`Models`/`Subnet` 字段已存在，原版后端鉴权已消费这两个字段）。
- **前端**：Token 页表单/列表增强。
- **验收**：限制模型后调用非授权模型返回 403 提示；subnet 外 IP 调用被拒；批量创建 10 个令牌名称唯一。

> **实施状态（已完成）**：`POST /api/token/` 新增 `count` 参数（≤1 单建；2~100 批量，命名 `{name}-{4位随机}`，`GetTokenNameExists` DB 查重 + 内存 usedNames 双重唯一；>100 拒绝）；EditToken 新增批量数量/模型范围（多选下拉，提交 join(',')）/IP 限制三字段；TokensTable 新增"限制"列。E2E 验证：批量 2×5 名称全局唯一、非授权模型 403、授权模型 200（usage=20）、网段外 IP 403。

### F7 Playground 内嵌对话
- **内容**：侧导航"对话"入口升级：若配置 `playground_enabled` 则内嵌对话页（选择自己的令牌 + 模型，SSE 流式打字机效果）；无配置时回退现有 `chat_link` iframe 方案。
- **后端**：零改动（前端直连 `/v1/chat/completions`，复用用户令牌鉴权）。
- **前端**：`pages/Playground`；SSE 资源释放（组件卸载关闭 EventSource）遵循前端规范。
- **验收**：流式对话正常、停止按钮可中断、令牌额度扣减正确（对照日志）；卸载页面无连接泄漏。

> **实施状态（已完成）**：新增 option `PlaygroundEnabled`（默认 false，经 /api/status 下发 `playground_enabled`，OperationSetting 管理开关）；`pages/Playground/index.js` fetch 直连 `/v1/chat/completions` SSE 流式（AbortController 实现"停止"按钮 + 卸载释放）；Header"对话"入口按开关切换内嵌页 / chat_link iframe。E2E 验证：流式 chunk 完整拼出"你好，世界！"、停止按钮流式期间出现、非流式调用额度扣减 + 日志入账一致。

### F8 数据看板增强
- **内容**：Dashboard 增加 RPM/TPM 指标卡与"模型维度调用分析"图（Top N 模型请求量/消费额），数据源为现有 logs 聚合接口扩展。
- **验收**：数字与日志抽样一致；聚合接口 P95 < 500ms（有 Redis 缓存/索引）。

> **实施状态（已完成）**：新增 `GET /api/user/dashboard/metrics`（selfRoute）：rpm/tpm 为 logs 最近 60s 实时聚合（不缓存），top_models 为最近 7 天 Top10（Redis 缓存 60s，key `dash_metrics:top_models:{uid}`，无 Redis 直查）；实现于 `model/log_metrics.go` + `controller/dashboard_metrics.go`；Dashboard 新增 RPM/TPM 指标卡 + 模型维度横向柱状图。E2E 验证：接口与 logs 表 7 天聚合逐条一致、Redis 缓存键生成、RPM=5/TPM=100 与实际调用节奏吻合（浏览器实测）。

### F9 渠道管理增强（管理面 9a + 数据面 9b）
- **内容（9a 管理面，低风险，本期实施）**：渠道列表增加权重/响应时间列、批量启停/测试、标签模式；`channels` 表已有字段直接暴露，缺的加列前先核对 upstream（避免与官方未来 schema 冲突）。
- **9b 数据面路由增强（实时延时避险/动态剔除/正则模型映射）**：2026-09-06 由用户解禁追加实施。
- **验收**：渠道批量操作与标签功能可用；9b 选路仅读内存原子统计（`routingstats` 叶子包，异步 channel 消费），数据面无同步阻塞。

> **实施状态（已完成，2026-09-06）**：详见独立规划 `Task2-1-F9-渠道管理增强.md`。后端新增 `POST /api/channel/batch`（enable/disable/delete/test，AdminAuth，批量启停同步 abilities、批量测试复用全量测试异步链路）；channels 表经核对后新增 `tag` varchar(64) 列（与 new-api 同名，官方上游无此列），`PUT /api/channel/` 的 tag 采用"显式携带才更新"语义（ShouldBindBodyWith 双绑定）；前端渠道表新增勾选框+批量按钮、标签列、详情模式权重可编辑列、编辑表单标签输入。E2E：API 29/29 + 浏览器 UI 全通过，relay 回归 200。

> **9b 实施状态（已完成，2026-09-06，用户解禁追加）**：详见独立规划 `Task2-1-F9b-数据面路由增强.md`。新增 `routingstats/` 叶子包（内存滑动窗口：最近 5 次延迟均值 + 连败计数，buffered channel 异步消费不阻塞数据面）；选路入口（内存/DB 两模式）接入动态剔除（10 分钟窗口内连败≥3 剔除，全剔除时退化为全量）与延迟加权随机（无样本退化为均匀）；模型映射支持正则 key（精确匹配优先，`getMappedModelName` 统一收敛，`relay/controller/helper.go`）；`GET /api/channel/metrics` 增 routing 字段，前端可用率 Popup 展示延迟/连败/剔除状态；env `ROUTING_EXCLUDE_WINDOW_SECONDS` 等可配。E2E 19/19 通过 + UI 走查通过；顺带修复 F11 重试成功漏记 `monitor.Emit(true)`。

### F10 个人中心增强
- **内容**：通知渠道扩展（邮箱/Bark/Gotify/Webhook）、配额警告阈值（余额低于阈值时异步通知，由监控协程触发，不进 relay 链路）、登录会话管理（简化版：查看当前会话列表 + 注销其他会话，基于现有 session 存储）。
- **DB**：通知配置放 `users` 扩展表 `user_settings`（user_id uniqueIndex + notify_type + notify_payload JSON + quota_warning_threshold）。
- **验收**：设置阈值后额度耗尽前收到通知；会话注销后旧 session 失效。

> **实施状态（已完成，2026-09-06）**：详见独立规划 `Task2-1-F10-个人中心增强.md`。新表 `user_settings` + `user_sessions`（AutoMigrate）；通知四通道（common/message/notify_user.go）；配额警告协程 monitor/quota_warning.go（env QUOTA_WARNING_INTERVAL 默认 600s，24h 冷却，不进 relay）；会话管理采用"user_sessions 登记 + user_settings.session_epoch 吊销版本号"方案（cookie store 无服务端状态，epoch 仅作用于 cookie 会话，access token 不受影响），selfRoute 新增 5 接口。E2E：API 25/25 + relay 回归 200 + 浏览器 UI 全通过。`relay/` 零改动。

---

## 7. P2 阶段（进阶能力，按需启动）

| 编号 | 内容要点 | 备注 |
| :--- | :--- | :--- |
| F11 监控与告警 | 渠道连续失败告警（SMTP/Webhook）、配额提醒协程、渠道可用率展示 | 基于 `monitor/` 扩展 |
| F12 2FA | TOTP（Google Authenticator 兼容），登录二次校验 | users 扩展表 `user_2fa` |
| F13 订阅套餐 | `packages` 表（P0 支付落地后价值更高：套餐 + 余额兑换 + 有效期/重置） | 依赖 F1 |
| F14 任务插件 | 绘图/音乐等异步任务：新表 `tasks` + 任务日志页 + `/v1` 任务型接口 | 工作量大，独立评审 |
| F15 排行榜 | 基于 logs 聚合的公开热门模型/厂商排行 | 数据已具备 |
| F16 模型元数据 | 模型图标/供应商/标签/描述管理，反哺 F3 模型广场展示 | 独立表 |
| F18 客户端集成菜单 | Cherry Studio/LobeChat 等跳转链接拼参（base_url + key） | 纯前端 |

---

> **实施状态（F11 已完成，2026-09-06）**：详见独立规划 `Task2-1-F11-监控与告警.md`。配额提醒协程已在 F10 交付（per-user），F11 补齐渠道侧：`monitor/alert.go`（新）Webhook 告警（事件 `channel_disabled`/`channel_metric_disabled`/`channel_enabled`，map+Mutex 冷却，故障类受限、恢复类即时，异步 10s best-effort）挂载于 `monitor/channel.go` 三个状态变更点；`monitor/metric.go` 重写（消费者常驻、门控运行时读 config 即时生效、RWMutex、`GetChannelMetrics()`）；`GET /api/channel/metrics`（AdminAuth）；4 个新 option（ChannelAlertEnabled/WebhookUrl/CooldownMinutes/MetricEnabled）。前端：渠道页"可用率"列（30s 轮询 + Popup 明细）、运营设置"监控设置"段。无新表，`relay/` 零改动。E2E：API 40/40（F11+F12 合并套件）+ 双主题 UI 走查通过。

> **实施状态（F12 已完成，2026-09-06）**：详见独立规划 `Task2-1-F12-两步验证.md`。TOTP 纯 Go 标准库实现（`common/totp`，RFC6238，零新依赖）；新表 `user_two_fas`（Gorm 复数化表名；secret `json:"-"` 不下发）；登录中间态 pending token（Redis TTL 300s 优先、sync.Map 兜底，Peek 验码→原子 Consume，错码不烧毁）；`POST /api/user/login/2fa`（公开+CriticalRateLimit）+ selfRoute 4 个 `/2fa/*` 端点；Login 密码通过后返回 `need_2fa` 不建会话。**仅门控密码登录**，OAuth/access token 不拦截，middleware/auth.go 与 `relay/` 零改动。前端：LoginForm 验证码视图、PersonalSetting 二维码 Modal（npm `qrcode`）。E2E：API 40/40 + 双主题 UI 走查通过；走查修复 2 个暗色穿帮（basic 按钮黑字、toast 白底白字）。

> **实施状态（F15 已完成，2026-09-06）**：新增 `model/log_rankings.go`（`GetGlobalModelStats`，复用 `GetUserModelStats` SQL 模板去掉 user_id）+ `controller/rankings.go`（`GetRankings` 公开接口，Redis 60s 缓存 + `inferProvider` 厂商前缀推断）；4 处注册点（config/option/misc/api-router）；option `RankingEnabled`（默认 false，`/api/status` 下发 `ranking_enabled`）；`pages/Rankings` 公开路由 `/rankings`（range+dimension 双 Tab）；Header"排行榜"入口（与 Pricing 同款无条件渲染）；OperationSetting 开关段。E2E：API 10/10 + UI 走查通过。`relay/` 零改动，无新表，仅 options 新增 1 行。

> **实施状态（F18 已完成，2026-09-06）**：纯前端，无新接口。TokensTable 已有 copy/open link 下拉（raw/next/ama/opencat/lobechat），F18 在 `pages/Playground` toolbar 新增"接入客户端"Dropdown（plug 图标），复用 `tokenKey` state，选项：NextChat/OpenCat/LobeChat/Cherry Studio（deeplink `ama://`）/复制 Key。拼参：`base_url = server_address || window.location.origin`；`key = sk-{tokenKey}`；deeplink 直接 `window.location.href`，其他复制到剪贴板。无 option 开关。E2E：UI 走查通过（按钮可见+选项完整+disabled 逻辑正确）。`relay/` 零改动。

---

## 8. 实施顺序与依赖

```
F1 在线支付 ──► F2 钱包页 ──► F5 签到（同页） ──► F4 邀请返利（同页）
F3 模型广场（独立，可并行）
P0 完成后 ──► F6 令牌增强 ──► F7 Playground ──► F8 看板增强 ──► F10 个人中心
F9 管理面 9a + 数据面 9b（随 P1，9b 用户解禁追加已完成）
P2 按需求启动（F13 订阅依赖 F1）
```

建议任务拆分节奏：每个 F 编号 = 一个独立任务项，开发前按本规划拆分详细任务规划（沿用 Task0x 文档模式），完成后回写 AI2AI 文档。

## 9. 通用约束与防踩坑（每项强制）

1. `relay/` 数据面：禁止同步 DB/HTTP；渠道路由增强只读内存/Redis 指标。
2. 核心表不改结构；扩展 = 新表 + options 配置 + 复用已有未暴露字段。
3. 额度变更三件套：事务 + 行锁 + `gorm.Expr` 原子更新 + `cleanUserCache`。
4. 支付回调：验签强制、幂等防重、失败重试安全（回调重放不重复加钱）。
5. 新接口统一响应 `{success, message, data}`；用户错误信息 i18n。
6. 前端新页面走 `pages/User/` + 独立 CSS（`.dashboard-container` 容器规范）+ 双主题令牌；不引入新 UI 框架。
7. 默认关闭的开关型功能（支付/签到/Playground）必须保证关闭时系统行为与原版一致。

## 10. 决策记录（2026-09-05 用户确认）

1. **支付渠道**：P0 仅做易支付（Epay，一套协议通吃微信/支付宝通道）；Stripe/Creem 随 F13 订阅延后。
2. **金额模型**：采用**纯人民币计价**——用户支付与展示均为人民币（元），内部额度按 `quota = amount(元) / Price × QuotaPerUnit` 换算（Price = 每 1 美元额度的人民币售价，管理可配）。
3. **F9b 数据面路由增强**：原定本期不纳入；2026-09-06 用户解禁追加，已完成（实现与约束见 `Task2-1-F9b-数据面路由增强.md`）。
4. **订阅套餐（F13）与任务插件（F14）**：延后，后续阶段立项。
5. **模型广场（F3）**：展示标准价（按倍率换算）；"充值价格模式"随 F1 折扣配置落地后再评估，P0 不做。
