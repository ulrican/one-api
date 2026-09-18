基于 **One-API** 二次开发，将其打造为具备 **New-API** 同等“商业化+面向 C 端”效果的产品，核心在于补齐三块短板：**面向 C 端的现代化 UI/交互**、**微信/支付宝/易支付等在线支付流**、以及**优化后的路由与体验**。

为了避免破坏原有的高性能网关架构，建议按照以下**增量二开路线图**逐步实施。

### 一、 核心改造路线图

```
+-----------------------------------------------------------------------+
|                       1. 前端 UI 重构 (web/)                           |
|  - 增加 C 端极简仪表盘 (Dashboard)   - 拆分控制台与用户交互界面        |
|  - 增加在充值面板 (微信/支付宝/易支付)  - 内嵌轻量级 Chat 对话组件       |
+-----------------------------------------------------------------------+
                                    │
                                    ▼ (HTTP REST API)
+-----------------------------------------------------------------------+
|                       2. 后端逻辑扩展 (Golang)                         |
|  - 扩展 Pay API & Webhook 回调   - 增加了支付订单表 (orders)          |
|  - 扩展系统配置与套餐 (Packages)   - 引入动态模型映射 & 渠道延时检测    |
+-----------------------------------------------------------------------+
```

### 二、 详细开发实施步骤

#### 步骤 1：前端 UI 重构（面向 C 端的现代化改造）

One-API 默认使用 Semantic UI / React，样式偏向 10 年前的传统控制台。改造建议使用 **Tailwind CSS + Shadcn UI 或 Ant Design** 进行局部/整体替换。

- **动作 1：拆分用户侧与管理侧视图**
  - 在 `web/src/pages/` 下新增 `User/` 目录，专门放置面向普通用户的页面（仪表盘、充值中心、对话面板）。
  - 隐藏复杂配置（如渠道管理、倍率微调），在用户侧仅暴露：**余额/套餐、已用 Token 曲线、我的 API Key、在线充值、WebChat**。
- **动作 2：内嵌轻量 WebChat 对话框**
  - 使用开源的 `@chatscope/chat-ui-kit-react` 或嵌入轻量级的 NextChat 组件。
  - 允许用户直接在网页端使用当前账户的余额发起对话（默认读取当前登录用户的第一个 Key），避免用户必须下载额外软件。

#### 步骤 2：后端数据库扩展（新增支付与套餐表）

**原则：不修改 One-API 原有核心表（如 `users`、`channels`），采用新建扩展表机制。**

在 `model/` 目录下新增以下两张表模型：

1. **订单表 `orders`（支持异步回调充值）：**

   Go

   ```
   // model/order.go
   type Order struct {
       Id           int64   `json:"id" gorm:"primaryKey;autoIncrement"`
       TradeNo      string  `json:"trade_no" gorm:"uniqueIndex;type:varchar(64)"` // 系统内部订单号
       OutTradeNo   string  `json:"out_trade_no" gorm:"type:varchar(64)"`        // 支付平台单号
       UserId       int     `json:"user_id" gorm:"index"`
       Amount       float64 `json:"amount" gorm:"type:decimal(10,2)"`            // 支付金额 (元)
       Quota        int64   `json:"quota"`                                       // 获得的 Token 额度
       Status       int     `json:"status" gorm:"default:0"`                     // 0:未支付, 1:已支付, 2:已超时
       PaymentMethod string `json:"payment_method" gorm:"type:varchar(20)"`      // epay, wxpay, alipay
       CreatedAt    int64   `json:"created_at"`
       UpdatedAt    int64   `json:"updated_at"`
   }
   ```

2. **充值套餐表 `packages`（可选）：** 定义“充值 10 元得 1,000,000 Token”、“月度 VIP 套餐”等模版。

#### 步骤 3：开发后端支付接入与 Webhook 回调

New-API 的核心优势之一在于集成第三方支付。最通用的二开方案是接入 **易支付协议（Epay）** 或 **微信/支付宝原生 SDK**。

1. **新增支付 Controller：** 在 `controller/pay.go` 中实现三大核心接口：

   - `POST /api/user/pay/create`：创建订单，生成支付二维码或跳转 URL。
   - `GET/POST /api/user/pay/notify`：**支付平台异步回调通知接口（核心安全点）**。
   - `GET /api/user/pay/status`：前端轮询订单支付状态。

2. **回调处理与并发安全扣费逻辑：**

   Go

   ```
   // controller/pay.go
   func PayNotify(c *gin.Context) {
       // 1. 校验支付平台签名 (MD5 / RSA 验签，防止伪造)
       if !verifyEpaySignature(c) {
           c.String(http.StatusBadRequest, "fail")
           return
       }
   
       tradeNo := c.Query("out_trade_no")
   
       // 2. 开启 DB 事务更新订单状态与增加用户配额
       err := model.DB.Transaction(func(tx *gorm.DB) error {
           var order model.Order
           if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
               return err
           }
           if order.Status == 1 { // 防止重复回调
               return nil
           }
   
           // 更新订单为已支付
           order.Status = 1
           tx.Save(&order)
   
           // 原子增加用户 Quota 额度
           return tx.Model(&model.User{}).Where("id = ?", order.UserId).
               UpdateColumn("quota", gorm.Expr("quota + ?", order.Quota)).Error
       })
   
       if err != nil {
           c.String(http.StatusInternalServerError, "fail")
           return
       }
   
       // 3. 同步刷新 Redis 缓存中的用户 Quota，确保网关无需查 DB 立刻生效
       cleanUserCache(order.UserId)
   
       c.String(http.StatusOK, "success")
   }
   ```

#### 步骤 4：增强渠道智能路由与自动降级

原版 One-API 的路由选择较为单一，参照 New-API 的思路进行改造：

- **修改 `relay/channel.go` 中的渠道选择器：**
  1. **实时延时避险：** 增加一个后台 Timer 协程，定期对渠道发起 `ping` 或测试 `models` 接口，计算最近 5 次调用的平均延迟。
  2. **动态剔除：** 选取 Channel 时，排除过去 10 分钟内连续报错（429 或 5xx）超过 3 次的节点。
  3. **增强型模型映射（Model Mapping）：** 支持正则映射（如将用户请求的 `gpt-4-.*` 自动正则重写为最便宜的特定渠道模型）。

#### 步骤 5：构建与打包流转 (Build)

One-API 采用 Go `embed` 语法将静态资源打包进单二进制文件中。完成二开后，使用以下命令构建生产包：

Bash

```
# 1. 编译前端静态资源
cd web
npm run build
cd ..

# 2. 将前端产物打包进后端并编译二进制程序
go mod download
go build -ldflags "-s -w" -o custom-one-api main.go
```

### 三、 二开防踩坑注意点

1. **不要破坏异步扣费主链路：** 修改代码时，切勿在 `relay/` 数据面主请求链路中添加耗时的同步数据库查询或网络 HTTP 请求。所有的支付、结算、日志统计必须保持异步/Redis 操作。
2. **严防支付回调伪造（安全第一）：**
   - 支付回调接口必须做强签名校验（校验 key 密钥）。
   - 数据库更新一定要加事务锁（如 `FOR UPDATE`），避免回调重试导致重复加余额。
3. **保持 upstream 同步：** 在你的 Git 仓库中将官方 One-API 设置为 `upstream` 远端。二开时尽量**以新增文件/新增模块为主，少改动原有代码文件**，这样日后可以通过 `git fetch upstream` 轻松合入 One-API 官方修复的漏洞与新增的基础模型支持。