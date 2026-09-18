# Task4-1 · 模型广场（七牛模型库每日同步 + 国内/海外分区展示）

> 来源：Me2AI/任务清单.md Task4-1（L119-129）。定位：面向 C 端的**公开营销/查询页面**（无登录可访问），数据面 `relay/` 零改动，不修改任何核心表，新增 1 张扩展表 + 1 个每日同步协程 + 1 个公开查询接口组 + 1 个前端页面。
>
> **本文件为实现方案，待站长确认后才进入编码。**

---

## 1. 需求摘要

1. 调用七牛平台模型列表接口（`https://openai.qiniu.com/v1/market/models`），将模型展示在「模型广场」页面，**区分海外模型与国内模型**。
2. **不实时调七牛**：每天同步一次到本系统数据库，页面只从 DB 读。
3. 先设计页面布局（列表 + 详情），确认后再实现。

---

## 2. 七牛接口数据分析（2026-05 实测，两页全量 JSON 已拉取核对）

### 2.1 调用方式与分区结论

| 请求 | 返回模型数 | 含义 |
| :--- | ---: | :--- |
| `GET /v1/market/models?overseas=false` | **104** | 国内可调用集合（国内模型） |
| `GET /v1/market/models?overseas=true` | **192** | 全量集合 = 国内 104 + **纯海外 89**（两集合 id 无重复） |

- 鉴权：Header `Authorization: Bearer <key>`；响应根结构 `{ "data": [ ... ] }`。
- **分区方案**：同步时调两次，取两集合 id 差集打标：
  - 出现在 `overseas=false` → `region = domestic`（国内）
  - 仅出现在 `overseas=true` → `region = overseas`（海外）
- 接口本身无 region 字段，差集是唯一可靠分区手段。

### 2.2 模型对象字段（24 个，均已核对）

| 字段 | 类型 | 用途 |
| :--- | :--- | :--- |
| `id` | string | 模型标识（如 `meituan/longcat-flash-lite`），含厂商前缀，天然唯一 |
| `name` | string | 展示名 |
| `description` | string | 模型介绍（详情页主体） |
| `avatar` | string(URL) | 模型图标（七牛 CDN 外链，大部分有） |
| `issuer` | object | 厂商：`name` / `avatar` / `model_page` |
| `hot_tags` | string[] | 营销标签，枚举：**限时免费 / 热门 / 上新 / 免费** |
| `features` | string[] | 能力标签，枚举：生图、视频理解、AI编程、联网搜索、高TPS、长上下文、深度思考、视觉定位、视频生成、图像理解、工具调用、结构化输出 |
| `architecture` | object | `input_modalities`（text/image/audio/video/file）、`output_modalities`（text/image/video）、`function_calling`、`reasoning`、`schema_output`、`content_cache`（均 bool） |
| `model_constraints` | object | `context_length`、`max_tokens` 等 |
| `pricing_rules_v2` | array | **新版分档定价（191/192 有值）**，见 2.3；1 个模型无价目（待官方维护） |
| `pricing_rules` | array | 旧版定价（仅 50 个模型有），**不使用，仅随原始 JSON 留存** |
| `rate_limit` | object | `ipm/qpm/rpm/tpm` |
| `support_api_protocols` | string[] | openai / anthropic / google / openai-image / openai_video / fal_ai 等 |
| `model_filing` | string | 备案信息 |
| `supported_parameters` | object | 支持的请求参数（详情页展示） |
| `rank` | int | 官方排序权重，**越小越靠前** |
| `release_at` / `retirement_at` | string | 发布 / 下线时间 |
| `suggested_model` / `model_alias` | string | 官方推荐替代模型 / 别名 |
| `pricing_page_url` | string | 官方定价页链接 |
| `private` / `created_time` | — | 私有标记 / 创建时间（展示层不用） |

厂商分布 Top（来自 issuer.name）：Aliyun 28、Google 26、OpenAI 23、DeepSeek 17、ByteDance 16、Anthropic 14、xAI 14、Kling 12、Minimax 9、zAI 8、Vidu 7、Moonshot-Kimi 6。

