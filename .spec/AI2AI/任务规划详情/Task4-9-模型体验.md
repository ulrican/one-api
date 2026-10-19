# Task4-9 模型体验（多模态体验页面）

> 需求来源：`.spec/Me2AI/任务清单.md` Task4-9。当前聊天窗口（Playground）仅支持文本模型体验，需新增多模态模型体验页面。
> 原则：`relay/` 数据面零改动（所需端点均已存在）、无核心表变更、无新增表、应用/模型/广场既有接口复用为主。
>
> **实施结果（2026-09-22 已完成并部署）**：本文方案全部落地，唯一偏差为**语音窗口改走 `/v1/chat/completions` 的 `input_audio` 多模态格式**（非下表规划的 `/v1/audio/transcriptions`）——实测七牛库无 whisper 兼容模型，该端点返回 500；audio-input 模型全为多模态 LLM（gemini/qwen-vl/grok 等），input_audio 实测转写正确。另修复 `common/gin.go` multipart 绑定既有缺陷。详见《协议和数据.md》2.20 节。E2E：未登录 401 跳转、菜单入口/高亮、chips 联动与应用置灰、文本 SSE（流式"成功"）、图片 UI 全链路（logo.png 返回 Flux logo 描述）、语音网关实测（wav 返回完整英文句）、video 占位、亮/暗双主题均通过。

## 1. 需求拆解

| 需求点 | 方案 |
| :--- | :--- |
| 模型类型选择 | 复用模型广场模态 chip 交互样式（`mk-chip` 同款视觉，本页独立 CSS 类 `exp-chip`），类型 = text/image/audio/video，默认 text |
| 应用选择 | 与模型类型联动：应用在当前类型下无可体验模型时置灰不可选 |
| 模型选择 | 与应用/类型双重联动：`(用户可用模型 ∩ 应用配置模型) ∩ 类型模态匹配` |
| 文本体验窗口 | 多轮 SSE chat（复用 Playground 的调用模式） |
| 图片体验窗口 | 上传图片 → `/v1/chat/completions` 多模态 content（image_url base64），返回图片理解/分类文本 |
| 语音体验窗口 | 上传音频 → `/v1/audio/transcriptions`（multipart），返回识别文本 |
| 其他类型 | video 模态本期渲染 EmptyState 占位（"暂不支持在线体验"），留扩展点 |
| 入口 | 侧栏聊天项正下方新增独立"模型体验"菜单项（Header 移动端抽屉同步） |

## 2. 现状依据（已核实）

- **数据面端点已存在**（`router/relay.go`，TokenAuth + Distribute）：`POST /v1/chat/completions`、`POST /v1/audio/transcriptions`（`relay/controller/audio.go#RelayAudioHelper` 走 OpenAI 兼容 adaptor，type 52 七牛渠道天然可用）。**relay/ 零改动**。
- **模型广场模态筛选**：`pages/Marketplace/index.js` `MODALITIES = ['text','image','video','audio']`，chip 样式 `mk-chip/mk-chip-active`，i18n 键 `marketplace.filters.modality`、`marketplace.modality.{m}`（直接复用该 i18n 键）。
- **应用列表**：`GET /api/application/`（UserAuth）返回 Token 数组（`models` 逗号串、`key`、`status`）；Playground 已有 `getTokenAllowedModels` 应用→模型交集逻辑可参考。
- **用户可用模型**：`GET /api/user/available_models`（abilities 驱动）。
- **模态数据可行性**（2026-09-21 实测库）：market_models 中 input 含 image 且 output=text 30+ 个；input 含 audio 且 output=text ~26 个；本站已接入的 `gemini-3.0-flash-preview`（text,image,audio,video,file → text）同时覆盖图片/语音体验，`deepseek/deepseek-v4-flash` 覆盖文本。

## 3. 设计方案

### 3.1 模态判定规则（前端，数据来自新接口）

模型 → 体验类型归属（`market_models.input_modalities/output_modalities`，逗号串解析）：

| 体验类型 | 判定 | 调用端点 |
| :--- | :--- | :--- |
| text 文本 | output_modalities 含 `text` | `POST /v1/chat/completions`（SSE） |
| image 图片 | input 含 `image` 且 output 含 `text`（排除生图：output 仅 image） | `POST /v1/chat/completions` 多模态 |
| audio 语音 | input 含 `audio` 且 output 含 `text` | `POST /v1/audio/transcriptions` |
| video 视频 | 其余 input/output 含 video 的模型 | 占位 EmptyState |

- 不在 market_models 的自定义模型（接口无模态记录）**保守归入 text**。
- 同一模型可同时归属多类型（如 gemini 同时出现在 image 与 audio 列表）。

### 3.2 后端新增接口（唯一后端改动，1 个查询接口）

| 接口 | 鉴权 | 响应 data |
| :--- | :--- | :--- |
| `GET /api/user/models/modalities` | UserAuth（selfRoute） | `[{id, input_modalities: string[], output_modalities: string[]}]`（market_models 全量精简投影，193 行轻量查询，无新增表/缓存） |

- 落点：`controller/model.go` 新增 handler（查 `model.GetMarketModels` 同源表，投影仅 id + 两模态列）；挂 `selfRoute`。
- relay/、核心表、既有接口全部不动。

### 3.3 前端页面 `pages/Experience/`

