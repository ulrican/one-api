# Task4-10b 微信/支付宝原生支付：凭证内置 + 支付宝订单码

> Me2AI/任务清单.md L224-246（与「Task4-10 设置页面优化」并列的第二块任务，AI2AI 编号 4-10b 以区分）。
> 本任务是对 Task4-8「直接到账」方案的**收束调整**：支付商户凭证不再走页面配置/DB，改为代码内置并随二进制发布；支付宝下单方式由电脑网站支付（跳转）改为**当面付订单码（alipay.trade.precreate，扫码）**；新增支付宝启用开关。

## 需求回顾（Me2AI 原文要点）
1. 微信支付方式：**Native 扫码**；支付宝支付方式：**支付宝订单码**（当面付 precreate 二维码）。
2. 使用指定商户信息替换当前项目支付信息；**支付信息不在页面设置，全部代码写死**。
3. 支付宝支付需要在设置页面开启，开启后充值模块显示支付宝支付选项。
4. 支付引用到的本地证书迁移到项目路径下，可随项目发布到阿里云服务器。

## 与 Task4-8 方案的差异（本任务变更点）
| 维度 | Task4-8 现状 | Task4-10b 调整 |
|---|---|---|
| 微信/支付宝商户凭证 | DB option（`WeChatPay*` 5 项 / `Alipay*` 3 项）+ 设置页表单 | **代码内置**：常量 + `go:embed` 商户私钥 PEM；option 映射与页面表单全部移除，DB 不可覆盖 |
| 支付宝下单 | `alipay.trade.page.pay`（跳转收银台，pay_type=redirect） | `alipay.trade.precreate`（订单码二维码，pay_type=qrcode，与微信 Native 同一扫码弹窗交互） |
| 支付方式开放 | direct 模式固定返回 `[alipay, wxpay]` | direct 模式：**微信恒开放**（凭证内置即可用）；支付宝仅 `AlipayEnabled=true` 时返回 |
| 证书 | 无（私钥粘贴文本框） | 商户私钥/证书文件迁入 `common/config/paycerts/`，`embed.FS` 打包进二进制，随镜像发布 |
| 易支付模式 | PaymentMode=epay（地址/PID/密钥页面配置） | **保留不动**（需求只提供微信/支付宝信息，未要求废弃易支付；凭证内置仅针对直连） |

## 内置支付信息（代码写死）
- 微信：AppId `wx0656eee3e5815e5e`；MchId `1746857564`；证书序列号 `2CEC729AAFD3F51FF52EA155A192CDD907277AF9`；APIv3 密钥（32B）；商户私钥 `apiclient_key.pem`（PKCS#8，embed）。
- 支付宝：AppId `2021006163665024`；应用私钥（PKCS#8 base64）；支付宝公钥（SPKI base64，回调验签）。**公钥模式**（需求直接给出支付宝公钥串；E:\pay\ali 下 3 个 crt 一并迁入仓库/二进制备用，但本期请求不使用证书模式参数）。

## 技术设计

### 1. 凭证与证书文件（随二进制发布）
- 新目录：
  - `common/config/paycerts/wx/apiclient_key.pem`（迁自 `E:\pay\wx\1746857564_20261009_cert\apiclient_key.pem`）
  - `common/config/paycerts/ali/alipayCertPublicKey_RSA2.crt`、`alipayRootCert.crt`、`appCertPublicKey_2021006163665024.crt`（迁自 `E:\pay\ali`，去 "(1)" 重复副本；本期不引用，仅随库发布）
- 新文件 `common/config/paycredentials.go`：
  - `//go:embed paycerts` → `payCertsFS embed.FS`；包级变量 `WeChatPayPrivateKey` 从 FS 读取 PEM（trim 空白）。
  - 其余 7 项凭证为 `const`；`config.go` 中原 8 个 var 的初值改为这些常量/PEM（变量名与引用点全部不变，controller/common 零改动引用）。
  - 新增 `var AlipayEnabled = false`（唯一保留 DB 化的支付子开关）。
- 效果：`go build` 后单二进制即含全部凭证，Docker 多阶段构建无需挂载证书目录，复制镜像到阿里云即可用。

