# Task03：改版后显示效果优化

> 来源：Me2AI/任务清单.md Task03
> 前置：Task02 全站双主题改版已完成并上线（镜像 one-api-custom:latest，2026-09-05）
> 状态：✅ 已完成并通过双主题浏览器实测（2026-09-05）。本次为**纯前端视觉打磨**：仅改 4 个 CSS 文件，业务 JSX/后端/relay/数据库/协议零改动。生产构建 JS gzip 297.87KB（无变化）、CSS 106.17KB（+0.54KB 原始）。实施记录见文末「7. 实施记录」。

---

## 1. 需求理解（来自 Me2AI）

三条核心优化线，均要求**暗色/亮色双主题**下清晰、协调：

1. **字体/文字**：文字颜色与主题匹配；重点关注 **label 文字、导航栏、按钮**在鼠标移入（hover）、激活（active）、移出（normal）三态的显示效果。
2. **图标**：图标颜色与主题匹配；重点关注图标在 hover/active/normal 三态的显示效果。
3. **布局**：页面模块间距协调合理、符合用户习惯；上下堆叠模块**宽度一致**、边缘对齐。

## 2. 现状勘察结论（Task02 产物审计）

### 2.1 已具备、无需重做的部分

- 四级文本令牌体系完整（`--text-primary/secondary/tertiary/disabled`，暗/亮各一套）。
- 导航栏三态已覆盖：`.app-header .item` normal=secondary、hover=primary 文字、active=品牌蓝+底部下划线；移动端菜单 active=软蓝底。
- 通用菜单/下拉菜单/Popup/分页 active 态、表格行 hover、卡片 header/meta/description 层级均已主题化。
- 标签体系完整：实心彩色 Label 与 basic 彩色 Label（含门控 !important 例外）双主题软底映射，hover 态已覆盖。
- 主按钮 hover 有品牌色+glow；basic 按钮 hover 蓝边蓝字；焦点环、reduced-motion 齐备。
- 独立彩色 `<Icon>` 全站 grep 为**零**（图标均继承 currentColor 或在按钮/标签内），图标颜色天然跟随文字。

### 2.2 发现的缺口（本次修复清单）

| # | 问题 | 证据 | 影响 |
| :--- | :--- | :--- | :--- |
| A | **彩色按钮组未覆盖**：SUI 选择器 `.ui.green.buttons .button`（0,3,0）命中组内按钮，现有覆盖层只有 `.ui.green.button`（0,3,0 同特异性但选择器不匹配组内按钮） | TokensTable 第 430/445 行 `<Button.Group color='green'\|'olive'>`（令牌行"对话/充值"按钮组） | 暗/亮主题下均显示 SUI 饱和绿/橄榄实心，与主题色板不协调；hover/focus/active 也是 SUI 色 |
| B | **yellow 实心按钮未覆盖**：现有按钮变体只覆盖 primary/positive-green/negative-red/basic | SystemSetting 第 328 行"关闭密码登录"确认按钮 `color='yellow'` → SUI `#FBBD08` 黄底深字 | 暗色下刺眼、亮色下与主题橙不协调 |
| C | **按钮缺 :active（按下）态**：覆盖层只定义 normal/hover/focus/disabled | semantic-ui.css 按钮段 | 鼠标按下无深度反馈，交互不完整 |
| D | **分页按钮 hover 无反馈**：`.ui.pagination.menu .item` 只定义 normal/active | semantic-ui.css 分页段 | 页码 hover 仅通用菜单底色，边框不变色 |
| E | **Chat 页无容器约束**：`.chat-shell` 直接渲染在 SUI Container 内，自身无 padding/max-width | Chat/index.js 第 26 行；app-frame.css `.chat-shell` 无 padding | 与其他页（dashboard-container/topup-page 自带 20×24 padding）左右边缘不对齐；移动端 gutter 仅 1em，其他页为 1em+12px |
| F | **TopUp 宽度与全站不一致**：`.topup-page { max-width:960px }`，其余页面内容宽 = 父级 SUI Container（≥1200px 视口时 1127px） | topup.css 第 10 行 | 充值页比仪表盘/令牌等页面窄一截，同层导航页面宽度不一致 |
| G | **文字对比度/图标三态需实测核验**：表头 tertiary 文字、disabled 文字、按钮内图标 hover（SUI `.ui.button:hover .icon{opacity:.85}`）等 | tokens.css / semantic-ui.css | 静态分析对比度均 ≥4.5:1，但需双主题浏览器实测确认"清晰、协调" |

