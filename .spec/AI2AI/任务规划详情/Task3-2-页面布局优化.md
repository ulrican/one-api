# Task3-2 页面布局优化（全高固定侧栏 + 展开/收缩 + 菜单顺序 + 高度/间距）

> 来源：`.spec/Me2AI/任务清单.md` 阶段三 Task3-2（L70-82）
> 状态：**已完成并通过双主题浏览器走查验证（2026-09-06）**
> 约束：仅前端改造；双主题遵循 sui-dual-theme 规范（:where 前缀 + tokens 变量，SUI 高特异性变体门控）；STANDALONE 全屏页不受影响；relay/ 零改动

## 1. 需求拆解

| # | 需求 | 方案 |
|---|---|---|
| 1 | 页面最小高度 = 浏览器窗口高度，避免内容被遮挡/底部空白 | 常规页包 `.app-frame`（flex column, min-height:100vh），`.app-shell` flex:1 → sticky footer，内容不足一屏时 Footer 贴视口底 |
| 2a | 左侧菜单栏固定在左侧所有区域（传统规范） | 侧栏从 Header 下方延伸至视口底部：`position:sticky; top:56px; height:calc(100vh-56px)`，栏面 `--bg-surface` + 右边框分隔，去掉 Task3-1 的浮动圆角卡片形态 |
| 2b | 菜单项左图标右文字 | 保持 Task3-1 修复后的 flex 布局（icon float:none, margin-right:8px） |
| 2c | 侧栏可展开/收缩：展开显全部，收缩只显图标 | 底部 toggle 按钮（«/»），状态持久化 localStorage `app_sidenav_collapsed`；收缩态 width 64px，隐藏分组标题与文字 label，菜单项图标居中，原生 title 提示；width 0.2s 过渡 |
| 3 | 内容区与顶部导航间距太大（当前 shell padding-top 20 + 页面容器 20 = 40px，且左右双层 padding 24+24=48px） | `.app-shell` 去 padding/max-width（改 flex:1 全宽），`.main-content` padding:0；间距由页面根容器单层控制（dashboard-container 等 20px 24px） |
| 4a | 聊天为独立模块置顶 | 侧栏顶部独立品牌色入口 `.app-sidenav-chat`（playground_enabled→/playground；否则 chat_link→/chat；都无则隐藏），不属于任何分组 |
| 4b | 总览/令牌/日志属常规模块，在聊天下方 | 分组重组：常规[总览/令牌/日志] → 资源[充值/价格/排行榜] → 账户[设置/关于] → 管理[渠道/兑换/用户，仅管理员] |

## 2. 变更清单

| 文件 | 变更 |
|---|---|
| `components/navConfig.js` | 重组：导出 `getChatItem()`（独立聊天项，条件同原逻辑）；`getNavGroups()` 改为 常规(general)/资源(resource)/账户(account)/管理(admin) 四组，聊天项从功能组移除 |
| `components/SideNav.js` | 重写：collapsed 状态（localStorage 持久化）；顶部聊天独立项；菜单滚动区 `.app-sidenav-scroll`（flex:1 overflow-y:auto）；底部 `.app-sidenav-footer` 收缩按钮；菜单项文字包 `<span className='app-sidenav-label'>`；收缩态 class `app-sidenav-collapsed`；菜单项加 `title` 属性 |
| `components/Header.js` | 移动端抽屉同步：顶部渲染聊天独立项 + 分组菜单（顺序由 navConfig 驱动，自动一致） |
| `index.js` | 常规页包 `<div className='app-frame'>`（Header + app-shell + Footer） |
| `theme/app-frame.css` | ① `.app-frame` flex column min-height:100vh；② `.app-shell` flex:1、去 padding/max-width；③ `.app-sidenav` 全高固定栏（sticky+height calc、表面色+右边框、去圆角卡片）；④ 收缩态样式；⑤ 聊天项品牌渐变样式；⑥ toggle 按钮样式；⑦ main-content padding:0 |
| `locales/zh|en/translation.json` | `sidenav.group.overview/usage` → `general`（常规/General）；新增 `sidenav.collapse`（收起/Collapse）、`sidenav.expand`（展开/Expand） |