### 2. option 层收敛（model/option.go）
- 删除 OptionMap 注册与 updateOption 分支：`WeChatPayAppId/WeChatPayMchId/WeChatPayApiV3Key/WeChatPaySerialNo/WeChatPayPrivateKey/AlipayAppId/AlipayPrivateKey/AlipayPublicKey`（共 8 项）。DB 残留同名行被 loadOptionsFromDatabase 忽略，无法覆盖内置值。
- 新增 `AlipayEnabled`：bool 分支 `config.AlipayEnabled = boolValue` + OptionMap 默认 false。controller GetOptions 的 `*Enabled` 不脱敏，正常回显。

### 3. 支付宝当面付下单（common/alipay.go 新增）
- `BuildAlipayPreCreate(appId, privateKeyPem, outTradeNo, notifyUrl, subject, totalAmount) (qrCode string, err error)`：
  - POST `https://openapi.alipay.com/gateway.do`，form 参数：app_id/method=`alipay.trade.precreate`/format=JSON/charset=utf-8/sign_type=RSA2/timestamp(北京)/version=1.0/notify_url/biz_content{out_trade_no,total_amount,subject}，RSA2 签名复用 `alipaySignParams`。
  - 解析 `alipay_trade_precreate_response`：`code=="10000"` 取 `qr_code`；否则返回包含 msg/sub_code/sub_msg 的错误。
  - **响应验签**：用内置支付宝公钥对业务节点的**原始 JSON 文本**（`json.RawMessage` 原字节，禁止反序列化后重新拼接 k=v——字段顺序/中文/转义差异会导致必验签失败，回调 form 才用 k=v 排序规则）做 RSA-SHA256 验签，验签失败拒绝，防中间人伪造二维码。
- 实测踩坑（2026-10-12 修复）：① `normalizePemPrivateKey` 旧实现先删全部空白再找 PEM 头，`BEGIN PRIVATE KEY` 头内空格一起被删导致标记失配、整串按 base64 解码报 `illegal base64 data at input byte 0`——必须先在原文匹配头尾标记，仅对密文体去空白。② 两网关真实 0.01 诊断单验证通过（微信返回 weixin:// Native 链接、支付宝返回 qr.alipay.com 订单码，说明商户凭证有效且已签约当面付）。
- 实测踩坑 2（2026-10-12 真机验证修复）：① **POST 编码**：Go `url.Values.Encode()` 把空格编成 `+`，subject（"充值额度 500000 点额度"，含全角＄/空格）随 biz_content 提交时支付宝报 `40002 isv.invalid-signature`——抽 `alipayPostForm` 统一把 `+` 替换为 `%20`（字面量 + 已编为 %2B，安全）。② **本机回调不可达兜底**：localhost/内网收不到异步回调时订单永远待支付；`GetPayOrderStatus` 轮询对 direct 模式待支付单主动查单（微信 QueryWeChatOrder / 新增支付宝 alipay.trade.query `QueryAlipayOrder`），查得支付成功即走同一 `FinishOrderTrade` 事务链路入账；下单 3s 内不查、同单 5s 节流（sync.Map）；生产环境回调延迟/丢失同样受益。
- 运行环境修复（2026-10-12）：gorm.io/driver/sqlite v1.5.1 的 AlterColumn 正则对 `decimal(10,2)` 这类列定义在**类型内部逗号**处截断导致重建表时 `invalid DDL, unbalanced brackets`（Order.Amount 每次重启都被判需变更列型→触发重建），SQLite 表现为**首次建库正常、二次启动迁移必失败**；升级驱动至 v1.5.7（括号感知的字段级解析）修复，连续两次 AutoMigrate 全模型通过。MySQL 生产不受此问题影响。
- 回调链路不变：`AlipayNotify`（POST form 公钥验签 + app_id 校验 + TRADE_SUCCESS/FINISHED + 事务金额强校验）对 precreate 同样适用，**路由零改动**。
- 原 `BuildAlipayPagePayURL` 保留（导出符号，备用/可回退），controller 不再调用。

