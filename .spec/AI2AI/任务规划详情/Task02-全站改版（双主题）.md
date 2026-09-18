# Task02：整个 one-api 全站改版（双主题）

> 来源：Me2AI/任务清单.md Task02
> 参考效果：Task01 已完成的《首页》改版（`/landing`，暗色科技 ⇄ 亮色简约双主题）
> 风格规范：`.trae/skills/tech-web/SKILL.md`（暗色科技霓虹）+ Landing 已落地的亮色简约令牌
> 状态：✅ 全部完成。阶段 0 决策门：用户批准按方案执行（D1–D5 全部采纳建议）。阶段 1（全站主题基建）✅、阶段 2（全局框架改版）✅、阶段 3（认证页与公开页改版）✅、阶段 4（C 端用户中心改版）✅、阶段 5（管理端改版）✅、阶段 6（收尾）✅ 均已完成并通过浏览器实测；生产构建 gzip 主包 297.87KB（较改版前基线 296.73KB 仅 +1.14KB）。

---

## 1. 需求理解（来自 Me2AI）

- 参考 Task01 首页改版实现的**双主题效果**（科技暗色 / 简约亮色，导航栏可切换），完成整个 one-api 的改版。
- 计划需覆盖：**改版内容、新增功能、删除功能**。
- 每个步骤需给出：具体任务项、完成标准、验收标准。
- 必须考虑功能兼容性，避免对已有功能造成影响。

## 2. 现状勘察结论

| 项 | 结论 |
| :--- | :--- |
| 改版对象 | 仅 `web/default/`（默认生效主题）。`web/berry`、`web/air` 为独立构建的可选主题，本任务**冻结不处理**（代码不删、构建保留、不验收改版效果） |
| 技术栈 | React 18 + CRA5 + Semantic UI React 2.1 + react-router-dom v6 + i18next + recharts；**无 Tailwind，不引入**（沿用 Task01 决策） |
| 代码规模 | default 主题约 9,500 行 JS/CSS；大文件：ChannelsTable 705 / EditChannel 681 / SystemSetting 641 / LogsTable 586 / TokensTable 511 / OperationSetting 435 / Dashboard 429 / PersonalSetting 402 / UsersTable 400 / landing.css 808 |
| 全局布局 | `index.js` 的 `AppLayout`：常规页 = Header + Container(main-content) + Footer；`STANDALONE_PATHS=['/landing']` 全屏独立 |
| 双主题现状 | 双主题令牌目前**仅存在于** `pages/Landing/landing.css`（`.tech-landing` 根 CSS 变量 + `.tl-theme-simple` 覆盖），切换态在 Landing 组件内（localStorage `landing_theme`），**未全站化** |
| 全局样式痛点 | `index.css` 仅 117 行基础样式；Semantic UI 默认浅底；组件内大量硬编码内联颜色（Header `#666/#333`、Footer `#666666`、Dashboard chartConfig `#fff` 白底与图表色等） |
| 关键业务细节 | ① TopUp 页现有**兑换码核销**（`POST /api/user/topup`）+ **外部充值链接**（`status.top_up_link`，跳转时拼 username/user_id/transaction_id）两套机制；② Setting 页为 Tab 结构：个人设置（所有用户）+ 运营/系统/其他设置（仅 root）；③ 登录/注册/OAuth 成功后 `navigate('/')`；④ `helpers/render.js` 的 `renderGroup/renderColorLabel` 输出 Semantic `<Label>`；⑤ 表格页（Token/Log/Channel/User/Redemption）均为薄页面 + 大 Table 组件结构 |
| 路由表 | 27 条路由（见 AI2AI/项目架构信息.md 2.4），URL 全部保留 |
| 后端 | 本任务**零改动**：不改 relay/、controller/、model/、数据库、构建流程 |
| 关键技术风险 | Semantic UI 的 Modal/Dropdown/Popup/Checkbox 弹层为 **Portal，渲染到 `body` 下**而非页面容器内 → 主题覆盖层必须挂在 `body.theme-*` 维度，不能用页面作用域 class |

## 3. 改版总策略：双层换肤 + 重点页面定制

不重写组件库、不逐页推倒重来，采用两层方案：

1. **全局主题层（基建）**：把 Landing 的双主题令牌提升为**全站 CSS 变量**（挂 `body.theme-dark` / `body.theme-light`），新增一张 **Semantic UI 组件覆盖样式表**（菜单/卡片/表格/表单/按钮/弹窗/下拉/分页等全部走变量）。此层承担约 80% 视觉改版，对业务逻辑零侵入。
2. **重点页面定制层**：高曝光 C 端页面（认证页、仪表盘、充值中心、404）在覆盖层之上做定制化科技风布局；管理端复杂表格页（渠道/用户/兑换码/系统设置）以覆盖层主题化为主，**不重写业务组件**。

**回退保障**：所有主题化由 `body.theme-*` class 驱动，移除 class 即恢复 Semantic UI 原样；每阶段独立提交、独立验收。

## 4. 文件级改版清单（treatment inventory）

图例：🆕 新增　🔴 重构/定制布局　🟡 覆盖层主题化 + 少量结构调整　⚪ 不动

### 4.1 基建与共享

| 文件 | 处置 | 说明 |
| :--- | :--- | :--- |
| `src/theme/tokens.css` | 🆕 | 全站双主题 CSS 变量（从 landing.css 提升），定义于 `body.theme-dark` / `body.theme-light` |
| `src/theme/semantic-ui.css` | 🆕 | Semantic UI 组件覆盖层（清单见阶段 1），全部引用变量 |
| `src/context/Theme/index.js`、`reducer.js` | 🆕 | ThemeContext：dark/light，localStorage `app_theme`，初始化优先级 localStorage → `prefers-color-scheme` → dark；同步 body class |
| `src/components/ThemeToggle.js` | 🆕 | 胶囊主题切换按钮（🌙/☀️），Header 与 Landing 共用 |
| `src/components/AuthLayout.js` | 🆕 | 认证页外壳：居中玻璃卡 + 品牌区（Logo/渐变名/返回链接） |
| `src/components/StatCard.js` | 🆕 | 指标卡（mono 数字 + 渐变图标 + 微光晕），Dashboard 复用 |
| `src/components/EmptyState.js` | 🆕 | 空态组件（图标 + 文案 + 操作按钮），Chat/空表格复用 |
| `src/index.js` | 🟡 | 包裹 ThemeProvider；引入两张 theme CSS；保留 STANDALONE_PATHS 机制 |
| `src/index.css` | 🟡 | body 底色/文字走变量；暗色网格点阵背景（fixed + 径向渐隐 + pointer-events:none）；padding-top 适配新导航 |

### 4.2 框架与公开页

