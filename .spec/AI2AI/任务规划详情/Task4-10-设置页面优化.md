# Task4-10 设置页面优化

## 需求回顾（Me2AI/任务清单.md L217-222）
- 当前设置页面（`/setting`）混杂了「当前登录账户的个人设置」与「系统管理级设置」，功能杂乱。
- 重新规划设置页面的功能归属：
  - **当前登录账户信息设置** → 继续保留在当前设置页面（`/setting`）。
  - **系统管理相关的设置** → 从设置页拆出，在管理模块下通过不同菜单分别承载，使功能归属清晰、便于查找。

## 现状分析

### 当前 `/setting` 页面结构（`web/default/src/pages/Setting/index.js`）
页面通过 `isRoot()` 判断，对管理员渲染 4 个 Tab，普通用户只看到「个人设置」：

| Tab | 组件 | 可见角色 | 内容区块 |
|---|---|---|---|
| 个人设置 | `components/PersonalSetting.js` | 所有用户 | 通用（资料/令牌/邀请/删号）、账号绑定（微信/GitHub/Lark/邮箱）、通知设置、登录会话、两步验证 |
| 运营设置 | `components/OperationSetting.js` | 仅管理员 | 额度、签到、排行榜、模型广场、日志、监控告警、通用（链接/额度单位/重试/显示开关）、支付（易支付/直连） |
| 系统设置 | `components/SystemSetting.js` | 仅管理员 | 服务器地址、登录注册开关、邮箱域名限制、SMTP、GitHub/Lark/微信 OAuth、Turnstile |
| 其他设置 | `components/OtherSetting.js` | 仅管理员 | 公告、系统名称/主题/Logo、首页内容/关于/页脚 |

### 当前管理模块侧栏菜单（`components/navConfig.js` admin 组）
`渠道(/channel)、倍率(/ratio)、兑换(/redemption)、用户(/user)` —— 均为实体管理页，无配置类入口。

### 核心问题
1. 普通用户打开 `/setting` 看到的是干净的「个人设置」，但管理员打开 `/setting` 时个人设置与大量系统配置挤在同一页面的 Tab 中，定位成本高。
2. 「运营设置」单页承载 8 个区块（含 Task4-8 新增的直连支付 5+3 项参数），页面过长、职责过重。
3. 「其他设置」命名不直观，实际承载站点品牌/内容配置。

## 目标规划

### 一、`/setting` 页面瘦身（所有用户可见）
- 仅保留 **个人设置（PersonalSetting）** 一个区块，移除 Tab 切换（单页直出）。
- 管理员原有的「运营/系统/其他」三个 Tab 从该页面移除。

### 二、管理模块新增配置类菜单
在 `navConfig.js` 的 `admin` 组下新增 4 个菜单项（与现有「渠道/倍率/兑换/用户」并列），各对应一个独立页面：

| 菜单名 | 路由 | 承载组件（来源） | 内容 |
|---|---|---|---|
| 运营设置 | `/operation` | `OperationSetting.js`（原样迁移） | 额度、签到、排行榜、模型广场、日志、监控告警、通用 |
| 支付设置 | `/payment` | `PaymentSetting.js`（从 OperationSetting 拆出「支付」区块） | 支付开关、支付模式（易支付/直连互斥）、易支付参数、微信支付参数、支付宝参数、价格与金额预设 |
| 系统设置 | `/system` | `SystemSetting.js`（原样迁移） | 服务器地址、登录注册、邮箱限制、SMTP、OAuth（GitHub/Lark/微信）、Turnstile |
| 站点设置 | `/site` | `SiteSetting.js`（原 `OtherSetting.js` 重命名） | 公告、系统名称/主题/Logo、首页内容/关于/页脚 |

> **为什么把「支付」从运营设置中拆出**：支付配置涉及敏感凭证（EpaySecret、WeChatPayApiV3Key、WeChatPayPrivateKey、AlipayPrivateKey 等），且 Task4-8 后参数项多、独立成域，拆为单独菜单后运维与权限边界更清晰；同时避免「运营设置」单页过长。

### 三、菜单顺序（admin 组）
按「实体管理 → 运营配置 → 支付配置 → 系统配置 → 站点配置」逻辑排序：
```
渠道 → 倍率 → 兑换 → 用户 → 运营设置 → 支付设置 → 系统设置 → 站点设置
```

### 四、路由与权限
- 新路由 `/operation`、`/payment`、`/system`、`/site` 均使用 `PrivateRoute` 包裹。
- 复用现有后端 `GET/PUT /api/option/` 接口与 `GET /api/status`，**后端零改动**（配置项 key 不变，仅前端页面重组）。
- 页面内继续沿用 `isRoot()` / `isAdmin()` 校验（设置组件内部已有管理员语义，迁移后保持）。

## 实施步骤

### 步骤 1：拆分 OperationSetting，抽取支付区块
- 新建 `web/default/src/components/PaymentSetting.js`，将 `OperationSetting.js` 中：
  - `inputs` 里的支付相关字段（`PayEnabled`、`PaymentMode`、`PayAddress`、`EpayId`、`EpaySecret`、`WeChatPay*`、`Alipay*`、`PayPrice`、`MinTopUp`、`MaxTopUp`、`TopupAmountOptions`）移至新组件 state。
  - `submitConfig('pay')` 逻辑、支付相关 JSX（支付开关、模式单选、易支付/直连表单、价格金额预设）整体迁移。
