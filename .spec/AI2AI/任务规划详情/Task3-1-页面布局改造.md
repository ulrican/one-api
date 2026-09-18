# Task3-1 页面布局改造（左侧菜单栏 + 顶部导航一致性）

> 来源：`.spec/Me2AI/任务清单.md` 阶段三 Task3-1
> 状态：**已完成并通过双主题浏览器走查验证（2026-09-06）**
> 约束：不触碰 relay/ 数据面；仅前端改造；双主题（:where(html.theme-*) 前缀 + tokens.css 变量）；STANDALONE 全屏页不受影响

## 1. 现状

- `index.js#AppLayout`：常规页 = `<Header/>` + `<Container className="main-content"><App/></Container>` + `<Footer/>`；STANDALONE_PATHS（`/`、`/login`、`/register`、`/reset`、`/user/reset`、`/oauth/github`、`/oauth/lark`）为全屏独立页不套框架。
- `components/Header.js`：桌面端把全部功能菜单平铺在顶部玻璃导航（C 端组 + 管理组，组间竖线）；移动端汉堡 + 抽屉 `.app-mobile-menu`。
- 首页 `pages/Landing/index.js#tl-nav`：品牌 + 链接组（首页/模型矩阵/开发者接入）+ 右侧操作区（ThemeToggle/状态胶囊/控制台按钮）。

## 2. 目标布局

```
Header（顶部导航，菜单项与首页一致，见 §4）
.app-shell（flex，max-width 1600px 居中）
  ├─ SideNav（左侧菜单栏，桌面端 sticky；移动端隐藏）
  └─ Container.main-content（flex:1, min-width:0）
Footer
```

## 3. 左侧菜单栏规划（SideNav）

数据源：新组件 `components/navConfig.js` 导出分组菜单配置（i18n 键 / 图标 / 路径 / 显隐条件 / admin 标记），SideNav 与 Header 移动端抽屉共用。

| 分组 | 菜单项 | 路径 | 图标 | 显隐条件 | i18n 键 |
|---|---|---|---|---|---|
| 概览 | 仪表盘 | /dashboard | chart bar | 总是 | header.dashboard |
| 功能 | 令牌 | /token | key | 总是 | header.token |
| 功能 | 日志 | /log | book | 总是 | header.log |
| 功能 | 对话 | /playground 或 /chat | comments | playground_enabled=true → /playground；否则 chat_link → /chat；都无则隐藏 | header.chat |
| 资源 | 充值 | /topup | cart | 总是 | header.topup |
| 资源 | 模型价格 | /pricing | dollar | 总是 | header.pricing |
| 资源 | 排行榜 | /rankings | trophy | 总是 | header.rankings |
| 账户 | 个人设置 | /setting | setting | 总是 | header.setting |
| 账户 | 关于 | /about | info circle | 总是 | header.about |
| 管理 | 渠道管理 | /channel | sitemap | 仅 isAdmin() | header.channel |
| 管理 | 兑换码 | /redemption | dollar sign | 仅 isAdmin() | header.redemption |
| 管理 | 用户管理 | /user | user | 仅 isAdmin() | header.user |

- 未登录用户渲染全部 C 端项（与原 Header 行为一致，点击后 PrivateRoute 重定向登录页）；管理组隐藏。
- active 高亮：`useLocation()` 判定 `pathname === to || pathname.startsWith(to + '/')`，加 `.app-sidenav-active`。
- 对话入口条件沿用原 Header 模块级读取 localStorage 的方式。

## 4. 顶部导航规划（与首页一致）

对齐 Landing `tl-nav` 三段式结构：

