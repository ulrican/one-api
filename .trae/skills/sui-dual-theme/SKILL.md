---
name: "sui-dual-theme"
description: "Semantic UI React + CSS 变量的暗色/亮色双主题覆盖层模式（html class 驱动 + Portal 弹层处理 + ThemeContext + 防闪烁）。当为 one-api/web/default 新增页面/组件做主题化、新增主题切换入口、或排查双主题穿帮（白底白字/白色弹层）时调用。"
---

# SUI 双主题覆盖层模式（科技暗色 ⇄ 简约亮色）

one-api/web/default（React 18 + CRA5 + Semantic UI React，无 Tailwind）全站双主题的固定实施模式。Task02 阶段 1 已落地基建，后续阶段（Header 改版、各页面主题化、新增组件）必须遵循本规范，保证：零硬编码颜色、Portal 弹层不穿帮、可整体回退。

## 0. 架构总览（不可变更的分层）

```
<html class="theme-dark|theme-light">   ← class 挂 html 级（Portal 决定的，见第 3 节）
  └─ theme/tokens.css                   ← 第 1 层：设计令牌（两套 CSS 变量）
  └─ theme/semantic-ui.css              ← 第 2 层：SUI 组件覆盖层（:where() 零特异性，引用变量）
  └─ 页面级 CSS（landing.css 等）        ← 第 3 层：页面专属槽位，继承全局变量
  └─ 组件内联 style                      ← 禁止写死颜色，只允许布局属性
```

- 主题运行时由 `context/Theme/`（ThemeContext）驱动，切换 = 改 `<html>` class。
- **回退保障**：移除 html 上的 `theme-*` class，所有覆盖层失效，恢复 SUI 原样。任何主题化改动都不得破坏这一点。

## 1. 令牌层（tokens.css）规则

- 两套变量分别定义在 `html.theme-dark { --... }` 与 `html.theme-light { --... }`；共享令牌（字体/圆角/过渡）定义在 `html.theme-dark, html.theme-light {}`。
- 必选变量槽位（新增组件优先复用，不要自造色值）：
  - 品牌：`--brand-blue` / `--brand-purple` / `--brand-green` / `--brand-amber` / `--brand-danger` 及 `-hover`；`--brand-gradient`、`--brand-gradient-text`
  - 表面：`--bg-page`（页面底）、`--bg-surface`（卡片）、`--bg-surface-translucent`、`--bg-elevated`（**Modal/Popup/Dropdown 菜单等 Portal 浮层**）、`--bg-inset`（输入框/凹陷区）、`--bg-glass`（玻璃导航）、`--bg-hover`、`--bg-active`
  - 文本：`--text-primary` / `--text-secondary` / `--text-tertiary` / `--text-disabled` / `--on-primary`
  - 边框：`--border-color` / `--border-strong`
  - 主色：`--primary` / `--primary-hover` / `--primary-active` / `--primary-soft-bg|border|text`
  - 语义软底色（标签/徽章/消息）：`--success-*`、`--warning-*`、`--danger-*`、`--info-*`、`--purple-*`（每组 `-soft-bg` / `-soft-border` / `-text`）
  - 阴影：`--shadow-card` / `--shadow-elevated` / `--glow-primary` / `--glow-purple`
  - 字体：`--font-sans` / `--font-mono`；圆角 `--radius-sm|md|lg`；`--transition-theme`
- 每个主题块末尾必须设 `color-scheme: dark|light`（让滚动条/原生控件跟随）。
- 暗色色板对齐 tech-web skill（底 `#0B0F17`、面 `#111827`、蓝 `#3B82F6`、紫 `#8B5CF6`、翡翠 `#10B981`、琥珀 `#FBBF24`）；亮色对齐 blue-style-rules（底 `#F8FAFC`、卡 `#FFFFFF`、主蓝 `#2563EB`、光晕换柔和阴影）。