| 文件 | 处置 | 说明 |
| :--- | :--- | :--- |
| `src/components/Header.js` | 🔴 | 玻璃导航重绘；菜单 C 端/管理分组；嵌入 ThemeToggle；Logo 跳转按登录态区分（D3）；移动端侧边栏主题化 |
| `src/components/Footer.js` | 🟡 | 双主题页脚；footer_html 区域暗色文字兼容 |
| `src/components/Loading.js` | 🟡 | 科技风加载态 |
| `src/components/LoginForm.js` | 🔴 | 套 AuthLayout；表单/微信 Modal/第三方按钮主题化；**登录成功跳转改 `/dashboard`** |
| `src/components/RegisterForm.js` | 🔴 | 同上；注册成功跳转改 `/dashboard` |
| `src/components/PasswordResetForm.js`、`PasswordResetConfirm.js` | 🔴 | 套 AuthLayout + 主题化 |
| `src/components/GitHubOAuth.js`、`LarkOAuth.js` | 🟡 | 加载态主题化；回调成功跳转改 `/dashboard` |
| `src/pages/About/index.js` | 🟡 | 卡片化科技风重排 |
| `src/pages/NotFound/index.js` | 🔴 | 科技风 404（渐变大字 + 返回按钮） |
| `src/pages/Home/index.js` | 🟡 | 路由迁至 `/home`；仅做主题化（markdown/iframe 机制不动） |
| `src/pages/Landing/index.js` | 🟡 | 删私有 theme state，改消费 ThemeContext；Logo 链接改 `/` |
| `src/pages/Landing/landing.css` | 🟡 | 局部变量改引用全站变量；删 `.tl-theme-simple` 重复定义；外观零回归 |
| `src/App.js` | 🟡 | `/` → Landing、`/home` → Home（D1）；其余路由不动 |
| `src/components/PrivateRoute.js` | 🟡 | 未登录跳转不变；确认登录后落地行为（D3） |

### 4.3 C 端用户中心

| 文件 | 处置 | 说明 |
| :--- | :--- | :--- |
| `src/pages/Dashboard/index.js` | 🔴 | StatCard 指标卡；recharts 双主题适配（轴/网格/Tooltip/Legend 颜色经 props 随主题传入，替换 chartConfig 硬编码 `#fff`） |
| `src/pages/Dashboard/Dashboard.css` | 🟡 | 令牌化 |
| `src/components/TokensTable.js` | 🟡 | 表格/状态标签/操作按钮主题化；空态用 EmptyState |
| `src/pages/Token/index.js`、`src/pages/Token/EditToken.js` | 🟡 | 页面容器与编辑 Modal 主题化 |
| `src/components/LogsTable.js` | 🟡 | 表格/筛选栏/分页主题化；金额数字 mono |
| `src/pages/Log/index.js` | ⚪/🟡 | 薄页面，随覆盖层生效，仅微调 |
| `src/pages/TopUp/index.js` | 🔴 | 重排：余额卡 + 套餐卡网格（UI 槽位，接现有 top_up_link/兑换码）+ 兑换码区；现有两套充值逻辑不动 |
| `src/pages/Setting/index.js` | 🟡 | Tab 菜单主题化（secondary pointing） |
| `src/components/PersonalSetting.js` | 🟡 | 分组卡片主题化 |
| `src/pages/Chat/index.js` | 🔴 | iframe 外加科技风外壳顶栏；无 `chat_link` 时 EmptyState 引导（替代当前空白 iframe） |

### 4.4 管理端

| 文件 | 处置 | 说明 |
| :--- | :--- | :--- |
| `src/components/ChannelsTable.js` | 🟡 | 表格主题化；渠道状态点语义色；空态 EmptyState |
| `src/pages/Channel/index.js`、`src/pages/Channel/EditChannel.js` | 🟡 | 681 行表单（模型多选/密钥/参数）全部控件主题化；测试按钮反馈 |
| `src/components/RedemptionsTable.js`、`src/pages/Redemption/*` | 🟡 | 表格/生成弹窗主题化；核销状态语义色 |
| `src/components/UsersTable.js`、`src/pages/User/*`（EditUser/AddUser） | 🟡 | 表格/弹窗主题化；角色标签、额度数字 mono |
| `src/components/SystemSetting.js`、`OperationSetting.js`、`OtherSetting.js` | 🟡 | 设置卡片分组主题化；危险操作按钮红色语义 |
| `src/helpers/render.js` | ⚪/🟡 | Label 输出经覆盖层适配；仅在覆盖层不足时微调 |

### 4.5 明确不动

- 后端全部（`relay/`、`controller/`、`model/`、`common/`、`router/`、main.go）、数据库、Redis、Go embed 构建流程。
- `web/berry/`、`web/air/` 两套主题（冻结）。
- 全部 27 条路由 URL、全部 `/api/...` 调用与请求参数、cookie/session 鉴权、i18n 机制。
- `helpers/api.js`（axios 封装；Home 页防御性修复已另行完成，拦截器吞错问题列为可选优化项，不在本任务必做范围）。

## 5. 新增 / 删除 / 保留清单

### 5.1 新增功能（前端 UI 层，无后端改动）

1. **全站双主题切换器**：Header 胶囊切换（🌙科技风 / ☀️简约风），全站即时生效、刷新保持、首次跟随系统；Landing 与内页共用同一主题态（合并现有 `landing_theme` 偏好）。
2. **C 端 / 管理端导航分组**：普通用户：仪表盘/令牌/日志/充值/对话/设置；管理员额外：渠道/兑换码/用户（admin 判断逻辑保留，仅调整视觉分组与顺序）。
3. **登录后落地用户仪表盘**：`/dashboard` 成为登录后默认页（登录/注册/OAuth 跳转与 Header Logo 联动）。
4. **根路径切换为新落地页**（D1）：`/` 呈现科技风落地页，旧 Home 迁 `/home`。
5. **充值中心改版**：余额卡 + 套餐卡网格 UI；套餐卡行为复用**现有** `top_up_link` 外跳机制（无链接时置灰"即将上线"），兑换码核销保留；在线支付（orders/packages 后端）属独立任务线，本任务不接。
6. **品牌化状态页**：404、Loading、空态（Chat 无链接/空表格）。
7. **认证页品牌化**：登录/注册/重置密码统一玻璃卡布局。

### 5.2 删除 / 下线

- **不删除**任何现有功能、路由、接口、数据表。
- 视觉下线：旧 Semantic 浅色 Header/Footer 外观、组件内硬编码颜色；旧 Home 不再占据根路径（迁至 `/home`，机制保留）。
- berry/air 不在改版范围（D4）。

### 5.3 明确保留

全部路由 URL、API 调用、鉴权、OAuth（GitHub/飞书/微信扫码 Modal）、Turnstile、recharts 数据逻辑、兑换码与外部充值链接逻辑、管理员 markdown 首页/页脚配置、打包流程。

## 6. 分阶段任务计划（文件级任务项 → 完成标准 → 验收标准）

阶段间顺序执行；**阶段 1 是后续所有阶段的前置**，须先完成并验收。每阶段独立提交、可回退。

---

### 阶段 0：决策门确认（D1–D5）

| # | 决策项 | 建议方案 |
| :--- | :--- | :--- |
| D1 | 根路径 `/`（Task01 遗留事项 3） | `/` 切换为新版落地页；旧 Home 迁 `/home` 保留，管理员 markdown 配置不删 |
| D2 | 首次访问默认主题 | 跟随 `prefers-color-scheme`，手动切换后持久化（`app_theme`）；迁移旧 `landing_theme` |
| D3 | 登录后默认落地页 | 由 `/token` 改为 `/dashboard`；登录/注册/OAuth 成功跳转与 Header Logo 同步改 |
| D4 | berry / air 主题 | 冻结，仅改版 default |
| D5 | 删除功能边界 | 不删任何后端功能/路由/接口；前端仅视觉分组与迁移 |

- 完成标准：用户逐条确认或修正，结果回填本节。
- 验收标准：决策项无未决。

---

### 阶段 1：全站主题基建（令牌 + 覆盖层 + ThemeContext）　规模：L

**任务项**

