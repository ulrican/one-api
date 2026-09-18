# Task3-3 页面布局优化（菜单/内容独立滚动 + Footer 永久可见 + 全宽 + 柱状图 hover）

> 来源：`.spec/Me2AI/任务清单.md` 阶段三 Task3-3（L84-95）
> 状态：**已完成并通过双主题浏览器走查验证（2026-09-06）**
> 约束：仅前端改造；双主题遵循 sui-dual-theme 规范（:where 前缀 + tokens 变量）；STANDALONE 全屏页不受影响；relay/ 零改动

## 1. 需求拆解

| # | 需求 | 方案 |
|---|---|---|
| 1a | 菜单栏与内容区是独立两部分，独立竖向滚动条 | `.app-frame` 改 `height:100vh; overflow:hidden`；`.app-shell` flex:1 + overflow:hidden；`.app-sidenav` height:100%（其 `.app-sidenav-scroll` 已 overflow-y:auto）；`.main-content` flex:1 + overflow-y:auto。菜单/内容各自独立滚动，互不干扰 |
| 1b | 当前底部页脚不管内容多少都需要向下滚动才能看到 | Footer 作为 `.app-frame` 第三段 flex 项（flex-shrink:0），永久钉在视口底，不再被内容挤出可视区。同时移除原 `.app-footer` 的 margin-top:32px（不再需要让 footer 让位内容） |
| 2 | 菜单项选中状态恒为聊天项，不随路由变化 | 原因：聊天项默认态用品牌渐变背景（恒高亮视觉），看起来永远是"选中态"。改为：默认态与常规菜单项视觉一致（透明底 + `--text-secondary` + `--brand-blue` 图标），仅命中路由时（`.app-sidenav-chat-active`）才切到品牌渐变 + 白字。所有菜单项的选中态变化规律统一 |
| 3a | 总览柱状图 hover 时柱子变"大灰色底柱子"，显示不佳 | recharts Tooltip 默认 `cursor` 在 BarChart 上渲染整列灰色 rect（`rgba(204,204,204,0.3)`）。给模型使用统计、模型维度调用分析两处 Bar 的 Tooltip 加 `cursor={false}` 禁用 cursor rect |
| 3b | 统计、模型维度调用分析模块之间没间距 | 这两个模块是 `.dashboard-container` 直接子级的两个 `.chart-card`，原本无 margin。补规则 `.dashboard-container > .chart-card { margin-bottom:16px }` + `:last-child { margin-bottom:0 }`（charts-grid 内的 chart-card 由 grid gap 接管，不受影响） |
| 4a | 菜单栏宽度 + 内容区域宽度 = 页面宽度，两边无空白 | 去掉 `.dashboard-container`/`.chat-shell`/`.topup-page` 的 `max-width:1600px`（改 `max-width:none`），`.main-content` 已是 flex:1 全宽；页面根容器单层 padding 即可 |
| 4b | 顶部导航栏 icon/菜单项/登录信息宽度 = 页面宽度 | `Header.js` 桌面端 Container 的 `maxWidth:'1600px'` 改 `'100%'`，让顶部导航也占满全宽 |
| 4c | 两边无滚动条 | 已通过 4a/4b + `.app-shell .main-content { overflow-x:hidden }` 保证不出现水平滚动条 |

## 2. 变更清单

| 文件 | 变更 |
|---|---|
| `theme/app-frame.css` | ① `.app-frame` 改 `height:100vh; overflow:hidden`；② `.app-header.ui.menu` flex-shrink:0；③ `.app-shell` 改 `flex:1 1 0; min-height:0; overflow:hidden; align-items:stretch`；④ `.app-shell .main-content.ui.container` 加 `overflow-y:auto; overflow-x:hidden`；⑤ `.dashboard-container`/`.chat-shell` max-width:none !important；⑥ `.app-footer` flex-shrink:0 + margin-top:0；⑦ `.app-sidenav` 改 `height:100%`（去 sticky/top/height:calc）；⑧ 聊天项默认态改为常规菜单项视觉（透明底 + 品牌色图标），新增 `.app-sidenav-chat-active` 选中态品牌渐变 |
| `pages/Dashboard/Dashboard.css` | 补 `.dashboard-container > .chart-card { margin-bottom:16px }` + `:last-child { margin-bottom:0 }` |
| `pages/Dashboard/index.js` | 两处 BarChart 的 Tooltip 加 `cursor={false}`（模型使用统计 / 模型维度调用分析） |
| `pages/TopUp/topup.css` | `.topup-page` max-width 由 1600px 改为 none；margin 由 0 auto 改为 0 |
| `pages/Pricing/pricing.css` | `.pricing-page` max-width 由 1100px 改为 none；padding 改 24px 24px 48px |
| `pages/Rankings/Rankings.css` | `.rankings-page` max-width 由 1100px 改为 none；padding 改 24px 24px 48px |
| `components/Header.js` | 桌面端 Container 的 `maxWidth:'1600px'` 改 `'100%'` |
| `index.js` | 不变（`.app-frame` 已存在） |

## 3. 关键 CSS 结构（Task3-3 改造后）