## 2. SUI 覆盖层（semantic-ui.css）规则

- 所有选择器以 `:where(html.theme-dark, html.theme-light)` 为前缀：
  - **`：where()` 零特异性** → 页面级样式可覆盖本层；未挂 theme class 时整层不生效（回退保障）。
  - 例外：若必须提升优先级才能压过 SUI 内联样式（如 Toggle 复选框 `.box:before`），允许在该条规则末尾加 `!important`，但仍保留前缀。
- 覆盖清单（新增 SUI 组件用法时先检查是否已覆盖，未覆盖则补到本文件）：
  菜单 `.ui.menu`（含 vertical/secondary/pagination）、卡片 `.ui.card`、区块 `.ui.segment`、表格 `.ui.table`（thead/striped/hover）、表单（input/textarea/select/dropdown/checkbox/toggle）、按钮（default/primary/positive/negative/yellow/orange/basic，含 `.ui.{color}.buttons .button` 组形态，三态 normal/hover·focus/active）、标签 `.ui.label`（含 blue/purple/green/red/yellow 等 color 变体与 basic 变体）、消息 `.ui.message`、标题 `.ui.header`、统计 `.ui.statistic`、Tab、面包屑、Loader、Modal、Popup、Dropdown `.menu`、Dimmer、react-toastify（`.Toastify__toast` 等）。
- 彩色 `<Label color='x'>` 在暗色下**禁止使用 SUI 实底色**（高饱和荧光刺眼），统一映射为 `--*-soft-bg/border/text` 软底徽章三件套。
- 彩色按钮必须同时覆盖**组形态**：`<Button.Group color='green'>` 生成 `.ui.green.buttons > .button`（组内子按钮自身**不带** color class），只写 `.ui.green.button` 会漏掉（令牌行"对话/充值"按钮组踩过）。SUI 彩色按钮规则无 !important、特异性 (0,3,0)，`:where()` 同位 + 主题 CSS 后加载即可胜出。
- 按钮三态必须写全：`normal` / `hover·focus` / `:active`（按下）；`.ui.button .icon` 要覆盖 SUI 的 `.ui.button:hover .icon{opacity:.85}`（不覆盖会发灰）；黄/橙按钮在暗色用琥珀底+**深色文字**（`--on-warning`，白字在 #FBBF24 上对比不足），亮色用橙底白字。
- 分页 `.ui.pagination.menu .item:hover` 需显式给边框/文字变蓝（特异性 (0,4,0) 高于通用菜单 hover 规则，不会自动继承蓝边）。
- 每个主题块必须同时覆盖暗/亮两套——只写暗色是最常见的遗漏来源。

## 3. Portal 铁律（最高频穿帮点）

Semantic UI 的 **Modal / Dropdown 菜单 / Popup / Checkbox 弹层、react-toastify** 都通过 Portal 渲染到 `document.body` 下，**不在任何页面容器 div 内**。

- 主题 class 必须挂 `<html>`（或 body）级；挂在页面根 div（如 `.tech-landing`、`.dashboard-container`）上的主题变量，Portal 弹层拿不到 → 弹层永远是白底。
- 弹层覆盖选择器写成 `:where(html.theme-dark, html.theme-light) .ui.modal { ... }`，**不要**写 `.page-scope .ui.modal`。
- 浮层表面一律用 `--bg-elevated`（比卡片略亮/同级 + 阴影），不要用 `--bg-page`。
- 验收时每个页面必开一遍 Modal/Dropdown 检查弹层底色。

## 4. ThemeContext 与防闪烁

