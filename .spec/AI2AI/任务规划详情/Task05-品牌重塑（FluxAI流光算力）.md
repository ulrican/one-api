# Task05：品牌重塑（FluxAI · 流光算力）

> 来源：用户指令（2026-09-13）。状态：**已完成上线**。

## 1. 需求

系统官方名称改为 **FluxAI（流光算力）**，修改系统名称、icon 及所有关联呈现；不改业务逻辑、协议与数据库结构。后续追加：图标须在科技风（暗色）与简约风（浅色）双主题下均清晰可辨（初版深色底图标在暗色主题下与背景融合不可辨），并按用户提供的参考图（芯片 + 斜向流光 + 霓虹光晕）重设计。

## 2. 品牌触点清单与改动

原则：仅改品牌层（名称/文案/图标），保留上游归属（GitHub 仓库链接、页脚 JustSong 版权、文件头 MIT Copyright 均不动）。

### 2.1 前端（web/default）

| 文件 | 改动 |
| :--- | :--- |
| `public/index.html` | `<title>` → `FluxAI - 流光算力`；meta description 重写；favicon 指向 `/favicon.ico`（sizes=any）+ PNG 兜底；theme-color `#0a1020` |
| `public/logo.png` / `public/favicon.ico` | 全新品牌图标（见 §3），同文件名替换 |
| `src/helpers/utils.js` | system_name 兜底值 `One API` → `FluxAI` |
| `src/locales/zh/translation.json` | 欢迎语标题/描述、关于页描述、补全倍率 placeholder（共 3 处） |
| `src/locales/en/translation.json` | 同上英文对应 3 处 |
| `src/pages/Channel/EditChannel.js` | 帮助文案 "One API 会把请求体中的 model" → "FluxAI 会…" |

注意：Header 品牌名与 logo 均由 `/api/status` 的 `system_name` 动态驱动并写入 localStorage，非硬编码。

### 2.2 后端（Go）

| 文件 | 改动 |
| :--- | :--- |
| `common/config/config.go` | `SystemName` 默认值 → `FluxAI` |
| `main.go` | 启动日志 `One API %s started` → `FluxAI %s started` |
| `common/init.go` | 启动 banner → `FluxAI <ver> - LLM API aggregation and AI compute distribution platform.` |
| `controller/twofa.go` | 2FA issuer 兜底 → `FluxAI` |
| `relay/adaptor/openai/adaptor.go` | OpenRouter 透传头 `X-Title` → `FluxAI` |

### 2.3 运行库选项

SystemName 为 DB option（options 表），默认值不覆盖已存值。部署后用管理员 API 更新：

```
PUT /api/option/  {"key":"SystemName","value":"FluxAI"}
```

## 3. 图标设计（GDI+ 程序化绘制，脚本 AppData/Local/Temp/make-fluxai-icon.ps1）

> 迭代史：v1 深藏青底+渐变 F（暗主题下与背景融合不可辨，弃）；v2 亮渐变底+白 F（用户要求按参考图重设计，弃）；**v3 最终版**：按用户参考图构图（深蓝底 + 三道流光 + Flux 字标），芯片元素按要求替换为 AI 聚合枢纽，配色重调适配双主题。

最终版构成：

- 画布 512×512，圆角方 tile（r=112）深靛蓝对角渐变（#1B2B6B → #0A0E2E）；
- **霓虹外晕**：tile 边缘三道青色 glow（宽 34/20/10、α 26/44/62）+ 4px 青→紫渐变描边——暗色主题下靠光晕与背景分离，浅色主题下深底自然对比（双主题适配关键）；
- **AI 聚合枢纽**（替代芯片）：中心 (256,256) 发光环（r46，青白→紫渐变描边 9px + 两层 glow）+ 白热径向核心；外圈 r96 处 6 颗卫星节点（青/紫交替，r9 + glow），细连线（α130）自环缘 r52 接至 r84——多渠道汇聚一网的聚合隐喻；
- **三道流光**：旋转 -38° 空间内三条平行彗星光束（宽 24/32/24，ColorBlend 尾透明→头亮），**三色区分**：青(120,228,255)/天白(205,240,255)/紫(178,150,255)，亮头部错位排布 + 光晕圆；
- **Flux 字标**：Segoe UI Bold 60pt 白色 "Flux"（右上区 316,222），四方向青色 glow 描边增暗背景分离度；小尺寸（favicon）下字标虚化属预期，主体构图仍可辨；
- 光子点缀点 3 粒。

favicon.ico：48/32/16 三档 BMP(DIB) 条目（不用 PNG 压缩条目，GDI+ System.Drawing.Icon 不支持；DIB 行序必须自下而上，与 GDI+ LockBits 自上而下相反，需反转行序写入）。

## 4. 踩坑记录

1. **GDI+ 重叠子路径镂空**：GraphicsPath 默认 Alternate 填充，F 的竖杆与横杆重叠区被挖成 D 形洞；构造时指定 `FillMode::Winding` 解决。
2. **PS 5.1 函数空括号调用**：`New-FPath()` 报 "An expression was expected after '('"，须写 `New-FPath`。
3. **PS 5.1 byte[] 返回值被展开**：函数返回 `byte[]` 会被管道展开成单个 byte；`return ,$arr` 逗号包裹，接收端用 `List[byte[]]`。
4. **同文件并行 Edit 丢失**：对同一文件的多条 Edit 并行发出时相互覆盖（zh translation.json 曾丢一处），同文件编辑必须串行。
5. **浏览器缓存**：logo.png 同名替换后浏览器可能仍显示旧图（启发式强缓存），验证需强刷（Ctrl+F5）或 URL 加 query。
6. **双主题可读性教训**：初版"深藏青底 + 渐变 F"在暗色主题下 tile 与背景融合导致 F 不可辨；结论——暗色 UI 下的图标必须有自发光元素（亮渐变/霓虹光晕/白色主体）承担对比。
7. **静态资源 7 天强缓存导致换图不生效（2026-09-14）**：后端对静态资源统一下发 `Cache-Control: max-age=604800`，`<img src="/logo.png">` 在 max-age 内不再回源——表现为"系统名称已变（走 API 无长缓存）但图标仍是旧图"，且 Ctrl+F5 前的常规刷新不触发回源。走查盲区教训：用 `?cb=` 参数绕缓存验证的是文件本身，不代表页面 `<img>` 实际命中缓存的情况。修复：`src/helpers/utils.js` 新增 `LOGO_VERSION` 常量，默认 logo 路径追加 `?v=`；`public/index.html` 两处 favicon 链接同样追加。**今后更换 logo.png / favicon.ico 必须同步递增 LOGO_VERSION 与 index.html 的 ?v=**。

## 5. 部署链路

`npm run build`（web/default）→ 产物移至 `web/build/default/`（Docker 首阶段 COPY 的是该目录，非容器内 npm build）→ `docker build -t one-api-custom:latest` → `docker rm -f one-api` + `docker run`（--network one-api_default，-p 3008:3000，SQL_DSN 指 mysql）→ 验证 `/logo.png`、`/favicon.ico`、`<title>`、`/api/status.system_name`。
