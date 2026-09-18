# Task01：新版科技风落地页（首页改版·第一步）

> 来源：Me2AI/任务清单.md Task01
> 参考效果：Me2AI/demo/index-demo1.html（暗色科技霓虹风）
> 风格规范：.trae/skills/tech-web/SKILL.md
> 状态：✅ 已完成并通过浏览器实测

## 1. 需求理解（来自 Me2AI）

- 参考 `demo/index-demo1.html` 的效果完成 one-api 首页改版。
- **新首页暂不替换当前首页**：当前 `/`（Semantic UI Home 页，承载管理员配置的 home_page_content）保持不动。
- 新落地页作为**独立新页面**提供，页面导航栏中的"控制台"菜单需能跳转到**当前已有页面**（现有登录/控制台体系）。

## 2. 现状勘察结论

| 项 | 结论 |
| :--- | :--- |
| 生效主题 | `web/default/`（`config.Theme` 默认 `default`；build.sh 构建三套主题到 `web/build/<theme>`，Go embed 后由 `router/web.go` 提供 SPA 服务，NoRoute 回退 index.html） |
| 技术栈 | React 18 + CRA5(react-scripts) + Semantic UI + react-router-dom v6 + i18next，**无 Tailwind** |
| 全局布局 | `web/default/src/index.js`：`<Header/>` + Semantic `<Container className="main-content"><App/></Container>` + `<Footer/>` 全局包裹所有路由 |
| 现有路由 | `/` Home、`/login`、`/register`、`/dashboard`(PrivateRoute，普通用户可用)、`/token`(登录后落地页)、`/chat`、`/about` 等 |
| 页面级 CSS 先例 | `pages/Dashboard/Dashboard.css`（页面内 `import './Dashboard.css'`） |
| 全局 body 样式 | `index.css`：`body { padding-top: 55px; }`，浅底 |
| 品牌工具 | `helpers/utils.js`：`getSystemName()`（默认 One API）、`getLogo()`（默认 /logo.png） |
| 登录态 | `UserContext`（`userState.user` 为空即未登录） |

## 3. 方案（最小增量，不碰 relay/、不改表、不改构建流程）

### 3.1 新增文件

1. `web/default/src/pages/Landing/index.js`
   - demo1 的 React 移植：玻璃拟态导航栏、Hero（渐变标题+双 CTA+4 项指标看板）、模型矩阵 3 卡、开发者接入终端（cURL/Python Tab 切换）、自带暗色页脚。
   - 品牌名取 `getSystemName()`；Logo 取 `getLogo()`，加载失败兜底渐变 ⚡ 标记。
   - 终端代码 Base URL 用 `window.location.origin + '/v1'` 动态生成，Key 用 `sk-xxxx` 占位。
   - **控制台按钮（任务明确要求）**：未登录 → `/login`（文案"控制台 / 登录"）；已登录 → `/dashboard`（文案"进入控制台"）。
   - Hero 主 CTA"免费获取 API Key"：未登录 → `/register`，已登录 → `/token`；次 CTA"体验在线 WebChat" → `/chat`。
   - 锚点导航仅保留真实区块：`#hero` / `#models` / `#developer`（demo 中 #sla/#pricing 为死锚点，不沿用）。
   - `useEffect` 挂载时将 `document.body` 的 `paddingTop/背景色` 切换为落地页暗色值，卸载还原（避免全局 55px 顶距与白底穿帮）。

2. `web/default/src/pages/Landing/landing.css`
   - 全部选择器以 `.tech-landing` / `.tl-` 前缀作用域隔离，不污染 Semantic UI 全局样式。
   - 设计令牌（色板/字号/间距/圆角/光晕）严格取自 tech-web skill：底 `#0B0F17`、卡 `#111827`、终端 `#05070B`，蓝 `#3B82F6`/紫 `#8B5CF6`/翡翠 `#10B981`/琥珀 `#FBBF24`。
   - 特效：点阵网格（径向渐隐 mask + pointer-events:none）、玻璃导航、渐变文字、CTA 蓝色 glow、卡片 hover 紫色 glow、脉冲状态点、终端窗口。
   - 响应式：看板 4→2→1 列、模型卡 3→1 列、Hero 字号缩放；`prefers-reduced-motion` 动效降级。

### 3.2 修改文件（各 1 处小改）

3. `web/default/src/App.js`
   - 新增 lazy 导入 `Landing` 与路由 `<Route path='/landing' ...>`；`/` 及其他路由**完全不动**。

4. `web/default/src/index.js`
   - 新增内部 `AppLayout` 组件（`useLocation` 判断）：`/landing` 路径下**不渲染**全局 Semantic `<Header/>`、`<Container/>`、`<Footer/>`（落地页全屏暗色、自带导航页脚）；其余路径保持原有布局不变。`ToastContainer` 两布局均保留。

### 3.3 明确不做

- 不替换 `/` 首页、不改 Home 组件、不改后端、不改 relay/、不改数据库、不改打包流程。
- 不引入 Tailwind 依赖（CRA5 需 craco 改构建，风险大于收益；用作用域 CSS 等价实现，skill 中 Tailwind 章节标注为"若项目使用"）。
- 营销文案暂硬编码中文（与 demo 一致）；i18n 化列为后续任务。

## 4. 验收标准