### 4. controller/pay.go 调整
- `GetPayConfig`：methods 动态化——
  - epay 模式：`["alipay","wxpay"]`（现状不变）；
  - direct 模式：`["wxpay"]`，`config.AlipayEnabled` 为 true 时前置追加 `"alipay"`。
- `validateDirectPayParams`：wxpay 校验内置常量非空（部署完整性）；alipay 额外要求 `config.AlipayEnabled`，未开启返回「支付宝支付未开启」；错误文案去掉「请在运营设置填写」。
- `createDirectPayOrder` 的 alipay 分支改调 `createAlipayPrecreateOrder`：响应 `{pay_type:"qrcode", code_url: qrCode, trade_no, quota, amount}`，与微信 Native 响应结构一致；充值单与套餐单（package.go 走同一 launchPay）同时受益。

### 5. 前端
- `PaymentSetting.js`（/payment?tab=payment）：
  - 删除微信 5 项 + 支付宝 3 项 state/表单/提交逻辑；direct 模式改为：说明文案（「微信支付 Native 扫码已内置可用」）+ **支付宝启用 Checkbox（AlipayEnabled，即时保存）** + 凭证内置说明。
  - 易支付参数、价格/限额/预设、模式单选保持不变。
- `TopUp/index.js`：
  - 支付方式按钮由 `payConfig.methods` 动态渲染（当前写死两个按钮）；config 加载后默认选中第一个可用方式（direct 下即微信），避免停留在未开放的 alipay。
  - 扫码弹窗按方式区分文案：微信「微信扫码支付/请使用微信扫一扫」、支付宝「支付宝扫码支付/请使用支付宝扫一扫」（qrPay 增加 method 字段；img alt 同步）。
- i18n（zh/en）：新增 `setting.operation.pay.alipay_enable`、`direct_wechat_builtin`、`direct_credential_notice`；`topup.pay.scan_title_alipay`、`scan_tip_alipay`。

## 实施步骤
1. 建 `common/config/paycerts/`，复制 PEM/CRT；新增 `paycredentials.go`；`config.go` 8 个支付凭证 var 改常量初值 + 新增 `AlipayEnabled`。
2. `model/option.go`：删 8 项映射/分支，加 `AlipayEnabled`。
3. `common/alipay.go`：新增 `BuildAlipayPreCreate`（POST + JSON 解析 + 响应验签）。
4. `controller/pay.go`：methods 动态化；校验加 AlipayEnabled；alipay 分支换 precreate 扫码。
5. `PaymentSetting.js` 瘦身 + 开关；`TopUp/index.js` methods 动态渲染与弹窗文案。
6. i18n zh/en 补键。
7. Docker 内 `go build ./...`；web `npm run build`；AI2AI 文档（协议和数据/项目架构信息）同步。

## 验收标准
1. 支付设置页 direct 模式不再出现任何凭证输入框；仅有支付宝启用开关与内置说明；切换 AlipayEnabled 后刷新仍保持（DB option 生效）。
2. direct 模式、AlipayEnabled=false：充值页只有微信支付；下单出微信 Native 二维码，支付后回调到账（回归）。
3. AlipayEnabled=true：充值页出现支付宝；下单调 precreate 返回订单码二维码；支付宝 App 扫码支付后异步通知验签入账、订单状态变已到账、余额/用户组缓存刷新；套餐购买同链路可用。
4. 支付宝接口响应验签失败/伪造回调/金额不一致均不入账。
5. `GET /api/option/` 不再回显任何微信/支付宝凭证；手工 PUT 这些 key 不改变运行时凭证（内置值不可覆盖）。
6. 二进制内可验证含 PEM（strings/反编译无 DB 依赖）；清空部署机 E:\pay 后容器内支付仍正常（证书不依赖宿主机路径）。
7. epay 模式回归：易支付参数、两种支付方式跳转、回调不受影响。
8. go build 与 web build 通过；双主题下支付设置页样式正常。

## 明确不做
- 不删除易支付模式及其页面配置（需求未要求，保留 Task4-8 互斥模式）。
- 不启用支付宝证书模式（app_cert_sn/alipay_root_cert_sn）；crt 文件仅随库发布备用，请求走公钥模式。
- 不做微信平台证书下载/轮换（维持 Task4-8「APIv3 解密 + 主动查单复核」方案）。
- 不改 orders 表、不改 relay/ 数据面、不改回调路由。