## 3. 实施方案（分 4 步，每步独立可验收）

### 步骤 1：按钮体系补齐（`theme/semantic-ui.css`）

1. 彩色按钮组：新增组形态选择器（与实心按钮同色板）：
   `.ui.primary.buttons .button`、`.ui.blue.buttons .button`、`.ui.teal.buttons .button` → primary；
   `.ui.green.buttons .button`、`.ui.olive.buttons .button`、`.ui.positive.buttons .button` → success；
   `.ui.red.buttons .button`、`.ui.negative.buttons .button` → danger；
   含 hover/focus/active 三态（hover 用 *-hover 色，active 用深色）。
2. warning 按钮：`.ui.yellow.button`、`.ui.orange.button` 及组形态 → 实心 warning 色；暗色黄底配深色文字（`--bg-page` 级深色保证对比），亮色橙底白字；含三态。
3. 所有按钮变体补 `:active` 态：默认按钮 active=`--bg-active` 底+蓝边；primary active=`--primary-active`；绿/红/黄同逻辑。
4. 分页 item hover：边框+文字转品牌蓝（`.ui.pagination.menu .item:hover`）。
5. 全部规则保持 `:where(html.theme-dark, html.theme-light)` 前缀；仅当与 SUI !important 规则冲突时才用门控选择器（按钮 SUI 规则无 !important，预计不需要）。

**完成标准**：CSS 中按钮变体（默认/primary/green/olive/red/yellow/basic/组形态）三态齐全；无硬编码色。
**验收**：浏览器令牌页按钮组、系统设置弹窗 yellow 按钮、分页 hover、按钮按下效果双主题截图。

### 步骤 2：图标交互态统一（`theme/semantic-ui.css` + `theme/app-frame.css`）

1. 覆盖 `.ui.button:hover .icon { opacity: 0.85 }`：主题化按钮 hover 时图标 `opacity:1`（与文字同色变亮，不发灰）。
2. 表格行内操作按钮图标（编辑/复制/删除/测试等）：确认跟随按钮文字色；negative 按钮图标白色在红底上对比足够。
3. 导航/菜单/下拉/主题切换按钮图标：确认 hover/active 时图标随 currentColor 变化（导航图标 opacity 0.85 保留，hover 时提到 1）。
4. 走查中如发现个别图标颜色不协调（如 Popup 触发图标），定点修正。

**完成标准**：全站图标 normal/hover/active 三态颜色随主题令牌、无 SUI 默认灰/饱和色残留。
**验收**：浏览器逐页 hover 操作图标与导航图标双主题截图核验。

### 步骤 3：布局容器与间距统一

1. **Chat 页**（`theme/app-frame.css`，纯 CSS 不改 JSX）：`.chat-shell` 加 `max-width:1600px; margin:0 auto; padding:20px 24px 40px;`（与 dashboard-container 一致），640px 下 padding 12px；`.chat-shell-bar` 的 margin-top 相应归零（改由容器 padding 提供顶距）。
2. **TopUp 宽度对齐**（`pages/TopUp/topup.css`）：`.topup-page` 去掉 `max-width:960px`，padding/max-width 与 dashboard-container 完全一致（20px 24px 40px / 1600px / 移动 12px），使充值页与其余控制台页左右边缘对齐；hero/套餐卡内部布局不变（套餐网格三列在 1127px 内容宽下间距自然）。
3. **间距节奏核验**：走查各页卡片间距（Dashboard stat-row↔charts、Setting Tab↔表单、列表页卡片），明显不协调处在覆盖层统一微调（预期少量或零改动）。

**完成标准**：同一路由层级页面内容区左右边缘对齐；堆叠模块间距统一。
**验收**：浏览器 /topup、/chat、/dashboard、/token 等页同宽度截图叠放比对；390px 移动端 gutter 一致。

### 步骤 4：双主题系统走查 + 构建 + 文档

1. dev server 浏览器走查（暗/亮各一轮），按 Me2AI 三条线逐项核验：
   - 文字：label/导航/按钮/表头/标签/Toast/Popup 三态可读、对比清晰；
   - 图标：导航、按钮、表格操作区、空态、空表格图标三态；
   - 布局：11 个路由模块间距与宽度一致性、390px 移动端。