```css
/* 三段弹性骨架：Header 固定高 → shell 剩余高度（菜单/内容各自独立滚动）→ Footer 永久可见 */
.app-frame { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
.app-header.ui.menu { flex-shrink:0; }
.app-shell {
  flex:1 1 0; min-height:0; display:flex; align-items:stretch;
  width:100%; overflow:hidden; position:relative; z-index:1;
}
.app-shell .main-content.ui.container {
  flex:1; min-width:0; width:auto!important; max-width:none!important;
  margin:0!important; padding:0;
  overflow-y:auto; overflow-x:hidden;        /* 内容区独立竖向滚动 */
}
.app-footer.ui.segment.vertical { flex-shrink:0; margin-top:0; }

/* 侧栏占满 shell 高度，内部 .app-sidenav-scroll 独立竖向滚动 */
.app-sidenav {
  width:212px; flex-shrink:0; height:100%;
  display:flex; flex-direction:column;
  background:var(--bg-surface); border-right:1px solid var(--border-color);
  z-index:90; transition:width .2s ease;
}
.app-sidenav-scroll { flex:1; overflow-y:auto; padding:10px 8px 8px; }

/* 页面根容器去 max-width 限制（菜单 + 内容 = 页宽） */
.dashboard-container, .chat-shell { max-width:none!important; }

/* 聊天项：默认态与常规菜单项一致，避免"恒高亮"误以为选中态 */
.app-sidenav-chat {
  display:flex; align-items:center;
  margin:2px 0 12px; padding:10px 12px;
  border-radius:var(--radius-md);
  background:transparent; color:var(--text-secondary);
  font-size:14px; font-weight:500; text-decoration:none;
  transition:color .2s ease, background-color .2s ease;
}
.app-sidenav-chat:hover { color:var(--text-primary); background:var(--bg-hover); }
.app-sidenav-chat .icon { margin:0 8px 0 0!important; opacity:.85; color:var(--brand-blue); }
/* 选中态：品牌渐变 + 白字（特许硬编码 --on-primary，渐变上两主题统一） */
.app-sidenav-chat-active {
  background:var(--brand-gradient); color:var(--on-primary);
  font-weight:600; box-shadow:var(--glow-primary);
}
.app-sidenav-chat-active .icon { color:var(--on-primary); opacity:1; }
```

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| `height:100vh` 在移动端 iOS Safari 工具栏伸缩时视口抖动 | 项目内常规页非首屏全屏页（落地页/认证页走 STANDALONE 路径不套 app-frame）；移动端Header 走 isMobile 分支，且 100vh 在桌面端是用户主要场景，移动端可接受 |
| Footer 永久可见占去垂直空间，长内容页可用高度变小 | 用户明确要求"不管内容多少都需要向下滚动才能看到"是缺陷；常驻 Footer 是更符合预期的行为，且 footer 高度仅 ~70px |
| 去掉 max-width 后超宽屏（>2000px）页面元素横向拉伸过度 | 表格/卡片内部布局仍受 chart-card/stat-row grid 等子组件约束；超宽屏下卡片自然横向填满，与 new-api 等同类产品一致 |
| recharts Tooltip cursor=false 后用户失去"hover 哪一列"的视觉反馈 | Tooltip 弹层本身已足够指示当前 hover 项；且原 cursor 是灰色 rect 覆盖整列，视觉上反而干扰柱子本身的颜色辨识 |
| 聊天项去掉默认渐变后入口辨识度降低 | 保留 `--brand-blue` 图标色作为"特色入口"提示；选中态仍有渐变高亮；用户原诉求是"选中态要随路由变化"，不能让默认态抢镜 |

## 5. 验收清单

- [x] 桌面端 1440：菜单栏与内容区各自有独立竖向滚动条，互不干扰
- [x] 桌面端 1440：Footer 始终可见于视口底，无需滚动
- [x] 桌面端 1440：菜单栏宽度 + 内容区宽度 = 页面宽度，两侧无空白/水平滚动条
- [x] 桌面端 1440：顶部导航栏宽度 = 页面宽度
- [x] 菜单项选中态随路由变化：访问 /dashboard 时"总览"高亮（蓝字+bg-active），"聊天"恢复默认态；访问 /playground（或 /chat）时"聊天"切到品牌渐变，其他项恢复默认
- [x] 总览柱状图 hover：不再出现灰色大底柱子，Tooltip 正常显示
- [x] 总览页面"模型使用统计"与"模型维度调用分析"两个 chart-card 之间有 16px 间距
- [x] 暗/亮双主题：以上检查点两套主题均通过
- [x] 移动端（≤1000px）：侧栏自动隐藏，抽屉菜单正常；100vh 不影响抽屉滚动
- [x] `npx react-scripts build` 通过

## 6. 部署构建注意

| 问题 | 对策 |
|---|---|
| `.dockerignore` 未排除 `data/` 导致 Docker 构建上下文加载 `data/mysql/mysql.sock` 失败 | 确认 `.dockerignore` 含 `data` 行（已在前期修复） |
| `docker build --no-cache` 时 CRA5 `npm install` 报 peer dependency 冲突（typescript@4.9.5 vs react-scripts@5.0.1） | Dockerfile `npm install` 加 `--legacy-peer-deps` 标志 |
| Docker 构建缓存命中旧 COPY 层，npm build 产物不含最新 CSS（`.app-header.ui.menu .ui.container` 全宽规则丢失） | `--no-cache` 全量重建；并确保本地 `web/build/default/` 产物已更新（`npm run build` 脚本内 `mv -f build ../build/default`） |
| SQLite 旧卷 schema 与新 AutoMigrate 不兼容（`invalid DDL, unbalanced brackets`） | `docker volume rm one-api-data` 后重建容器，让 DB 重新初始化 |