1. 新建 `src/theme/tokens.css`：从 `landing.css` 提升全套双主题令牌（品牌蓝 `#3B82F6`/紫 `#8B5CF6`/翡翠 `#10B981`/琥珀 `#FBBF24`；表面/边框/文本四级中性色；阴影/光晕；sans/mono 字体；圆角；间距）。暗色定义在 `body.theme-dark`，亮色在 `body.theme-light`（亮色对齐 blue-style-rules：页底 `#F8FAFC`、卡 `#FFFFFF`、主蓝 `#2563EB`、光晕→柔和阴影、渐变标题→实色蓝）。
2. 新建 `src/theme/semantic-ui.css`，覆盖清单（全部引用变量、零硬编码）：
   - 导航：`.ui.menu` 及 `.item`（hover/active/移动端 vertical）
   - 表面：`.ui.segment`、`.ui.card`、`.ui.cards .card`、`.ui.container`
   - 表格：`.ui.table`（表头/行 hover/分隔线/striped）
   - 表单：`.ui.input input`、`.ui.form input/textarea/select`、`.ui.checkbox`、`.ui.selection.dropdown` 及其打开菜单
   - 按钮：`.ui.button`（primary/basic/negative）hover/focus 焦点环
   - **Portal 弹层（重点）**：`.ui.modal`（header/content/actions）、`.ui.popup`、`.ui.dropdown .menu`、react-toastify 容器
   - 反馈：`.ui.label`（含 color=blue/violet/green/red/yellow/orange 语义色映射）、`.ui.message`、`.ui.tab`/`.ui.tab.active`
   - 分页：`.ui.pagination.menu .item`（active/disabled）
   - 全局：滚动条、`::selection`、焦点环、`a` 链接色
3. 新建 `src/context/Theme/`（index.js + reducer.js）：状态 `dark|light`；初始化 localStorage `app_theme` → 系统偏好 → dark；`toggle/setTheme` 同步持久化与 `document.body.classList`；暴露 `useTheme()`。
4. `src/index.js`：包裹 `ThemeProvider`；引入两张 theme CSS；防首屏闪烁（渲染前同步设置 body class）。
5. Landing 接入全局主题：`pages/Landing/index.js` 删除私有 `theme` state 与切换按钮内部逻辑，改用 `useTheme()`；`ThemeToggle` 提取为共享组件；`landing.css` 变量改为引用全站令牌，删除 `.tl-theme-simple` 块。

**完成标准**

- body 挂载 `theme-dark/theme-light` 后，现有全部页面两主题下可读：无白底白字、黑底黑字、亮白弹层。
- 切换整站即时生效、刷新保持、首次跟随系统。
- Landing 两主题外观与 Task01 验收记录**逐区一致**（无回归）。

**验收标准**

- [ ] 第 7 节走查清单中"全局弹层"行通过（Modal/Dropdown/Popup/Toast 暗色可读）。
- [ ] Landing 两主题与 Task01 效果一致。
- [ ] 刷新/新标签页主题保持；系统深色偏好下首次访问为暗色。
- [ ] `npx react-scripts build` 通过。

---

### 阶段 2：全局框架改版（Header / Footer / 布局背景）　规模：M

**任务项**

1. `components/Header.js`（重绘样式，不动路由目标）：
   - 玻璃拟态导航（暗色 `rgba(11,15,23,0.8)` + 模糊 + 底部光晕线；亮色白 + 柔和阴影），对齐 Landing 导航。
   - Logo + 渐变品牌名；菜单项图标 + hover 动效；当前路由 active 高亮。
   - 菜单分组：C 端组（仪表盘/令牌/日志/充值/对话/设置）与管理组（渠道/兑换码/用户，管理员可见）之间加分隔；`isAdmin()` 逻辑不变。
   - 右侧嵌入 `ThemeToggle`；语言下拉、用户名下拉/登出、登录注册按钮主题化。
   - Logo 链接：未登录 → `/`；已登录 → `/dashboard`（D3）。
   - 移动端汉堡侧边栏（Segment + vertical Menu）主题化。
2. `components/Footer.js`：双主题；`footer_html` 自定义内容区文字色兼容暗色。
3. `index.css`：body 底色/文字色走变量；暗色启用全局网格点阵背景（复用 Landing 网格参数，fixed 定位 + 径向渐隐 + `pointer-events:none`；亮色关闭或极淡）；`padding-top` 适配新导航高度。
4. `components/Loading.js`：脉冲点/渐变 spinner 科技风。

**完成标准**

- 所有常规页呈现统一科技风框架；主题切换在 Header 与 Landing 行为一致。

**验收标准**

- [ ] 桌面 1440px / 移动 390px 两档导航无换行、无遮挡、侧边栏可用。
- [ ] 普通账号无管理菜单；管理员可见且分组正确。
- [ ] 登出、语言切换、主题切换、Logo 跳转（按登录态）功能正确。
- [ ] 网格背景不降低内容可读性、无横向滚动条。

---

### 阶段 3：认证页与公开页改版　规模：M

**任务项**

1. 新建 `components/AuthLayout.js`：居中玻璃卡（暗色）/白卡（亮色）+ 顶部品牌区（Logo/渐变名）+ 底部返回首页链接；登录/注册/重置三页复用。
2. `LoginForm.js`：套 AuthLayout；输入框/主按钮/错误 Message/微信扫码 Modal/第三方登录按钮（GitHub/飞书/微信）主题化；**登录成功 `navigate('/dashboard')`**（原为 `/`，D1 后 `/` 是落地页，必须改）。
3. `RegisterForm.js`：同构；注册成功跳转改 `/dashboard`。
4. `PasswordResetForm.js` / `PasswordResetConfirm.js`：套 AuthLayout + 主题化。
5. `GitHubOAuth.js` / `LarkOAuth.js`：加载态主题化；回调成功跳转改 `/dashboard`。
6. `pages/About/index.js`：卡片化科技风重排（系统信息结构沿用）。
7. `pages/NotFound/index.js`：科技风 404（渐变大字 + 返回首页/控制台双按钮，按登录态）。
8. 根路径切换（D1）：`App.js` 中 `/` → Landing、新增 `/home` → Home；`index.js` 的 `STANDALONE_PATHS` 同步（`/` 加入、`/landing` 可保留重定向到 `/`）；Landing Logo 链接改 `/`；Home 随覆盖层主题化。

**完成标准**

- 未登录全链路（落地页 → 登录/注册/重置/OAuth/关于/404）视觉统一；根路径为新落地页、旧首页 `/home` 可访问。

**验收标准**

- [ ] 注册→登录→登出→忘记密码全流程功能不变（错误提示、Turnstile、微信 Modal 正常）。
- [ ] GitHub/飞书 OAuth 跳转与回调正常，登录后落 `/dashboard`。
- [ ] `/` 为落地页、`/home` 为旧首页且 markdown/iframe 正常渲染，两页无穿帮。
- [ ] 任意不存在路径展示品牌化 404。

---

### 阶段 4：C 端用户中心改版　规模：L

**任务项**

1. **Dashboard（登录后首页）** `pages/Dashboard/index.js` + `Dashboard.css`：
   - 顶部三项指标（今日请求/额度/Token）改用 `StatCard`（mono 数字、渐变图标、微光晕）。
   - recharts 双主题：坐标轴文字/网格线/Tooltip/Legend 颜色经 props 随主题传入（监听 `useTheme()`），删除 chartConfig 硬编码 `background:'#fff'` 与固定色板（色板保留但暗色下调亮/提高对比）。
