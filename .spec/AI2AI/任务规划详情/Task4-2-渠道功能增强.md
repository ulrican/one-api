# Task4-2：渠道功能增强

> 来源：Me2AI/任务清单.md Task4-2（L131-141）。定位：管控面增强，不修改 relay/ 数据面，不删除现有硬编码，新增"模型库渠道"模式。
>
> **本文件为实现方案，待站长确认后才进入编码。**

## 1. 需求摘要

1. 渠道类型与模型列表从硬编码改为支持从第三方模型库（七牛）动态获取。
2. 新增渠道类型分类：七牛模型库、其他模型库。
3. 新增渠道时根据渠道类型从对应平台获取模型列表供选择。
4. 渠道需维护 API Key、API Secret 等访问信息。
5. 不删除现有硬编码方式，验证 OK 后由站长明确通知清除。

## 2. 现有代码

| 模块 | 文件 | 现状 |
|:---|:---|:---|
| 渠道类型(后端) | `relay/channeltype/define.go` | 57 个 iota 常量(OpenAI=1→Dummy=56) |
| 渠道类型(前端) | `web/default/src/constants/channel.constants.js` | `CHANNEL_OPTIONS` 硬编码数组 |
| 模型列表获取 | `controller/model.go#ListModels` L49-114 | 遍历 adaptor `GetModelList()` 构建 |
| 渠道实体 | `model/channel.go` L19-41 | `Channel{Type int, Key string, Config string, ...}` |
| 渠道编辑 | `web/default/src/pages/Channel/EditChannel.js` | `GET /api/channel/models` 拉全量列表 |
| 七牛已有(Task4-1) | `common/marketplace/client.go` `model/market_model.go` | 193 模型已同步，含 price_input/output(¥/百万token) |

## 3. 方案

### 3.1 新增渠道类型常量

`relay/channeltype/define.go` 末尾(Dummy 前)加：
```go
QiniuLibrary   // 57：七牛模型库渠道
OtherLibrary   // 58：其他模型库渠道
```
不注册 adaptor，转发时 `ToAPIType` 映射为 OpenAI 兼容（七牛 API 兼容 OpenAI 格式）。

### 3.2 新增扩展表 `channel_model_sources`（不改 channels 表）

| 列 | 类型 | 说明 |
|:---|:---|:---|
| id | int64 PK | 自增 |
| channel_id | int index | 关联 channels.id |
| source_type | varchar(32) | qiniu_library / other_library |
| api_base_url | varchar(512) | 模型库 API 地址 |
| api_key | text | 访问 Key |
| api_secret | text | 访问 Secret |
| last_sync_at | bigint | 上次模型列表同步时间 |
| created_at | bigint | |

### 3.3 后端接口

| 接口 | 鉴权 | 请求 | 响应 |
|:---|:---|:---|:---|
| GET `/api/channel/library/models` | AdminAuth | `?source_type=qiniu_library&api_base=&api_key=&api_secret=` | `{success, data:[{model_id,name,issuer_name,price_input,price_output}]}` |
| POST `/api/channel/library/sync` | AdminAuth | `{channel_id:123}` | `{success, synced:N}` |

> 模型列表优先读 `market_models` 表(秒级)，仅 `POST sync` 实时调七牛。

### 3.4 前端 EditChannel 改造

- 渠道类型下拉新增"七牛模型库/其他模型库"（不删现有选项）。
- 选中模型库类型时：显示 api_base_url/api_key/api_secret 输入框；模型列表从 `/api/channel/library/models` 拉取。
- 选中现有类型时：行为完全不变。

## 4. 实施批次

| # | 内容 | 文件 |
|:---|:---|:---|
| 1 | 扩展表 + model 层 | `model/channel_model_source.go`(新)、`model/main.go` |
| 2 | 后端接口 + 路由 | `controller/channel_library.go`(新)、`router/api.go` |
| 3 | 渠道类型常量 + adaptor 映射 | `relay/channeltype/define.go`、`relay/channeltype/helper.go` |
| 4 | 前端 EditChannel | `web/default/src/pages/Channel/EditChannel.js`、`channel.constants.js` |
| 5 | i18n + 测试 | `locales/zh/en` |

## 5. 决策记录（2026-09-17 站长确认）

1. **api_secret 存储**：AES 加密存储。新增 `common/secret.go` 加解密工具，`channel_model_sources.api_key`/`api_secret` 加密后入库、读取时解密。**不影响 channels.key**（保持现状，后续如需统一加密另议）。
2. **拉模型列表方式**：默认读 `market_models` 表（毫秒级），前端提供"刷新"按钮调 `POST /api/channel/library/sync` 实时拉七牛。与 Task4-1 缓存策略一致。
3. **"其他模型库"范围**：只预留框架。前端选项可选中、后端接口抽象 `source_type` 参数，但 `other_library` 实际不调任何第三方；待后续接入具体供应商时再实现。
4. **七牛模型库 adaptor**：走 `OpenAICompatible` adaptor（七牛 API 兼容 OpenAI 格式），`ToAPIType` 映射零开发成本。
5. **与 Task4-3 联动**：是。Task4-2 完成后渠道模型价格直接用于 Task4-3 自动倍率计算；Task4-3 实现时由渠道保存触发 `go ratio.AutoRecompute(false)`。