## 风险与回滚
- **风险 1**：支付宝应用若实际为证书模式（目录存在 appCert crt 为佐证），公钥模式请求会被网关拒绝（sub_code 如 aop.invalid-signature 等）。预案：运行期下单报错若指向签名/证书模式，即用已 embed 的 3 个 crt 增加 app_cert_sn/alipay_root_cert_sn（SN=证书 issuerDN+serial 的 MD5）切换证书模式，无需再动部署。
- **风险 2**：当面付需商户账号签约「当面付」产品；未签约 precreate 返回 ACQ.NOT_SIGN。属商户账号侧前置条件，代码侧只能透出错误文案。
- **风险 3**：私钥入库进 Git 历史。用户明确要求代码写死随项目发布；仓库为私有，按需求执行；如需轮换证书仅需替换 paycerts 文件重新发版。
- **回滚**：恢复 option 映射与 PaymentSetting 表单、controller 换回 BuildAlipayPagePayURL 即可；凭证常量与 paycerts 目录保留不影响旧链路。

## 追加：对齐 Me2AI/demo/pay-demo.md 的逻辑调整（2026-10-12 第三轮）

用户要求参考实测沉淀的 pay-demo.md（Python 版支付接入指南）调整当前 Go 实现。逐条对照后，已对齐项无需改（金额单位、订单号规则、双通道幂等入账、回调金额强校验、微信应答格式、precreate 响应验签），实际调整 4 点：

1. **查单状态三分类**（对齐 demo 1.6/2.6/3.3 的 TRADE_STATE_MAP / TRADE_STATUS_MAP）：
   - `common` 新增 `TradeQueryState`（Paid / Pending / Closed）+ `QueryWeChatOrder`/`QueryAlipayOrder` 均改为返回 `(交易号, 金额, state, err)` 四元组。
   - 微信映射：SUCCESS→Paid；NOTPAY/USERPAYING→Pending；CLOSED/REVOKED/PAYERROR→Closed；**REFUND→Closed（领域修正：demo 映射 REFUND→PAID 是通用商城语义，充值入账场景退款入账=送额度，绝不入账）**；未知状态保守按 Pending。
   - 支付宝映射：TRADE_SUCCESS/TRADE_FINISHED→Paid；WAIT_BUYER_PAY→Pending；TRADE_CLOSED→Closed；**40004+ACQ.TRADE_NOT_EXIST→Pending（买家未扫码前交易不存在属正常现象，此前被当 error 每 5s 刷一条 SysError 日志）**；其余才返回 error。
2. **reconcileDirectOrder 适配三分类**：Paid→FinishOrderTrade 入账（原链路）；Pending→静默等下一轮（不再刷错误日志）；Closed→新增 `model.MarkOrderExpired`（条件更新 pending→expired，与回调入账互斥）本地同步过期 + SysLog，并把过期后的订单返回给前端。
3. **WeChatPayNotify 查单复核收紧**：`err != nil || state != Paid` 才返回 5xx FAIL 让微信重推，仅信任平台确认已支付的结果。
4. **终态同步与应答规范**：
   - AlipayNotify 失败应答 `fail`→`failure`（对齐 demo 0.6 支付宝应答规范；易支付 PayNotify 的 `fail` 是易支付协议，不动）。
   - 前端 TopUp 轮询（3s，对齐 demo 0.5）：`status===1` 成功停止之外，新增 `status===2`（平台已关闭/已超时）时停止轮询、关闭扫码弹窗、提示并刷新订单列表（demo 5.3：CLOSED 需重新下单）。
5. **明确不做**：不加 precreate `timeout_express`（本地 30min 过期 + 晚支付仍入账的既定设计更宽容）；不实现微信平台证书验签（维持解密认证+查单复核双保险）；REFUND 不按 demo 映射为 PAID。

验证：`go build ./...` 通过；web build 产物已同步 `web/build/default/`；服务已重启（localhost:3008）。