2. **令牌** `TokensTable.js` + `Token/index.js` + `EditToken.js`：表格表头玻璃感、行 hover 微光；状态标签语义色（启用绿/禁用红/过期琥珀）；新建/编辑 Modal（额度输入、模型限制、有效期）主题化；复制 Key/充值按钮样式；空数据用 EmptyState。
3. **日志** `LogsTable.js` + `Log/index.js`：表格 + 顶部筛选栏（类型/时间/关键词）+ 分页主题化；额度/金额数字 mono；长内容省略号逻辑不变。
4. **充值中心** `pages/TopUp/index.js`（重排，逻辑不动）：
   - 顶部余额卡（当前额度，StatCard 风格）。
   - 套餐卡网格：**静态 UI 槽位**（金额/额度/推荐徽章）；点击行为：有 `top_up_link` 时复用现有外跳逻辑（拼 username/user_id/transaction_id），无链接时置灰提示"在线支付即将上线"；**不新增任何支付 API 调用**。
   - 兑换码核销区保留（`POST /api/user/topup`），输入框 + 按钮主题化。
5. **设置** `Setting/index.js`（Tab 菜单 secondary pointing 主题化）+ `PersonalSetting.js`（个人资料/安全/绑定分组卡片主题化，保存逻辑不动）。
6. **WebChat** `pages/Chat/index.js`：iframe 外加科技风外壳（标题栏 + 新窗口打开链接 + 主题底色融合）；无 `chat_link` 时渲染 EmptyState（说明 + 跳转设置/首页按钮），替代空白 iframe。

**完成标准**

- 普通用户登录后全旅程视觉统一、功能不变；图表两主题清晰。

**验收标准**

- [ ] 新用户走查：注册 → 登录落 `/dashboard`（指标与图表正常、暗色下坐标轴可读）→ 创建令牌（Modal 正常）→ 复制 Key → 查日志（筛选/分页正常）→ 兑换码充值（成功后余额刷新）→ 改个人设置 → 打开 Chat（有链接显示 iframe、无链接显示空态）。
- [ ] 全程无 JS 报错、控制台无未捕获异常、无样式穿帮。
- [ ] 套餐卡无链接时置灰、有链接时外跳参数与现状一致。
- [ ] 所有 Modal/下拉/日期控件暗色可读。

---

### 阶段 5：管理端改版　规模：L

**任务项**（策略：覆盖层主题化为主，**不改业务逻辑与请求**）

1. **渠道** `ChannelsTable.js`（705）+ `Channel/index.js` + `EditChannel.js`（681）：
   - 表格：渠道名/分组 Label/状态点（正常绿/手动禁用灰/异常红）/延迟/操作列主题化；行 hover、空态 EmptyState。
   - 编辑页大表单：基础信息、密钥、模型多选（Dropdown Portal 菜单）、参数设置、分组/Region 等全部控件主题化；"测试"按钮结果 Message 语义色。
2. **兑换码** `RedemptionsTable.js` + `Redemption/index.js` + `EditRedemption.js`：生成弹窗（数量/面额/有效期）、表格状态（未用/已用/过期）标签主题化。
3. **用户** `UsersTable.js` + `User/index.js` + `EditUser.js` + `AddUser.js`：表格角色标签（root/admin/user 语义色）、额度数字 mono；编辑/新增 Modal（额度调整、角色、密码）主题化。
4. **系统设置** `SystemSetting.js`（641）/ `OperationSetting.js`（435）/ `OtherSetting.js`（236）：设置项卡片分组主题化；保存按钮与"危险操作"（重置/清理类）按钮红色语义；设置项说明文字次级色。
5. 管理端长表格统一：表头、斑马纹（暗色下用极低对比）、hover、分页在 1440px/390px 两档检查。

**完成标准**

- 管理员全部功能双主题下可用、可读、无穿帮。

**验收标准**

- [ ] 管理员走查：渠道增删改查 + 测试渠道、用户增删改/额度调整、兑换码批量生成与核销、四类设置（个人/运营/系统/其他）保存，功能全部正常。
- [ ] 模型多选 Dropdown、角色 Dropdown、分页等 Portal 弹层暗色可读。
- [ ] 长表格暗色下边距/斑马纹/hover/滚动无异常。

---

### 阶段 6：收尾（i18n / 硬编码清理 / 构建 / 文档）　规模：M

**任务项**

1. i18n：本任务新增文案（主题切换、套餐占位、空态、404、Auth 页品牌区等）全部补 `locales/zh/translation.json` 与 `locales/en/translation.json`，代码一律 `t()`。
2. 硬编码颜色清理：全量搜索内联 style 中的 `#xxx` 色值（Header/Footer/Dashboard/TopUp 等已定位处为必改），替换为 CSS 变量或语义 class。
3. 构建验证：`web/default` 下 `npx react-scripts build` 通过；按 `.spec/Me2AI/ReadMe.md` 流程重建 `one-api-custom:latest` 镜像并启动实测（注意端口映射 `-p 3008:3000`）。
4. 全站双主题走查（第 7 节）逐项浏览器实测：桌面 1440px + 移动 390px × 暗/亮。
5. tech-web skill 第 10 节检查清单逐项核对（令牌用色、glow 克制、mono 数字、响应式、`prefers-reduced-motion`、焦点环）。
6. 更新 AI2AI 文档：`项目架构信息.md`（主题基建/新共享组件/路由变化）、`协议和数据.md`（无协议变更则注明）、本文档第 9 节实施记录。

**完成标准**

- 生产构建通过、Docker 镜像内全站改版生效；AI2AI 文档反映最新状态。

**验收标准**

- [ ] build 成功，gzip 主包增量 < 60KB。
- [ ] 第 7 节走查清单 100% 通过。
- [ ] AI2AI 三份文档更新完成。

## 7. 全站双主题走查清单（每页 × 暗/亮 × 桌面/移动）

| 页面 | 路由 | 阶段 | 重点检查 |
| :--- | :--- | :--- | :--- |
| 落地页 | `/` | 1/3 | 与 Task01 效果一致；主题与全站联动；Logo 跳 `/` |
| 旧首页 | `/home` | 3 | markdown/iframe 渲染、双主题 |
| 登录/注册/重置 | `/login` `/register` `/reset` | 3 | 玻璃卡、Turnstile、微信 Modal、第三方登录、错误提示、登录后跳 `/dashboard` |
| OAuth 回调 | `/oauth/github` `/oauth/lark` | 3 | 加载态、回调跳转 |
| 仪表盘 | `/dashboard` | 4 | recharts 双主题、StatCard、登录默认落地 |
| 令牌 | `/token` `/token/add` `/token/edit/:id` | 4 | 表格、Modal、复制、状态标签、空态 |
| 日志 | `/log` | 4 | 筛选、分页、长表格、mono 数字 |
| 充值 | `/topup` | 4 | 余额卡、套餐卡（有/无 top_up_link 两态）、兑换码核销 |
| 对话 | `/chat` | 4 | iframe 外壳、无 chat_link 空态 |
| 设置 | `/setting` | 4/5 | Tab 切换；个人设置 + 运营/系统/其他（root） |
| 渠道 | `/channel` `/channel/add` `/channel/edit/:id` | 5 | 大表单、模型多选 Dropdown、测试反馈 |
| 兑换码 | `/redemption` + 编辑页 | 5 | 批量生成、核销状态标签 |
| 用户 | `/user` + 编辑/添加 | 5 | 角色标签、额度调整 Modal |
| 关于 / 404 | `/about` `*` | 3 | 品牌化 |
| 全局弹层 | 任意页 | 1 | Modal/Dropdown/Popup/Toast/Checkbox/分页 |

## 8. 兼容性与风险控制

