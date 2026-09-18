# 屏蔽硬编码渠道/模型数据，只保留七牛同步数据 — 实施计划

## Context（背景与目标）

用户要求：屏蔽代码中硬编码相关的渠道、模型数据，只保留七牛同步过来的（market_models 表）。

调研结论（已完成）：
- **已天然干净、无需改动**（abilities 驱动，当前 abilities 只含七牛模型）：
  - 令牌模型下拉 `GET /api/user/available_models`
  - Playground 聊天页模型下拉（同上，Playground/index.js:66）
  - `/v1/models`（controller/model.go:132-168，abilities 过滤 + custom 兜底追加，七牛模型可正常返回）
  - 价格页 `GetPricing` → `GetAllEnabledPricingModels()`（ability.go:125，abilities 驱动）
- **需要屏蔽的硬编码暴露点（共 3 处）**：
  1. EditChannel 渠道类型下拉（EditChannel.js:392 直接用全量 `CHANNEL_OPTIONS`，约 50 种硬编码类型）
  2. EditChannel「填入相关模型/填入所有模型」按钮（EditChannel.js:574-597，52/53 下也显示，点击灌入硬编码模型——正是此前 53 个硬编码模型入库的来源）
  3. 后端 `GET /api/models`（DashboardListModels → channelId2Models 硬编码 adaptor 清单）与 `GET /api/channel/models`（ListAllModels → 全局 models 硬编码清单）

用户已确认的决策：
- 渠道类型下拉**保留 52（七牛模型库）+ 53（其他模型库）**，其余全部屏蔽
- 后端两接口**切换数据源到 market_models**（API 层彻底无硬编码）

约束：遵循项目"**不删除硬编码**"原则——CHANNEL_OPTIONS、adaptor GetModelList 等硬编码数据全部保留在代码内（不破坏 upstream 合并），仅在对外暴露入口屏蔽/换源。不动 relay/ 数据面。

## 改动清单

### 后端（2 个文件）

1. **model/market_model.go** — 新增查询函数：
   ```go
   // GetMarketModelIds 返回七牛同步的全部模型 id（去重、排序，含全部 price_unit）
   func GetMarketModelIds() ([]string, error)
   ```
   实现：`DB.Model(&MarketModel{}).Distinct("model_id").Order("model_id").Pluck(...)`。
   （清单用途不限 token 计价，与渠道可服务的模型口径一致）

2. **controller/model.go** — 两个接口换数据源（init() 的 channelId2Models 硬编码构建保留，仅不再暴露）：
   - `DashboardListModels`（L117）：`data` 改为 `map[string][]string{"52": ids, "53": ids}`，保持原 map 结构（前端 utils.js loadChannelModels 缓存结构兼容）
   - `ListAllModels`（L125）：`data` 改为由 ids 构建 `[]OpenAIModels{Id, Object:"model", OwnedBy:"qiniu"}`，保持 OpenAI list 结构（供 berry 主题/管理工具等既有消费方兼容）
   - **不动**：ListModels / RetrieveModel / GetUserAvailableModels

### 前端（2 个文件，无新增 i18n 键）

3. **web/default/src/constants/channel.constants.js** — 末尾导出白名单（不删 CHANNEL_OPTIONS）：
   ```js
   // Task4-x：对外可见的渠道类型白名单（模型库类型，数据源为市场同步）
   export const LIBRARY_CHANNEL_KEYS = [52, 53];
   ```

4. **web/default/src/pages/Channel/EditChannel.js**：
   - L392 类型下拉：`options={CHANNEL_OPTIONS}` → `options={CHANNEL_OPTIONS.filter((o) => LIBRARY_CHANNEL_KEYS.includes(o.key))}`
   - L576-597「填入相关模型」「填入所有模型」两个 Button 外包条件 `inputs.type !== 52 && inputs.type !== 53`（「清空」「添加自定义模型」保留，属用户主动输入）
   - 非 52/53 分支的 `getChannelModels` 路径（L89/L202/L261）保留不动——类型下拉过滤后已不可达

### 明确不动（避免误伤）

- `ChannelsTable.js` type2label、`helper.js getChannelOption`：全量 CHANNEL_OPTIONS 仅作**已有渠道的类型标签映射**，不是数据清单暴露，保留
- `utils.js loadChannelModels/getChannelModels`：保留，后端换源后缓存内容自然变为 market 数据
- relay/、ratio 硬编码 map：完全不动

## 验证方案（E2E）

1. 容器编译：`docker run --rm -v "${PWD}:/build" -v "C:\Users\yzz\go\pkg\mod:/go/pkg/mod" -w /build -e GOOS=linux -e CGO_ENABLED=0 golang:1.23-bookworm go build ./...`
2. 前端构建（web/default，`$env:CI="false"; $env:DISABLE_ESLINT_PLUGIN="true"; npx react-scripts build`）→ 移动产物 `web/default/build` → `web/build/default`（先删旧目录）
3. `docker build -t one-api-custom:latest .` → 重启容器（既有标准命令，端口 3008:3000，勿加 --log-dir）
4. API 验证（PowerShell session 登录 root/123456）：
   - `GET /api/models` → data 仅含键 "52"/"53"，值为 market_models 的 model_id（如 deepseek/deepseek-v4-flash-20260731），无 gpt-* 等硬编码
   - `GET /api/channel/models` → data 全为 market 模型 id
   - `GET /api/user/available_models` → 仍仅 1 个七牛模型（回归确认）
   - `/v1/models`（带令牌）→ 返回 abilities 模型，正常
5. 浏览器验证（browser 子代理）：
   - 渠道新建页：类型下拉只有「七牛模型库/其他模型库」2 项
   - 编辑渠道 32（type=52）：模型区无「填入相关模型/填入所有模型」按钮，模型清单来自 library/models
   - 渠道列表页：渠道 32 类型标签正常显示"七牛模型库"
   - 令牌编辑页模型下拉、价格页、Playground：回归无异常

## 部署后收尾

- 更新 AI2AI 文档：`协议和数据.md` 补一节（/api/models 与 /api/channel/models 数据源切换 + 前端类型白名单 LIBRARY_CHANNEL_KEYS）；`项目架构信息.md` 同步一句
- 更新记忆 lessons（如遇新坑）
