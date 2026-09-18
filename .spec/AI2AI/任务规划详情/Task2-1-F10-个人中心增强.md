# Task2-1 F10 · 个人中心增强（通知渠道 / 配额警告阈值 / 登录会话管理）

> 来源：Task2-1-二开功能规划.md §6 F10（P1）。定位：用户自服务能力，全部为管控面（selfRoute），`relay/` 零改动。

## 1. 现状核对（2026-09-06）

| 关注点 | 现状 |
| :--- | :--- |
| 会话存储 | `main.go` 使用 gin-contrib/sessions **cookie store**（`cookie.NewStore`）——会话数据全在客户端 cookie，服务端无法枚举/吊销 |
| 会话内容 | `session.Set(id/username/role/status)`（controller/user.go `SetupLogin`）；authHelper 仅读这些值 + blacklist 内存判封禁 |
| access token | 无会话时走 `Authorization` 头 → `ValidateAccessToken`（非 cookie 会话，不受"注销其他会话"影响） |
| 邮件能力 | `common/message/email.go SendEmail(subject, receiver, content)` 已有（SMTP 配置在管理端 SystemSetting） |
| 根通知 | `common/message/main.go Notify(by,...)` 仅 root（email/message_pusher），无 per-user 通道 |
| 后台协程模式 | `go controller.AutomaticallyTestChannels(frequency)`（env 驱动，main.go L84） |
| 个人设置页 | `pages/Setting/index.js` → `components/PersonalSetting.js`（通用/绑定/删号三节，SUI 组件） |
| DB | 无 user_settings/user_sessions；AutoMigrate 注册点在 `model/main.go migrateDB()` |

## 2. 设计方案

### 2.1 DB（两张新扩展表，不碰核心表）

1. **`user_settings`**（`model/user_setting.go`，一用户一行，惰性创建）
   - `Id` int PK；`UserId` int uniqueIndex
   - `NotifyType` varchar(20)（'' 关闭 / email / bark / gotify / webhook）
   - `NotifyPayload` text（JSON：各通道参数，见 2.3）
   - `QuotaWarningThreshold` bigint（0=关闭；配额小于该值触发提醒）
   - `LastNotifiedAt` bigint（冷却用）
   - `SessionEpoch` bigint（会话吊销版本号，默认 0）
2. **`user_sessions`**（`model/user_session.go`，仅作展示记录；吊销靠 epoch）
   - `Id` int64 PK；`SessionId` varchar(64) uniqueIndex（登录时生成 UUID）；`UserId` int index
   - `Ip` varchar(64)；`UserAgent` varchar(255)；`CreatedAt`/`LastActiveAt` bigint

### 2.2 会话管理（简化版：列表 + 注销其他）

- **Login**（`SetupLogin`）：生成 `sessionId=common.GetUUID()`；`session.Set("session_id")`、`session.Set("epoch", 当前epoch)`；insert `user_sessions`（IP/UA）。记录失败不阻断登录。
- **authHelper**（`middleware/auth.go`，cookie 会话分支）：
  - 当前 epoch = `model.GetSessionEpoch(uid)`（缓存 60s）；`epoch==0` → 直接放行（兼容存量 cookie/未用此功能用户，零额外开销路径除外的一次缓存查）；
  - `epoch>0` 时：session 无 `session_id`（旧 cookie）或 `epoch` 不等 → `session.Clear()` + 401「登录状态已失效，请重新登录」。
  - access token 分支不校验（token 非会话）。
- **GET /api/user/sessions**：列出本人记录（LastActiveAt desc，当前 sid 标记 `current`），顺带清理 30 天前旧记录。
- **DELETE /api/user/sessions/others**：删除其他行 → `BumpSessionEpoch`（+1 写回 + 缓存写透）→ **当前响应内** `session.Set("epoch", newEpoch)` 续期自身 cookie → 其他设备下次请求 401。
- **Logout**：删除自身 `user_sessions` 行（session.Clear 前取 sid）。
- 缓存：`session_epoch:{uid}` Redis TTL 60s；无 Redis 用进程内 map+RWMutex TTL 60s；bump 时写透（单节点即时生效，多节点 ≤60s 收敛）。

### 2.3 通知渠道（`common/message/notify_user.go` 新文件）

`SendUserNotify(setting, userEmail, title, content)`：

| NotifyType | Payload JSON | 投递 |
| :--- | :--- | :--- |
| email | 无 | `message.SendEmail(title, userEmail, content)`（未绑定邮箱报错） |
| bark | `{server_url?, device_key}` | POST `{server||https://api.day.app}/push` JSON `{device_key,title,body,group:"one-api"}` |
| gotify | `{server_url, app_token}` | POST `{server_url}/message?token={app_token}` JSON `{title,message,priority:5}` |
| webhook | `{url, secret?}` | POST `{url}` JSON `{title,content,timestamp}` + 可选头 `X-OneApi-Secret` |

统一 `&http.Client{Timeout:10s}`；参数缺失/JSON 非法返回 error。

### 2.4 配额警告协程（`monitor/quota_warning.go` 新文件）

- `go monitor.WarnQuotaUsers(interval)`（main.go 启动；`config.QuotaWarningInterval`，env `QUOTA_WARNING_INTERVAL` 默认 600s）。
- 扫描 SQL：`user_settings us JOIN users u ON u.id=us.user_id WHERE threshold>0 AND u.status=1 AND u.quota<threshold AND us.notify_type<>'' AND (last_notified_at=0 OR last_notified_at<now-24h)`。
- 命中 → SendUserNotify（标题含系统名，正文含当前余额/阈值/美元换算）→ 成功更新 `last_notified_at`（失败仅记日志，下轮重试）。
- **冷却 24h**（常量）；不配置即关闭，无全局开关；**不进 relay 链路**（独立协程，只读 DB）。