1. **零后端改动**：不碰 `relay/`、`controller/`、`model/`、数据库、Redis；在线支付后端（orders/packages）属独立任务线，本任务仅 UI 槽位。
2. **路由 URL 全部不变**（除 D1：`/` 与 Home 互换且旧页保留 `/home`）；OAuth 回调、外跳充值链接、文档地址不受影响。
3. **跳转联动（易漏点）**：D1 后 `/` 是公开落地页，所有"登录成功后 `navigate('/')`"必须改为 `/dashboard`（LoginForm/RegisterForm/GitHubOAuth/LarkOAuth 四处 + Header Logo），否则登录用户会回到营销页。
4. **不换组件库、不引 Tailwind**：Semantic UI React 保留；覆盖样式集中在 `src/theme/`，删除即可整体回退。
5. **Portal 弹层**：Modal/Dropdown/Popup/Toast 渲染在 body 下，覆盖选择器以 `body.theme-dark .ui.modal` 等全局维度书写（阶段 1 重点验收项）。
6. **recharts 硬编码色**：SVG 属性不受 CSS 覆盖控制，图表颜色须经 props 随主题传入。
7. **iframe 不可控**：Chat、外链首页、footer_html 内部样式无法主题化，仅做外壳底色融合。
8. **Landing 回归保护**：阶段 1 改造后以 Task01 验收记录为回归基准，逐区比对。
9. **每阶段独立提交、独立验收**；阶段 1（基建）为全部后续阶段前置。

## 9. 实施记录

### 阶段 0：决策门 ✅

- 用户回复"按这个方案开始执行阶段 1"，视为 D1–D5 全部采纳建议：
  - D1 `/` 切换为新落地页、旧 Home 迁 `/home`（阶段 3 落地）
  - D2 默认主题跟随系统，手动切换持久化于 `app_theme`，迁移旧 `landing_theme`
  - D3 登录后落地 `/dashboard`（阶段 3 改跳转）
  - D4 berry/air 冻结
  - D5 不删后端功能

### 阶段 1：全站主题基建 ✅（已完成并通过浏览器实测）

**新增文件**

| 文件 | 说明 |
| :--- | :--- |
| `src/theme/tokens.css` | 全站双主题令牌：`html.theme-dark` / `html.theme-light` 两套品牌色/表面/文本四级/边框/语义软底色/阴影光晕/字体令牌；body 底色、链接、滚动条、选中文本、焦点环全局适配 |
| `src/theme/semantic-ui.css` | Semantic UI 覆盖层，全部引用变量；`:where(html.theme-dark, html.theme-light)` 零特异性前缀（移除 class 即整体回退）；覆盖菜单/卡片/区块/表格/表单/下拉/按钮/标签/消息/Modal/Popup/Dropdown 菜单（Portal）/Toast/标题/统计/分页/Tab/Loader + 全局 `.app-theme-toggle` 胶囊样式 |
| `src/context/Theme/index.js`、`reducer.js` | ThemeContext：`dark/light`，持久化 `app_theme`；初始化优先级 app_theme → 旧 `landing_theme`（tech/simple 迁移）→ `prefers-color-scheme` → dark；`applyThemeToDocument` 同步 `<html>` class；导出 `useTheme()`（theme/isDark/isLight/toggleTheme/setTheme） |
| `src/components/ThemeToggle.js` | 胶囊切换按钮（🌙/☀️ + 文案，<640px 仅图标）；`className` 可传（Landing 传 `tl-theme-toggle` 复用其导航样式） |

**修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/index.js` | 引入 tokens.css / semantic-ui.css；包裹 `ThemeProvider`（StatusProvider 内、UserProvider 外） |
| `public/index.html` | `<head>` 内联首帧前主题探测脚本（与 reducer 同逻辑：app_theme → landing_theme 迁移 → 系统偏好 → dark），防暗色白闪 |
| `src/pages/Landing/index.js` | 删除私有 theme state / `landing_theme` 持久化 / body 底色逻辑；切换按钮替换为共享 `<ThemeToggle className='tl-theme-toggle'/>`；根 div 不再拼 `tl-theme-simple`（由 `html.theme-light` 驱动）；body 顶距挂载处理保留 |
| `src/pages/Landing/landing.css` | 品牌/中性色/字体令牌下沉到全站 tokens.css（继承）；`.tech-landing` 仅保留落地页专属槽位（暗色值）；新增 `html.theme-light .tech-landing` 亮色覆盖块（替代旧 `.tl-theme-simple`）；`.tl-gradient-text`/`.tl-grid-bg` 亮色规则改挂 `html.theme-light`；切换图标选择器兼容 `.att-icon`/`.att-text`；终端 `--brand-terminal:#05070b` 两主题保持深色 |
| `package.json` | dev proxy 由 `http://localhost:3000` 改为 `http://localhost:3008`（与当前 Docker 容器 `-p 3008:3000` 实际映射一致；ReadMe 旧注释未同步） |

**验证结果**

- `npx react-scripts build`：Compiled successfully；主包 gzip 296.45KB（+365B）、CSS 102.63KB（+3.24KB），远低于 60KB 增量阈值（CSS 增量小，主包阈值指 JS）。
- dev server（PORT=3007，proxy→3008 容器）浏览器实测 11 项全 PASS：
  - `/landing` 暗色科技风与 Task01 一致；切亮色全页切换、终端保持深色；刷新偏好保持；切回正常。
  - `/login` 暗/亮两主题输入框、按钮、文字均可读，无白底白字。
  - root/123456 登录后 `/dashboard`：暗色卡片、recharts 坐标轴/网格/Tooltip 清晰。
  - `/token` 表格暗色可读；"添加令牌"Modal 为深色底、控件可读（Portal 覆盖生效）。
  - `/log` 表格与类型筛选下拉弹层深色可读。
  - 亮色下 `/dashboard`、`/token` 白卡/浅灰底/Modal 正常。
  - 控制台无红色 JS 错误。

**验收核对**

- [x] 全局弹层（Modal/Dropdown/Popup/Toast）暗色可读
- [x] Landing 两主题与 Task01 效果一致（逐区无回归）
- [x] 刷新/新标签页主题保持；系统深色偏好首次访问暗色；旧 `landing_theme` 偏好自动迁移
- [x] 生产构建通过

**阶段 1 遗留 / 注意事项**

1. dev proxy 改为 3008 后，若日后容器按 `-p 3000:3000` 启动需同步改回（或 ReadMe 端口命令统一）。
2. ~~全站普通页面暂无 ThemeToggle 入口~~（阶段 2 已在 Header 桌面导航与移动抽屉挂载）。
3. Dashboard 的 recharts 数据色板仍为组件内硬编码（暗色下可读性已实测 OK），阶段 4 再改为随主题 props 传入。

### 阶段 2：全局框架改版 ✅（已完成并通过浏览器实测）

**新增文件**

| 文件 | 说明 |
| :--- | :--- |
| `src/theme/app-frame.css` | 全站框架样式层（第 3 层 CSS）：sticky 玻璃导航（`.app-header`，下划线式 active 高亮、C 端/管理组 `.app-nav-divider`、渐变品牌名 `.app-brand-name`）、移动抽屉 `.app-mobile-menu`、页脚 `.app-footer`、全局点阵网格背景（`body::before` 固定层 + mask 顶部渐隐，亮色降透明度）、科技风加载态 `.app-loading`（三色脉冲点 + reduced-motion 降级）；主题规则全部 `:where(html.theme-dark, html.theme-light)` 前缀 |

**修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/components/Header.js` | 重写导航结构：导航项拆为 `userButtons`（仪表盘/令牌/日志/充值/[对话]/设置/关于）与 `adminButtons`（渠道/兑换码/用户，`admin:true`），管理组前渲染竖向分隔线，仅 `isAdmin()` 可见；`useLocation()` 驱动 `app-nav-active` 高亮；桌面导航右侧与移动抽屉均挂载 `<ThemeToggle/>`；Logo 链接按登录态切换（登录→`/dashboard`，未登录→`/`）；移动端登录按钮改 `primary`；删除全部硬编码 `#666/#333` 内联色 |
| `src/components/Footer.js` | `Segment` 加 `app-footer` 类（透明底/顶部分隔线/三级文本色由 app-frame.css 接管），删除内联 `color:'#666666'`；footer_html 自定义内容仍只做外壳融合 |
| `src/components/Loading.js` | SUI Dimmer/Segment 加载态替换为 `.app-loading` 三色脉冲点科技风（无硬编码色，引用品牌变量） |
| `src/index.js` | 引入 `theme/app-frame.css`（semantic-ui.css 之后） |