- `context/Theme/reducer.js`：状态 `dark|light`；初始化优先级 **localStorage `app_theme` → 旧偏好迁移 → `prefers-color-scheme` → dark**；`applyThemeToDocument()` 负责 html class 切换 + 持久化。
- `useTheme()` 返回 `{ theme, isDark, isLight, toggleTheme, setTheme }`；组件需要随主题重渲染时（如 recharts）用它订阅。
- **防 FOUC**：`public/index.html` 的 `<head>` 内联一段同步脚本（与 reducer 同逻辑），在首帧前给 `<html>` 加 class。不能只靠 React effect（effect 执行前已有白帧）。
- 切换按钮统一用 `components/ThemeToggle.js`；需要融入特定导航样式时传 `className`（如 `<ThemeToggle className='tl-theme-toggle'/>`），并在该页面 CSS 中兼容按钮内部类名 `.att-icon` / `.att-text`。
- localStorage key 固定 `app_theme`；旧 key（Task01 的 `landing_theme`：tech/simple）只读迁移、不删写。

## 5. 页面/组件主题化作业流程

1. 先查 tokens.css 是否已有所需语义槽位；没有且确有复用价值才加令牌（加必须暗/亮两套）。
2. 页面专属样式（如 landing.css）：基础令牌继承全局，只在页面根类上定义**页面专属槽位**；亮色覆盖写成 `html.theme-light .page-root { --slot: ... }`，不要新建 `page-root.theme-simple` 之类的第二套切换机制。
3. 删除组件内联 style 中的硬编码色值（`#fff/#666/#333` 等），换成变量；内联 style 只保留布局（宽高/间距/flex）。
4. **图表（recharts）特例**：SVG 属性（stroke/fill）不吃 CSS 覆盖，坐标轴/网格/Tooltip/Legend 颜色必须经 props 传入，组件内 `useTheme()` 订阅后选色板；暗色底图表卡片不得写死 `background:'#fff'`。
5. iframe（Chat、外链首页、footer_html）内容不可控，只做外壳底色融合，不尝试改 iframe 内部。
6. 终端/代码块两主题都保持深色（终端惯例）。

## 6. 验收清单（每阶段必过）

- [ ] 暗/亮两主题 × 桌面 1440 / 移动 390 走查：无白底白字、黑底黑字、亮白弹层。
- [ ] 每页至少打开一次 Modal 与 Dropdown，Portal 弹层底色/文字可读。
- [ ] 刷新后主题保持；清空 localStorage 后跟随系统深浅色；首屏无白闪。
- [ ] 全局搜索新增代码无硬编码十六进制色值（终端深色等特许例外需注释说明）。
- [ ] 移除 html theme class 后页面恢复 SUI 原样（回退验证）。
- [ ] `npx react-scripts build`（web/default，DISABLE_ESLINT_PLUGIN=true）通过。
- [ ] tech-web skill 第 10 节检查清单（暗色页面）：glow 克制、mono 数字、reduced-motion、焦点环。

## 7. 已知坑位记录

