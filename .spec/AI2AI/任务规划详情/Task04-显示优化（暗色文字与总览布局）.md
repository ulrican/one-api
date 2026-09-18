# Task04：显示优化（暗色导航/卡片黑字 + 总览布局对齐）

> 来源：Me2AI/任务清单.md Task04（2026-09-05）。状态：**已完成上线**。

## 1. 需求理解（来自 Me2AI）

1. 暗色主题顶部导航栏文字颜色要与主题匹配，清晰、协调。
2. 暗色主题下页面各卡片文字仍存在黑色，要与主题匹配。
3. 总览页（/dashboard）三行卡片显示宽度不一致，调整为一致。
4. 总览页第二行（趋势图）与第三行（统计卡）之间没有间距，要添加间距。

约束同 Task02/03：`relay/`/后端/数据库/协议零改动；自定义类用 `:where(html.theme-dark, html.theme-light)` 前缀；压 SUI 高特异性变体用 `html.theme-*` 门控。

## 2. 勘察结论（实测根因）

### 2.1 总览布局（问题 3、4）——同一元凶

生产实测（暗色，视口 ≤1366px 媒体查询生效）：

| 元素 | 实测 |
| :--- | :--- |
| `.stat-row`（第一行） | W=1165，L=48，margin `0 0 16px` |
| `.charts-grid`（第二行） | W=1179，L=41，**margin `0 -7px`** |
| `.chart-card`（第三行） | W=1165，L=48 |
| 行 1→2 间距 | 16px |
| 行 2→3 间距 | **0px（贴合）** |

根因：`src/index.css` 残留旧 SUI-Grid 版 Dashboard 的媒体查询（≤1366px）：

```css
.charts-grid { margin: 0 -0.5em !important; }   /* 负边距：左右各 -7px → 宽 14px、左移 */
.charts-grid .column { padding: 0.5em !important; }
.chart-card { margin: 0 !important; }
.ui.header { font-size: 1.1em !important; }
.stat-value { font-size: 0.9em !important; }
```

- `margin` shorthand + `!important` 同时把 Dashboard.css 的 `margin-bottom:16px` 重置为 0 → 二、三行零间距；
- 左右 `-0.5em` 负边距 → 第二行比一、三行宽 14px 且左移 7px；
- `.charts-grid .column` / `.stat-value` 是旧版类名，新版（CSS grid + `.stat-number`）已不存在，纯死规则。

### 2.2 卡片黑字（问题 2）——SUI Card 标题变体漏覆盖

暗色实测深色文字（r/g/b ≤100）：

| 位置 | 实测颜色 | 根因 |
| :--- | :--- | :--- |
| 各列表页卡片标题（令牌管理/操作日志/系统设置/渠道/兑换/用户/关于…） | `rgba(0,0,0,0.85)` | `<Card.Header className='header'>` 渲染为 `.ui.card > .content > .header`（**div.header 不带 `.ui`**），SUI card.css 写死 0.85、特异性 (0,4,0)；既有 `.ui.header` 门控不匹配 |
| /log 页 `<h3 class='ui header'>`“使用明细…” | `rgba(0,0,0,0.85)` | h3 在 card content 内，被 SUI `.ui.card > .content > .header`（class 选择器命中 class~=header）(0,4,0) 压过 `html.theme-dark h3.ui.header` (0,3,1) |
| /topup “在线支付即将上线”按钮 | `rgba(0,0,0,0.6)` | SUI `.ui.basic.disabled.button` 带 `!important` 写死 0.6；`:where()` 版 (0,3,0) 压不住 |

### 2.3 导航栏（问题 1）——导航项本身正常，Portal 下拉菜单穿帮

- 顶部导航菜单项实测：normal `rgb(209,213,219)`、active `rgb(59,130,246)`、header 底 `rgba(11,15,23,0.8)`，**均正常**（Task02/03 已覆盖 `.app-header .item`）。
- 漏点：右上角**语言/用户名下拉的弹层菜单**（Portal 挂 body）：菜单项“中文/English/注销”实测 `rgba(0,0,0,0.95/0.87)` 黑字、hover 底 `rgba(0,0,0,0.05)`（菜单白底）。根因：`:where()` 版 `.ui.dropdown .menu > .item` 与 SUI 同为 (0,4,0)，主题 CSS 先于 semantic.min.css 加载时被压。

## 3. 实施方案与改动文件

| 文件 | 改动 |
| :--- | :--- |
| `src/index.css` | 删除旧 Dashboard 网格残留媒体查询中的 `.charts-grid` / `.charts-grid .column` / `.chart-card` / `.stat-value` 四条死规则（保留 `.ui.header{font-size:1.1em}` 现状字号，加注释说明） |
| `src/theme/semantic-ui.css` | ① Dropdown 弹层（menu 容器/item/hover/selected/header/divider）全部由 `:where()` 升级为 `html.theme-dark/light` 门控（(0,5,0)+ 压 SUI (0,4,0)）；② 新增 Card 标题门控 `.ui.card > .content > .header` / `.ui.cards` 版 (0,5,0)/(0,6,0) + `.ui.card .meta` 门控；③ 新增 basic 禁用按钮门控（!important，`--text-disabled`） |
| 无 JS/JSX 改动 | 纯 CSS 修复，零业务逻辑改动 |

