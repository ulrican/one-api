# Task2-1 F12 · 两步验证 2FA（TOTP，Google Authenticator 兼容）

> 来源：Task2-1-二开功能规划.md §7 F12（P2）。定位：用户自服务安全能力。TOTP 纯标准库实现（无新 Go 依赖）；新扩展表 `user_twofa`；`relay/` 零改动、middleware 零改动（2FA 在登录控制器层完成，会话建立后鉴权链路不变）。

## 1. 现状核对（2026-09-06）

| 关注点 | 现状 |
| :--- | :--- |
| 密码登录 | `controller/user.go` `Login` → `user.ValidateAndFill()`（用户名密码校验）→ `SetupLogin`（写 cookie session + F10 会话登记） |
| 登录请求 | `POST /api/user/login` `{username, password}`（公开，CriticalRateLimit）；LoginRequest 结构体 |
| OAuth 登录 | GitHub/Lark/OIDC/微信回调直接 `SetupLogin`（controller/auth.go）——本期 2FA **仅门控密码登录**，OAuth 不拦截（文档注明） |
| access token | `Authorization` 头鉴权，与会话无关，不受影响 |
| 随机数 | `common/random.GetUUID()`；secret 生成可用 crypto/rand |
| 前端登录 | `components/LoginForm.js`（AuthLayout 玻璃卡）；登录成功后 `user.onLocalStorageChanged` + 跳转 `/dashboard` |
| 个人设置 | `components/PersonalSetting.js`（F10 已有通知/会话两节，追加"两步验证"节） |
| TOTP 库 | go.mod 无 otp 依赖 → **纯 stdlib 实现**（crypto/hmac + crypto/sha1 + encoding/base32）；前端无 QR 库 → 新增 npm `qrcode`（toDataURL 渲染二维码） |
| DB | AutoMigrate 注册点 `model/main.go` migrateDB() |

## 2. 设计方案

### 2.1 TOTP 标准库实现（`common/totp/totp.go` 新文件）

RFC 6238 / Google Authenticator 兼容：
- `GenerateSecret() (string, error)`：crypto/rand 生成 20 字节 → base32（RawStdEncoding，无 padding，32 字符 A-Z2-7）
- `ProvisioningURI(issuer, account, secret string) string`：`otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}`（issuer=`SystemName`，account=用户名，URL 编码）
- `Validate(secret, code string) bool`：30s 时间步、HMAC-SHA1、6 位数字、动态截断（RFC4226 DT）；校验当前步 ±1（时钟漂移容忍）；code 必须为 6 位数字
- 不引入第三方 Go 依赖（Docker 构建零新增模块下载风险）

### 2.2 DB（新扩展表，不碰核心表）

`model/user_twofa.go`：

```go
type UserTwoFA struct {
    Id        int    `gorm:"primaryKey;autoIncrement"`
    UserId    int    `gorm:"uniqueIndex"`
    Secret    string `gorm:"type:varchar(64)"`
    Enabled   bool   `gorm:"default:false"`
    CreatedAt int64
    UpdatedAt int64
}
```

- setup 阶段 upsert 一行 `Enabled=false`（允许重复 setup 轮换 secret）；enable 校验通过后置 `Enabled=true`；disable 删除行。
- 方法：`UpsertTwoFASetup(userId, secret)`、`GetTwoFA(userId) (*UserTwoFA, error)`（无行返回 nil, nil）、`EnableTwoFA(userId)`、`DeleteTwoFA(userId)`。
- 注册 AutoMigrate（model/main.go）。

### 2.3 登录两步流程（controller/user.go + controller/twofa.go）

```
POST /api/user/login {username,password}
  ├─ 密码校验失败 → 401 语义（success:false，原样）
  ├─ 密码通过 + 未启用 2FA → SetupLogin（原样）
  └─ 密码通过 + 已启用 2FA → 签发一次性 pending token：
       {success:true, data:{need_2fa:true, twofa_token:<uuid>}}
       （不建立会话；pending TTL 5 分钟，一次性消费）

POST /api/user/login/2fa {twofa_token, code}   （公开 + CriticalRateLimit）
  ├─ pending 无效/过期 → success:false "验证已过期，请重新登录"
  ├─ TOTP 校验失败 → success:false "验证码错误"（pending 保留，允许重试至过期）
  └─ 校验通过 → 消费 pending（一次性）→ 加载用户 → SetupLogin
```

- pending 存储（`model/twofa_pending.go`，与 F10 epoch 缓存同模式）：Redis 优先 `SET 2fa_pending:{token} {userId} EX 300`（RedisEnabled 时）；无 Redis 进程内 `map[string]pendingItem` + sync.RWMutex + 惰性过期。`SaveTwoFAPending` / `ConsumeTwoFAPending`（消费即删，一次性）。
- pending 与用户绑定：登录用户名以 pending 中 userId 为准，防止 token 混用。