### 2.3 定价结构（pricing_rules_v2，重点兼容项）

- 数组，支持**分档**（实测如 qwen3-coder 有 3 档，按 `input_range` / `output_range` token 区间定价）。
- 每档：`details_v2.input` / `details_v2.output`，各为 `{ name, unit_name, unit_size, unit_price（人民币）, unit_price_usd }`；**`output` 可能为 null（部分生图模型），解析必须判空**。
- 计费单位（unit_name 实测枚举）：
  - `token` —— 主流文本模型，单价 = `unit_price / unit_size`（如 size=1000 即每千 token 价格；卡片统一折算 ¥/百万 token）
  - `images` / `image` / `pic` —— 生图，¥/张
  - `time` / `second` —— 视频，¥/秒
  - `unit_price = 0` → 免费（配合 hot_tags「免费/限时免费」）
- 列表卡片只展示**首档摘要价**（输入 / 输出两行）；详情页展示**完整分档表 + 区间 + 人民币/美元双币种**。

---

## 3. 总体设计

```
七牛 openai.qiniu.com                    浏览器（公开访问，无需登录）
        ▲ 每日 03:00 同步（+启动时空表立即一次）         ▲
        │                                        GET /api/marketplace/models
┌───────┴──────────┐    upsert/删旧     ┌───────────────────────────┐
│ common/marketplace│ ───────────────▶ │ market_models 表（新扩展表） │
│ (qiniu client)   │                   └─────────────┬─────────────┘
└──────────────────┘                                  │ DB 查询（+Redis 60s）
        ▲ 管理端可手动触发                             ▼
POST /api/marketplace/sync (Admin)        controller/marketplace.go
```