```
pages/Experience/
├── index.js          # 页面壳：类型 chips + 应用/模型下拉 + 按类型切换体验窗口
├── TextPanel.js      # 文本窗口（SSE chat，参考 Playground：系统提示词+多轮+停止+清空）
├── ImagePanel.js     # 图片窗口（上传预览 + 提示词 + 非流式多模态调用 + 结果区）
├── AudioPanel.js     # 语音窗口（上传音频 + FormData 调用 + 识别文本结果区）
└── experience.css    # 作用域隔离样式（exp- 前缀，tokens.css 变量，双主题）
```

- **布局**：`.dashboard-container` 外壳（`max-width:none` 全宽规范）；顶部工具卡：模态 chips 行（text 默认，chip 样式复刻 mk-chip）+ 应用 Dropdown（searchable，status=1，无可用模型的应用 `disabled:true`）+ 模型 Dropdown（searchable，双重交集）。
- **联动**：切类型/切应用 → 重算模型列表，当前模型不在列表则自动重置为首个；模型列表为空渲染内联提示（引导去模型广场/应用管理）。
- **TextPanel**：SSE 打字机（`AbortController` 卸载释放，与 Playground 同款实现）；系统提示词输入；Enter 发送。
- **ImagePanel**：`<input type=file accept="image/*">`，前端校验 ≤10MB，FileReader 转 dataURL；提示词默认"请识别并分类这张图片"；`messages:[{role:'user', content:[{type:'text'},{type:'image_url', image_url:{url}}]}]` 非流式调用；结果区展示返回文本（保留最近会话历史列表）。
- **AudioPanel**：`<input type=file accept="audio/*">` ≤25MB；FormData `{file, model}` POST `/v1/audio/transcriptions`；展示 `{text}` 结果（历史列表）。
- **Video/其他**：`EmptyState`（icon video）占位。
- **i18n**：新增 `header.experience`、`experience.*`（chips 复用 `marketplace.modality.*`、应用/模型 placeholder、各面板文案、错误提示）zh/en；插值一律双花括号 `{{var}}`。
- **主题**：experience.css 全部走 tokens.css 变量 + `:where(html.theme-dark, html.theme-light)` 门控（同 marketplace.css 模式）；第三方 CSS 无新增。

### 3.4 路由与菜单入口

- `App.js`：`/experience` → `PrivateRoute` + 静态 import（与其他常规页一致）。
- `navConfig.js`：导出 `getExperienceItem()` → `{ name:'header.experience', to:'/experience', icon:'flask' }`（图标名先 grep `semantic.min.css` 确认 `.icon.flask:before` 存在，缺失则换备选）。
- `SideNav.js`：`chatItem` 之后、`<Menu>` 之前渲染独立 Link（class 复用 `app-sidenav-chat` 布局 + 新类 `app-sidenav-exp`，激活态新类 `app-sidenav-exp-active`——蓝色高亮，不占用聊天项品牌渐变）；新增少量 app-frame.css 规则（激活态对齐 `.app-sidenav-active` 视觉）。
- `Header.js` 移动端抽屉：聊天项下方同步插入（实现时读 Header 抽屉渲染处）。
- 令牌/聊天/Playground 现有功能零改动。

## 4. 协议与数据变更汇总

- 新增接口 1 个：`GET /api/user/models/modalities`（见 3.2）。
- 无新增/修改表；无新增 options；`/api/status` 不变。
- 网关调用（前端 → 数据面，Bearer `sk-<应用key>`）：`/v1/chat/completions`（含多模态 content）、`/v1/audio/transcriptions`（multipart）——均为既有协议。

## 5. 实施步骤

| # | 步骤 | 产出 |
| :--- | :--- | :--- |
| 1 | 后端：`controller/model.go` 增模态映射查询 + selfRoute 注册 | 接口可调（curl 验证） |
| 2 | 前端：Experience 页面四文件 + experience.css | 页面三窗口可用 |
| 3 | 路由 + navConfig + SideNav/Header 抽屉菜单 + i18n（zh/en） | 入口可达 |
| 4 | 前端构建 + 联调 E2E（浏览器） | 验收清单全过 |
| 5 | 维护 AI2AI（项目架构信息/协议和数据/本规划标注完成） | 文档同步 |

## 6. 完成标准 / 验收标准

1. 侧栏聊天项下方出现"模型体验"入口，移动端抽屉同步；未登录访问跳登录。
2. 默认 text 类型，chips 可切换；image/audio/video 类型下模型列表、应用可用性正确联动（应用置灰逻辑生效）。
3. 文本窗口：选 deepseek 等文本模型，SSE 流式回复、停止、清空正常。
4. 图片窗口：上传本地图片，gemini-3.0-flash-preview 返回理解/分类文本。
5. 语音窗口：上传音频文件，返回识别文本。
6. video 类型渲染占位提示，不报错。
7. 双主题下无穿帮（chips/弹层/上传区）；无水平滚动条；页面全宽规范（`max-width:none`）。
8. `relay/` 零 diff；核心表零变更；既有 Playground/应用管理/模型广场功能回归正常。

## 7. 风险与兼容性

- **audio 计费口径**：`/v1/audio/transcriptions` 走 `RelayAudioHelper` 按 token 倍率预扣，gemini 文本倍率来自 Task4-3 自动计算；与上游真实音频计费可能有差异，属网关统一计费语义，不阻塞（必要时后续按秒计价扩展）。
- **多模态透传**：openai adaptor 对 chat/completions 纯透传，image_url(base64) 大 payload 走 GzipDecodeMiddleware 正常；≤10MB 前端限制兜底。
- **不在广场的模型**：归入 text 类型，行为与 Playground 一致。
- **兼容性**：全部为新增文件 + 1 个新查询接口；navConfig/SideNav/Header 为追加式小改；不动令牌与 Playground。