## 3. 关键 CSS 结构

```css
.app-frame { display:flex; flex-direction:column; min-height:100vh; }
.app-shell { flex:1 0 auto; display:flex; align-items:flex-start; width:100%; position:relative; z-index:1; }
.app-shell .main-content.ui.container { flex:1; min-width:0; width:auto!important; max-width:none!important; margin:0!important; padding:0; }

.app-sidenav {
  width:212px; flex-shrink:0; align-self:flex-start;
  position:sticky; top:56px; height:calc(100vh - 56px);
  display:flex; flex-direction:column;
  background:var(--bg-surface); border-right:1px solid var(--border-color);
  z-index:90; transition:width .2s ease;
}
.app-sidenav-scroll { flex:1; overflow-y:auto; padding:8px 8px 0; }
.app-sidenav-footer { border-top:1px solid var(--border-color); padding:8px; }
.app-sidenav-collapsed { width:64px; }
.app-sidenav-collapsed .app-sidenav-label,
.app-sidenav-collapsed .app-sidenav-group-title { display:none; }
.app-sidenav-collapsed .item { justify-content:center; padding:10px 0!important; }
@media (max-width:1000px) { .app-sidenav { display:none; } }
```

- 菜单项/item 规则沿用 Task3-1 门控选择器 `html.theme-* .app-sidenav .ui.vertical.menu .item`（(0,6,1)，压 SUI vertical menu）。
- 聊天项 `.app-sidenav-chat`：`background:var(--brand-gradient); color:#fff`（渐变上白字两主题统一，特许硬编码白字加注释）；收缩态变 40px 圆形图标按钮。
- toggle 按钮：全宽 ghost 风格（hover --bg-hover），图标 «（展开态点击收起）/ »（收缩态点击展开）。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| sticky + flex 拉伸冲突导致侧栏不全高 | aside 用 `align-self:flex-start` + 显式 `height:calc(100vh-56px)`，不依赖 stretch |
| 内容超长时侧栏内部菜单滚动 | `.app-sidenav-scroll` overflow-y:auto；Footer 区固定不滚 |
| 收缩态 SUI Menu item 文字仍占位 | label span 包裹 + 收缩态 display:none；item justify-content:center |
| 双层 padding 去除后个别页面贴边 | 已确认全部常规页根容器自带 padding（dashboard-container/topup-page/chat-shell 20·24·40；pricing/rankings-page 24·16·48；编辑页均 dashboard-container） |
| 移动端抽屉菜单顺序/聊天项遗漏 | 抽屉与 SideNav 共用 navConfig，聊天项抽屉顶部同样渲染 |
| 缓存导致走查旧版 | 走查 URL 带 cache-busting query，读 `script[src*=main.]` hash 确认新版 |

## 5. 验收标准

1. 桌面宽屏：侧栏从顶部导航下沿一直延伸到视口底部（全高），表面色与内容区以右边框分隔，无浮动卡片圆角。
2. 展开/收缩：点击侧栏底部按钮，宽度 212↔64 平滑过渡；收缩态仅图标居中、分组标题/文字隐藏、hover 有 title 提示；刷新后状态保持。
3. 菜单项为左图标右文字；聊天为独立品牌色入口在最顶部；其下依次 常规（总览/令牌/日志）/资源/账户/管理。
4. 普通用户无管理组；管理员有。
5. 内容不足一屏时 Footer 贴视口底部（无大片空白）；内容区与 Header 间距约 20px（不再 40px）。
6. ≤1000px 侧栏隐藏，汉堡抽屉含聊天项+全分组；双主题无穿帮。
7. STANDALONE 页（/、/login 等）布局不变。

## 6. 实施结果（2026-09-06 交付）

### 6.1 变更清单（全部前端，relay/ 零改动）

