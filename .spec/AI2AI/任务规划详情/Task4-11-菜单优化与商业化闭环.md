# Task4-11 控制台菜单优化 + 商业化闭环（用户组管理 / 套餐自助升级）

> 用户指令：①「立即可做」清理收敛与「短期」商业化闭环一起执行；②控制台菜单命名/分布/排序优化。
> 约束：不改 relay/ 数据面同步链路；不改核心表（users 仅新增只读性质的方向使用既有列）；扩展表新增；构建部署端口 3008:3000。

## 一、现状核查结论（编码前已验证）

| 项 | 结论 |
| --- | --- |
| pages/Token（index+EditToken） | 仅 App.js 引用（/token 三条路由），菜单早已无入口 → 死页面，删 |
| pages/Redemption/index.js | 无任何 import（仅 EditRedemption 在用）→ 死页面，删 |
| /chat iframe 页 | 引用点：App.js 路由、navConfig getChatItem 降级、Landing L224 → 三处一并收敛为 /playground，删页面 |
| EditChannel 渠道分组 | 已是 Form.Dropdown multiple+allowAdditions（多选化早已完成）→ 本任务不再动 |
| 分组倍率接口 | GET/POST /api/ratio/groups（整体替换 map，default 必填）已存在 |
| 用户组缓存 | Redis key `user_group:<id>`（model/cache.go CacheGetUserGroup） |
| 支付链路 | CreatePayOrder→orders 表→PayNotify/WeChatPayNotify/AlipayNotify→model.FinishOrderTrade（事务+行锁+幂等+金额校验） |

## 二、Phase A 清理收敛（低风险）

1. 删 `web/default/src/pages/Token/`（index.js + EditToken.js）；App.js 删 import 与 /token、/token/add、/token/edit/:id 三条路由。
2. 删 `web/default/src/pages/Redemption/index.js`（保留 EditRedemption.js）。
3. 删 `web/default/src/pages/Chat/`；App.js 删 import 与 /chat 路由。
4. navConfig `getChatItem()` 收敛：恒返回 `/playground`（去 playground_enabled/chat_link 降级逻辑）。
5. Landing L219-229 WebChat 按钮：恒 navigate('/playground')。
6. /payment 兑换 Tab 文案改「兑换码管理」（header.redemption 仅此一处使用，直接改 zh/en 值）。

## 三、Phase B 菜单结构优化（命名/分布/排序）

### 新侧栏结构（navConfig.js）
- 置顶独立：**对话**（/playground，icon comments）、**模型体验**（/experience，icon flask）
- 常规：总览 /dashboard、应用 /application、日志 /log
- 资源：充值 /topup、模型广场 /marketplace(statusFlag)、**模型价格 /pricing（新增入口）**、排行榜 /rankings
- 账户：设置 /setting、关于 /about
- 管理（admin，命名统一「××管理」）：渠道管理 /channel、倍率管理 /ratio、用户管理 /user、运营管理 /operation、支付管理 /payment、系统管理 /system、站点管理 /site

### 顶部导航 topNavLinks
首页 → 模型广场 → **模型价格（新增）** → 排行榜 → 关于

### i18n 变更（zh / en 同步）
- 新增：header.pricing（模型价格 / Pricing）
- 改名：header.channel=渠道管理/Channels、header.ratio=倍率管理/Ratios、header.user=用户管理/Users、header.operation=运营管理/Operations、header.payment=支付管理/Payments、header.system=系统管理/System、header.site=站点管理/Site、header.redemption=兑换码管理/Redemption Codes
- Ratio 页 Card.Header 标题与菜单重名 → 移除标题行、保留公式副标题（与 Task4-10 去标题原则一致）

## 四、Phase C 用户组管理（组列表 / 批量迁移）

### 后端（controller/group.go + model/user.go）
- `GET /api/group/manage`（AdminAuth）→ `data: [{name, ratio, member_count}]`
  - ratio 来自 SnapshotGroupRatio()；member_count 来自 `SELECT group, COUNT(*) FROM users GROUP BY group`
- `POST /api/group/move`（AdminAuth）→ body `{from_group, to_group}`，校验：二者非空且不相等、to_group 必须已存在于 GroupRatio；`UPDATE users SET group=to WHERE group=from`（RowsAffected 返回 moved 数）
  - Redis 有 `user_group:<id>` 短 TTL 缓存，迁移后延迟生效属可接受（写文档说明）；default 组不允许作为 from 被清空？——允许迁出 default（把用户升组），但 to=from 拒绝

### 前端（components/GroupManage.js 新建，/ratio 页 Tab3 整体替换）
- 表格列：组名 | 分组倍率（行内 Input） | 成员数 | 操作（迁移）
- 「保存倍率」→ POST /api/ratio/groups（整体替换，沿用既有校验）；「新增分组」行；成员数=0 的组可删除（从 map 移除后整体保存）
- 「迁移」→ Modal 选择目标组 → POST /api/group/move → 成功后刷新成员数
- i18n：groupmanage.* 键（zh/en）

## 五、Phase D 套餐自助升级（vip/svip 商业化闭环）

