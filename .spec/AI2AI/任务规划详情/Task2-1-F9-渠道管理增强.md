# Task2-1 F9 · 渠道管理增强（仅管理面 9a）

> 任务来源：Task2-1-二开功能规划.md §6 F9。范围仅 **9a 管理面**（低风险）；9b 数据面路由增强（实时延时避险/动态剔除）本期不纳入，`relay/` 零改动。

## 1. 现状核对（2026-09-06 代码核对）

| 项 | 现状 |
| :--- | :--- |
| channels 表字段 | 已有 `Weight *uint`、`ResponseTime int`、`TestTime int64`、`Priority *int64`；**无 Tag 字段** |
| 后端接口 | 单个增删改查、`GET /test`（scope=all/disabled 全量异步测试）、`GET /test/:id`、`DELETE /disabled`、余额更新；**无按 ID 批量启停/测试/删除** |
| 状态同步 | `model.UpdateChannelStatusById(id, status)` 已同步 `abilities.enabled`；`channel.Delete()` 已清理 abilities |
| 全量测试 | `controller/channel-test.go` `testChannels(ctx, notify, scope)`：全局锁防重 + goroutine 异步 + 自动禁用/恢复 |
| 前端列表 | 列：ID/名称/分组/类型/状态/**响应时间（已有）**/余额/优先级(详情模式可编辑)/测试模型/操作；`manageChannel` 含 `weight` 分支但**无权重 UI 入口**；无标签列；无勾选批量操作 |
| 前端表单 | EditChannel 无标签字段 |

## 2. 改造方案

### 2.1 后端（新增为主）

1. **`model/channel.go`**
   - Channel 新增 `Tag string \`json:"tag" gorm:"type:varchar(64);default:''"\``（列名 `tag`，与 new-api 一致；AutoMigrate 自动加列，官方上游目前无此字段，冲突风险低）。
   - 新增 `GetChannelsByIds(ids []int) ([]*Channel, error)`。
   - 新增 `BatchUpdateChannelStatus(ids []int, status int) error`：循环 `UpdateChannelStatusById`（管理面低频，复用既有 abilities 同步）。
   - 新增 `BatchDeleteChannels(ids []int) (int64, error)`：循环 `channel.Delete()`（含 abilities 清理）。
   - 新增 `UpdateChannelTag(id int, tag string) error`：显式更新 tag 列。
     - 原因：`channel.Update()` 用 struct `Updates`，零值（tag=""）不更新，无法清空标签；又不能改 Select 全字段（批量启停 PUT body 仅 `{id,status}`，Select 会把 key 清空）。故 tag 在 controller 单独显式更新，零风险。
2. **`controller/channel.go`** 新增 `BatchManageChannels`：`POST /api/channel/batch`，body `{ids: int[], action: "enable"|"disable"|"delete"|"test"}`。
   - enable → status=1；disable → status=2（手动禁用）；delete → 批量删除；test → 调 channel-test 的按 ID 测试。
   - 均为 AdminAuth（路由组已挂）。
3. **`controller/channel-test.go`**：抽出 `testChannelsList(ctx, notify, channels)`（复用全局锁 + goroutine + 自动禁用逻辑）；新增 `testChannelsByIds(ctx, ids)`；`testChannels(scope)` 改为取数后委托。
4. **`router/api.go`**：channelRoute 新增 `POST("/batch", controller.BatchManageChannels)`。

### 2.2 前端（default 主题）

1. **`components/ChannelsTable.js`**
   - 首列新增 Checkbox（表头全选/行单选），`selectedIds` 状态（Set），翻页/刷新/搜索后清空选择。
   - 新增**标签列**（常显）：tag 徽章，空显示 `-`。
   - 详情模式新增**权重列**（可编辑 Input，复用已有 `manageChannel('weight')`）。
   - 底部操作区新增批量按钮（选中数 >0 可用）：批量启用 / 批量禁用 / 批量测试 / 批量删除（带确认 Popup），调 `POST /api/channel/batch`；完成后刷新列表。
   - colSpan 同步调整。