- `OperationSetting.js` 删除上述支付字段与 `case 'pay'` 分支及对应 JSX。
- 两组件各自独立 `getOptions()`，互不依赖。

### 步骤 2：重命名 OtherSetting 为 SiteSetting
- 新建 `web/default/src/components/SiteSetting.js`，内容等同 `OtherSetting.js`（公告、系统名称/主题/Logo、首页内容/关于/页脚）。
- 删除原 `OtherSetting.js`。

### 步骤 3：新建 4 个管理页容器
- `web/default/src/pages/Operation/index.js`、`Payment/index.js`、`System/index.js`、`Site/index.js`：均采用 `dashboard-container` + `chart-card` 外壳，挂载对应 Setting 组件。
- 页面标题沿用既有 i18n（`setting.tabs.operation`、`setting.tabs.system` 等）。

### 步骤 4：改造 Setting 页面
- `pages/Setting/index.js`：删除 `isRoot()` 分支与 `panes` 中的 operation/system/other 三个 Tab，直接渲染 `<PersonalSetting />`。
- 移除 `OperationSetting`、`SystemSetting`、`OtherSetting` 的 import。

### 步骤 5：注册路由（App.js）
- 新增 4 条 `PrivateRoute` 路由：`/operation`、`/payment`、`/system`、`/site`（参照 `/ratio` 直接 import 方式）。

### 步骤 6：更新侧栏菜单（navConfig.js）
- admin 组 `items` 追加 4 项（放在 `user` 之后）：
  ```js
  { name: 'header.operation', to: '/operation', icon: 'settings', admin: true },
  { name: 'header.payment',   to: '/payment',   icon: 'credit card', admin: true },
  { name: 'header.system',    to: '/system',    icon: 'server', admin: true },
  { name: 'header.site',      to: '/site',      icon: 'globe', admin: true },
  ```
- 图标名 `settings`、`credit card`、`server`、`globe` 均为 Semantic UI 内置图标。

### 步骤 7：i18n 补全（zh + en）
- 新增 `header.operation`、`header.payment`、`header.system`、`header.site` 四个菜单名。
- 新页面标题复用 `setting.tabs.operation`、`setting.tabs.system`，新增 `setting.tabs.payment`、`setting.tabs.site`。

### 步骤 8：文档同步
- `协议和数据.md`：补充「设置页面拆分」说明，注明后端接口无变化。
- `项目架构信息.md`：更新前端页面清单与管理菜单列表。

## 验收标准
1. 普通用户访问 `/setting`：仅显示个人设置（资料/绑定/通知/会话/两步验证），无任何系统配置 Tab。
2. 管理员访问 `/setting`：同样仅显示个人设置，不再混入运营/系统/其他配置。
3. 管理员侧栏「管理」分组可见：渠道、倍率、兑换、用户、**运营设置、支付设置、系统设置、站点设置** 共 8 项。
4. 点击「运营设置」(`/operation`)：显示额度/签到/排行榜/模型广场/日志/监控/通用，**不含支付区块**。
5. 点击「支付设置」(`/payment`)：显示支付开关、模式单选、易支付或直连参数表单、价格金额预设，保存与回显正常。
6. 点击「系统设置」(`/system`)：服务器地址/登录注册/SMTP/OAuth/Turnstile 等配置完整可用。
7. 点击「站点设置」(`/site`)：公告、系统名称、主题、Logo、首页内容、关于、页脚配置完整可用。
8. 所有原设置功能（保存、即时开关、JSON 校验、敏感字段不回显等）行为与拆分前完全一致。
9. 双主题（暗色/亮色）下新页面样式与现有管理页一致（复用 `.dashboard-container` + `.chart-card`）。
10. `web build` 与 `go build` 通过。

## 明确不做
- **不改动后端**：不新增/修改任何 option key、接口、数据库表；`GET/PUT /api/option/` 接口保持不变。
- **不改动 `relay/` 数据面**与核心表结构。
- **不调整 PersonalSetting 内部逻辑**：仅做页面归属迁移，个人设置的功能区块不变。
- **不删除 OperationSetting/SystemSetting 组件文件**（改为被新页面引用）；OtherSetting 重命名为 SiteSetting。
- 暂不引入二级路由或 Tab 嵌套（每个管理页保持单页 + 内部分区，与原 Tab 内容一致）。

## 风险与回滚
- **风险**：PaymentSetting 从 OperationSetting 拆出时，`originInputs` 基线同步逻辑（`submitConfig` 末尾 `setOriginInputs({...inputs})`）需完整迁移，否则「epay→direct 来回切换」二次修改会漏发更新（Task4-8 已踩过的坑）。
- **回滚**：若拆分后异常，恢复 `pages/Setting/index.js` 的 4 Tab 结构即可，后端与 option key 无任何变化，回滚成本低。