- **同步协程**：`model` 包内启动（沿用 `model.StartOrderExpireSweeper()` 先例），ticker 24h；仅主节点运行（`config.IsMasterNode` 协程启动区判断，与 SyncOptions 同位置）。
- **同步失败不删旧数据**：保留 DB 中上次成功数据，记错误日志，等下个周期；管理端显示「上次成功同步时间」。
- **对外接口公开**（沿用 `/api/pricing`、`/api/rankings` 先例，不挂鉴权中间件）；Redis 缓存前判 `common.RedisEnabled`。
- **配置走 options 表**（沿用 option.go + SystemSetting 先例）：
  - `MarketplaceEnabled`（功能开关，bool）。**默认 true**：站长明确要求该功能，部署即用；管理端一键关闭，关闭后协程跳过同步、接口返回 disabled、菜单隐藏（同排行榜开关的前端处理）。
  - `QiniuApiSecret`（七牛 Key，默认值内置任务给定的 key，可后台改）。命名以 `Secret` 结尾 → 自动命中 [option.go L20](file:///e:/97_OneAI/one-api/controller/option.go#L20) 的 `HasSuffix("Secret")` 脱敏规则，管理端 GET 不回显明文，也不经 `/api/status` 下发。
  - `MarketplaceLastSyncTime`（上次成功同步时间，string）。
- 状态下发：`/api/status` 增加 `marketplace_enabled`（沿用 `ranking_enabled` 先例），前端据此隐藏入口。

---

## 4. 数据库设计（1 张新扩展表）

表名 `market_models`，文件 `model/market_model.go`，在 `model/main.go migrateDB()` 追加一行 AutoMigrate。**不拆子表**：192 行数据量极小，复杂嵌套（定价分档、架构、限流）以原始 JSON 列留存，列表筛选所需字段扁平成列 + 索引。

| 列 | 类型 | 索引 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | bigint PK auto | | 自增主键 |
| `model_id` | varchar(128) | **uniqueIndex** | 七牛模型 id（如 `deepseek/deepseek-v3.1`） |
| `name` | varchar(128) | | 展示名 |
| `region` | varchar(16) | index | `domestic` / `overseas` |
| `issuer_name` | varchar(64) | index | 厂商名（筛选用） |
| `issuer_avatar` | varchar(512) | | 厂商图标 URL |
| `avatar` | varchar(512) | | 模型图标 URL |
| `description` | text | | 简介（卡片截断，详情全显） |
| `hot_tags` | varchar(255) | | **code 数组**（同步时由中文枚举映射，见 §4.1），如 `["hot","new"]` |
| `features` | varchar(255) | | **code 数组**（能力标签映射后存储，英文站可直接 i18n；筛选用，Go 端 LIKE 匹配 code） |
| `input_modalities` | varchar(128) | | 逗号分隔：text,image,audio,video,file（筛选用） |
| `output_modalities` | varchar(128) | | 逗号分隔：text,image,video |
| `context_length` | bigint | | 上下文长度（0=未知） |
| `max_output_tokens` | bigint | | 最大输出（0=未知） |
| `protocols` | varchar(128) | | 逗号分隔协议 |
| `rank` | int | index | 官方排序（默认排序依据） |
| `price_input` | decimal(12,6) | index | 摘要价：首档输入价折算 **¥/百万 token**；非 token 模型为单单位价；0=免费；**-1=无价目** |
| `price_output` | decimal(12,6) | index | 摘要价：首档输出价（同上；生图 output 为 null 时 = -1） |
| `price_unit` | varchar(16) | | 摘要计费单位：`token` / `image` / `second` / `unknown` |
| `is_free` | tinyint | index | 是否免费（0 元模型，卡片打标） |
| `capabilities` | varchar(128) | | 逗号分隔：function_calling,reasoning,schema_output,content_cache（详情用） |
| `release_at` | varchar(32) | | 发布时间（原文保留） |
| `retirement_at` | varchar(32) | | 下线时间 |
| `filing` | varchar(255) | | 备案信息 |
| `pricing_page_url` | varchar(512) | | 官方定价页 |
| `suggested_model` | varchar(128) | | 推荐替代模型 |
| `model_alias` | varchar(128) | | 别名 |
| `detail_json` | longtext | | **七牛完整原始对象 JSON**（详情页直接反序列化，含 pricing_rules_v2 全档、rate_limit、supported_parameters 等，避免详情二次拉取） |
| `created_at` / `updated_at` | bigint | | 秒级时间戳 |

**全量同步写策略（事务）**：单事务内批量 upsert 192 行（冲突键 `model_id` 更新全部列），随后删除本批 `model_id` 集合之外的旧行（处理官方下架模型）；失败回滚，旧数据保持不动。

### 4.1 中文枚举 → 稳定 code 映射（同步时转换）

七牛返回的 `hot_tags` / `features` 是**中文字面量**，直接落库会导致英文站无法翻译。同步时在 client 层映射为 code 存入上述两列；前端按 code 走 i18n；**映射表未覆盖的新枚举值原样存入（中文透传），前端兜底直接展示原文**，不因官方加标签而丢数据。`detail_json` 始终保留中文原值。

| 中文原值 | code | 卡片视觉 |
| :--- | :--- | :--- |
| 限时免费 | `limited_free` | 品牌色描边签 |
| 免费 | `free` | 绿色签 |
| 热门 | `hot` | 橙色签 |
| 上新 | `new` | 蓝色签 |

| 中文原值 | code | | 中文原值 | code |
| :--- | :--- | :--- | :--- | :--- |
| 深度思考 | `reasoning` | | 视频生成 | `video_gen` |
| 工具调用 | `tool_call` | | 图像理解 | `image_understanding` |
| 结构化输出 | `schema_output` | | 视觉定位 | `visual_grounding` |
| 联网搜索 | `web_search` | | 高TPS | `high_tps` |
| AI编程 | `coding` | | 长上下文 | `long_context` |
| 生图 | `image_gen` | | 视频理解 | `video_understanding` |

前端筛选区快捷 feature 仅放出前 8 个高频项，其余通过卡片/详情可见。

> 数据库设计落库后同步登记到 `.spec/AI2AI/协议和数据.md`。

---

## 5. 同步服务设计

### 5.1 七牛客户端（新文件 `common/marketplace/client.go`）

- `FetchQiniuModels(overseas bool) ([]QiniuModelRaw, error)`
  - `http.Client{Timeout: 30s}`，URL 带 query；Header `Authorization: Bearer ` + `config.QiniuApiSecret`。
  - 非 2xx / JSON 解析失败 → 返回 error。
  - 响应结构体只强类型化需要的字段，其余 `json.RawMessage` / `interface{}` 透传（原始 JSON 直接来自 HTTP body，逐模型重新序列化进 `detail_json`）。
- 定价抽取 helper：`extractSummaryPrice(pricingRulesV2) → (in, out float64, unit string, isFree bool)`，**严格判空**（`details_v2.output == nil`、空数组、无价目 → -1/unknown）。

### 5.2 同步协程（新文件 `model/market_sync.go`）

- `StartMarketplaceSync()`：仿 `StartOrderExpireSweeper()`，**定时策略定为：启动时表为空立即同步一次（保证新部署/新启用立即可见）；之后固定每 24 小时一次滚动 ticker**（重启后重新计时，不追求固定钟点；同步为幂等全量替换，任何时刻执行都安全）。每轮执行前先判 `config.MarketplaceEnabled`，关闭则跳过本轮（管理端手动同步接口不受开关限制）。
- `SyncMarketplaceModels() (int, error)`（协程与管理端手动接口共用）：
  1. 并发/顺序拉两次接口（顺序即可，秒级完成）；
  2. domestic id 集合 → 打标；overseas=true 全集做差集；
  3. 映射为 192 个 `MarketModel`：hot_tags/features 经 §4.1 枚举表转 code（未知值原文透传）、avatar/issuer_avatar 的 http 链接升级 https、定价摘要由 `extractSummaryPrice` 计算、完整原始对象序列化进 `detail_json`；
  4. 事务 upsert + 删旧；
  5. 成功后写 option `MarketplaceLastSyncTime`，并清 Redis 列表缓存（`marketplace:list:*`，有 Redis 时）。
- main.go 注册位置：与 `model.StartOrderExpireSweeper()`（L90 附近）同区；migrateDB 追加 AutoMigrate。

### 5.3 配置项改动

| 文件 | 改动 |
| :--- | :--- |
| `common/config/config.go` | `MarketplaceEnabled bool`（默认 true）、`QiniuApiSecret string`（默认内置任务给定 key） |
| `model/option.go` | OptionMap 注册两项 + `updateOptionMap` switch 分支（bool 解析沿用 `RankingEnabled` 模式） |
| `controller/misc.go` | `/api/status` 增加 `"marketplace_enabled": config.MarketplaceEnabled` |
| 管理端 [OperationSetting.js](file:///e:/97_OneAI/one-api/web/default/src/components/OperationSetting.js#L352-L360) | 在「通用」区块排行榜区块（L352-360）之后新增「模型广场」小区：①功能开关 Checkbox（即时保存，同 RankingEnabled 模式）；②Qiniu Key 密码输入框（不回显，留空表示不修改，随「保存」提交）；③只读「上次同步时间」；④「立即同步」按钮 → `POST /api/marketplace/sync`，loading 防重点，成功刷新同步时间与计数，失败弹错误信息 |

---

## 6. 后端接口设计（`controller/marketplace.go` 新文件）

统一响应壳：`{ success, message, data }`（沿用项目规范，HTTP 200）。

### 6.1 `GET /api/marketplace/models` —— 模型列表（公开，无需鉴权）

Query 参数（全部可选）：

| 参数 | 说明 |
| :--- | :--- |
| `region` | `all`（默认）/ `domestic` / `overseas` |
| `q` | 关键词，匹配 name / model_id / description（LIKE） |
| `issuer` | 厂商名精确匹配（issuer_name） |
| `modality` | `text` / `image` / `video` / `audio` / `file`（匹配 input_modalities；`image` 同时匹配生图/图像理解） |
| `feature` | 能力标签精确（features LIKE，如「深度思考」「生图」） |
| `sort` | `rank`（默认）/ `price_asc`（按输入价，免费在前，无价目垫底）/ `context_desc` |
| `page` / `page_size` | 默认 1 / 24，page_size ≤ 60 |

响应：

```json
{
  "success": true,
  "data": {
    "total": 192,
    "page": 1,
    "page_size": 24,
    "facets": { "issuers": ["Aliyun", "Google", "..."] },
    "items": [ { 卡片 DTO } ]
  }
}
```

卡片 DTO（不含长描述全文与 detail_json）：
`model_id, name, region, issuer_name, issuer_avatar, avatar, short_description(截断 120 字), hot_tags[], features[], input_modalities[], output_modalities[], context_length, rank, price{unit,input,output,is_free}, retirement_at`

- `facets.issuers`：全量厂商名（按模型数降序），供前端筛选下拉；可随列表一起缓存。
- **缓存**：有 Redis 时按 query 组合 key `marketplace:list:<hash>` 缓存 60s（沿用 rankings 模式）；同步成功后清除该前缀。

### 6.2 `GET /api/marketplace/models/:id` —— 模型详情（公开）

- `:id` 为七牛 model_id（含斜杠，gin 路由注册用 `*id` 或前端 encodeURIComponent；实现时验证选 `models/detail?id=xxx` query 形式更稳妥——**拟采用 `/api/marketplace/detail?id=model_id`**，避免斜杠路径问题）。
- 响应：扁平字段 + `detail`（七牛原始对象原样 JSON，前端按需取 pricing_rules_v2 / rate_limit / supported_parameters / model_constraints / architecture）。
- 不存在 → `success:false, message:"model not found"`。
- 详情接口不缓存（单行主键查询，开销极低）。

### 6.3 `POST /api/marketplace/sync` —— 手动立即同步（AdminAuth）

- 执行 `model.SyncMarketplaceModels()`，返回 `{ synced: 192 }`；失败返回 error 信息。
- 路由挂载：apiRouter 下 `middleware.AdminAuth()`（参照 rankings 开关模式，管理员可用）。

路由注册点 [router/api.go L36-37](file:///e:/97_OneAI/one-api/router/api.go#L36-L37) 旁：

```go
apiRouter.GET("/marketplace/models", controller.GetMarketModels)
apiRouter.GET("/marketplace/detail", controller.GetMarketModelDetail)
apiRouter.POST("/marketplace/sync", middleware.AdminAuth(), controller.SyncMarketplace)
```

---

## 7. 前端页面布局设计（任务核心：先布局后实现）

### 7.1 路由 / 入口 / 文件

| 项 | 内容 |
| :--- | :--- |
| 路由 | `/marketplace`（公开页，沿用 /pricing、/rankings 挂载方式，不包 PrivateRoute） |
| 文件 | 新目录 `web/default/src/pages/Marketplace/index.js` + `marketplace.css`（页面级 CSS + `.marketplace-page` 前缀隔离） |
| 菜单 | [navConfig.js](file:///e:/97_OneAI/one-api/web/default/src/components/navConfig.js) 「资源」组：充值 / 价格 / **模型广场（icon: `shop`）** / 排行榜；`marketplace_enabled=false` 时隐藏（localStorage 读 status 标志，沿用 playground 模式） |
| 顶部导航 | 暂不加入 topNavLinks（已有 4 项，避免拥挤）；后续如需可在落地页加卡片入口（本期不做） |
| i18n | `web/default/src/i18n/locales/zh.js` + `en.js` 同 key 双语，禁止硬编码中文；**另需内置 hot_tags（4）/features（12）/模态/能力（function_calling 等）的 code → 中英文案映射**，未知 code 兜底原文 |
| 主题 | 全部用 tokens.css 变量（--bg-surface/inset、--text-primary/secondary/tertiary、--border-strong、--brand-blue、--primary-soft-bg、--glow-primary 等），暗色亮色均验证；卡片复用 `.chart-card` 视觉语言 |

### 7.2 列表页线框（桌面）

```
┌───────────────────────────────────────────────────────────────────────┐
│  模型广场                                                                │
│  汇聚全球主流大模型，覆盖文本、图像、视频、语音，国内/海外分区可选              │
│  [🔍 搜索模型名称 / 描述 ………………………………]                         │
├───────────────────────────────────────────────────────────────────────┤
│  〔 全部 192 〕〔 🇨🇳 国内模型 104 〕〔 🌏 海外模型 89 〕                  │
│                                                                        │
│  厂商: [全部 ▾]   模态: [全部▾][文本][图像][视频][语音]                   │
│  能力: [深度思考][工具调用][生图][视频生成][联网搜索][长上下文][AI编程] …    │
│  排序: [官方推荐 ▾]   （价格从低到高 / 上下文从大到小）                     │
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│ │ [icon] 名称 🌏│ │ [icon] 名称  │ │ [icon] 名称  │ │ [icon] 名称  │    │
│ │ 厂商名        │ │ 厂商名       │ │ 厂商名       │ │ 厂商名       │    │
│ │ [热门][上新]  │ │ [限时免费]   │ │ [深度思考]    │ │ [生图]       │    │
│ │ 简介文字两行… │ │ 简介…        │ │ 简介…        │ │ 简介…        │    │
│ │ 📝文本 🖼图像 │ │ 📝文本       │ │ 📝文本       │ │ 🎬视频       │    │
│ │ 上下文 128K   │ │ 上下文 200K  │ │ 上下文 256K  │ │              │    │
│ │ ─────────── │ │ ─────────── │ │ ─────────── │ │ ─────────── │    │
│ │ 输入 ¥2/M   │ │ 🎉 免费      │ │ 输入 ¥1/M   │ │ ¥0.2/秒     │    │
│ │ 输出 ¥8/M   │ │             │ │ 输出 ¥3/M   │ │             │    │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│       … 24 张/页，响应式：4 列(≥1400) / 3 列 / 2 列 / 1 列(≤640)          │
│                              〔上一页〕 1 2 3 … 〔下一页〕                 │
│  数据更新于 2026-05-xx 03:00（最后同步时间，footer 小字）                   │
└───────────────────────────────────────────────────────────────────────┘
```

**卡片元素约定**：

- 顶部行：模型 avatar（`<img loading="lazy" referrerpolicy="no-referrer">`；http URL 统一升级为 https；加载失败降级为厂商首字母圆底占位）+ 名称（粗体，单行省略）+ 区域角标（色块 + 文字「国内」「海外」，文案走 i18n，不用 emoji 表义）。
- 厂商行：issuer.avatar 小图标（同样懒加载/降级）+ issuer.name（次要文字色）。
- 标签行：`hot_tags` / `features` 为 code，**文案一律经 i18n 映射表解析**（map 缺失的未知 code 直接显示原文）；hot_tags 配色按 code：limited_free=品牌色描边、free=绿、hot=橙、new=蓝；features 取前 3 个用中性签，超出 +N。
- 描述：两行截断。
- 模态行：文本/图像/视频/语音/文件 小图标 + 文字；上下文长度（`>1000` 显示 128K 格式）。
- 卡底分隔线 + 价格区：
  - token 模型：`输入 ¥X.XX /百万token`、`输出 ¥X.XX /百万token`（右对齐小字）；
  - 生图：`¥X.XX /张`；视频：`¥X.XX /秒`；
  - 免费：整行绿色「🎉 免费」；无价目：灰色「价格待公布」；
  - 有 `retirement_at`（即将下线）：灰色「即将下线」小字。
- 整卡可点击 → 打开详情 Drawer；hover 浮起 + 品牌色辉光（--glow-primary），双主题分别验证。

### 7.3 详情展示：右侧大 Drawer（SUI `Modal size='large'` 侧滑样式，自绘 CSS）

**选 Drawer 而非新页面的理由**：保留列表筛选/分页/滚动位置；模型详情内容虽多但单屏分区可容纳；不新增第二条路由的状态管理。实现时如 Drawer 空间不足（定价档位多），退化为居中大 Modal，布局不变。

```
┌──────────────────────────────────────────────────┐
│  [大图标] 模型名称        [国内/海外角标]            │
│           厂商名（链接 model_page ↗）               │
│           [热门] [深度思考] [工具调用] [长上下文]     │
├──────────────────────────────────────────────────┤
│  模型介绍                                          │
│  description 全文……                                │
│                                                    │
│  ▸ 能力支持                                        │
│    输入模态  文本 / 图像    输出模态  文本            │
│    函数调用 ✔  深度推理 ✔  结构化输出 ✔  上下文缓存 ✔ │
│    上下文长度 256,000    最大输出 64,000            │
│    API 协议 openai / anthropic                     │
│                                                    │
│  ▸ 价格（人民币，括号内美元）                        │
│  ┌档位区间(tokens)──────┬输入(/百万)──┬输出(/百万)┐│
│  │ 0 ~ 32,000           │ ¥2.00($0.28)│ ¥8.00     ││
│  │ 32,000 ~ 128,000     │ ¥4.00       │ ¥16.00    ││
│  └─────────────────────┴─────────────┴──────────┘│
│  （生图/视频模型按 ¥/张、¥/秒展示；免费模型整表替换为   │
│    「免费」标识；无价目显示「价格待公布」+ 官方定价页↗） │
│                                                    │
│  ▸ 限流   RPM 500    TPM 128,000    QPM/IPM …      │
│  ▸ 其他   发布时间 / 备案号 / 别名 / 推荐替代模型      │
│                                                    │
│  [ 官方定价页 ↗ ]              [ 立即使用 → ]        │
└──────────────────────────────────────────────────┘
```

- 「立即使用」：默认跳 `/topup`（充值页）。**P1 增值项**：进页面时拉一次本地 `/api/pricing` 得到本站在售模型名集合（Set），取七牛 model_id 最后一个 `/` 后的部分做**精确相等匹配**（如 `deepseek/deepseek-v3.1` 对 `deepseek-v3.1`；不带 `/` 的 id 用全值）——仅精确匹配，不做前缀/模糊匹配以避免误标；命中则卡片/详情显示「✓ 本站已接入」绿徽，按钮变「去对话」→ `/playground`；未命中保持「立即使用」→ `/topup`。
- 各分区在字段为空时整块隐藏，不留空标题。
- 抽屉在暗色主题下的滚动条、分隔线、表格斑马纹单独走 CSS 变量验证。

### 7.4 状态与交互

- 首屏 loading 骨架（6 张灰卡 pulse），请求失败显示 EmptyState 错误态 + 重试。
- Tab/筛选/排序/分页变化走 query 状态（用 URLSearchParams 同步到地址栏，支持刷新保持与分享）。
- 计数（全部/国内/海外）来自首屏列表 total 或 facets，切 region 时保留其它筛选。
- 移动端（≤768px）：筛选折叠为「筛选」弹层，卡片单列，Drawer 全屏化。
- 页脚显示「数据每日自动同步，最后更新：xxx」。

---

## 8. 文件变更清单

### 后端（新增 4 + 修改 6）

| 文件 | 类型 | 内容 |
| :--- | :--- | :--- |
| `model/market_model.go` | 新增 | MarketModel 结构、查询（筛选/分页/排序/facets）、批量 upsert + 删旧事务 |
| `model/market_sync.go` | 新增 | `StartMarketplaceSync()` 协程 + `SyncMarketplaceModels()` |
| `common/marketplace/client.go` | 新增 | 七牛 HTTP client、响应结构、定价摘要抽取（nil 安全） |
| `controller/marketplace.go` | 新增 | 列表 / 详情 / 手动同步 3 个 handler + DTO |
| `model/main.go` | 修改 | migrateDB 追加 AutoMigrate |
| `main.go` | 修改 | 启动 `model.StartMarketplaceSync()`（主节点区） |
| `common/config/config.go` | 修改 | MarketplaceEnabled、QiniuApiSecret |
| `model/option.go` | 修改 | OptionMap 注册 + updateOptionMap 分支 |
| `controller/misc.go` | 修改 | status 下发 marketplace_enabled |
| `router/api.go` | 修改 | 3 条路由 |

### 前端（新增 2 + 修改 4）

| 文件 | 类型 | 内容 |
| :--- | :--- | :--- |
| `web/default/src/pages/Marketplace/index.js` | 新增 | 列表 + 筛选 + 分页 + 详情 Drawer |
| `web/default/src/pages/Marketplace/marketplace.css` | 新增 | 页面样式（CSS 变量，双主题，响应式） |
| `web/default/src/App.js` | 修改 | import + `/marketplace` 路由 |
| `web/default/src/components/navConfig.js` | 修改 | 资源组加菜单项 |
| `i18n/locales/zh.js`、`en.js` | 修改 | marketplace.* 全量 key 双语 |
| `web/default/src/components/OperationSetting.js` | 修改 | 通用区块排行榜后新增「模型广场」：开关 / Key / 同步时间 / 立即同步按钮（详见 §5.3） |

**不触碰**：`relay/` 全部文件、users/channels/tokens/logs 等核心表、embed 打包流程。

---

## 9. 任务步骤拆分（实现阶段执行，预计 6 个提交批次）

1. **后端数据层**：建表 + AutoMigrate + option/config 注册 + status 下发。
2. **七牛客户端 + 同步逻辑**：client 拉取/解析、差集打标、定价抽取、事务 upsert、协程启动；`go build` + 本地启动验证日志与表数据（192 行、分区数 104/89）。
3. **查询接口**：列表（筛选/分页/排序/facets/缓存）+ 详情 + 手动同步；curl 验证三接口。
4. **前端列表页**：路由、菜单、i18n、卡片网格、Tab/筛选/搜索/排序/分页、骨架与错误态、双主题 CSS、响应式。
5. **前端详情 Drawer + 管理端**：分档定价表、能力/限流/备案分区、「本站已接入」P1 匹配、SystemSetting 同步管理。
6. **构建部署回归**：`npx react-scripts build`（CI=false）→ 产物移 `web/build/default` → docker 镜像重建部署；按验收清单走查；更新 AI2AI 架构信息.md / 协议和数据.md。

## 10. 验收标准

- [ ] 启动后空表立即同步一次，`market_models` 落 192 行，国内 104 / 海外 89；每日自动同步一次（日志可见），同步失败不覆盖旧数据。
- [ ] 列表接口 region/q/issuer/modality/feature/sort/分页全部生效，价格排序免费在前、无价目在后；Redis 开关两种部署都正常（无 Redis 不 panic）。
- [ ] 详情接口返回完整七牛原始对象；model_id 含 `/` 可正常查询。
- [ ] 管理端可开关功能、改 Key、手动触发同步、看到同步时间；Key 不被接口明文返回；关闭开关后菜单隐藏、列表接口返回 disabled（手动同步按钮仍可用）。
- [ ] hot_tags/features 标签中英文站均正确显示（code→i18n 映射），未知枚举原文可见不丢失。
- [ ] `/marketplace` 公开可访问（未登录可看）；菜单按开关显隐；卡片信息完整（图标/标签/模态/上下文/摘要价/区域角标），免费与无价目展示正确，生图/视频单位正确。
- [ ] 详情 Drawer 分档定价（含区间、人民币+美元、output 为 null 的生图模型不报错不崩）、能力、限流、备案信息完整；空字段不留空分区。
- [ ] 中英文切换无漏 key；暗色/亮色主题无白底白字/穿帮；≥1400 / 普通 / 移动端三档布局正常。
- [ ] `relay/` 与核心表零改动；数据面请求链路无任何新增 DB/HTTP 调用。

## 11. 已识别风险与处理

| 风险 | 处理 |
| :--- | :--- |
| `details_v2.output` 为 null（部分生图模型） | 强类型指针 + 判空，摘要价置 -1，详情不显示输出价 |
| 1 个模型无价目 | price=-1 / unit=unknown，卡片「价格待公布」 |
| 七牛图标外链防盗链/失效/混合内容 | 同步时 http 统一升级 https（防 HTTPS 页混合内容拦截）；`referrerpolicy="no-referrer"` + onerror 首字母占位 |
| 七牛接口超时/宕机 | 30s 超时；失败保留旧数据；每日重试 + 手动按钮 |
| 多节点部署重复同步 | 协程启动遵循 IsMasterNode 既有模式（与 SyncOptions 一致） |
| 官方新增字段/枚举 | 扁平列容忍未知值；原始 JSON 透传，前端只渲染认识的标签，其余忽略 |
| Key 泄露风险 | 配置名以 Secret 结尾自动脱敏；仅服务端持有，不下发前端 |
