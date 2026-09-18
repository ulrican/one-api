# FluxAPI 使用说明

> FluxAI（流光算力）AI 模型聚合网关 · 用户接入指南
> 完全兼容 OpenAI API 协议——改两行代码（Base URL + API Key）即可无缝接入。

---

## 1. 平台简介

FluxAPI 是 FluxAI 平台对外的统一大模型调用接口：

- **OpenAI 兼容**：任何支持 OpenAI SDK / API 规范的客户端、框架、应用都能直接使用
- **多模型聚合**：一个 Key 调用平台上线的全部模型（当前已接入 DeepSeek 系列，持续扩充）
- **透明计费**：按 token 用量计费，价格页明码标价，日志页逐笔可查

## 2. 快速开始（4 步）

| 步骤 | 操作 | 位置 |
|---|---|---|
| ① 注册/登录 | 注册账号并完成登录 | 右上角 → 注册 |
| ② 创建 API 令牌 | 令牌页 → 添加令牌（得到 `sk-` 开头的密钥） | 控制台 → 令牌 |
| ③ 查看模型与价格 | 确认可用模型、输入/输出单价 | 控制台 → 价格 |
| ④ 发起调用 | 用 Base URL + 令牌调用接口（见下文示例） | 任意 OpenAI 兼容环境 |

## 3. 接口规格

### 3.1 基本信息

```
Base URL : {站点地址}/v1
认证方式 : Authorization: Bearer sk-你的令牌
协议     : OpenAI API 兼容，JSON 请求/响应，流式为 SSE
```

### 3.2 核心接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/v1/chat/completions` | POST | 对话补全（核心接口），支持流式 |
| `/v1/models` | GET | 查询当前令牌可用的模型列表 |
| `/v1/embeddings` | POST | 文本向量化（视渠道支持情况） |

### 3.3 常用请求参数（chat/completions）

| 参数 | 类型 | 说明 |
|---|---|---|
| `model` | string | 模型名，如 `deepseek-chat`，必填 |
| `messages` | array | 对话消息数组 `[{role, content}]`，必填 |
| `stream` | bool | 是否流式返回（SSE），默认 false |
| `temperature` | number | 采样温度 0~2，默认 1 |
| `max_tokens` | int | 最大生成 token 数 |

### 3.4 响应结构

返回 OpenAI 标准格式，用量在 `usage` 字段：

```json
{
  "id": "chatcmpl-xxx",
  "model": "deepseek-chat",
  "choices": [{ "message": { "role": "assistant", "content": "..." } }],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 42,
    "total_tokens": 57
  }
}
```

## 4. 调用示例

### 4.1 curl

```bash
curl {站点地址}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-你的令牌" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

### 4.2 Python（openai SDK）

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-你的令牌",
    base_url="{站点地址}/v1"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好"}],
)
print(response.choices[0].message.content)
```

### 4.3 Node.js（openai 包）

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-你的令牌",
  baseURL: "{站点地址}/v1",
});

