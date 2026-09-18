# Task3-4 页面布局优化（Footer 32px 仅占内容区 + 聊天菜单常驻 + 首页回顶 + 内容间距收紧 + 侧栏选中态 + 首页页脚）

> 来源：`.spec/Me2AI/任务清单.md` 阶段三 Task3-4（L97-108）
> 状态：**已完成并通过双主题浏览器走查验证（2026-09-07）**
> 约束：仅前端改造；双主题遵循 sui-dual-theme 规范（:where 前缀 + tokens 变量）；relay/ 零改动；STANDALONE 全屏页不受影响

## 1. 需求拆解

| # | 需求 | 方案 |
|---|---|---|
| 1a | 底部状态栏高度 56px → 32px | `.app-footer` 改 `min-height:32px; display:flex; align-items:center; padding:0 16px; font-size:12px`，内部 `.custom-footer` 12px/1.4，flex 垂直居中，整体固定 32px |
| 1b | 底部状态栏不跨「菜单栏+内容区」，只占满内容区 | `index.js` 布局重构：Footer 从 `.app-frame` 底部移入 `.app-shell` 内新增的 `.app-main-col` 弹性列（侧栏右侧），与 `.main-content` 同列；Footer 只占内容区宽度，侧栏底部不再有页脚 |
| 2 | 控制台侧栏缺少聊天菜单 | 根因：`getChatItem()` 在 `playground_enabled!=='true'` 且无 `chat_link` 时返回 null，侧栏不渲染聊天项。改为：默认/开启 Playground 均指向内置 `/playground`，仅当未开 Playground 但配置了外部 `chat_link` 时走 `/chat` iframe——聊天入口常驻侧栏顶部 |
| 3 | 首页顶部导航点「首页」应显示页面最顶部，不需向下滚动 | 落地页 `.tl-nav` 的「首页」原为 `<a href='#hero'>`，但导航是 sticky（占流），锚点跳转把 hero 顶到视口 0、被 64px sticky 导航遮住。改为 onClick `window.scrollTo({top:0, behavior:'smooth'})`；同时给 `section[id]` 加 `scroll-margin-top:76px` + `html{scroll-behavior:smooth}`，修复 #models/#developer 锚点被导航遮挡 |
| 4 | 内容区与顶部导航/左侧菜单/底部栏/右侧滚动条间距太大，空白多 | 页面根容器 padding 统一由 `20px 24px 40px` / `24px 24px 48px` 收紧为 `12px 16px 16px`：`.dashboard-container`、`.chat-shell`、`.topup-page`、`.pricing-page`、`.rankings-page` |
| 5 | 左侧菜单栏菜单项点击后没有选中效果 | 根因（CSS 特异性倒挂）：Task3-1 为压 SUI 把基础项规则门控到 `html.theme-* .app-sidenav .ui.vertical.menu .item`（**(0,6,1)**，设 color/background），而 hover 规则 `html.theme-* .app-sidenav a.item:hover` 仅 (0,4,2)、active 规则 `html.theme-* .app-sidenav .item.app-sidenav-active` 仅 (0,5,1)，**均弱于基础规则** → hover 底色与 active 选中色被基础规则的 `color:--text-secondary; background:transparent` 覆盖，点击无选中效果。修复：hover/active/icon 规则统一补上 `.ui.vertical.menu` 路径并显式门控（hover (0,7,2)、active (0,7,1)、active:hover 并列防 hover 盖选中），active 增 `font-weight:600`，选中项图标显式 `color:var(--brand-blue)` |
| 6 | 首页（落地页）底部状态栏高度优化为 32px | 落地页为 STANDALONE 自有页脚 `.tl-footer`（原 `padding:32px 24px`，实际高约 81px）。改 `min-height:32px; display:flex; align-items:center; justify-content:center; padding:0 24px`，内部 `<p>` 去 margin，与控制台状态栏等高 |

## 2. 变更清单