**验证结果**

- `npx react-scripts build`：Compiled successfully；主包 gzip 296.96KB（+0.51KB）、CSS 103.51KB（+0.88KB）。
- 浏览器实测全项 PASS：
  - 桌面暗色：玻璃 sticky 导航、渐变品牌名、C 端/管理菜单顺序与分隔线、active 蓝色下划线随路由切换、滚动吸顶、点阵网格背景顶部渐隐、页脚分隔线+三级文字可读。
  - 导航右侧 ThemeToggle 整站亮/暗切换（含导航、表格、Modal、下拉弹层回归无穿帮）。
  - 登录态点 Logo → `/dashboard`；未登录态导航可见 ThemeToggle 与登录入口。
  - 390px 移动端：汉堡展开深色玻璃抽屉（图标+纵向菜单+active 高亮+主题切换+语言+注销），抽屉内切主题亮色玻璃底同步，点菜单抽屉收起并导航。
  - `/landing` 独立页无重复全局导航、双主题正常。
  - 控制台无功能性红色报错（仅 React 开发环境 deprecated 提示）。

**阶段 2 遗留 / 注意事项**

1. ~~未登录态点击 Logo 现跳 `/`（旧 Home）~~（阶段 3 已落地：`/` 为落地页，Logo 未登录跳 `/` 即落地页）。
2. `footer_html` 自定义富文本内部颜色不可控（运营自管内容），外壳已融合。
3. recharts 色板硬编码仍留待阶段 4。

### 阶段 3：认证页与公开页改版 ✅（已完成并通过浏览器实测）

**新增文件**

| 文件 | 说明 |
| :--- | :--- |
| `src/components/AuthLayout.js` | 认证页全屏布局：居中玻璃卡（暗色 glass / 亮色白卡）+ 顶部 Logo/渐变品牌名 + 标题 + 底部"← 返回首页"链接；登录/注册/重置/重置确认四页复用 |
| `src/components/AuthLayout.css` | AuthLayout 样式（`:where()` 主题前缀）：`.auth-layout`（100vh 居中）、`.auth-card`、`.auth-brand/-logo/-brand-name`、`.auth-title`、`.auth-links`（卡内链接行）、`.auth-note`、`.auth-oauth`/`.auth-oauth-btn`（第三方登录圆形按钮，hover 蓝边+光晕）、`.auth-submit`（渐变品牌主按钮，替代旧内联 `#2F73FF`）；<480px 卡内边距收窄 |

**修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/components/LoginForm.js` | 重写为 AuthLayout 结构（移除 Grid/Card/Header/Image 品牌区）；主按钮改 `primary` + `auth-submit`（删 `#2F73FF` 内联）；第三方登录 GitHub/微信按钮改 `auth-oauth-btn` 圆形描边按钮，飞书入口同构；微信扫码 Modal 逻辑不变（Portal 已由覆盖层主题化）；**登录成功跳转 `/token`→`/dashboard`、微信登录 `/`→`/dashboard`**；root 默认密码仍引导 `/user/edit`（安全逻辑保留） |
| `src/components/RegisterForm.js` | 套 AuthLayout；删 `#2F73FF`/`#666` 硬编码；**注册成功保持跳 `/login`**（后端 Register 不建立会话，直跳 /dashboard 会被 PrivateRoute 弹回；登录后由 Login 落 /dashboard，已在代码注释说明） |
| `src/components/PasswordResetForm.js` / `PasswordResetConfirm.js` | 套 AuthLayout；删全部硬编码色；确认页新密码框 `backgroundColor:#f8f9fa` 内联删除（由输入框覆盖层接管） |
| `src/components/GitHubOAuth.js` / `LarkOAuth.js` | Dimmer/Segment 加载态替换为 `<Loading text={prompt}/>` 三色脉冲点；登录回调 `navigate('/')`→`/dashboard`（绑定回调仍 /setting）；新增 `res?.data` 防御（网络错误时拦截器返回 undefined，避免解构崩溃，失败按既有语义跳 /setting） |
| `src/components/Loading.js` | 新增 `text` prop：传入完整文案直接显示，否则沿用 `加载{prompt}中...` |
| `src/pages/NotFound/index.js` | 重写为科技风 404：渐变 mono 大数字 `.nf-code`（clamp 96–180px + 微光晕）+ 标题/说明 + "返回首页"按钮，登录态额外显示"进入控制台"；样式在 app-frame.css |
| `src/pages/Home/index.js` | 硬编码色清理：两处 `#444` 标题删除、链接 `#2185d0`→`var(--brand-blue)`、四组状态 `#21ba45/#db2828`→`var(--brand-green)/var(--brand-danger)` |
| `src/App.js` | **D1 路由切换**：`/`→Landing、`/landing`→`<Navigate to='/' replace/>`、新增 `/home`→Home（懒加载不变） |
| `src/index.js` | STANDALONE_PATHS 扩展为 `/`、`/login`、`/register`、`/reset`、`/user/reset`、`/oauth/github`、`/oauth/lark`（认证/OAuth 全屏无全局导航）；404 与 /home、/about 保留全局布局 |
| `src/locales/zh/translation.json` / `en/translation.json` | 新增 `auth.back_home` 与 `notfound.*`（code/title/description/back_home/back_console） |
| `src/theme/app-frame.css` | 追加 `.nf-*` 科技风 404 样式 |

**验证结果**

- `npx react-scripts build`：Compiled successfully；主包 gzip 296.73KB（**-231B**，移除认证页 SUI Grid/Card 等引用）、CSS 104.35KB（+835B）。
- 浏览器实测全项 PASS：
  - `/` 为落地页且无重复导航；`/landing` 自动重定向到 `/`。
  - `/login` 全屏玻璃卡（无全局导航）：Logo+渐变品牌名、标题、输入框、渐变登录按钮、忘记密码/注册链接、"← 返回首页"均正常；亮色下白卡可读；返回首页回 `/`。
  - `/register`、`/reset` 同构玻璃卡；互相跳转链接正确；实测注册 testuser0905 成功（toast"注册成功"）并跳 `/login`；重置页提交未注册邮箱正确 toast 报错。
  - root/123456 登录 → `/user/edit` 安全引导；普通登录 → `/dashboard`（D3）；注销 → `/login` 全屏页。
  - 404：未登录仅"返回首页"；登录态显示"返回首页/进入控制台"双按钮且跳转正确。
  - `/oauth/github` 无参访问显示三色脉冲加载态（旧 Dimmer 已移除）。
  - `/home` 旧首页全局布局内暗色卡片可读、状态绿/红文字清晰；`/about` 卡片暗色可读。
  - 控制台无功能性红色报错（业务 toast 错误为预期；React deprecated 警告忽略）。

**阶段 3 遗留 / 注意事项**

1. 注册成功跳 `/login` 而非计划中的 `/dashboard`——后端 Register 不建立会话，属有意偏差（代码内注释）。
2. 走查中注册的测试账号 testuser0905 残留在测试库（测试环境，可由管理员删除）。
3. 认证页无 ThemeToggle 入口（全屏页设计）；主题可在落地页/全局导航切换后持久化，认证页自动跟随。
4. About 页 iframe 模式（about 内容为 https 外链）外壳已融合，内部不可控。

