# Task4-6 应用管理页面 + Playground 切换 实施计划

## 一、需求与调研结论

### 需求
1. 侧栏「常规」组新增「应用管理」菜单，位置在总览下方、令牌上方（用户明确令牌入口后续才删，本任务保留）。
2. 应用管理（整体复刻令牌）：
   - 新建应用：应用名称、**应用类型（聊天助手/智能体/API接入/其他，用户已确认）**、APIKey（自动生成）、额度限制、过期时间、可用模型
   - 应用列表：名称、类型、APIKey（**脱敏显示，不可直接查看**）、已用额度、剩余额度（=限制额度-已用额度）、创建时间、过期时间、模型信息、状态、操作（复制/编辑/启用禁用/删除）
   - 无独立编辑工具栏，全部操作在列表行内
3. Playground：令牌下拉切换为应用下拉。

### 关键调研（已读代码验证，非臆测）
- `model/token.go` Token 结构已含 **Name/Key(sk- key,char48)/Status/CreatedTime/ExpiredTime(-1永不过期)/RemainQuota/UnlimitedQuota/UsedQuota/Models** —— 应用字段全部具备，**仅缺 AppType**。
- relay 数据面鉴权 `middleware/auth.go#TokenAuth → model.ValidateUserToken(key)`，key 命中 tokens 表 + Redis JSON 缓存（`model/cache.go`，Marshal/Unmarshal 加字段向后兼容，旧缓存反序列化 AppType="" 自然刷新）。
- 令牌接口：`/api/token/` GET 列表/GET 搜索/POST 新增（含 count 批量）/PUT 更新（支持 ?status_only）/DELETE :id；controller/token.go。
- `Token.Update()` 的 Select 白名单不含 app_type → 令牌编辑不会误清应用标记（隔离安全）。
- 前端：`pages/Token/index.js` 薄壳 + `components/TokensTable.js` 列表（含新建/编辑 Modal、模型选择、额度/过期表单、状态渲染）；`pages/Token/EditToken.js` 独立编辑页。
- Playground（`pages/Playground/index.js`）：`GET /api/token/?p=` 取启用令牌 → 下拉 → `Bearer sk-${key}` 调用，并按 token.models 过滤模型。

### 架构决策
**采用"tokens 表新增 app_type 列 + 独立 /api/application/ 接口族"**：
- 用户明确授权"底层数据结构、代码流程复用令牌功能"；tokens 不在禁改核心表(users/channels)清单内，且加列是纯增量（AutoMigrate 自动加列，不动旧数据）。
- 替代方案"新建 applications 表"会迫使鉴权热路径 TokenAuth 查两张表，直接破坏 relay 性能与三不原则，否决。
- 应用即 `app_type != ''` 的 token：**relay 零改动**即可用应用 key 调网关（Playground 自动生效）；旧令牌 app_type='' 两边列表天然隔离。

## 二、改动文件清单

### 后端（新增为主）
1. `model/token.go`：
   - Token 加 `AppType string \`json:"app_type" gorm:"index;default:''"\``
   - 新增 `GetAllUserApplications(userId,start,num,order)` / `SearchUserApplications(userId,keyword)`：在现有条件上 `app_type != ''`
   - Token 加应用更新方法 `UpdateApplication()`（Select 增加 "app_type"）
2. `controller/application.go`（新建）：复刻 token controller 六接口
   - `GetAllApplications`/`SearchApplications`（分页同 ItemsPerPage、order 同）
   - `AddApplication`：校验 appType ∈ {chat,agent,api,other}、名称必填≤30；buildApplication 生成 random.GenerateKey()、写入 AppType
   - `UpdateApplication`：全字段编辑 + `?status_only` 状态切换（沿用过期/耗尽不可启用校验）
   - `DeleteApplication`：:id + userId 作用域
3. `router/api.go`：selfRoute 下新增 `applicationRoute := apiRouter.Group("/application")` + UserAuth，路由同 token 六件套
4. `model/main.go`：无需手改（Token 已在 AutoMigrate，新列自动迁移）—— 验证数据库实际加列