2. `npx react-scripts build` 生产构建（基线 gzip 297.87KB / CSS 105.63KB，预期增量 <2KB）。
3. 重建 Docker 镜像并切换容器（沿用 Task02 已验证流程），生产环境复验。
4. 回填 AI2AI 文档（Task03 实施记录状态、项目架构信息、sui-dual-theme 坑位如新增）。

## 4. 涉及文件

| 文件 | 改动 |
| :--- | :--- |
| `web/default/src/theme/tokens.css` | 两主题各补按钮三态令牌 `--btn-*-hover/active`、`--on-warning` |
| `web/default/src/theme/semantic-ui.css` | 按钮组/warning 按钮/active 态/分页 hover/按钮图标三态 |
| `web/default/src/theme/app-frame.css` | `.chat-shell` 容器化；导航图标 hover 微调 |
| `web/default/src/pages/TopUp/topup.css` | `.topup-page` 宽度/ padding 与全站容器对齐 |
| 其余文件 | **不动**（业务 JSX、后端、relay、数据库、协议零改动） |

## 5. 验收标准

1. 双主题下：label 文字、导航、按钮、图标在 normal/hover/active 三态颜色清晰协调，无 SUI 默认饱和色/白底/灰底残留。
2. 控制台各页面内容区左右边缘对齐；模块间距协调；移动端 gutter 一致。
3. 回退保障不破坏：移除 `html.theme-*` class 后恢复 SUI 原样。
4. 生产构建通过、gzip 增量 <2KB；浏览器走查无业务报错；镜像重建后生产环境复验 PASS。

## 6. 风险与边界

- **风险①**：按钮组选择器与 SUI 组规则同特异性（0,3,0）→ 依靠主题 CSS 在 SUI 之后加载保证覆盖（现有 primary 按钮已验证此机制有效）；若个别不生效再升级门控选择器。**（已验证：主题 CSS 后加载即可胜出，未用门控）**
- **风险②**：TopUp 拉宽后套餐三卡在超宽屏拉伸过疏 → 套餐网格已有 gap 与卡片 max-width 机制，走查时确认，必要时给套餐网格加 max-width（页面内部居中，不影响与其他页边缘对齐）。**（走查结论：1127px 内容宽下三卡均匀、不稀疏，未触发补救）**
- **边界**：不新增功能、不改交互逻辑、不动 berry/air 主题；发现的问题以"覆盖层能解决则不改 JSX"为原则。

---

## 7. 实施记录（2026-09-05 完成）

### 修改文件

| 文件 | 改动 |
| :--- | :--- |
| `theme/tokens.css` | 两主题各补 8 个按钮三态令牌：`--btn-success-hover/active`、`--btn-danger-hover/active`、`--btn-warning-bg/hover/active`、`--on-warning`（暗色琥珀底深字 `#1a1305`，亮色橙底白字） |
| `theme/semantic-ui.css` | ① 按钮组形态补齐：`.ui.{primary\|blue\|teal\|positive\|green\|olive\|negative\|red\|yellow\|orange}.buttons .button` 全部纳入主题色板（TokensTable 对话/充值绿·橄榄组不再是 SUI 饱和色）；② yellow/orange 按钮映射 warning 令牌（SystemSetting 关闭密码登录确认弹窗）；③ 所有按钮变体补 `:active` 按下态；④ 分页 item hover/focus 蓝边蓝字（active 自身 hover 不变）；⑤ `.ui.button .icon { opacity:1 }` 覆盖 SUI hover 发灰规则；⑥ 按钮 transition 补 color |
| `theme/app-frame.css` | ① `.chat-shell` 容器化：max-width 1600 / margin auto / padding 20·24·40（复刻 dashboard-container），`.chat-shell-bar` margin-top 归零，640px 下 12px padding；② 导航图标 hover/active 时 opacity 1（normal 0.85）+ transition |
| `pages/TopUp/topup.css` | `.topup-page` max-width 960px → 1600px，padding 与 dashboard-container 完全一致，充值页与全站页面左右边缘对齐 |

### 走查结果（dev 3007，root/123456，暗/亮双主题）