## 4. 验收标准

1. /dashboard 三行卡片左右边缘对齐（宽度一致、同 left），第二、三行间距 16px。
2. 暗色下各列表页卡片标题（Card.Header）为浅色（--text-primary），无 0.85 黑字；/log h3 标题同步修复。
3. 暗色下导航栏语言/用户名下拉弹层：菜单深色底（--bg-elevated）、item 浅色文字、hover/selected 态正常。
4. 暗色下 /topup 禁用按钮文字为 --text-disabled，可读不刺眼。
5. 亮色主题无回归（门控同时给亮色变量，外观与原 SUI 一致）。
6. `npx react-scripts build` 通过；镜像重建后生产复验。

## 5. 实施记录（2026-09-05 完成）

### 修改文件
| 文件 | 改动 |
| :--- | :--- |
| `src/index.css` | 删除旧 Dashboard SUI-Grid 残留媒体查询（`.charts-grid` 负 margin !important 等 4 条死规则） |
| `src/theme/semantic-ui.css` | ① Dropdown 弹层全套门控（含 `.ui.menu .ui.dropdown` 导航内高特异性变体，item/hover/selected **必须 !important**——SUI 该变体自带 `color:#000000de!important`）；② Card 标题门控 `.ui.card > .content > .header`（0.85 黑字）+ `.ui.card .meta`；③ basic 禁用按钮门控（!important）；④ **无色 basic label 门控**（`<Label basic>` 无 color 变体，SUI (0,3,0)!important 白底黑字，用户管理表额度/已用/请求数/状态 4 处） |

### 走查结果（生产 http://localhost:3008，root/123456）
- **布局**（main.0dc03ab0+，暗色）：三行卡片 W=1165/L=48 完全一致；GAP_1_2=16、GAP_2_3=16。
- **导航下拉弹层**：菜单底 `rgb(22,31,46)`（--bg-elevated）；当前语言项"中文" `rgb(59,130,246)` + 软蓝底 `rgba(59,130,246,0.12)`；"English"/"注销" `rgb(209,213,219)`。
- **暗色黑字全站扫描**（r/g/b≤100 且非透明，聚合去重）：/token 0 组、/log 1（brand-name 渐变字误报）、/channel 1（同）、/redemption 1（同）、/setting 1（同）、/about 1（同）、/topup 2（brand-name + hero-number 均透明渐变字，误报）、/user 修复后仅余黄色"降级"按钮 `rgb(26,19,5)`——琥珀底（#FBBF24）深棕字为 Task02 既定设计（--on-warning，白字对比不足），非穿帮。
- 卡片标题（Card.Header）全站暗色复测为 --text-primary 浅色；/log h3"使用明细"同步修复。
- **亮色回归**（main.22475725.css，theme-light）：/user 无色 label `rgb(51,65,85)` 深灰字 + `rgb(241,245,249)` 浅灰底 + `rgb(226,232,240)` 边框；卡片标题 `rgb(15,23,42)`；下拉项 `rgb(51,65,85)` + 菜单白底 `rgb(255,255,255)`；/dashboard 白字扫描 0 组（无白底白字）。

### 经验沉淀
- **SUI Card 标题是独立黑字根因**：`<Card.Header>` 渲染 `.content > .header`（class 仅 `header`，无 `ui`），SUI card.css 写死 `rgba(0,0,0,0.85)`、(0,4,0)；且 card 内任何 class 含 `header` 的元素（如 `<h3 class='ui header'>`）都会被该选择器命中，优先级高于 `.ui.header` 门控。门控清单需包含 `.ui.card > .content > .header` 与 `.ui.cards > .card > .content > .header` 两种形态。
- **!important 判定不能只看选择器名**：导航内下拉项 SUI 规则 `.ui.menu .ui.dropdown .menu>.item{color:#000000de!important}` 同时具备高特异性 (0,6,0) 与 !important；无 !important 的门控特异性再高也输。排查"门控写了却不生效"时，先 curl 拉取 semantic.min.css / 构建产物中该类名的实际规则文本，确认是否带 !important。
- **SUI 无色变体与彩色变体要分开门控**：`.ui.basic.label`（无 color）与 `.ui.basic.{color}.label` 是两条 SUI 规则，彩色变体门控不覆盖无色变体；扫描黑字时 `<Label basic>` 不传 color 的用法（UsersTable 额度/统计列）容易漏。
- **旧版 CSS 残留是布局暗雷**：index.css 中 SUI-Grid 时代 `.charts-grid{margin:0 -0.5em!important}` 跨版本命中新类名，同时造成宽度偏移（负 margin）与间距消失（shorthand 重置 margin-bottom）；改版后应同步清理同名旧规则。
- **浏览器黑字扫描脚本要点**：需排除 `color:rgba(0,0,0,0)` 透明（渐变文字误报）、按 className+color 聚合去重后再看明细，否则单页近百行输出无法定位。