| 文件 | 变更 |
|---|---|
| `src/index.js` | AppLayout 常规页结构重构：`.app-shell` 内侧栏右侧新增 `.app-main-col` 弹性列，包裹 `<Container.main-content>` + `<Footer/>`；Footer 从 `.app-frame` 层移入内容列 |
| `src/theme/app-frame.css` | ① 新增 `.app-main-col`（flex:1; column; overflow:hidden）；② `.main-content` 改 `flex:1 1 0; min-height:0`（内容列内弹性滚动区）；③ `.app-footer` 重写为 32px 高 flex 居中条（min-height:32px / padding:0 16px / font-size:12px / 透明底 + 顶部分隔线），新增 `.app-footer .ui.container{width:100%!important…}`、`.custom-footer` 12px；④ 删除重复的旧 `.app-footer{flex-shrink:0;margin-top:0}` 规则；⑤ `.dashboard-container` / `.chat-shell` padding 收紧为 `12px 16px 16px`；⑥ **侧栏 hover/active 规则补 `.ui.vertical.menu` 路径修复特异性倒挂**（hover (0,7,2)/active (0,7,1)），active 加 font-weight:600 + 图标品牌蓝 |
| `src/components/navConfig.js` | `getChatItem()` 兜底返回 `/playground`，聊天入口常驻（仅「未开 Playground + 有 chat_link」走 `/chat`） |
| `src/pages/Landing/index.js` | 「首页」导航项改为 preventDefault + `window.scrollTo top:0 smooth` |
| `src/pages/Landing/landing.css` | ① 新增 `html{scroll-behavior:smooth}` + `.tech-landing section[id]{scroll-margin-top:76px}`；② `.tl-footer` 改 32px 高 flex 居中条（`min-height:32px; padding:0 24px`，`<p>` 去 margin） |
| `src/pages/TopUp/topup.css` | `.topup-page` padding → `12px 16px 16px` |
| `src/pages/Pricing/pricing.css` | `.pricing-page` padding → `12px 16px 16px` |
| `src/pages/Rankings/Rankings.css` | `.rankings-page` padding → `12px 16px 16px` |

## 3. 关键结构（Task3-4 改造后）

```css
/* app-frame 三段：Header / shell / （Footer 不再在 frame 层） */
.app-frame { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
.app-shell { flex:1 1 0; min-height:0; display:flex; align-items:stretch; overflow:hidden; }
.app-sidenav { width:212px; flex-shrink:0; height:100%; }            /* 侧栏独立，全高 */
.app-main-col { flex:1 1 0; min-width:0; min-height:0;              /* 新增内容列 */
                display:flex; flex-direction:column; overflow:hidden; }
  .main-content.ui.container { flex:1 1 0; min-height:0; overflow-y:auto; }  /* 内容独立滚动 */
  .app-footer.ui.segment.vertical { flex-shrink:0; min-height:32px;
                display:flex; align-items:center; padding:0 16px;
                border-top:1px solid var(--border-color); font-size:12px; }  /* 钉列底，仅内容宽 */
```

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| Footer 移入内容列后，侧栏底部与内容列底部视觉不齐 | 侧栏 `bg-surface` + 右边框全高，内容列 Footer 透明底 + 顶部分隔线，两者由侧栏右边框自然分界，符合"状态栏只占内容区"诉求 |
| Footer 32px 过高/过矮文字挤压 | flex `align-items:center` + min-height:32px，12px/1.4 文字约 17px，垂直居中留白合理；`.custom-footer` 由 index.css 的 1.1em 显式压回 12px |
| 聊天菜单常驻后，未开 Playground 的环境点进去无功能 | `/playground` 为内置对话页，仅需登录（PrivateRoute）+ 有效令牌/模型；控制台用户本就具备，符合预期 |
| `scroll-behavior:smooth` 影响全站锚点 | 仅作用于 html 平滑滚动，落地页锚点体验更自然；控制台内无锚点跳转，不受影响 |
| 内容 padding 收紧后卡片贴边 | 左右保留 16px、顶 12px、底 16px，卡片不贴边；移动端媒体查询原有更紧 padding（12px 8px/12px）保持不变 |

## 5. 验收清单

- [x] 底部状态栏高度 32px（DevTools 量测 .app-footer offsetHeight ≈ 32）
- [x] 底部状态栏只占内容区宽度，左侧菜单栏底部无页脚横跨
- [x] 任意页面内容超出时，Footer 始终钉在内容列底部可见，不随内容滚动
- [x] 控制台侧栏顶部「聊天」菜单常驻（默认配置/未开 Playground 也显示），点击进 /playground
- [x] 首页（落地页）下滑后点「首页」平滑回到页面最顶部，hero 完整可见
- [x] 落地页「模型矩阵/开发者接入」锚点定位不被 64px sticky 导航遮挡
- [x] 内容区与顶部导航/侧栏/页脚间距收紧，无大片空白；菜单宽+内容宽=页宽
- [x] 暗/亮双主题：以上检查点两套主题均通过
- [x] 移动端（≤1000px）：侧栏抽屉、Footer、内容间距正常
- [x] `npm run build`（Docker stage1）通过
