# Task4-4 剩余子项实施计划

## 背景（Repository Research）

任务源：`.spec/Me2AI/任务清单.md` L151-158（Task4-4，共 5 项）。

- 第 4 项「充值页面间距松散」**已完成**（2026-09-19，28px 模块间距收紧为 12/16px，且在线充值+充值记录已合并为同一卡片）。
- 本计划实施剩余 4 项。

调研结论：

1. **渠道已选模型展示**：`web/default/src/pages/Channel/EditChannel.js` 中本会话新建的 `LibraryModelPicker` 组件目前只有「已选 N / 共 M」文字计数，无已选模型 chips 展示。模型数据 `libraryModels`（含 name/model_id）在组件 props 中齐备。
2. **登录跳转**：`components/LoginForm.js` 的 `completeLogin`（L73-84）硬编码：root+默认密码 → `/user/edit`，其余 → `/dashboard`；微信登录（L60）同样写死 `/dashboard`；GitHubOAuth/LarkOAuth 回调也跳 `/dashboard`。而 `components/PrivateRoute.js`（L6-11）未登录时已把来源页存入 `Navigate state={{ from: history.location }}`，但登录页从未消费。
3. **倍率区块**：`components/OperationSetting.js` 内倍率 = 手动 JSON 三件套（L448-488：ModelRatio/CompletionRatio/GroupRatio + `submitConfig('ratio')`，保存逻辑 L159-181）+ Task4-3 的 `<RatioAutoSetting onRatioChanged={getOptions}/>`（L490）。设置页为 Tab 布局（`pages/Setting/index.js`），全站无"设置拆独立路由"先例；独立管理页模式参照 `pages/Channel/index.js`（dashboard-container+Card 外壳，App.js L135-142 PrivateRoute 注册）。菜单配置在 `components/navConfig.js` admin 组（L52-66，改一处 SideNav 与移动端抽屉同时生效）。
4. **兑换码核销链路**：`controller/user.go` L799-825 `TopUp` → `model/redemption.go` L54-90 `Redeem(ctx,key,userId)`，事务内行锁查码（L69）→状态必须 Enabled=1（L73）→ `gorm.Expr("quota + ?")` 原子加额度（L76）→置 Used=3（L80-82）→事务外 RecordLog（L88）。参考表 `model/order.go`（F1 订单，含 Amount decimal/Status/时间索引与 `GetUserOrders` 分页模式）。金额换算：`Amount = Quota × config.PayPrice / QuotaPerUnit(500000)`，与 `controller/pay.go` L79 反向一致；当前环境 PayPrice 已配置（¥10≈684.9k）。

## 实施步骤

### A. 渠道模型选择顶部显示已选模型（前端）

文件：`web/default/src/pages/Channel/EditChannel.js`（LibraryModelPicker 组件内）

- 在筛选条上方新增「已选模型 chips 区」：横向 flex-wrap；每个 chip 显示模型显示名（从 `models` 按 model_id 查 name，查不到回退 model_id）+ 删除图标，点击从 selected 移除。
- 未选时该区不占位（不渲染或仅零高度提示），已选数较多时限高（max-height ~96px）可纵向滚动。
- 与既有计数 Label「已选 N / 共 M」并存（计数保留在操作栏右侧）。

### B. 登录后跳转：上次访问页 → 首页（前端）

文件：`components/LoginForm.js`、`components/GitHubOAuth.js`、`components/LarkOAuth.js`

- LoginForm 引入 `useLocation`；定义安全回跳：
  `const from = location.state?.from?.pathname; const redirectTo = from && from.startsWith('/') && from !== '/login' ? from : '/';`
- `completeLogin`：取消 root 默认密码强制跳 `/user/edit` 的分支（**保留 `showWarning(root_password)` 安全提醒横幅**，跳转统一走 redirectTo）；微信登录回调（L60）同样改 redirectTo。
- GitHub/Lark OAuth 回调组件：无 router state，`navigate('/')`（首页）。

### C. 倍率管理独立页面（前端）

1. 新建 `web/default/src/pages/Ratio/index.js`：
   - 外壳套 `dashboard-container > Card fluid chart-card > Card.Content`（与 Channel 页一致）。
   - 挂载时 `GET /api/option/` 初始化 ModelRatio/CompletionRatio/GroupRatio 三个 JSON 文本域 + 保存按钮（保存逻辑搬迁自 OperationSetting 的 `case 'ratio'`：verifyJSON 校验后 `PUT /api/option/` 逐项更新）。
   - 渲染 `<RatioAutoSetting onRatioChanged={刷新本地 option} />`（组件零改动复用）。
2. `components/OperationSetting.js`：删除 L159-181 `case 'ratio'` 分支与 L448-491 倍率 JSX（含 RatioAutoSetting import 与挂载）；其余区块 Divider 衔接保持不变。
3. `App.js`：import Ratio 页 + 注册 `<Route path='/ratio' element={<PrivateRoute><Ratio/></PrivateRoute>} />`（管理员接口由后端 AdminAuth 兜底，前端不额外拦截）。
4. `components/navConfig.js`：admin 组新增 `{ name: 'header.ratio', to: '/ratio', icon: 'balance scale', admin: true }`（置于"渠道"之后）。
5. i18n：zh/en `translation.json` 新增 `header.ratio`（倍率管理 / Ratio Management）；倍率页复用既有 `setting.operation.ratio.*` 与 `setting.operation.ratio_auto.*` 文案，不新增大批键。