| 文件 | 变更 |
|---|---|
| `components/navConfig.js` | 新增 `getChatItem()`（独立聊天项：playground_enabled→/playground，否则 chat_link→/chat，都无→null）；`getNavGroups()` 重组为 常规[总览/令牌/日志]/资源[充值/价格/排行榜]/账户[设置/关于]/管理[渠道/兑换/用户] |
| `components/SideNav.js` | 重写：`aside.app-sidenav` 全高固定栏；顶部 `.app-sidenav-chat` 品牌渐变独立入口；`.app-sidenav-scroll`（flex:1 overflow-y:auto）菜单区；`.app-sidenav-footer` 收缩按钮（«/»）；collapsed 状态持久化 localStorage `app_sidenav_collapsed`；菜单项文字包 `.app-sidenav-label`，收缩态隐藏；菜单项带原生 `title` 提示 |
| `components/Header.js` | 移动端抽屉同步：聊天项置顶 + 新分组顺序（共用 navConfig） |
| `index.js` | 常规页包 `.app-frame`（flex column min-height:100vh 的 sticky-footer 骨架） |
| `theme/app-frame.css` | `.app-frame`/`.app-shell`（flex:1，去 padding/max-width，消除双层 padding）；`.app-sidenav` 全高栏（sticky top:56、height calc(100vh-56px)、--bg-surface + 右边框，去浮动卡片）；聊天项渐变样式（--brand-gradient + --on-primary + --glow-primary）；toggle 按钮；收缩态 64px（label/分组标题隐藏、图标居中、聊天项变 40px 圆角方块）；width 0.2s 过渡 |
| `locales/zh|en/translation.json` | `sidenav.group.overview/usage` → `general`（常规/General）；新增 `sidenav.collapse/expand` |

### 6.2 踩坑记录

1. **收缩态分组标题不隐藏**：分组标题是 `<span class="item app-sidenav-group-title">`，本身也是 `.item`，命中门控 flex 规则 `html.theme-* .app-sidenav .ui.vertical.menu .item`（(0,6,1) 的 display:flex）；收缩隐藏规则 `:where() .app-sidenav-collapsed .app-sidenav-group-title`（(0,2,0) display:none）压不过。修复：门控 `html.theme-* .app-sidenav-collapsed .ui.vertical.menu .item.app-sidenav-group-title`（(0,7,1)）+ `display:none !important`。菜单项文字 label 是普通 span（非 .item），(0,2,0) 即可隐藏。
2. **双层 padding**：Task3-1 的 `.app-shell`（max-1600 + padding 24）与页面根容器 `.dashboard-container`（max-1600 + padding 24）叠加，导致内容左右 48px 边距、顶部 40px 间距。Task3-2 shell 去 padding/max-width 改 flex:1 全宽，间距由页面容器单层控制（顶部 20px）。已确认全部常规页根容器自带 padding（dashboard-container/topup-page/chat-shell 20·24·40；pricing/rankings-page 24·16·48；5 个编辑页均 dashboard-container）。
3. **sticky + flex 拉伸冲突**：aside 需 `align-self:flex-start` + 显式 `height:calc(100vh - 56px)`，不能依赖 flex stretch（否则高度被拉成 shell 全高，sticky 失效）。

### 6.3 验证记录

- 走查 PASS：新版元素（app-frame/sidenav/toggle/chat）✓；菜单顺序（聊天置顶渐变块 → 常规[总览/令牌/日志] → 资源 → 账户 → 管理）✓；收缩 212→64px（collapsed class、label/分组标题 display:none、localStorage 持久化、title 提示）✓；展开恢复 ✓；/about 短内容 footerTop=750 ≤ winH=819（sticky footer 无空白）✓；内容区与 header 间距 20px ✓；普通用户 testui 侧栏 groups=[常规,资源,账户] 无管理组、聊天项在 ✓；暗/亮双主题展开+收缩四形态截图无穿帮 ✓；≤1000px 视口侧栏 display:none 走汉堡抽屉（响应式保留）✓；STANDALONE 页不受影响 ✓。
- 部署：镜像 one-api-custom:latest（前端 main.c5199b15.css），容器 3008→3000，`/api/status` OK；测试账号 testui 已删除。
