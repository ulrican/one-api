# F1 · 在线充值体系（易支付 Epay）详细任务规划

> 归属：Task2-1 二开功能规划 P0 首项。上游规划：Task2-1-二开功能规划.md §5 F1/F2。
> 已确认决策：纯人民币计价；P0 仅易支付；Stripe/Creem 延后；TopupDiscount 折扣 P0 不实现（随 F3 再评估）。

## 1. 代码 Grounding 结论（实施依据）

| 依赖点 | 位置 | 结论 |
| :--- | :--- | :--- |
| options 机制 | `model/option.go` | InitOptionMap 注册默认值 + updateOptionMap switch 回写 config；bool 类需加进 `HasSuffix("Enabled")` 分支 |
| 配置变量 | `common/config/config.go` | 新增 Pay* 变量；**key 含 "Secret" 的 option 不会经 GetOptions 下发**（EpaySecret 自动脱敏） |
| 建表迁移 | `model/main.go migrateDB()` | 追加 `DB.AutoMigrate(&Order{})` |
| 加额度 | `model.IncreaseUserQuota`（内部 `gorm.Expr("quota + ?")`） | 直接复用；事务内用 `tx` 版本自写 |
| 缓存刷新 | `model/cache.go` | `CacheUpdateUserQuota` 会回写旧值（上游行为），**充值后必须 `common.RedisDel("user_quota:<id>")` 删 key** 强制下次读 DB |
| 充值日志 | `model.RecordTopupLog(ctx, userId, content, quota)` | 复用（LogTypeTopup） |
| 路由 | `router/api.go` | selfRoute 组（UserAuth）加 4 个接口；notify 为公开接口挂在 apiRouter 下 |
| 汇率 | `config.QuotaPerUnit = 500000`（=1 美元） | `quota = amount(元) / PayPrice × QuotaPerUnit` |
| 订单号 | `random.GetRandomString` + `helper.GetTimestamp` | `TradeNo = <unix秒><10位随机>` |
| 通知地址 | `config.ServerAddress`（options 可配） | notify_url = ServerAddress + `/api/user/pay/notify` |
| 现有充值 | `controller/user.go TopUp`（兑换码）+ `AdminTopUp` | 保留不动；新支付全部在新文件 |
| 前端 | `pages/TopUp/index.js` + `topup.css`（双主题令牌已就绪） | 升级为钱包页，保留 `/topup` 路由与 top_up_link 回退 |
| 管理设置 | `components/OperationSetting.js`（root 运营 Tab） | 新增"支付设置"分组，走既有 `PUT /api/option/` |

## 2. 设计

### 2.1 数据库（新表 orders，不改核心表）

```go
// model/order.go
type Order struct {
    Id            int64   `json:"id" gorm:"primaryKey;autoIncrement"`
    TradeNo       string  `json:"trade_no" gorm:"uniqueIndex;type:varchar(64)"`  // 内部订单号
    OutTradeNo    string  `json:"out_trade_no" gorm:"type:varchar(128);index"`   // 支付平台单号
    UserId        int     `json:"user_id" gorm:"index"`
    Amount        float64 `json:"amount" gorm:"type:decimal(10,2)"`              // 人民币元
    Quota         int64   `json:"quota"`                                          // 到账额度
    Status        int     `json:"status" gorm:"default:0"`                        // 0未支付 1已支付 2已超时
    PaymentMethod string  `json:"payment_method" gorm:"type:varchar(20)"`         // alipay / wxpay
    CreatedAt     int64   `json:"created_at" gorm:"bigint;index"`
    UpdatedAt     int64   `json:"updated_at" gorm:"bigint"`
}
```
状态机：0 →（回调验签通过）1；0 →（超时，惰性判定 30 分钟）2。方法：
- `InsertOrder`、`GetUserOrders(userId, limit)`、`GetOrderByTradeNo`
- `FinishOrderTrade(ctx, tradeNo, outTradeNo)`：事务 + `clause.Locking{Strength:"UPDATE"}` 行锁；`Status==1` 幂等返回 nil；否则置 1 + 记 OutTradeNo + 事务内 `tx.Model(&User).UpdateColumn("quota", gorm.Expr("quota + ?"))`
- `tryExpireOrder(order)`：Status==0 且距今 >30min → 置 2（惰性，不起后台协程）

### 2.2 易支付协议（`common/epay.go`）

- 下单：拼 `{PayAddress}/submit.php?pid&type=out_trade_no&notify_url&return_url&name&money&sign&sign_type=MD5`，money 格式 `%.2f`
- 签名规则：参数（剔除 `sign/sign_type` 与空值）按 ASCII 升序拼 `k=v&...` + 商户密钥，MD5 小写
- 验签：同一规则校验回调参数；`trade_status == "TRADE_SUCCESS"` 才入账
- 回调响应：纯文本 `success` / `fail`

### 2.3 新增配置项（options，默认全关）

| key | 类型/默认 | 说明 |
| :--- | :--- | :--- |
| PayEnabled | bool false | 支付总开关（false 时前端回退 top_up_link，行为与原版一致） |
| PayAddress | string "" | 易支付网关地址 |
| EpayId | string "" | 商户 PID |
| EpaySecret | string "" | 商户密钥（GetOptions 自动脱敏不下发） |
| PayPrice | float 7.3 | 每 1 美元额度的人民币售价 |
| MinTopUp | float 1.0 | 最低充值（元） |
| MaxTopUp | float 5000.0 | 最高充值（元，防滥用） |
| TopupAmountOptions | string "[10,30,50,100,200,500]" | 充值金额预设（JSON 数组） |