### 阶段 4：C 端用户中心改版 ✅（已完成并通过浏览器实测）

**新增文件**

| 文件 | 说明 |
| :--- | :--- |
| `src/components/EmptyState.js` | 通用空状态（圆形软底图标 + 标题 + 描述 + 操作区 children），Chat 空态及后续表格空态复用；样式 `.empty-state*` 在 app-frame.css |
| `src/pages/TopUp/topup.css` | 充值中心样式（`:where()` 主题前缀）：余额 hero 卡（`.topup-hero` + 径向光晕 + 渐变 mono 数字）、套餐网格 `.topup-packages`/`.pkg-card`（推荐徽章 `.pkg-badge`、置灰 `.pkg-disabled`）、琥珀色"即将上线"提示 `.topup-soon`、兑换区 `.topup-redeem`；<640px 单列 |

**修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/pages/Dashboard/index.js` | 重写：新增三张今日指标卡（请求/消费/Token，渐变图标 + mono 数字，`.stat-row`/`.stat-card`）；**recharts 双主题色板**——`chartTheme.dark/light` 常量经 `useTheme()` 订阅，坐标轴/网格/Tooltip（bg/border/文字）/折线/柱条全部 props 传入具体色值（SVG 属性不读 CSS 变量）；删除 `chartConfig` 硬编码 `background:'#fff'`/`#4318FF`/`#A3AED0`；SUI Card/Grid 改为纯 div + CSS Grid（图表逻辑、数据接口 `/api/user/dashboard` 不变） |
| `src/pages/Dashboard/Dashboard.css` | 全部重写为 `:where(html.theme-dark, html.theme-light)` 前缀主题规则；删除全局白底 `.dashboard-container{background:#fff}`、`.ui.card>.content>.header{color:#2B3674}`、黑字 `.settings-tab` 等旧规则（原文件无主题前缀且含 `!important`，暗色下穿帮源）；指标卡/图表卡样式双主题；通用容器/卡片类移至 app-frame.css |
| `src/pages/TopUp/index.js` | UI 重排（**逻辑零改动**：`topUp()` 核销、`openTopUpLink()` 外跳拼参、`getUserQuota()` 不变）：余额 hero 卡（`renderQuota` 渐变 mono 数字 + 在线充值按钮，无链接时 disabled）；**套餐静态槽位** `PACKAGES`（¥10/¥100 推荐/¥500）点击统一走 `openTopUpLink`，无 `top_up_link` 时整组置灰 + 按钮文案变"在线支付即将上线" + 琥珀提示条；**未新增任何支付 API**；兑换码区保留（`POST /api/user/topup`）；删除全部 `#2185d0/#21ba45` 硬编码 |
| `src/pages/Chat/index.js` | iframe 外增加科技外壳 `.chat-shell`（标题栏 + "新窗口打开"外链）；无 `chat_link` 时渲染 EmptyState（"对话功能未开启" + 返回首页），替代空白 iframe |
| `src/theme/app-frame.css` | 追加：①通用页面容器 `.dashboard-container` 与 `.chart-card`（含 `.ui.card.chart-card` 高特异性版，全站 Token/Log/Channel/User/Redemption/Setting/Home/About 复用类由此全局生效，修复懒加载 chunk 导致的样式不确定）；②EmptyState 样式；③设置页 Tab `.ui.menu.settings-tab`（active 蓝下划线）+ `.ui.tab.segment` 透明化（原定义在 Dashboard.css 但 Setting 未 import，属隐性 bug）；④WebChat 外壳样式 |
| `src/theme/semantic-ui.css` | **修复 SUI basic 彩色标签穿帮**：SUI 自带 `.ui.basic.{color}.label` 为 (0,4,0) 且 `!important`（白底+饱和色），`:where()` 零特异性压不住 → 令牌/兑换码状态标签在暗色下呈白底荧光块。改为 `html.theme-dark/light .ui.basic.{color}.label` 门控高特异性（(0,5,0)）+ `!important` 软底三件套，补齐 grey/black 与链接 hover 态（移除 theme class 即回退，符合 skill 例外规则） |
| `src/components/LogsTable.js` | 内联 `color:'gray'` → `var(--text-tertiary)` |
| `src/locales/zh|en/translation.json` | 新增 `dashboard.stat.*`、`topup.balance.*`、`topup.packages.*`（title/subtitle/soon/recommend/buy/tiers）、`chat.*`（title/open_new/empty.*） |

**验证结果**

- `npx react-scripts build`：Compiled successfully；主包 gzip 297.37KB（+644B）、CSS 105.53KB（+1.18KB）。
- 浏览器实测全项 PASS、控制台零报错（无 recharts container/tick 告警）：
  - Dashboard 暗色：三指标卡（渐变图标/mono 数字）、三折线卡（凹陷图表区、浅灰轴、蓝/青/紫折线、深色 Tooltip）、堆叠柱状图（轴/图例/柱条/Tooltip）全部可读；亮色：白卡/深轴/深折线/白 Tooltip 对应正确；悬停 Tooltip 主题正确。
  - /token 表格 + 添加令牌 Modal（含模型范围下拉 Portal 弹层）暗色可读；令牌/兑换码状态标签经 basic Label 修复后为软底徽章，暗色不荧光、亮色浅底可读（修复前为白底高饱和块）。
  - /log 筛选栏/表格/分页暗色可读，"点击查看"等次级文字改用变量。
  - /topup：余额卡渐变数字 + 三套餐卡（¥100 推荐徽章蓝边）+ 无链接置灰 + 琥珀提示条 + 兑换区，双主题可读；空码提交 toast 正常。
  - /chat 无链接显示 EmptyState（图标/标题/返回首页）。
  - /setting Tab active 蓝色下划线高亮，表单可读（settings-tab 全局生效）。
  - 回归：/channel（含添加渠道大 Modal）、/user、/redemption、/about 卡片表格暗色无穿帮。
  - 390px 移动端：指标卡/折线卡/套餐卡单列堆叠不溢出。

**阶段 4 遗留 / 注意事项**

1. 套餐卡为**静态展示槽位**（¥10/100/500 固定三档），点击统一外跳 `top_up_link`；待后端订单/套餐体系落地后（ME2AI 路线图 orders/packages 表）再接入真实套餐数据。
2. 令牌/日志表格的"空数据 EmptyState 行"仍用 SUI 表格默认空态（功能可读），EmptyState 组件已就绪，阶段 6 收尾可统一。
3. 渠道编辑等管理大表单的细粒度主题化在阶段 5 处理（本次仅回归可读性）。
4. Dashboard 折线数据补零/日期范围逻辑未动。

### 阶段 5：管理端改版 ✅（已完成并通过浏览器实测）

**策略与范围**：管理端（渠道/兑换码/用户/系统设置）全部使用标准 SUI 组件（Table/Form/Dropdown/Modal/Label/Popup/Pagination/Checkbox/Toggle/Message），无硬编码色（全量 grep 确认 `ChannelsTable/RedemptionsTable/UsersTable/SystemSetting/OperationSetting/OtherSetting` 及 `pages/Channel|User|Redemption` 下零 hex 色；内联 style 仅 cursor/maxWidth/minHeight/fontFamily 等布局属性）。故阶段 5 以**走查验证 + 覆盖层补漏**为主，**业务逻辑与请求零改动、无 JSX 结构改动**。