2. **`pages/Channel/EditChannel.js`**：名称旁新增标签输入框（`tag`，单标签文本，用于渠道分组标记/筛选展示）。
3. **i18n**（zh/en）：`channel.table.tag/weight/selected_count`、`channel.buttons.batch_enable/batch_disable/batch_test/batch_delete/confirm_batch_delete`、`channel.edit.tag/tag_placeholder`、`channel.messages.batch_*`。

### 2.3 不做

- 9b 数据面路由增强（延时避险/动态剔除/正则映射）——`relay/` 零改动。
- 标签多值/彩色体系/按标签筛选——单标签文本列，后续按需扩展。

## 3. 验收标准

1. 勾选 N 个渠道 → 批量禁用：DB `channels.status=2` 且 `abilities.enabled=0`；批量启用后 `status=1` 且 `abilities.enabled=1`。
2. 批量删除：选中渠道及其 abilities 记录被删除。
3. 批量测试：触发异步测试（全局锁防重），mock 渠道 `response_time/test_time` 更新。
4. 标签：编辑表单设置标签后列表显示徽章；清空标签可保存为空。
5. 权重：详情模式可编辑并持久化。
6. **`relay/` 目录零改动**；网关转发回归（/v1/chat/completions 对话正常）。
7. 生产构建通过，双主题无穿帮（管理端标准 SUI 组件，零硬编码色）。

## 4. 实施状态（2026-09-06 已完成并通过 E2E）

**后端**：
- `model/channel.go`：新增 `Tag` 字段（varchar(64)，AutoMigrate 自动加列）、`GetChannelsByIds`、`BatchUpdateChannelStatus`、`BatchDeleteChannels`、`UpdateChannelTag`。
- `controller/channel.go`：新增 `BatchManageChannels`（POST /api/channel/batch，enable/disable/delete/test 四动作）；`UpdateChannel` 改用 `ShouldBindBodyWith` 双绑定（主模型 + `Tag *string` 探测）——tag 未携带时保持原值、空串时清空。
  - **踩坑**：最初用匿名结构体在 `model.Channel` 外覆 `Tag *string` 试图遮蔽，实测 encoding/json 中内层 string 字段仍会绑定（非空靠 struct Updates 碰巧生效，空串清空失效）；改为双绑定解决。
- `controller/channel-test.go`：抽出 `testChannelsList`，新增 `testChannelsByIds`（复用全局锁防重 + goroutine 异步 + 自动禁用逻辑）。
- `router/api.go`：注册 POST /batch。

**前端**（web/default）：
- `components/ChannelsTable.js`：首列 Checkbox（全选/单选 + selectedIds）、标签列（teal 徽章）、详情模式权重可编辑列（接入已有 manageChannel weight 分支）、底部批量按钮（批量启用/禁用/测试/删除，删除带确认 Popup）。
- `pages/Channel/EditChannel.js`：名称下新增标签输入框。
- zh/en i18n 补齐。

**E2E（2026-09-06，镜像 one-api-custom 3008）**：
- API 层 29/29 通过：标签设置/持久化/最小化 PUT 存活/清空落库/批量操作存活；批量禁用(status=2+abilities.enabled=0)、启用(status=1+abilities 恢复)；权重编辑持久化；批量测试异步 response_time 更新；空 ids/非法 action 拒绝；批量删除清理 channels+abilities；未登录 401。
- 网关回归：`/v1/chat/completions` 200 正常（`relay/` 零改动）。
- 浏览器 UI：全选按钮显隐（已选 N 个）、批量禁用→启用闭环 toast 与状态色、详情模式权重输入框、编辑表单标签设置/清空后列表刷新为 "-"。
- 脚本：`Temp/e2e_f9/e2e_f9.ps1`。