### 2.4 新增接口（`controller/pay.go`，统一 `{success,message,data}`）

| 接口 | 鉴权 | 说明 |
| :--- | :--- | :--- |
| GET `/api/user/pay/config` | UserAuth | {enabled, amount_options[], min/max, price, methods:[alipay,wxpay]} |
| POST `/api/user/pay/create` | UserAuth | body{amount, method} → 校验 → 建单 → 返回 {pay_url, trade_no, quota, amount} |
| GET|POST `/api/user/pay/notify` | 公开（仅全局限流） | 验签 → FinishOrderTrade → RecordTopupLog → RedisDel → `success` |
| GET `/api/user/pay/status?trade_no=` | UserAuth | 轮询（校验订单归属，惰性过期） |
| GET `/api/user/orders` | UserAuth | 本人最近 50 条订单 |

## 3. 实施步骤（执行任务项）

| # | 任务 | 产出 | 完成标准 |
| :--- | :--- | :--- | :--- |
| S1 | orders 模型与迁移 | model/order.go + main.go 一行迁移 | go build 通过 |
| S2 | epay 协议封装 | common/epay.go | 单测式自验证：签名/验签往返一致 |
| S3 | config+options 注册 | config.go、option.go | 保存 option 后 config 变量即时生效 |
| S4 | 支付 controller+路由 | controller/pay.go、router/api.go | go build 通过；接口冒烟通过 |
| S5 | 前端钱包页 | TopUp/index.js 改造 + topup.css 扩展 | 双主题无穿帮；PayEnabled=false 回退原行为 |
| S6 | 管理端支付设置 | OperationSetting.js + i18n zh/en | 保存后 /api/user/pay/config 反映新值 |
| S7 | 构建与 E2E | docker 镜像重建（3008） | §4 验收全部通过 |
| S8 | 回写文档 | 本文档状态 + 协议和数据.md + 项目架构信息.md | 文档与代码一致 |

## 4. 验收标准

1. **功能**：开启 PayEnabled → 钱包页可选金额/支付方式创建订单并跳转支付网关；回调成功后余额即时到账（Redis 已清，网关鉴权读到新额度）；订单状态、订单历史正确。
2. **安全**：伪造签名回调返回 `fail` 且不加钱；同一订单重复回调幂等（不重复入账）；金额越界（<Min/>Max/非法 method）被拒；EpaySecret 不出现在任何 GET 响应。
3. **兼容**：PayEnabled=false 时页面/接口行为与改造前一致（top_up_link 外跳 + 兑换码可用）；`relay/` 与核心表零改动；原文件仅 option.go/config.go/api.go/main.go 注册点级修改。
4. **质量**：`go build` 与前端 `npm run build` 通过；双主题走查无黑字/白字穿帮。

## 5. 状态

- [x] S1 orders 模型与迁移（model/order.go + main.go）
- [x] S2 epay 协议封装（common/epay.go）
- [x] S3 config+options 注册（config.go / option.go）
- [x] S4 支付 controller+路由（controller/pay.go / router/api.go）
- [x] S5 前端钱包页（pages/TopUp 改造 + topup.css + i18n zh/en）
- [x] S6 管理端支付设置（OperationSetting.js + i18n）
- [x] S7 构建与 E2E：Docker 镜像重建成功，模拟回调全链路 **23/23 通过**
- [x] S8 回写文档（协议和数据.md、项目架构信息.md、本文档）

### S7 测试记录（2026-09-06，http://localhost:3008）

E2E 脚本：`%TEMP%\f1_e2e_test.ps1`（模拟易支付回调，覆盖 §4 验收 1/2）。结果 **PASS=23 FAIL=0**：

- 配置链路：8 项 option 保存 → `GET /api/user/pay/config` 即时生效
- 建单：10 元 @ PayPrice=7.3 → quota=684931（`floor(10/7.3×500000)`），pay_url 指向网关 submit.php
- 回调入账：正确 MD5 签名 → `success`；订单置 1；余额 +684931
- 幂等：同一回调重放，余额不变（事务行锁 + Status==1 短路）
- 安全：伪造签名（sign 全 0）→ HTTP 400 `fail`，订单保持待支付
- 兼容：测试后 PayEnabled 恢复 false

S7 过程中修复的两个编译/运行错误（已入码）：

1. `controller/pay.go` CreatePayOrder 未使用的 `ctx` 变量（Docker go build 报错）
2. **`PayNotify` 中 `common.RedisDel` 未判 `common.RedisEnabled`** —— 无 Redis 部署时 RDB 为 nil，回调直接 panic（Gin Recovery 兜底成 500）。已加 `if common.RedisEnabled` 防护，与 model/cache.go 惯例一致。**教训：调用 common/redis.go 的 RDB 方法前必须判 RedisEnabled，RDB 本身无 nil 防护。**

备注：真实易支付商户联调需生产网关地址与密钥（另需配置 ServerAddress 为公网地址，否则 notify_url 无法回调）；本地用"按协议构造正确签名的模拟回调"完成全链路验证。