### 前端（新增为主）
5. `pages/Application/index.js`（新建）：dashboard-container + Card 薄壳
6. `pages/Application/ApplicationsTable.js`（新建，由 TokensTable 适配）：
   - 列：应用名/类型彩色 Label/APIKey 脱敏（`sk-****` + 末4位，行内复制按钮，复制内容为完整 `sk-`+key）/已用额度/剩余额度（无限额度显示无限）/创建时间/过期时间（永不过期标签）/模型信息（tags 展开）/状态 Label/操作（复制 key、编辑、启用禁用 Switch、删除确认）
   - 新建 Modal：名称、类型下拉、无限额度勾选+额度输入、过期时间（沿用令牌的过期时间控件：datetime-local/快捷选项）、模型多选（复用令牌同款 ModelSelect）
   - 编辑 Modal：复用同一表单（行内"编辑"入口，无独立工具栏/路由）
   - API 全部走 `/api/application/`；空态引导新建
7. `App.js`：新增 `/application` PrivateRoute（不新增 edit 独立页）
8. `components/navConfig.js`：general 组 dashboard 之后插入 `{ name:'header.application', to:'/application', icon:'cubes' }`
9. `pages/Playground/index.js`：列表源改 `/api/application/`，下拉文案/空态改"应用"，其余（key 调用、按 models 过滤）不动
10. `locales/zh|en/translation.json`：`header.application`、`application.*`（类型名/表单/列表/空态/操作）、`playground.app_placeholder` 等

### 文档
11. `.spec/AI2AI/协议和数据.md`：tokens 表 app_type 新列说明；2.x 新增应用接口协议节
12. `.spec/AI2AI/项目架构信息.md`：Task4-6 段

## 三、实施步骤（依赖序）
1. 后端：Token 加列+model 方法 → application controller → 路由；docker go build ./... 验证
2. 前端：ApplicationsTable + index 页 + 路由 + 菜单 + i18n；react-scripts build
3. Playground 切换
4. 删旧前端产物 → 移产物 → docker build → 重启容器
5. E2E（见下）
6. 更新两份 AI2AI 文档

## 四、验证（全部实际执行，不以"审查"代替）
- 后端 go build 0 错；MySQL 实测 tokens 表出现 app_type 列
- API 流水（PowerShell + root 登录 cookie，名称全 ASCII）：
  1. POST 创建 app_test（类型 chat、500000 额度、7 天过期、限定模型）→ 返回 key
  2. GET 列表含该应用；GET 旧令牌列表不出现该应用（隔离）
  3. PUT 编辑改名/改类型/改额度；PUT ?status_only 禁用 → GET 状态=2；启用恢复
  4. **用应用 key 实际调一次网关** `/v1/chat/completions`（或 Playground 同款）验证 relay 鉴权零改动可用；查 used_quota 增长
  5. DELETE 删除；清理测试数据
- 浏览器 E2E：菜单位置（总览下方）；新建/列表脱敏（不出现完整 key）/复制/编辑/启停/删除；Playground 下拉为应用、模型过滤生效、可发消息
- 无水平滚动条、控制台无新增报错

## 五、风险与处理
- 旧 Redis token 缓存无 app_type：JSON 反序列化得空串，仅影响"应用列表"漏显旧 token（本来也该漏）；更新后自然回源，无需刷缓存
- 应用 key 与令牌 key 同命名空间：uniqueIndex 已防重；ValidateUserToken 不校验类型，应用/令牌均可调网关（符合"应用即凭证"预期）
- 额度语义：限制额度=创建时 remain_quota 初值；剩余=remain_quota（系统实时扣减）；已用=used_quota；不额外存初始值（编辑额度即调整剩余，与令牌一致）
- Playground 无应用时：空态提示"请先在应用管理创建应用"
- Edit 工具 timeout 频繁：每次编辑后 grep 验证落盘，不盲目重试