- 暗色：/token 彩色按钮组为柔和绿/青系、hover 变深、组内图标不发灰 ✅；翻页 hover 蓝边 ✅；默认按钮 hover 蓝边 ✅；系统设置关闭密码登录确认 Modal 琥珀按钮（深字清晰）✅；导航 hover 文字变亮、图标由微透变满、active 蓝+下划线 ✅；/chat 外壳 24px 边距对齐不贴边（经运营设置临时配置对话链接验证，验后恢复）✅；/topup 与 /token 等宽对齐 ✅；/log 表头灰字清晰无白底 ✅；控制台过滤 React dev 噪声后**无业务报错** ✅。
- 亮色：/chat 白底外壳边框正常 ✅；/token 按钮组协调不刺眼、hover 有反馈 ✅；/dashboard、/channel、/log、/topup 无白底白字穿帮、topup 等宽 ✅。
- 构建：Compiled successfully；JS gzip **297.87KB（零增量）**、CSS 106.17KB（+0.54KB 原始，gzip 增量远小于 2KB 预算）。
- **生产复验（http://localhost:3008，新镜像 3008:3000）**：容器日志 `server started`、`/api/status` 200、嵌入资源为 `main.fc458beb.css`；浏览器实测暗/亮双主题下 /token 按钮组柔和绿（rgb(16,185,129)）hover 变深图标不发灰、/topup 全宽 24px 边距对齐、亮色无穿帮，全部 PASS。
- **排障记录**：首次镜像构建失败，根因为 Docker 虚拟盘（C 盘 docker_data.vhdx 21GB）写满导致 buildkit 内 npm install 报 `EROFS read-only file system` 后守护进程崩溃（非代码问题）；处置：重启 Docker Desktop + `docker builder prune -af`（清 13GB 构建缓存）+ 清理主机 npm-cache/Temp（C 盘恢复 14GB 空余）后重建成功。
- 经验沉淀：彩色按钮组形态选择器、按钮三态/图标发灰、黄按钮深字、容器宽度统一、App 启动 status 覆盖 localStorage 等坑位已回写 `.trae/skills/sui-dual-theme/SKILL.md`。

### 遗留

1. 测试环境「运营设置→对话链接」走查后已清空恢复；`top_up_link` 仍未配置（套餐静态槽位维持置灰提示，待支付体系 Task）。
2. Token 页彩色按钮组在亮色主题下绿/青为品牌绿体系（与软底标签风格已协调）；如后续需要更柔和的绿色可再调令牌。

---

## 7.1 修复补充（2026-09-05 晚：用户反馈暗色 Tab/Header 黑色文字看不清）

### 根因
SUI Menu/Header 的高特异性变体写死黑白色，`.ui.menu .item`(0,2,0) / `.ui.header`(0,2,0) 的 `:where()` 覆盖压不住：
- `.ui.tabular.menu .item:hover`(0,3,1) → `rgba(0,0,0,0.87)` 黑
- `.ui.tabular.menu .active.item`(0,4,0) → `rgba(0,0,0,0.95)` 黑 + `background:#fff` 白
- `.ui.secondary.pointing.menu .item`(0,5,1) / `.active.item`(0,5,0) → 同黑色系（Setting 页 Tab 用这个）
- `.ui.header` 及其修饰变体写死 `rgba(0,0,0,0.87)` 黑

### 处置
**全部改用门控高特异性选择器**（`html.theme-dark/light .ui.xxx` 前缀把特异性拉到 (0,5+) 级）：
1. **Tabular Menu 全套三态门控**（`semantic-ui.css`）：`.item` / `:hover` / `.active.item` + `.bottom.tabular` + `.vertical.tabular`，用令牌 `--text-secondary` / `--text-primary` / `--brand-blue` / `--bg-surface`
2. **Secondary Menu 全套三态门控** + **Secondary Pointing Menu 全套三态门控**：Setting 页 Tab 专用，active 态给 `border-bottom:2px solid var(--brand-blue)` 替代 SUI 深黑下划线，普通态/hover 态用 text-secondary / text-primary
3. **Header 门控升级**：从 `:where()`(0,2,0) 升级为 `html.theme-dark .ui.header`(0,3,0)，覆盖 H1-H5 + dividing + basic + attached + top/bottom.attached
4. **`.item:hover` 三形态全覆盖**：`.item:hover` / `a.item:hover` / `.link.item:hover`（SUI React Tab 组件渲染为 `<a class="item">`）

### 修复后生产 computed（http://localhost:3008，main.1abcbe05.css，暗色主题）