### 2.5 接口（selfRoute，UserAuth）

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/api/user/setting` | 返回 `{notify_type, notify_payload, quota_warning_threshold}`（无行=默认值） |
| PUT | `/api/user/setting` | upsert；校验 notify_type 枚举/payload JSON 合法/阈值≥0 |
| POST | `/api/user/setting/notify_test` | 用已保存配置发测试通知，返回投递结果 |
| GET | `/api/user/sessions` | 本人会话列表（含 current 标记） |
| DELETE | `/api/user/sessions/others` | 注销其他会话（见 2.2） |

### 2.6 前端（`components/PersonalSetting.js` 追加两节 + zh/en i18n）

- **通知设置**：通知方式 Dropdown（关闭/邮箱/Bark/Gotify/Webhook）→ 按通道渲染参数输入；配额警告阈值 Input（0=关闭，提示文案）；「保存」「发送测试通知」按钮（成功/失败 toast 显示投递原因）。
- **登录会话**：SUI Table（IP/设备 UA/登录时间/最近活跃/当前会话徽标）+「注销其他会话」按钮（确认 Modal；成功后刷新列表）。
- 全部标准 SUI 组件、零硬编码色、走 `API` helper。

## 3. 验收标准

1. 配置 webhook（指向 mock）后「测试通知」收到报文；阈值触发后 24h 内仅告警一次（冷却），清零阈值后不再告警。
2. 双会话登录，「注销其他会话」后被注销方请求 401，当前方正常；Logout 后列表移除该记录。
3. epoch=0 时存量 cookie / access token 行为与改造前一致（回归）。
4. `relay/` 零改动；核心表零改动；生产构建通过；双主题无穿帮。

## 4. 实施状态（2026-09-06 已完成并通过 E2E）

**DB**：`model/user_setting.go`（user_settings：notify_type/notify_payload/quota_warning_threshold/last_notified_at/session_epoch）+ `model/user_session.go`（user_sessions 会话登记，展示用）。均注册 AutoMigrate（model/main.go）。

**会话管理**：SetupLogin 生成 sessionId（random.GetUUID）写入 session + 登记 user_sessions；authHelper 仅对 **cookie 会话**（fromSession）做 epoch 校验——epoch=0 兼容存量会话，bump 后旧 cookie 401；`DELETE /api/user/sessions/others` bump epoch 并在响应中续期当前 cookie；Logout 删除自身行；epoch 缓存 Redis 60s（无 Redis 进程内 sync.Map TTL 60s，bump 写透）。
- **踩坑（ISS-06）**：epoch 校验最初对所有认证路径生效，access token（无 session，sid 恒空）在 epoch>0 时被误踢 401；修复为 `fromSession` 判定后仅 cookie 会话校验。

**通知**：`common/message/notify_user.go` SendUserNotify（email 复用 SendEmail；bark POST {server}/push；gotify POST {server}/message?token=；webhook POST {url} + 可选 X-OneApi-Secret，10s 超时）。通知方式常量定义在 message 包（model 已依赖 message，反向引用会循环导入）。

**配额警告**：`monitor/quota_warning.go` WarnQuotaUsers 协程（config.QuotaWarningInterval，env QUOTA_WARNING_INTERVAL 默认 600s，main.go 启动）；JOIN 扫描 user_settings+users（threshold>0 且 notify_type<>'' 且 status=1 且 quota<threshold 且冷却外），投递成功写 last_notified_at（24h 冷却常量），失败仅记日志下轮重试。不进 relay 链路。

**接口**（selfRoute）：GET/PUT /api/user/setting（PUT 校验 notify_type 枚举 + payload JSON 合法 + 阈值≥0）、POST /api/user/setting/notify_test、GET /api/user/sessions（顺带清理 30 天前记录，current 标记）、DELETE /api/user/sessions/others。

**前端**（PersonalSetting.js）：通知设置（方式 Dropdown 按通道渲染参数输入 + 阈值美元输入，换算 `quota = 美元 × status.quota_per_unit`）+ 登录会话表格（timestamp2string、当前会话绿色 Label、"注销其他会话"确认 Modal，仅 1 条会话时 disabled）；zh/en i18n。
- **踩坑（ISS-07）**：按钮 key `notify.save` 与语言包 `saved` 不一致导致渲染原始 key；补 `"save": "保存设置"/"Save"` 修复。

**E2E（2026-09-06，镜像 one-api-custom 3008，QUOTA_WARNING_INTERVAL=5）**：
- API 25/25 通过：设置 CRUD/roundtrip/非法类型/非法 payload 拒绝；测试通知投递到 mock-openai /hook 并收到报文；阈值触发扫描→mock 收到"配额不足提醒"、last_notified_at 落库；24h 冷却（重置冷却字段后二次验证）；阈值清 0 后不再扫描；双会话列表 current 唯一、注销其他→B 401/A 正常、access token 不受影响、Logout 删行。
- relay 回归：/v1/chat/completions 200（`relay/` 零改动）。
- 浏览器 UI：通知设置表单交互/保存/测试通知 toast、会话表格+当前徽标、单会话时注销按钮 disabled、中文渲染正常（ISS-07 修复后复验）。
- mock-openai 扩展 /hook（POST 计数+last、GET last/count、POST reset），容器重建为 `-p 9000:9000`。
