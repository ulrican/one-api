# One-API 二次开发 AI 编码规范

## 一、 项目背景与核心原则
1. **系统定位**：高并发 AI 模型聚合网关。数据面（Relay 转发）性能优先，管控面（Admin/User 管理）安全稳定优先。
2. **三不原则**：
   - 不修改核心转发链路（`relay/`）的同步阻塞逻辑，禁止在数据面引入耗时 DB 查询。
   - 不直接修改原版核心表结构（如 `users`, `channels`），优先采用新增扩展表（如 `orders`）并使用 Gorm 外键关联。
   - 不动核心 Go `embed` 静态打包流程，保持前端编译产物与后端的解耦。

---

## 二、 后端规范 (Golang / Gin / Gorm / Redis)

### 1. 架构与目录分工
- **Controller 层 (`controller/`)**：负责参数校验、HTTP 响应格式化、调用 Model 或 Service。不写复杂业务逻辑。
- **Model 层 (`model/`)**：负责 Gorm 结构体定义、数据库读写、事务控制。
- **Relay 层 (`relay/`)**：负责大模型协议转换与流式透传（数据面），修改需极度谨慎。
- **Middleware 层 (`middleware/`)**：处理鉴权、限流、跨域。

### 2. 并发与数据库开发规范
- **原子扣费与余额处理**：
  - 更新用户余额/配额时，必须使用 SQL 原理表达式更新，禁止“先 SELECT 再计算后 UPDATE”。
  - 示例：`tx.Model(&User{}).Where("id = ?", id).UpdateColumn("quota", gorm.Expr("quota + ?", addQuota))`
- **事务处理**：
  - 在涉及充值、订单状态更新等敏感操作时，必须使用 `model.DB.Transaction(func(tx *gorm.DB) error { ... })`。
  - 关键资源查询须配合行锁（如 `.Set("gorm:query_option", "FOR UPDATE")`）。
- **Redis 缓存优先**：
  - 用户 Quota、Token 状态更新后，必须同步调用 `cleanUserCache(userId)` 或更新 Redis 对应 Key，保障网关毫秒级鉴权。

### 3. 代码质量与错误处理
- 必须遵循 Go 官方风格，禁止无意义的 `panic`，所有 error 显式捕获并记录日志。
- 面向用户的错误响应必须使用标准结构：`c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})`。

---

## 三、 前端规范 (React / Semantic UI / Tailwind)

### 1. 模块化隔离
- **管理端与用户端分离**：
  - 管理员功能保留在原版页面中。
  - 所有二次开发的 C 端页面（如个人中心、充值、看板、WebChat）统一放置于 `web/src/pages/User/` 目录下。
- **状态管理与请求**：
  - 统一使用封装好的 `API` 工具模块发起 AJAX 请求。
  - 请求路径前缀遵循系统 API 规约（如用户侧接口使用 `/api/user/...`）。

### 2. UI/UX 体验
- 二开组件推荐使用现代简洁风格，流式打字机响应必须处理好 SSE（Server-Sent Events）的资源释放，组件卸载时手动关闭 EventSource。

---

## 四、 安全规范 (Security)

1. **支付与回调安全**：
   - 所有第三方支付回调（Webhook）必须强制校验签名（MD5 / RSA）。
   - 回调逻辑必须具备幂等性（通过订单状态 `Status == Paid` 防重刷）。
2. **凭证脱敏**：
   - 包含 `SecretKey`、`Password` 的结构体或 JSON 响应，必须增加 `json:"-"` 标记或在输出前做掩码处理。

---

## 五、 AI 协作 Prompt 指令范例

向 AI 提交二开任务时，请按以下 Spec 模板编写指令：

```text
[二开任务]: 为 One-API 增加支付宝/易支付回调接口
[关联目录]: controller/pay.go, model/order.go, router/api-router.go
[实现要求]:
1. 在 model/order.go 定义 Order 结构体，包含事务加锁更新 Quota 逻辑。
2. 在 controller/pay.go 中实现 PayNotify 接口，包含 MD5 签名校验。
3. 更新用户 Quota 后，异步调用 cleanUserCache 清除 Redis 缓存。
4. 严格遵守《One-API 二次开发 AI 编码规范》，不要修改 relay/ 目录下的任何代码。