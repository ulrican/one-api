# Task4-8 充值模块优化（直接到账）

## 需求回顾（Me2AI/任务清单.md L192-197）
- 保留易支付模式，新增微信/支付宝原生直连支付（直接到账）。
- 设置页支持开启/关闭，直接到账与易支付互斥（单选）。
- 直连模式设置模块维护微信支付、支付宝支付参数。
- 充值价格、最低/最高金额、金额预设与易支付模式共用一套。
- 在线充值页面按开启的支付类型渲染对应交互。

## 已实现框架（本任务开始前）
| 模块 | 位置 | 状态 |
|---|---|---|
| PaymentMode 配置（epay/direct 互斥） | common/config/config.go L97-117 | ✅ |
| 直连参数配置项（微信5项/支付宝3项） | config.go + model/option.go 双向映射 | ✅ |
| 设置页支付模式单选 + 参数表单 | web/default/src/components/OperationSetting.js L700-834 | ✅ |
| 公开回调路由 + 用户接口路由 | router/api.go L34-38, L65-67 | ✅ |
| CreatePayOrder 按 PaymentMode 分支 | controller/pay.go L108-112 | ✅ |
| GetPayConfig 返回 payment_mode | controller/pay.go L27-43 | ✅ |
| 通用入账 FinishOrderTrade（行锁/幂等/金额校验/事务） | model/order.go L98-168 | ✅ 复用 |
| 前端 pay/config 驱动渲染 + 轮询 | web/default/src/pages/TopUp/index.js | ✅（仅 epay 交互） |

## 本次补全内容
### 1. 后端微信支付封装（新增 common/wechatpay.go，纯标准库）
- 请求签名：WECHATPAY2-SHA256-RSA2048（商户私钥，消息=METHOD\nURL\n时间戳\n随机串\nBODY\n）。
- Native 下单：POST https://api.mch.weixin.qq.com/v3/pay/transactions/native → code_url。
- 回调 resource 解密：AES-256-GCM，key=APIv3Key(32B)，解密成功即完成身份认证（共享密钥）。
- 主动查单：GET /v3/pay/transactions/out-trade-no/{no}?mchid=xx，回调用查单结果入账（免平台证书轮换，只信任我方 TLS 直连查询）。
- 私钥归一化：兼容多行 PEM / 单行 PEM（输入框粘贴丢换行）/ 纯 base64。

### 2. 后端支付宝封装（新增 common/alipay.go，纯标准库）
- 下单：alipay.trade.page.pay（电脑网站支付），RSA2 签名（含 sign_type，剔除空值），拼 gateway.do 跳转 URL。
- 回调验签：支付宝公钥 RSA-SHA256 验签（剔除 sign/sign_type 与空值，ASCII 排序 k=v&）。

### 3. controller/pay.go 补全 4 个 TODO 桩
- createWeChatNativeOrder：下单得 code_url，响应 `{pay_type:"qrcode", code_url, trade_no, quota, amount}`。
- createAlipayPageOrder：得 pay_url，响应 `{pay_type:"redirect", pay_url, trade_no, quota, amount}`。
- WeChatPayNotify：解密 resource → trade_state=SUCCESS → 主动查单复核金额 → FinishOrderTrade → 按 v3 规范应答 JSON。
- AlipayNotify：验签 → app_id/trade_status/total_amount 校验 → FinishOrderTrade → 应答 success/fail。
- 直连模式下单前先校验对应支付方式参数已配置（避免先插订单再报错留脏单）。

### 4. 前端 TopUp 直连交互
- startPay 按 pay_type 分支：qrcode → 二维码弹窗（qrcode 库已有依赖）；redirect / epay pay_url → window.open（原逻辑）。
- 二维码弹窗：金额、二维码、扫码提示、等待态；关闭即停轮询；轮询逻辑复用现有 pollOrderStatus。
- i18n：zh/en 增加 topup.pay.scan_* 键。

### 5. 安全加固
- controller/option.go GetOptions：隐藏后缀为 PrivateKey / ApiV3Key 的配置（对齐 EpaySecret 隐藏策略），留空不修改语义已有。

## 验收标准
1. PaymentMode=direct 时：设置页仅显示直连参数表单；epay 时仅显示易支付参数。
2. 直连+微信：充值页扫码弹窗，支付后轮询到账、订单状态更新为已到账。
3. 直连+支付宝：跳转支付宝收银台，支付后回调入账。
4. 回调重放/伪造/金额篡改均不入账（验签/解密+查单+金额校验三道防线）。
5. go build 与 web build 通过；epay 模式回归不受影响。

## 明确不做
- 不实现微信平台证书下载与轮换（用主动查单替代）。
- 不引入第三方支付 SDK（保持依赖零增长，stdlib 实现）。
- 不改动 relay/ 数据面与核心表；orders 表结构不变。