const res = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "你好" }],
});
console.log(res.choices[0].message.content);
```

### 4.4 流式调用

请求中传 `"stream": true`，响应为 SSE 逐块推送，直到收到 `[DONE]`。
各语言 SDK 的流式用法与 OpenAI 官方完全一致（Python `stream=True` + 迭代器 / Node `stream: true`）。

## 5. 第三方客户端接入

控制台「Playground」右上角插头菜单提供**一键接入链接**（自动带上当前服务器地址与所选令牌）：

| 菜单项 | 客户端 | 形式 |
|---|---|---|
| NextChat 链接 | NextChat 网页版 | 复制网址到浏览器打开即自动配置 |
| AMA 链接 | Cherry Studio 桌面版 | 需本机已安装（深链拉起） |
| OpenCat 链接 | OpenCat（iOS/Mac） | 需设备已安装（深链拉起） |
| LobeChat 链接 | LobeChat 网页版 | 复制网址打开即自动配置 |

也可以在任何客户端中手动填写：**Base URL = `{站点地址}/v1`，API Key = 你的令牌**。

不想写代码？控制台内置 **Playground 对话页**可直接测试（令牌筛选器会联动过滤模型列表）。

## 6. 模型与价格

### 6.1 价格查询

- **价格页**（控制台 → 价格）：所有可用模型的输入/输出单价，单位 **元 / 1K tokens**，实时来自系统倍率配置
- **公开接口**：`GET /api/pricing` 返回模型清单与倍率（无需鉴权）
- **模型可用性**：`GET /v1/models`（按你的令牌与分组过滤）

### 6.2 当前已接入模型（快照，以价格页为准）

| 模型 | 定位 |
|---|---|
| deepseek-chat | 通用对话，高性价比 |
| deepseek-reasoner | 深度推理（R1），数学/逻辑/代码 |
| deepseek-flash / deepseek-v4-pro | 扩展模型（价格见价格页） |

### 6.3 计费规则

```
本次扣费 = ( 输入tokens × 模型倍率 + 输出tokens × 模型倍率 × 补全倍率 ) × 分组倍率
```

- 倍率体系与人民币的换算基准：**1 模型倍率 = $0.002/1K tokens ≈ ¥0.014/1K**（即 ¥14/百万 tokens）
- 输出单价 = 输入单价 × 补全倍率（生成比理解更贵）
- 分组倍率按账户所在分组生效（default 分组 = 1.0）
- 价格页展示的为基准分组价格

## 7. 充值与对账

### 7.1 充值

- 入口：控制台 → 充值（在线支付：支付宝 / 微信，支付成功**实时到账**）
- 额度换算：**充值到账 quota = 充值金额 ÷ 充值价格 × 500,000**；充值价格默认 7.3 元/$ 额度
  - 例：充 ¥10 → 10 ÷ 7.3 × 500,000 ≈ 684,931 quota ≈ $1.37 额度
- 单笔限额与快捷金额档位见充值页
- 推荐先小额充值试通全流程

### 7.2 对账

控制台 → 日志：每笔调用记录**时间、模型、输入/输出 tokens、扣除 quota**，可与账单核对。

## 8. 令牌（API Key）管理

令牌页支持对每个 Key 独立设置：

| 设置 | 说明 |
|---|---|
| 额度上限 | 该 Key 累计最多消耗的 quota，防失控 |
| 有效期 | 过期自动失效 |
| IP 白名单 | 限制调用来源 IP |
| 模型范围 | 限定该 Key 只能调用哪些模型（Playground 模型列表会联动过滤） |
| 分组 | Key 所属分组决定分组倍率与可用模型 |

多项目/多人使用建议：**一人一 Key、一项目一 Key**，单独设额度上限，便于隔离与撤销。

## 9. 错误码与排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 401 无效的令牌 | Key 错误/已删除/过期 | 令牌页检查状态与有效期 |
| 403 无权使用模型 | 模型不在令牌的模型范围内 | 编辑令牌的"模型范围" |
| 429 | 触发限流 | 降低并发，稍后重试 |
| 额度不足 | 令牌额度上限或账户余额耗尽 | 提升令牌额度 / 充值 |
| 模型返回 5xx | 上游渠道波动 | 稍后重试，持续失败请联系管理员 |

## 10. FAQ

**Q：和直接调 DeepSeek 官方 API 有什么区别？**
协议完全一致（OpenAI 兼容），区别只在 Base URL 和 Key，以及本平台的统一计费与多模型聚合。价格由平台定价，见价格页。

**Q：一个 Key 可以多人/多项目共用吗？**
可以，但建议分 Key 管理：额度隔离、日志可区分、泄露时单独撤销。

**Q：充值后额度没到账？**
在线支付到账依赖支付平台异步回调，需站点公网可达；等待 1~2 分钟仍未到账，在日志/订单中核对支付状态，联系管理员处理。

**Q：怎么知道某个模型划不划算？**
价格页输出价 ≈ 输入价 × 补全倍率；长回复场景优先看输出价。

---

*文档对应系统版本：FluxAI（one-api 二开），配置类信息（价格、充值价、模型清单）以站内页面实时数据为准。*