| 元素 | 修复前 | 修复后 |
| :--- | :--- | :--- |
| `.ui.menu.settings-tab .active.item` color | `rgba(0,0,0,0.95)` 黑 | **`rgb(59,130,246)` 品牌蓝** |
| `.ui.menu.settings-tab .active.item` BG | `rgba(0,0,0,0)` 透明 | **`rgb(17,24,39)` 暗蓝灰** |
| `.ui.menu.settings-tab .item` normal | `rgba(0,0,0,0.87)` 黑 | **`rgb(209,213,219)` 浅灰（--text-secondary）** |
| `.ui.header` color | `rgba(0,0,0,0.87)` 黑 | **`rgb(249,250,251)` 白（--text-primary）** |
| 亮色 active Tab | `rgba(0,0,0,0.95)` 黑 | **`rgb(37,99,235)` 蓝** |
| 亮色 Header | `rgba(0,0,0,0.87)` 黑 | **`rgb(15,23,42)` 黑（亮色正确值）** |

hover 态 CSS 规则确认正确（`color:var(--text-primary)`，特异性 0,7,1 > SUI 0,5,1），JS dispatchEvent 无法触发 CSS `:hover` 伪类是浏览器限制；真实鼠标悬停会生效。

### 经验沉淀
已回写 `.trae/skills/sui-dual-theme/SKILL.md` 两条新坑：「SUI Menu 高特异性变体必须门控」和「SUI Header 必须门控」。

## 7.2 修复补充（2026-09-05 晚：仪表盘无数据态大片空白布局问题）

### 根因（用户截图反馈 /dashboard）
1. 底部"统计"卡（模型使用堆叠柱状图）固定 384px 高、内含 300px ResponsiveContainer；`models` 为空数组时 `<Bar>` 数量为 0，图表区整块"黑洞"无任何内容。
2. 三个趋势折线图卡 204px 高，`processTimeSeriesData()` 恒补零返回 7 天 X 轴，零值直线贴 X 轴，上方大面积留白。
3. 后端 `/api/user/dashboard` 无数据时返回 `{"data":null,...}`，前端已归一化为 `[]`，因此可用 `models.length===0` 判定。

### 处置（零后端/零 relay/零协议改动，默认主题 default）
- `pages/Dashboard/index.js`：
  - 引入 `components/EmptyState`；新增 `hasStats = models.length > 0` 与 `isSeriesEmpty(key)`（该维度 7 天全零判定）。
  - 底部统计卡：`hasStats` 为 false 时用 `<EmptyState icon='chart bar' .../>` 替换整个 300px 图表容器（标题头保留），卡高 384→331px 且内容居中。
  - 三个趋势图：保留图表骨架与 X 轴，全零维度在 `.chart-container` 内叠加 `.chart-empty-hint` 浮层（"近 7 天暂无数据"）；ResponsiveContainer 高度 120→140px。
- `pages/Dashboard/Dashboard.css`：`.chart-container` 加 `position:relative`；新增 `.chart-empty-hint`（绝对定位居中、`padding-bottom:30px` 避开 X 轴标签、`color:var(--text-tertiary)`、12px、`pointer-events:none`），均 `:where(html.theme-dark, html.theme-light)` 前缀。
- i18n：zh/en `translation.json` 的 `dashboard` 节新增 `empty.trend / empty.stats_title / empty.stats_desc` 三个键。

### 修复后生产 computed（http://localhost:3008，main.7e0b61e4.js）
- 暗色：空态标题 `rgb(209,213,219)`、描述/趋势提示 `rgb(156,163,175)`、图标底 `rgba(23,37,84,0.6)` 图标 `rgb(59,130,246)`、卡片 inset 底 `rgb(10,14,20)`；亮色对应 `rgb(51,65,85)`/`rgb(100,116,139)`/蓝调浅底。
- 有数据时 EmptyState 与浮层均不渲染（`models>0`、系列有值），图表行为不变。

### 经验沉淀
- 自动化浏览器对旧部署的 **Service Worker / 磁盘缓存极顽固**：即使 Ctrl+Shift+R + unregister SW，页面仍可能加载旧 hash（旧 `main.05d310a4.js` 被缓存，服务端对其返回 1KB SPA fallback）。可靠手法：地址栏访问带 cache-busting 查询串的 URL（如 `/dashboard?fresh=xxx`），并以 `document.querySelector('script[src*="/static/js/main."]').src` 读回实际加载的 hash 为准；验证代码是否入包可直接 `Invoke-WebRequest` 拉取主 bundle 字符串匹配特征类名/键名。
- 主题切换验证必须以 `document.documentElement.className` 读回为准（agent 常误判当前主题）；localStorage 写入后 agent 的模拟刷新可能不生效，直接点击主题切换按钮（React 状态即点即生效）最稳。
