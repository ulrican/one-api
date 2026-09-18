# Task3-5：左侧菜单栏优化（分类区分与对齐）

> 来源：Me2AI/任务清单.md#L110-115。前置：Task3-1~3-4 已完成（侧栏骨架/收缩/独立滚动/选中态）。

## 需求与方案

| # | 需求 | 现状问题 | 方案 |
| :--- | :--- | :--- | :--- |
| 1 | 分类与菜单项默认显示效果区分 | 分组标题规则被基础项规则 (0,6,1) 静默覆盖（padding/margin/color 均未生效），标题与菜单项观感接近 | 分组标题门控 (0,7,1)：11px 大写字距 + `--text-tertiary` + 品牌蓝竖形装饰条（::before），与 14px 带图标的菜单项明显区分 |
| 2 | 所有菜单项图标左对齐、文字左对齐 | 菜单项图标被设 `width:auto`，不同图标字形宽度不一 → 各项文字起点参差 | 图标恢复 SUI 固定宽 `1.18em`（菜单项/聊天入口/收起按钮统一），文字起点一致 |
| 3 | 底部"收起菜单"高度与状态栏一致（32px） | `.app-sidenav-footer` padding 8px + 按钮 padding 9px，总高约 52px | footer 容器 `height:32px; padding:0`，按钮 `height:32px; padding:0 12px; border-radius:0; font-size:12px`，与内容区 Footer（32px/12px）对齐 |

## 改动文件

- `web/default/src/theme/app-frame.css`（仅样式，无结构/JS 改动）：
  - `.app-sidenav .ui.vertical.menu .item i.icon`：`width:auto` → `1.18em`
  - `.app-sidenav-chat .icon`、`.app-sidenav-toggle .icon`：补 `width:1.18em`
  - `.app-sidenav-group-title`：升级门控规则（含 `:first-child` 收敛首组上边距）+ `::before` 装饰条
  - `.app-sidenav-footer` / `.app-sidenav-toggle`：32px 化
- 收缩态不受影响：分组标题隐藏规则 (0,7,1)+!important 在文件中位置更靠后仍生效；按钮图标居中保持。

## 验收标准

1. 展开态：分类标题为小号大写灰字 + 蓝色装饰条，明显区别于菜单项。
2. 展开态：所有菜单项图标左缘一致、文字左缘一致（跨项对齐）。
3. 侧栏底部"收起菜单"条总高 32px（+1px 分隔线），与内容区状态栏高度一致。
4. 暗色/亮色两主题均正常；收缩态仅图标居中、无分组标题；构建通过。

## 实施记录（2026-09-08）

- 改动全部落在 `web/default/src/theme/app-frame.css`（无 JS/结构改动）：
  - 菜单图标恢复 SUI 固定宽 `1.18em`（菜单项/聊天入口/收起按钮三处统一）→ 文字左缘跨项一致。
  - `.app-sidenav-footer` 改 `height:32px; padding:0`；`.app-sidenav-toggle` 改 `height:32px; padding:0 12px; border-radius:0; font-size:12px`。
  - 分组标题升级为门控 (0,7,1)：11px/700/大写字距 0.08em/`--text-tertiary`/`padding:14px 12px 6px`/首组 `:first-child` 收敛。
  - 分组标题前加 `::before` 装饰条（3px×10px 品牌蓝、圆角 2px、opacity .75），作为首个 flex 子元素与文字以 7px gap 排列。
- **装饰条踩坑（SUI 伪元素三重冲突）**：① `.ui.vertical.menu .item:first-child:before{display:none!important}` (0,5,1)：首个分组标题正是菜单首子元素，装饰条被隐藏；② `.ui.vertical.menu .item:before{position:absolute;top:0;left:0;width:100%;height:1px}` (0,4,1)：分隔线伪元素绝对定位脱离 flex 流；③ SideNav 的 `<Menu borderless>` 命中 `.ui.borderless.menu .item:before{background:0 0!important}` (0,4,1 + **!important**)，普通声明无论特异性多高都被压成透明背景。修复：装饰条规则 (0,7,2) 显式 `position:static!important; display:block!important; background:var(--brand-blue)!important; top:auto; left:auto`。
- 部署：本地 `npx react-scripts build` → 产物同步 `web/build/default`（最终 CSS `main.decb4d3f.css`，JS 不变 `main.e63fe4dd.js`）→ `docker build` → 换新容器（每次换容器均复现 "invalid DDL, unbalanced brackets" 迁移 FATAL，需删卷 one-api-data 首启；该 bug 与前端无关，后端重启即触发，属待修独立问题）。服务 http://localhost:3008 。
- 验证（2026-09-08，浏览器实测，暗/亮双主题）：4 个分组装饰条背景 rgb(59,130,246)/rgb(37,99,235)、display block、position static、3×10px；菜单项图标 left 全为 20、文字 left 全为 45（跨项对齐）；`.app-sidenav-footer`/`.app-sidenav-toggle`/`.app-footer` 高度均 32px；截图确认装饰条与分组标题视觉区分明显。