### 2.4 自助管理接口（selfRoute，UserAuth）

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/api/user/2fa/status` | `{enabled: bool}` |
| POST | `/api/user/2fa/setup` | 生成 secret + otpauth_url，upsert（enabled=false）；已启用时拒绝（需先停用） |
| POST | `/api/user/2fa/enable` | `{code}`：校验当前 setup secret 的 TOTP → enabled=true；未 setup 拒绝 |
| POST | `/api/user/2fa/disable` | `{code}`：校验 TOTP 通过 → 删除记录（停用） |

### 2.5 前端

- **LoginForm.js**：登录响应 `data.need_2fa` 时切换为验证码视图（6 位数字输入 + "验证并登录" + "返回"），提交 `/api/user/login/2fa`；成功走原登录成功逻辑；错误 toast。
- **PersonalSetting.js** 新增"两步验证"节（标准 SUI）：
  - 未启用：点击"启用"→ 调 setup → Modal 展示二维码（`qrcode.toDataURL(otpauth_url)`，`<img>` 渲染）+ secret 明文（手动录入备用）+ 6 位验证码输入 + "确认启用"；成功后刷新状态。
  - 已启用：绿色"已启用"Label + "停用两步验证"按钮 → Modal 输入验证码确认 → disable。
- npm 新增依赖 `qrcode`（web/default/package.json）。
- i18n zh/en 键 `setting.personal.twofa.*` / `login.twofa.*`。

## 3. 验收标准

1. setup 返回 secret/otpauth_url（secret 为 32 位 base32）；用正确 TOTP code 启用成功；错误 code 拒绝（不启用）；重复 setup 轮换 secret。
2. 启用后：密码正确登录返回 `need_2fa` 且**不建立会话**（带 cookie 调 `/api/user/self` 为未登录态）；正确 code 完成登录；错误 code 拒绝；pending 5 分钟过期；pending 一次性（消费后重放失效）。
3. 停用后密码登录直接成功，不再要求 2FA。
4. access token 调用 `/v1` 与管理端功能不受影响；OAuth 登录不拦截（文档注明）；`relay/` 零改动；核心表零改动。
5. 生产构建通过；双主题无穿帮。

## 4. 实施记录（2026-09-06 完成）

**后端**
- `common/totp/totp.go`（新文件）：纯 stdlib（crypto/hmac、crypto/sha1、encoding/base32、crypto/rand）。`GenerateSecret`（20 随机字节 → base32 RawStdEncoding 无 padding，32 字符 A-Z2-7）、`ProvisioningURI`（issuer=SystemName，缺省 "One API"）、`Validate`（30s 步、HMAC-SHA1、6 位、RFC4226 动态截断、当前步 ±1 漂移、`hmac.Equal` 常量时间比较）。RFC6238 标准向量验证通过。
- `model/user_twofa.go`（新文件）：`UserTwoFA` 结构；**实际表名 `user_two_fas`**（Gorm 默认复数化）；`Secret` 字段 `json:"-"` 不下发；方法 `UpsertTwoFASetup/GetTwoFA/EnableTwoFA/DeleteTwoFA/TwoFAEnabled`。
- `model/twofa_pending.go`（新文件）：登录中间态 TTL 300s；Redis 优先（`2fa_pending:{uuid}`，调用前判 `common.RedisEnabled`），无 Redis 用 sync.Map + 惰性清理；`SaveTwoFAPending`、`PeekTwoFAPending`（只查不消费）、`ConsumeTwoFAPending`（LoadAndDelete/Redis DEL 一次性）。
- `model/main.go`：AutoMigrate 注册 `&UserTwoFA{}`。
- `controller/twofa.go`（新文件）：`GetTwoFAStatus/SetupTwoFA/EnableTwoFA/DisableTwoFA`（selfRoute）+ `LoginTwoFA`（公开接口）。
- `controller/user.go`：`Login` 密码校验通过后、`SetupLogin` 前插入 2FA 分支——已启用则签发 pending token 并返回 `{success:true, data:{need_2fa:true, twofa_token}}`，**不建立会话**。
- `router/api.go`：`POST /login/2fa`（公开 + CriticalRateLimit）、selfRoute 4 个 `/2fa/*` 端点。
- **middleware/auth.go 零改动**；OAuth/access token 不拦截；`relay/` 零改动。

**关键流程修正（E2E 中发现并修复）**
- 初版 `LoginTwoFA` 先 `ConsumeTwoFAPending` 再验码，错误验证码会把一次性 pending 烧毁，导致正确码反而报"会话已过期"。已改为 **Peek（查 userId）→ 加载记录 → TOTP 验码 → 原子 Consume（失败说明并发/已用）→ SetupLogin**；错误码不消耗 pending，与设计"允许重试至过期"一致。

**前端（web/default）**
- `components/LoginForm.js`：`data.need_2fa` 切换验证码视图（shield 图标 6 位数字输入、"验证并登录"渐变主按钮、描边"返回"按钮）；错误走 toast。
- `components/PersonalSetting.js`：新增"两步验证"节——启用走 Modal（`qrcode.toDataURL(otpauth_url)` 渲染二维码 `<img>` + secret 明文 + 验证码输入 + 确认）；已启用显示状态与停用 Modal。
- `package.json` 新增 `qrcode ^1.5.4`；i18n zh/en 键 `login.twofa.*` / `setting.personal.twofa.*` 已补齐。

**验证（E2E 40/40，详见系统测试记录第 13 节）**
- secret 格式（`^[A-Z2-7]{32}$`）与 otpauth URL 正确；错码拒绝、正确码启用；status on 且 secret 不下发；access token 调 `/api/user/self` 不受影响。
- 启用后新客户端登录返回 `need_2fa` 且无会话（/self 401）；错码拒绝且不烧毁 pending；正确码建会话；pending 重放失效、伪造 token 拒绝；验码停用后直接登录恢复。

**双主题**：亮/暗走查通过；走查中发现并修复两处暗色穿帮（见系统测试记录 13.4）：①2FA 登录视图"返回"按钮（SUI `.ui.basic.button` 带 `!important` 黑字，主题规则升级为门控+`!important`）；②react-toastify 白底白字（`ReactToastify.css` 在主题 CSS 之后加载，调整 index.js 导入顺序使主题覆盖生效）。