- SUI `.ui.toggle.checkbox` 的滑块是伪元素，需 `!important` 覆盖 `input:checked ~ .box:before` 背景。
- `.ui.selection.dropdown.active/hover` 会重置背景，覆盖时 focus/active/hover 三态都要写。
- Toast 进度条按类型分 class（`--success/--error/--warning/--info`），需分别覆盖。
- **SUI basic 彩色标签**：`.ui.basic.{color}.label` 自带规则是 (0,4,0) 且全属性 `!important`（白底+饱和边框/文字），`:where()` 零特异性永远压不过 → 暗色下呈白底荧光块（令牌/兑换码状态标签踩过）。解法：门控高特异性选择器 `html.theme-dark .ui.basic.green.label`（(0,5,0)）+ `!important` 软底三件套，grey/black 与 `a.ui.basic.label:hover` 也要补。
- **SUI Form 内输入框**：`.ui.form input[type=text|password|...]`（semantic.min.css 实测）特异性 (0,3,1) 且写死 `background:#fff`/深色文字（无 !important），`:where()` 版 `.ui.form input` (0,2,1) 压不住 → `<Form>` 包裹的 Form.Input/Form.TextArea 在暗色下白底（系统设置页踩过；未包 Form 的裸 `.ui.input input` 是 (0,2,1) 同位、后加载胜出，不踩）。解法：表单内 input/textarea/select 及 `:focus`/`:disabled` 态改用门控选择器 `html.theme-dark .ui.form input`（(0,3,2)）；注意 focus 规则也要门控，否则会被基础门控规则盖掉聚焦蓝边。
- **实底彩色 Label 无需门控**：`.ui.yellow.label` 等实底彩色标签 SUI 无 !important、(0,3,0)，`:where()` 同位且主题 CSS 后加载即可胜出（用户角色标签用此）。
- **SUI Menu 高特异性变体必须门控**（Task03 显示优化收尾踩）：`.ui.tabular.menu .item`(0,3,0)、`.ui.tabular.menu .active.item`(0,4,0)、`.ui.secondary.pointing.menu .active.item`(0,5,0) 写死 `color:rgba(0,0,0,0.87~0.95)` 黑色 + `border-color:#1B1C1D` 深黑 + `background:#fff` 白底，`:where(.ui.menu .item)`(0,2,0) 远不够。必须补门控：`html.theme-dark .ui.tabular.menu .item:hover`(0,5,1) / `html.theme-dark .ui.secondary.pointing.menu .active.item`(0,7,0) —— 后者还需门控 `.header.item`（SUI 带 !important）。Setting 页 Tab 实际 DOM 是 `.ui.pointing.secondary.settings-tab.menu`（类名顺序无关），app-frame.css 有 settings-tab 专属覆盖也是 `:where()` 零特异性，需 semantic-ui.css 的门控在前面压。hover 态不能用 JS `dispatchEvent` 验证（`:hover` 只响应真实鼠标），靠 CSS 产物检查和真实截图判断。
- **SUI Header 必须门控**：`.ui.header` 基础 (0,2,0) 理论后加载赢，但 `.ui.dividing.header`/`.ui.attached.header`/`h1.ui.header`~`h5.ui.header` 等修饰变体继承 SUI `color:rgba(0,0,0,0.87)` 黑色（header.css），`:where()` 版容易被同特异性的 semantic.min.css 后面的 h1~h5 规则意外覆盖 → 升级为门控 `html.theme-dark .ui.header`(0,3,0) 彻底压，顺带覆盖 h1~h5 + dividing + basic + attached 等全修饰类。
- **recharts 不吃 CSS 变量**：SVG presentation 属性不解析 `var()`，图表色板必须 `useTheme()` 订阅后 props 传入具体色值（轴 tick fill、grid stroke、Tooltip contentStyle、Line/Bar fill）。
- **页面 CSS 文件随路由 chunk 懒加载**：全站复用的类（如 `.dashboard-container`/`.chart-card` 被 Token/Log/Setting 等多个页面使用）必须定义在全局引入的 app-frame.css，不能放在单页 CSS（如 Dashboard.css）中，否则未访问该页时样式缺失。
- **页面旧 CSS 是穿帮高发区**：二开前已有的页面级 CSS（如 Dashboard.css）常含无主题前缀的全局规则（白底 `background:#fff !important`、深色标题 `color:#2B3674`、黑字 tab），改写时整文件加 `:where(html.theme-dark, html.theme-light)` 前缀并引用变量。
- **容器宽度统一**：SUI 布局由 `index.js` 的 `<Container className='main-content'>` 包裹（桌面上限 1127px，移动 1em 侧外边距），页面自定义根容器（如 `.topup-page`/`.chat-shell`）必须复刻 `.dashboard-container` 的 `max-width:1600px; margin:0 auto; padding:20px 24px 40px`（640px 下 12px），否则出现页面左右边缘不对齐/移动端贴边。
- **App 启动会同步后端配置覆盖 localStorage**：`chat_link`/`top_up_link` 等键由 App.js 在 `/api/status` 返回时 set/removeItem，浏览器里手动 `localStorage.setItem` 后整页刷新会被清掉；走查需要对话外壳时，走管理员「运营设置→对话链接」真实配置（验完恢复），不要依赖 localStorage 造假。
- dev proxy 在 web/default/package.json，随后端端口变化调整（当前指向 3008 容器映射）。
- **Docker 重部署后自动化浏览器缓存极顽固**：旧 Service Worker/磁盘缓存会让页面持续加载旧 hash 主 bundle（即使 Ctrl+Shift+R + unregister SW；旧 chunk 不存在时服务端返回 1KB SPA fallback 占位）。走查必须：① 地址栏访问带 cache-busting 查询串的 URL（如 `/dashboard?fresh=xxx`）；② Console 读回 `document.querySelector('script[src*="/static/js/main."]').src` 确认 hash 已是新版本；③ 要确认代码真入包，直接 `Invoke-WebRequest http://localhost:3008/static/js/main.<hash>.js` 拉 bundle 字符串匹配特征类名/i18n 键。
- **主题切换验证不要用 localStorage+模拟刷新**：自动化浏览器里 `localStorage.setItem('app_theme','dark')` 后的模拟 F5 经常不生效（React 仍按旧 class 渲染），agent 还常误报"已切暗色"。最稳手法：直接点击右上角 ThemeToggle 按钮（React dispatch 即点即生效，无需刷新），然后 `console.log(document.documentElement.className)` 读回 `theme-dark|theme-light` 作为唯一凭据，再测色值。
- **SUI Card 标题是独立黑字根因**（Task04）：`<Card.Header>` 渲染为 `.ui.card > .content > .header`——class 只有 `header`，**不含 `ui`**，SUI card.css 对它写死 `color:rgba(0,0,0,0.85)`（(0,4,0)），`.ui.header` 门控盖不住；且 card 内任何 class 含 `header` 的元素（如 `<h3 class='ui header'>`）都被该选择器命中、优先级高于 `.ui.header` 门控。解法：门控 `.ui.card > .content > .header`(0,5,0) 与 `.ui.cards > .card > .content > .header`(0,6,0) 两形态 → `var(--text-primary)`，`.ui.card .meta` 同步 → `var(--text-tertiary)`。
- **导航内 Dropdown 菜单项 SUI 带 `!important`**（Task04 三轮才压住）：顶部导航内下拉项的实际规则是 `.ui.menu .ui.dropdown .menu>.item{color:#000000de!important;background:0 0!important}` 及 hover/selected 变体——(0,6,0) 高特异性 **且 !important**；无 !important 的门控特异性再高也输。门控时 item/hover/selected 三态都要写两种形态：`.ui.dropdown .menu > .item`（(0,5,0)，表单 selection dropdown 用）**和** `.ui.menu .ui.dropdown .menu > .item`（(0,6,0)，导航内用，必须 !important；hover/selected 的 background+color 都要 !important）。排查"门控写了却不生效"：先 `Invoke-WebRequest` 拉构建产物 CSS 文本，看该选择器是否带 `!important`，不要凭选择器名猜。
- **SUI 无色 basic label 与彩色 basic label 是两条规则**（Task04）：彩色 `.ui.basic.{color}.label` (0,4,0) 门控后，`<Label basic>` **不传 color**（用户管理表额度/已用/请求数/状态列）命中的是默认 `.ui.basic.label` (0,3,0) `color:rgba(0,0,0,0.87)!important` + 白底，`:where()` 版改背景改不了文字。解法：门控 `html.theme-* .ui.basic.label`(0,4,0)+!important → `--bg-inset`/`--text-secondary`/`--border-color`；彩色变体 (0,5,0) 特异性更高不受影响。黑字扫描要按 className+color 聚合并排除 `rgba(...,0)` 透明色（`.app-brand-name`/`.topup-hero-number` 用 background-clip 渐变文字，color 为透明黑，是误报）。