### 数据库（model/package.go 新建，均为扩展表）
```go
// packages 套餐模版
Package{ Id, Name varchar64, GroupName varchar32, Price decimal(10,2),
  DurationDays int /*0=永久*/, Description varchar255, Enabled bool default true, CreatedAt, UpdatedAt }
// user_packages 用户套餐实例（到期判定数据源）
UserPackage{ Id, UserId int index, PackageId int, GroupName varchar32,
  OrderTradeNo varchar64, StartAt int64, ExpireAt int64 /*0=永久*/,
  Status int /*1有效 0失效*/, CreatedAt }
// orders 扩展列（自有扩展表，可加列）
Order += PackageId int default 0 index   // >0 表示套餐购买订单
```
migrateDB() 注册两张新表 AutoMigrate；orders 加列由 AutoMigrate 自动补。

### 支付下单（controller/package.go 新建 + pay.go 小重构）
- `GET /api/package/available`（UserAuth）→ enabled 套餐列表（购买页用）
- `POST /api/package/purchase`（UserAuth）→ `{package_id, method}`：校验套餐存在且 enabled、PayEnabled；创建 Order{Amount=pkg.Price, Quota=0, PackageId=pkg.Id}；复用既有支付分支（epay→BuildEpaySubmitURL / direct→微信 Native 二维码|支付宝跳转）。将 CreatePayOrder 尾部「根据 PaymentMode 发起支付」抽为 `launchPay(c, order, method)` 供两处复用
- 管理端 CRUD：GET/POST/PUT `/api/package/`、DELETE `/api/package/:id`（AdminAuth）
- router/api.go 注册上述 6 条路由

### 回调入账（model/order.go FinishOrderTrade 内，事务中）
- order.PackageId > 0 时：不执行 quota 入账（套餐单 quota=0），改为事务内：
  1. 读套餐（不存在则报错回滚）
  2. 失效同组旧有效实例（status=0）
  3. 插入新 UserPackage（expire = now + days*86400，0=永久）
  4. `UPDATE users SET group=<pkg.GroupName>`（列更新）
  5. 充值日志内容改为「购买套餐 <名>（订单号 …）」
  - 幂等性沿用 credited 标记（重复回调直接跳过）；金额强校验/行锁全部复用
- 函数签名改为返回 `(*Order, credited, error)`，pay.go 三处回调调用点同步更新；回调成功后 credited 时除清 `user_quota:<id>` 外再清 `user_group:<id>`

### 到期判定（model/user.go GetUserGroup 内惰性降级）
- 读到 users.group 后：若 group ∉ {''、'default'} → 查 user_packages（user_id+group_name）：
  - 无任何记录 → 管理员手工分配，不动
  - 有记录但无有效实例（status=1 且 expire_at=0或>now）→ 已过期：事务置 users.group='default' + 失效旧实例 + 删 Redis `user_group:<id>`，返回 default
- 命中降级才产生写操作（一次性），日常读路径仅多一次带索引 COUNT 查询（Redis 未命中时才走）

### 前端
- **购买入口**：pages/TopUp 增加「套餐升级」卡片区（payEnabled 且有套餐时显示）：套餐卡片（名称/组标签/价格/时长/描述）+ 购买按钮 → POST /api/package/purchase → 复用页面既有支付交互（微信扫码 Modal / 收银台跳转 / 轮询 pay/status；套餐单 Quota=0，轮询成功后刷新用户信息）
- **管理端**：components/PackageManage.js 新建 → /payment 页新增第 3 个 Tab「套餐管理」：表格 + 新增/编辑 Modal（名称、开通组(下拉=/api/group/ 允许新增)、价格、时长天数、描述、启用开关）、删除
- i18n：topup.vip.*、packagemanage.*、payment.tabs.packages（zh/en）

## 六、协议与数据（完成后同步 .spec/AI2AI/协议和数据.md）

```
GET  /api/group/manage        → {success, data:[{name, ratio, member_count}]}        AdminAuth
POST /api/group/move          → {from_group, to_group} → {success, data:{moved}}     AdminAuth
GET  /api/package/            → 全量套餐列表                                          AdminAuth
POST /api/package/            → 新增套餐                                              AdminAuth
PUT  /api/package/            → 更新套餐                                              AdminAuth
DELETE /api/package/:id       → 删除套餐                                              AdminAuth
GET  /api/package/available   → enabled 套餐列表                                      UserAuth
POST /api/package/purchase    → {package_id, method} → 同 CreatePayOrder 支付响应     UserAuth
GET  /api/package/my          → 本人有效套餐（TopUp 展示当前身份/到期时间）            UserAuth
```
表：packages、user_packages（见上）；orders 新增 package_id 列。

## 七、执行顺序与验收

1. Phase A → 2. Phase B（navConfig+i18n 改名）→ 3. Phase C → 4. Phase D 后端 → 5. Phase D 前端 → 6. i18n 全量 → 7. `cd web/default && npm run build` → 移动 build → docker 重建（3008:3000）→ 8. E2E（browser_use，root/123456）：
   - A：/token /chat 直接访问→NotFound；侧栏无死项；/pricing 侧栏+顶部可达；兑换 Tab 显示「兑换码管理」
   - B：管理组 7 菜单命名统一；对话/模型体验置顶
   - C：/ratio 用户组 Tab 显示成员数；批量迁移 default→vip 后 users.group 变更
   - D：/payment 新建套餐 vip 月卡→TopUp 出现卡片→下单（epay 沙箱或验签外）验证订单创建与回调入账路径编译通过；GetUserGroup 到期判定单测逻辑走查
   - 回归：充值/兑换/应用/渠道编辑不受影响
9. 文档同步：协议和数据.md（新协议+表）、项目架构信息.md；更新 project_memory.md