- [ ] 访问 `/landing` 呈现 demo1 同等效果：暗色底、网格背景、玻璃导航、渐变 Hero、指标看板、模型卡、终端 Tab 切换。
- [ ] `/` 原首页及其余路由外观、行为无任何变化。
- [ ] 落地页"控制台/登录"：未登录跳 `/login`；登录后显示"进入控制台"跳 `/dashboard`。
- [ ] 落地页无 Semantic Header/Footer 穿帮、无白底/55px 顶距穿帮；离开落地页后 body 样式还原。
- [ ] `npx react-scripts build`（web/default）编译通过。
- [ ] 风格通过 tech-web skill 第 10 节检查清单（令牌用色、glow 克制、mono 数字、响应式、reduced-motion）。

## 5. 实施记录（已完成）

### 5.1 改动文件清单

| 文件 | 类型 | 说明 |
| :--- | :--- | :--- |
| `web/default/src/pages/Landing/index.js` | 新增 | 科技风落地页组件（导航/Hero/看板/模型矩阵/终端 Tab/页脚） |
| `web/default/src/pages/Landing/landing.css` | 新增 | 作用域样式（`.tech-landing`/`.tl-` 前缀），令牌取自 tech-web skill |
| `web/default/src/App.js` | 修改（2 处） | lazy 导入 Landing；注册 `/landing` 路由；`/` 及其余路由未动 |
| `web/default/src/index.js` | 修改 | 新增 `AppLayout`，`STANDALONE_PATHS=['/landing']` 路由下不渲染全局 Header/Container/Footer |

后端、relay、数据库、构建流程：**零改动**。

### 5.2 验证结果

- `npx react-scripts build`（web/default）：**Compiled successfully**（gzip 后主包 296KB）
- 静态服务器 + 浏览器实测（http://localhost:4173）：
  - `/landing` 暗色落地页完整渲染：玻璃导航、渐变 Logo/标题、脉冲状态胶囊、4 指标看板、3 模型卡、终端窗口、深色页脚 ✅
  - 终端 cURL/Python Tab 切换正常，Python 代码含 `from openai import OpenAI` ✅
  - "控制台 / 登录"按钮正确跳转 `/login` ✅
  - 原首页 `/` 保持 Semantic UI 浅色风格，未受影响 ✅
- tech-web skill 第 10 节自检：令牌用色、glow 克制（CTA+状态点）、mono 数字/代码、网格渐隐、响应式 4→2→1、`prefers-reduced-motion` 降级、焦点环均已落实 ✅

### 5.3 验收标准核对

- [x] `/landing` 呈现 demo1 同等效果
- [x] `/` 原首页及其余路由无变化
- [x] 控制台按钮：未登录 → `/login`；登录后按钮文案变"进入控制台" → `/dashboard`
- [x] 无 Semantic Header/Footer 穿帮、无白底/55px 顶距穿帮（body 样式挂载切换、卸载还原）
- [x] 生产构建编译通过
- [x] 通过 tech-web 检查清单

### 5.4 增量：双主题（科技暗色 ⇄ 简约亮色）导航栏切换

用户后续要求：在科技风之外再提供一套简约风格，通过导航栏按钮切换。

- **令牌架构重构**（`landing.css`）：所有颜色/阴影/背景（含徽章、状态胶囊、步骤序号、按钮、卡片等原先硬编码处）全部提升为 `.tech-landing` 根上的 CSS 变量；新增 `.tech-landing.tl-theme-simple` 类覆盖整套变量值实现亮色简约风（令牌对齐 blue-style-rules：页底 `#F8FAFC`、卡 `#FFFFFF`、主蓝 `#2563EB`、霓虹光晕→柔和中性阴影、渐变标题→实色蓝、网格点阵减淡）。代码终端 `.tl-terminal` 两套主题均保持深色（终端惯例）。
- **切换逻辑**（`Landing/index.js`）：`theme` state（`tech`|`simple`，默认 `tech`），持久化于 `localStorage` key `landing_theme`；根 div 追加 `tl-theme-simple` 类；body 底色随主题联动（`#0B0F17`/`#F8FAFC`）；导航栏右侧新增胶囊切换按钮（☀️简约风 / 🌙科技风，`aria-pressed`，<640px 仅显图标）。
- **浏览器实测**：两主题逐区（导航/Hero/指标/模型矩阵/终端/页脚）无白底白字、无漏切换斑块；切换流畅、刷新后偏好保持；生产构建通过。

### 5.5 开发环境备注

- CRA5(react-scripts 5.0.1) + Node 20 下 ESLint 依赖树不兼容（`Environment key "jest/globals" is unknown`），已在 `web/default/.env` 设 `DISABLE_ESLINT_PLUGIN=true`（与 `web/build.sh` 既有约定一致）及 `BROWSER=none`。
- 本地预览：`$env:PORT='3007'; npm start`（避让后端/docker 的 3000），访问 `http://localhost:3007/landing`；`/api` 由 package.json proxy 代理到 3000。

### 5.6 遗留事项（后续任务）

1. 营销文案目前硬编码中文，未走 i18n（zh/en 翻译键待补）
2. 指标数字（150ms/99.99%/10000+）为静态营销文案，后续可接真实统计接口
3. 当前 `/` 仍为旧首页；待后续任务决定是否将根路径切换为新落地页（届时只需调整路由与 STANDALONE_PATHS）
4. `web/berry`、`web/air` 两套主题未同步该页面（默认主题外的主题访问 /landing 会 404 到各自 NotFound）
5. 简约主题目前仅落地页本体；全局 Semantic UI 管理端/用户端页面未随动（落地页卸载后 body 样式还原，不影响其他页面）
6. `web/default/package.json` 的 build 脚本为 Unix 写法（`rm -rf build && ...`），Windows 下 `rm` 报错但不影响 react-scripts 编译产物；如需可后续改为跨平台写法