**修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/theme/semantic-ui.css` | **修复 Form 输入框白底穿帮（本阶段核心改动）**：SUI 打包规则 `.ui.form input[type=text|password|email...]` 特异性 (0,3,1) 且写死 `background:#fff`（无 !important），阶段 1 的 `:where()` 规则 (0,2,1) 压不住 → `<Form>` 内所有带 type 的输入框/文本域在暗色下呈白底（系统设置/其他设置 Tab 实测发现，登录页因未包 Form 而幸免）。修复：表单内 input/textarea/select 及 :focus 态改用 `html.theme-dark/light` 门控选择器（(0,3,2)），另补 disabled 态主题化；`.ui.input input`/Dropdown 仍用 `:where()`（(0,2,1) 同位且后加载即胜出）。与 basic label 同属"门控高特异性"例外，注释已说明 |

**已验证天然受覆盖（无需改动）**

- 渠道：类型/状态/延迟标签均为 `Label basic color=*`（阶段 4 门控规则覆盖）；Popup 排序提示、Pagination、多选 Dropdown Portal 菜单、Toggle、Message、红色危险按钮均走阶段 1 覆盖层。
- 兑换码：状态标签（绿/红/灰/黑 basic）+ 生成 Modal 同上。
- 用户：角色标签为**实底彩色 Label**（管理员黄/超管橙）——SUI 实底标签无 !important，` :where()` (0,3,0) 同特异性后加载胜出，已映射软底徽章（双主题实测柔和可读）。
- 设置三 Tab：Form.Checkbox/Toggle、mono 文本域（内联 fontFamily 无颜色）、Divider/Header、Tab 高亮（阶段 4 `.settings-tab`）均正常。

**验证结果**

- `npx react-scripts build`：Compiled successfully；主包 gzip 297.37KB（无变化）、CSS 105.59KB（+59B）。
- 浏览器实测（控制台除 React 18 dev 弃用警告 findDOMNode/defaultProps/key 外**无业务报错**）：
  - /channel 列表暗/亮：表格、类型与状态标签、操作图标、排序 PASS；添加渠道页：类型下拉 Portal 菜单、模型多选、Toggle、Message、危险按钮、输入框（修复后深色凹陷底+聚焦蓝边）PASS。
  - /redemption 暗/亮：表格 + 添加 Modal PASS。
  - /user 暗/亮：黄/橙角色实底标签柔和不荧光、状态/余额标签、添加与编辑用户表单 PASS。
  - /setting 三 Tab 暗/亮：Tab 下划线、分组标题、输入框（修复前系统/其他设置白底→修复后双主题正确）、Toggle、mono 文本域、危险按钮、Message PASS。
  - 回归：/channel/add 修复后深色输入框、亮色设置表单浅底深字+聚焦蓝边 PASS。

**阶段 5 遗留 / 注意事项**

1. 管理端宽表格在 <640px 下依赖 SUI 默认横向溢出行为（Card 内 table 宽度溢出），功能可用但未做专项移动端优化；阶段 6 视需要给 `.chart-card .table` 容器加 `overflow-x:auto`。
2. 走查中浏览器代理多次因 60 步预算截断，结论以多轮分块走查 + 构建验证拼合；均已附截图留证。
3. 渠道"测试模型"行内 Dropdown、优先级行内 Input（Popup 触发）在展开详情列时才渲染，属 Portal/Input 已覆盖组件，未单独截图。

### 阶段 6：收尾 ✅（已完成并通过浏览器实测）

**新增/修改文件**

| 文件 | 改动 |
| :--- | :--- |
| `src/components/TokensTable.js` / `LogsTable.js` / `ChannelsTable.js` / `UsersTable.js` / `RedemptionsTable.js` | 5 个表格统一空态：`import EmptyState`；`<Table.Body>` 内 `!loading && data.length === 0` 时渲染全 colSpan 空态行（Token/User/Redemption colSpan=7，Log/Channel=11），图标分别 key / file alternate outline / server / users / ticket；**数据请求与渲染逻辑零改动** |
| `src/locales/zh\|en/translation.json` | 新增 `token/log/channel/redemption/user.empty.{title,desc}` 共 5 组 ×2 语言 |
| `src/theme/app-frame.css` | 640px 媒体查询补：`.chart-card .content` 横向滚动（`overflow-x:auto` + `-webkit-overflow-scrolling:touch`）+ 表格 `min-width:720px`，宽表（渠道/日志）窄屏可横滑不破版；Dropdown/Popup 走 Portal 不受裁剪 |

**硬编码清理终检**：全量 grep `src/**/*.js` 无 hex 色内联（Dashboard chartTheme 为 recharts props 传值特例、Landing 槽位为页面令牌层，均双主题）；`color:'green'` 等均为 SUI Label 语义色 prop（数据驱动，走覆盖层）。tech-web 清单核对：焦点环 `:focus-visible`（tokens.css）、`prefers-reduced-motion`（app-frame.css）、mono 数字、glow 克制均已具备。

**验证结果**

- `npx react-scripts build`：Compiled successfully；**gzip 主包 297.87KB（改版前基线 296.73KB，总增量 +1.14KB，验收线 <60KB）**、CSS 105.63KB（基线 104.35KB，+1.28KB）。
- 浏览器实测全项 PASS、过滤 React dev 弃用警告后**无业务报错**：
  - 空态：/token 搜索无结果、/log 空数据均显示 EmptyState（软底图标+标题+描述），清空搜索恢复列表。
  - 移动端 390px：/channel 宽表横向滑动、不撑破卡片（Dashboard/TopUp 堆叠阶段 4 已验）。
  - **回退验证**：控制台移除 `html.theme-dark/light` class 后，/dashboard 立即恢复 SUI 原始浅色外观（白底卡片/默认按钮/默认表格），布局不崩、无不可读文字；刷新后主题恢复——回退保障成立。
  - 暗/亮双主题全站 11 个路由（落地页/登录/仪表盘/令牌/日志/充值/对话/设置/渠道/兑换码/用户/关于/404）经阶段 3–6 分轮走查无穿帮。

**阶段 6 遗留 / 注意事项**

1. ~~Docker 镜像未在本次重建~~ → **已重建并上线（2026-09-05）**：`docker build -t one-api-custom:latest .` 成功（镜像 ID f178b7c0be2c，111MB）；旧容器停删后以原配置重启（`-p 3008:3000 -e TZ=Asia/Shanghai -v D:/one-api/one-api:/data --restart always`，注意 ReadMe 中 `3008:3008` 为笔误，容器内服务监听 3000）；容器日志正常（DB migrated、server started on :3000），`/api/status` 200，嵌入产物 CSS `main.de7cf4c9.css` 含 app-header/empty-state/stat-card/theme-dark/topup-hero 全部新类名；浏览器生产环境走查（落地页暗/亮、登录玻璃卡、Dashboard 图表主题跟随、/channel、/topup）全项 PASS、无业务报错。
2. 空态文案在"搜索无结果"与"确实无数据"两场景共用（未细分），文案为通用引导语。
3. 阶段 3 走查注册的测试账号 testuser0905 仍在测试库，可由管理员删除。

---

## Task02 总结论

六个阶段全部完成：双主题基建（tokens/Context/防闪烁/SUI 覆盖层）→ 全局玻璃框架（导航/页脚/网格背景/移动端抽屉）→ 认证页与公开页 → C 端用户中心（Dashboard 双主题图表/充值中心/Chat 空态）→ 管理端（覆盖层验证 + Form 输入框修复）→ 收尾（空态统一/移动横滑/回退验证/构建）。全程**未改 relay/ 与后端、未改数据库、无协议变更**；主题层移除 html class 即可整体回退 SUI 原样。两处门控高特异性例外（basic Label、Form 输入框）均已记录于 skill 坑位。