### D. 兑换码充值记录（后端 + 前端）

**后端**：

1. 新建 `model/redemption_record.go`：
   ```go
   type RedemptionRecord struct {
       Id           int64   `gorm:"primaryKey;autoIncrement"`
       UserId       int     `gorm:"index"`
       RedemptionId int     `gorm:"index"`   // 兑换码不存在时为 0
       RKey         string  `gorm:"type:varchar(64);index"` // 提交的兑换码
       Name         string  `gorm:"type:varchar(64)"`
       Quota        int64
       Amount       float64 `gorm:"type:decimal(10,2)"` // Quota*PayPrice/500000 快照
       Status       int     `gorm:"index"` // 1 成功 / 2 失败
       Remark       string  `gorm:"type:varchar(255)"`  // 失败原因
       CreatedTime  int64   `gorm:"index"`
   }
   ```
   + `InsertRedemptionRecord(tx 可选)`、`GetUserRedemptionRecords(userId, start, num)`、`CountUserRedemptionRecords(userId)`。
2. `model/main.go`：Order/Redemption AutoMigrate 之后注册 RedemptionRecord（注意只用单一 `index` 标签，避免同列双索引 1060 坑）。
3. `model/redemption.go` `Redeem`：
   - 成功路径：事务内 `tx.Save` 之后 `tx.Create` 一条 status=1 记录（Amount 按当前 `config.PayPrice` 折算）。
   - 失败路径（码不存在 / 状态非 Enabled）：插入 status=2 + Remark（错误信息）记录后再返回原 error（不吞错、不改既有返回行为）。
4. 新建 `controller/redemption_record.go`（或并入 controller/redemption.go）：`GetTopUpRecords`——`c.GetInt("id")` + p/page_size 分页，返回 items/total，参照 pay.go 的 GetUserOrders 响应风格。
5. `router/api.go` selfRoute 注册 `GET /topup/records`（SelfAuth）。

**前端（TopUp/index.js + topup.css）**：

- 「兑换码充值」卡片底部加分隔线 + 「兑换记录」小节（样式复用本会话新增的 `.topup-orders-section`：分隔线+表格）。
- 列：时间、兑换码名称（/码）、到账额度、折算金额（PayPrice=0 或 Amount=0 显示 -）、状态（成功绿/失败灰 Label）。
- `loadRedemptionRecords()` 分页拉取（首页 10 条 + 简单分页或"加载更多"），核销成功后刷新；i18n 新增 `topup.redeem_records.*` zh/en。

## 明确不动

- relay/ 数据面、支付订单（orders）链路、在线支付现有功能；
- OperationSetting 除倍率区块外的全部设置；
- 模型倍率硬编码 map、既有 ratio API（Task4-3 已交付内容）。

## 验证（E2E，容器 http://localhost:3008，root/123456）

1. 容器 go build（golang:1.23-bookworm 挂载编译）0 错误；前端 react-scripts build；产物移 web/build/default；docker build + 重启（3008:3000，既有标准参数）。
2. 登录跳转：未登录直接访问 `/channel` → 被踢登录页 → 登录后回到 `/channel`；直接进登录页登录后落首页；root+123456 登录落首页且出现改密 warning。
3. 倍率管理：侧边栏管理组出现「倍率管理」→ 页面含 3 个 JSON 文本域（已正确回填现值）+ 自动计算/锁定/分组倍率区块；改一个 JSON 保存后热生效；运营设置页不再有倍率区块。
4. 渠道已选 chips：编辑渠道 32（七牛）→ 模型面板顶部出现已选模型 chip，点 × 可移除；搜索筛选后全选，chips 同步增加。
5. 兑换码记录：管理端创建一个测试兑换码 → 充值页核销成功 → 兑换记录出现成功行（额度/金额/时间正确）；再次提交同一码 → 出现失败行（状态失败+原因）；`GET /api/user/topup records` 分页正常；测试数据清理。
6. 回归：在线充值卡片、充值记录、签到/推荐卡显示正常；控制台无 JS 报错。

## 风险与处理

- **root 强制改密取消**：安全上保留 warning 横幅强提醒；如后续要求恢复强制，可在首页/Header 加未改密全局提示（本次不做）。
- **失败尝试刷表**：兑换码失败记录可能因用户乱试增多——只在登录态核销时记录、无登录/爆破面（SelfAuth），可接受；后续可加定期清理。
- **Amount 折算依赖 PayPrice**：未配置在线支付单价时存 0，前端显示「-」，不影响额度列。
- **OperationSetting 搬迁残留**：删除后确认无 `submitConfig('ratio')` 调用点、无 RatioAutoSetting 悬空 import（构建期即可暴露）。