- 左：品牌 Logo + 系统名（登录→/dashboard，未登录→/，保持现状）。
- 中：链接组（首页锚点对应控制台真实路由）：
  | 菜单项 | 路径 | 对应首页 | 说明 |
  |---|---|---|---|
  | 首页 | / | 首页(#hero) | 跳落地页 |
  | 模型价格 | /pricing | 模型矩阵(#models) | 系统真实数据页 |
  | 排行榜 | /rankings | —（新增） | F15 系统功能入口 |
  | 关于 | /about | 开发者接入(#developer) | 系统真实数据页 |
- 右：ThemeToggle + 语言切换 + 用户菜单（用户名 + 注销）/ 登录按钮（保持现状）。
- 删除项：原平铺的功能菜单（仪表盘/令牌/日志/充值/对话/设置/渠道/兑换码/用户）全部移入左侧菜单栏。
- 移动端：品牌 + 汉堡 → 抽屉（内容 = 顶部链接组 + 左侧菜单全部项 + 主题/语言/登录区）。

## 5. 实施清单

1. **新增** `components/navConfig.js`：`navGroups` 分组配置（见 §3 表）。
2. **新增** `components/SideNav.js`：桌面左侧菜单栏（semantic-ui Menu vertical + 自定义 class `app-sidenav`）。
3. **改造** `components/Header.js`：桌面导航改为 §4 链接组（`app-toplinks` class）；移动端抽屉改用 navConfig 渲染（保留主题/语言/登录区）。
4. **改造** `index.js#AppLayout`：常规页包 `<div className="app-shell"><SideNav/><Container className="main-content"><App/></Container></div>`。
5. **追加** `theme/app-frame.css`：
   - `.app-shell`：flex、gap、max-width 1600、margin auto、width 100%、padding 0 24px、z-index 1。
   - `.app-sidenav`：width 210px、flex-shrink 0、position sticky、top 72px、玻璃卡面（--bg-surface/--border-color/--radius-lg/--shadow-card）。
   - `.app-sidenav .item` / `.app-sidenav-active`（背景 --bg-active、文字 --brand-blue）、分组标题 `.app-sidenav-group-title`（小号大写字距 --text-tertiary）。
   - `.main-content` 覆盖：flex:1、min-width:0、width auto（抵消 SUI Container 固定宽度）、margin 0、padding 顶部对齐。
   - `@media (max-width: 1000px)`：`.app-sidenav { display:none }`；640px 下 padding 收窄。
6. **i18n** `locales/zh|en/translation.json`：新增 `sidenav.group.overview/usage/resource/account/admin`（概览/功能/资源/账户/管理）。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| SUI Container 默认 max-width 1280 + margin auto 挤压布局 | `.main-content` 显式 `flex:1; min-width:0; width:auto; margin:0`（:where 前缀门控主题态） |
| 双主题穿帮 | 全部新规则 `:where(html.theme-dark, html.theme-light)` 前缀 + tokens.css 变量；SideNav 无 Portal 弹层 |
| 移动端断点不一致（JS isMobile=600 / CSS 1000） | 600~1000px 区间 SideNav 隐藏但顶部导航仍为桌面态（链接组可见），可用性不受损 |
| `/pricing` `/rankings` `/about` 公开页 | 属常规布局（不在 STANDALONE_PATHS），自然获得左侧栏，公开项正常高亮 |
| 原有页面使用 `.dashboard-container` 自居中 | 保留其 max-width/padding，在 shell 内叠加无冲突（其 margin auto 在 flex 子项中失效需验证，必要时覆盖） |

## 7. 验收标准

1. 普通用户登录：左侧菜单无「管理」组，分组顺序/图标/文字符合 §3。
2. 管理员登录：左侧菜单含「管理」组三项。
3. 顶部导航菜单项 = 首页/模型价格/排行榜/关于 + 品牌区 + 主题/语言/用户区，与首页结构一致。
4. 移动端（≤600px）：汉堡抽屉含全部菜单项与功能区。
5. 双主题切换无穿帮（侧栏表面/高亮/分组标题两主题正常）。
6. STANDALONE 页（`/`、认证页）布局不变。
7. 构建产物 Docker 部署后 E2E 走查通过。

## 8. 实施结果（2026-09-06 交付）

### 8.1 变更清单（全部为前端，relay/ 零改动）

| 文件 | 变更 |
|---|---|
| `components/navConfig.js` | **新增**：`getNavGroups()` 分组菜单配置 + `topNavLinks` 顶部链接组（SideNav 与 Header 抽屉共用） |
| `components/SideNav.js` | **新增**：桌面左侧菜单栏（aside.app-sidenav > Menu vertical，分组标题 + 图标菜单项 + `.app-sidenav-active` 高亮） |
| `components/Header.js` | **重写**：删除平铺 userButtons/adminButtons；桌面导航改为 topNavLinks（首页/价格/排行榜/关于）；移动抽屉改用 getNavGroups() 渲染（新增 `.app-mobile-group-title`）；顶部 Container maxWidth 1200→1600 与 shell 对齐 |
| `index.js` | AppLayout 常规页包 `<div className="app-shell"><SideNav/><Container main-content>…` |
| `theme/app-frame.css` | 追加 §Task3-1：`.app-shell`/`.app-sidenav`/菜单行/分组标题/响应式（≤1000px 隐藏侧栏、≤640px 收窄） |
| `locales/zh|en/translation.json` | 新增 `sidenav.group.{overview,usage,resource,account,admin}` |

### 8.2 踩坑记录（重要）

1. **SUI 复合选择器不匹配**：SideNav DOM 为 `aside.app-sidenav > div.ui.vertical.menu`（两个元素），复合选择器 `.app-sidenav.ui.vertical.menu` **永不匹配**；且 SUI `.ui.vertical.menu .item{display:block}`（(0,4,0)）与 `.item>i.icon{float:right}`（(0,5,1)）压过 `:where()` 版（(0,2,0)）——首版出现「菜单图标全部浮到右侧」。修复：改后代选择器 `html.theme-* .app-sidenav .ui.vertical.menu .item`（(0,6,1)）+ icon 规则 `float:none;margin:0 8px 0 0!important`。
2. **浏览器强缓存误判**：CSS 修复后 agent 走查仍报旧样式——浏览器对 index.html/CSS 启发式强缓存（服务端 200 新内容但浏览器未回源）。取证方法：`document.styleSheets` 读实际规则 + `getComputedStyle` 对照；绕过用 URL 加 query（`?cb=xxx`）。
3. **诊断选择器歧义**：`querySelector('.app-sidenav .item')` 首个命中是**分组标题 span**（其 padding 6px 12px 4px 造成误读），取证时应用 `.app-sidenav a.item` 精确命中菜单项。

### 8.3 验证记录

- 浏览器走查 12/12 PASS：落地页/登录页全屏独立（无 .app-shell）✓；管理员左侧菜单含管理组（渠道/兑换/用户）✓；普通用户（临时注册 testui）无管理组 ✓；顶部导航仅 首页/价格/排行榜/关于 ✓；active 高亮正确（总览/渠道/价格/关于/设置 各页）✓；暗色/亮色两主题卡面/高亮/分组标题无穿帮 ✓；854px 视口侧栏按规则隐藏 ✓。
- 最终 computed style：`.app-sidenav a.item` display:flex ✓、`i.icon` float:none ✓（截图 sidebar-final-*.png）。
- 测试残留已清理：testui 账号已从 DB 删除。
- 部署：镜像 one-api-custom:latest（前端 main.a537a5d1.css），容器 one-api 端口 3008→3000，`/api/status` HTTP OK。
