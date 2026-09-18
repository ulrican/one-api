---
name: "tech-web"
description: "暗色科技霓虹风 Web 页面生成与审查规范：深蓝黑底 + 蓝/紫/翡翠渐变 + 网格背景与霓虹光晕。当生成或评审 AI、API 网关、开发者工具、科技 SaaS 类官网首页、落地页、数据看板、终端展示等页面时调用。"
---

# Tech Web · 暗色科技霓虹风页面规范

> 品牌主题色取自科技网关类 demo（深蓝黑底 + 蓝/紫/翡翠霓虹），其余系统化规则（字号层级、间距、圆角、组件状态、响应式、无障碍）沿用企业级设计规范并做暗色化适配。

## 0. 技能定位与触发场景

**适用场景（满足任一即应遵循本规范）：**
- AI 平台 / 大模型网关 / API 聚合 / 算力服务的官网首页、落地页、定价页
- 开发者文档站、控制台、数据看板（Dashboard）、WebChat 外壳
- 需要"科技感、未来感、深色沉浸式"氛围的营销与产品页面

**不适用场景：**
- 亮色为主的传统企业后台、政务/金融表单页（应使用亮色企业蓝规范）
- 暖色系营销页、儿童/娱乐类产品

**基调一句话：** 深色底是舞台，霓虹色是聚光灯——聚光灯永远只打在少数焦点上。

---

## 1. 设计令牌（Design Tokens）

### 1.1 品牌色（暗色科技底，强制使用）

| Token | 色值 | 用途 |
| :--- | :--- | :--- |
| `--brand-bg` | `#0B0F17` | 页面全局底色 |
| `--brand-surface` | `#111827` | 卡片/面板实底 |
| `--brand-surface-soft` | `rgba(17,24,39,0.45)` | 玻璃拟态卡片（配 backdrop-blur） |
| `--brand-terminal` | `#05070B` | 代码终端、深色嵌层 |
| `--brand-blue` | `#3B82F6` | 主按钮、链接、品牌强调（蓝-500） |
| `--brand-blue-hover` | `#60A5FA` | 蓝色悬停态（蓝-400） |
| `--brand-blue-deep` | `#2563EB` | 渐变起点、深蓝按钮（蓝-600） |
| `--brand-purple` | `#8B5CF6` | 次级强调、卡片 hover 光晕（紫-500） |
| `--brand-purple-hover` | `#A78BFA` | 紫色悬停态（紫-400） |
| `--brand-green` | `#10B981` | 成功状态、运行指标（翡翠-500） |
| `--brand-green-hover` | `#34D399` | 绿色悬停/渐变终点（翡翠-400） |
| `--brand-amber` | `#FBBF24` | 数据高亮、关键数字（琥珀-400） |
| `--brand-gradient` | `linear-gradient(135deg,#2563EB 0%,#7C3AED 50%,#34D399 100%)` | Logo 描边、主视觉渐变 |
| `--brand-gradient-text` | `linear-gradient(90deg,#60A5FA,#A78BFA,#34D399)` | 标题渐变文字 |

### 1.2 功能色（暗色语义）

```css
--color-success: #10B981;   /* 成功、已完成、运行中 */
--color-warning: #F59E0B;   /* 警告、待处理 */
--color-error:   #EF4444;   /* 错误、危险操作 */
--color-info:    #06B6D4;   /* 信息提示 */
```

功能色在暗色下**必须搭配深色语义底**（见 3.3 徽章规则），禁止直接套用亮色规范的浅底（如 `#EFF6FF`）。

### 1.3 中性色（暗色体系）

| 用途 | 色值 | 说明 |
| :--- | :--- | :--- |
| 主标题 | `#F9FAFB` / `#FFFFFF` | H1–H3、大标题 |
| 正文 | `#D1D5DB` | 段落、表格内容（gray-300） |
| 辅助文字 | `#9CA3AF` | 标签、说明、导航默认态（gray-400） |
| 弱化/占位 | `#6B7280` | placeholder、时间戳、禁用（gray-500） |
| 边框 | `#1F2937` | 卡片、分割线（gray-800） |
| 边框-强 | `#374151` | 输入框默认边框、hover 边框（gray-700） |

### 1.4 字体

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'PingFang SC', 'Microsoft YaHei', sans-serif;
--font-mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Consolas,
             'Courier New', monospace;
```

- 正文/标题使用 `--font-sans`；
- **数据指标数字、代码、终端、API Key、延时/QPS 等技术数值必须使用 `--font-mono`**，这是科技风的关键辨识度。

### 1.5 字号层级

| 层级 | 字号 | 行高 | 字重 | 颜色 |
| :--- | :--- | :--- | :--- | :--- |
| Hero 大标题 | `48px`（移动端 36px）→ 桌面 `72px` | 1.1 | 800 | `#FFFFFF`，副行可用渐变文字 |
| H1 | `32px` | `40px` | 700 | `#F9FAFB` |
| H2 | `24px` | `32px` | 700 | `#F9FAFB` |
| H3 | `20px` | `28px` | 600 | `#FFFFFF` |
| 正文 | `16px` | `24px` | 400 | `#D1D5DB` |
| 小字 | `14px` | `20px` | 400 | `#9CA3AF` |
| 微小 | `12px` | `16px` | 400 | `#6B7280` |
| 按钮 | `14px`（主 CTA 可 16px） | — | 600 | `#FFFFFF` |
| 看板数字 | `24px` | — | 700 mono | 对应语义色 |
| 终端代码 | `12–13px` | 1.7 | 400 mono | `#D1D5DB` |

### 1.6 间距

```css
--space-1: 4px;    /* 图标与文字间距 */
--space-2: 8px;    /* 小组件内间距 */
--space-4: 16px;   /* 卡片内边距、元素间距 */
--space-6: 24px;   /* 模块间距、卡片网格 gap */
--space-8: 32px;   /* 页面区块间距 */
--space-12: 48px;  /* 大区块分隔（section 上下 padding 常用 64px） */
```

### 1.7 圆角

```css
--radius-sm: 6px;      /* 标签、徽章、小按钮 */
--radius-md: 8px;      /* 按钮、输入框（rounded-lg） */
--radius-lg: 12px;     /* 标准卡片、看板（rounded-xl） */
--radius-xl: 16px;     /* 大卡片、功能容器（rounded-2xl） */
--radius-full: 9999px; /* 胶囊徽章、状态点、头像 */
```

### 1.8 阴影与霓虹光晕

科技风以**彩色光晕（glow）**替代传统灰色投影，且只用于焦点元素：

```css
--shadow-card: 0 1px 2px 0 rgba(0,0,0,0.4);                 /* 卡片默认 */
--glow-blue:   0 0 25px rgba(59,130,246,0.35);              /* 主 CTA 按钮 */
--glow-purple: 0 0 20px rgba(139,92,246,0.25);              /* 卡片 hover */
--glow-green:  0 0 16px rgba(16,185,129,0.30);              /* 运行状态强调 */
```

---

## 2. 科技感特效规则（品牌标志性效果）

以下 7 个特效为本风格的识别符号，按页面需要选用，**不必全部堆叠**。

### 2.1 网格点阵背景

页面顶部铺一层点阵网格，并用径向遮罩向四周渐隐：

```css
.bg-grid {
  background-image: radial-gradient(rgba(30,41,59,0.9) 1px, transparent 1px);
  background-size: 24px 24px;
  /* 顶部最亮，向下渐隐 */
  mask-image: radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%);
}
```
- 必须 `pointer-events: none` 且 `z-index` 低于内容；
- 禁止铺满全屏不渐隐（会变成噪点污染）。

### 2.2 玻璃拟态（Glassmorphism）

导航栏、浮层卡片使用半透明深底 + 背景模糊：

```css
.glass {
  background: rgba(11,15,23,0.8);   /* 导航 */
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(31,41,55,0.8);
}
.glass-card {
  background: rgba(17,24,39,0.4);
  backdrop-filter: blur(8px);
  border: 1px solid #1F2937;
}
```

### 2.3 渐变文字

仅用于 Hero 标题的副行/关键词，正文禁止：

```css
.text-gradient {
  background: var(--brand-gradient-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

### 2.4 霓虹光晕（克制使用）

- 主 CTA 按钮：常驻 `--glow-blue`；
- 卡片：默认无光晕，hover 时出现 `--glow-purple` 且边框变为 `rgba(139,92,246,0.5)`；
- **同一视口内常驻发光元素不超过 2–3 个**（通常是主 CTA + 运行状态点），光晕泛滥 = 没有焦点。

### 2.5 脉冲状态指示

"服务运行中"类状态用胶囊条 + 脉冲小圆点：

```html
<div class="status-pill">
  <span class="status-dot"></span> 网关 99.99% 运行中
</div>
```
```css
.status-pill { display:inline-flex; align-items:center; gap:8px;
  padding:6px 12px; border-radius:9999px; font-size:12px;
  background:rgba(6,78,59,0.4); border:1px solid rgba(6,95,70,0.5); color:#34D399; }
.status-dot { width:8px; height:8px; border-radius:9999px;
  background:#10B981; animation:pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
```

### 2.6 终端代码窗口

代码/接入示例必须放进"终端窗口"容器：深底 `#05070B`、顶部标题栏、红黄绿三个圆点、可选语言 Tab（cURL / Python 等），代码用 mono 字体、支持横向滚动。

### 2.7 渐变描边

Logo、高级徽章可用 1px 渐变描边（外层渐变底 + 内层底色挖空）：

```css
.gradient-border {
  background: var(--brand-gradient);
  padding: 1px;
  border-radius: 8px;
}
.gradient-border > .inner {
  background: var(--brand-bg);
  border-radius: 7px;
}
```

---

## 3. 组件规则

### 3.1 按钮

| 类型 | 背景 | 文字 | 悬停 | 附加 |
| :--- | :--- | :--- | :--- | :--- |
| Primary | `#2563EB` 或蓝→靛渐变 `linear-gradient(90deg,#2563EB,#4F46E5)` | `#FFFFFF` | `#3B82F6`/渐变提亮 | `box-shadow: var(--glow-blue)` |
| Secondary | `rgba(17,24,39,0.8)` + `1px solid #374151` | `#D1D5DB` | 背景提亮至 `#1F2937` | 可加 backdrop-blur |
| Danger | `#EF4444` | `#FFFFFF` | `#DC2626` | 危险操作二次确认 |
| Link | 透明 | `#60A5FA` | `#93C5FD` | 无背景 |

```css
.btn { padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;
       transition: all .2s; cursor: pointer; }
.btn-lg { padding: 14px 32px; border-radius: 12px; font-size: 16px; }  /* Hero CTA */
.btn-sm { padding: 6px 14px; border-radius: 6px; font-size: 12px; }
```

### 3.2 卡片

```css
.card {
  background: rgba(17,24,39,0.4);
  border: 1px solid #1F2937;
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(8px);
  transition: all .25s;
}
.card:hover {
  border-color: rgba(139,92,246,0.5);
  box-shadow: var(--glow-purple);
}
```

### 3.3 标签 / 徽章（深色语义，重点）

暗色下徽章 = **深色调底 + 同色系边框 + 400 档亮色文字**：

| 类型 | 背景 | 边框 | 文字 |
| :--- | :--- | :--- | :--- |
| 品牌蓝 | `rgba(23,37,84,0.6)`（blue-950/60） | `rgba(30,58,138,0.5)`（blue-800/50） | `#60A5FA` |
| 紫 | `rgba(59,7,100,0.6)` | `rgba(107,33,168,0.5)` | `#A78BFA` |
| 成功绿 | `rgba(6,78,59,0.6)` | `rgba(6,95,70,0.5)` | `#34D399` |
| 警告 | `rgba(120,53,15,0.5)` | `rgba(146,64,14,0.5)` | `#FBBF24` |
| 错误 | `rgba(127,29,29,0.5)` | `rgba(153,27,27,0.5)` | `#F87171` |
| 默认中性 | `rgba(31,41,55,0.8)` | `#374151` | `#9CA3AF` |

```css
.badge { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
         display:inline-flex; align-items:center; gap:6px; }
```

### 3.4 导航栏

```css
.navbar {
  position: sticky; top: 0; z-index: 50;
  background: rgba(11,15,23,0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(31,41,55,0.8);
  height: 64px;
}
.nav-link { color: #9CA3AF; font-size: 14px; }
.nav-link:hover { color: #60A5FA; }
.nav-link.active { color: #FFFFFF; }
```

### 3.5 数据看板（指标卡）

- 网格：桌面 4 列、平板 2 列、手机 1 列，gap 16px；
- 结构：mono 大数字（24px/700，用语义色：蓝=延时、绿=SLA、紫=并发、琥珀=关键指标）+ 12px gray-500 说明文字；
- 容器同 `.card` 但可用更实的 `rgba(17,24,39,0.5)`。

### 3.6 输入框 / 表单

```css
.input {
  padding: 10px 14px; border-radius: 8px;
  background: rgba(17,24,39,0.5);
  border: 1.5px solid #374151;
  color: #F9FAFB; font-size: 14px;
}
.input::placeholder { color: #6B7280; }
.input:focus { outline: none; border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
.input.error { border-color: #EF4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
.input:disabled { background: rgba(31,41,55,0.5); color: #6B7280; cursor: not-allowed; }
```

### 3.7 终端代码块

- 外层：`background:#05070B; border:1px solid #1F2937; border-radius:12px; overflow:hidden;`
- 标题栏：`background:#030712`（gray-950）+ 底部边框 + 红(`#EF4444`)/黄(`#EAB308`)/绿(`#22C55E`) 三个 12px 圆点；
- 语言 Tab：选中态 `bg:#1F2937; color:#60A5FA`，未选中 `color:#6B7280`；
- 代码：mono 12–13px、行高 1.7、`overflow-x:auto`，关键字/字符串可用语法高亮但配色需低饱和。

---

## 4. 颜色与效果铁律（Good / Bad）

```
✅ 页面底色 #0B0F17，卡片 #111827 系，终端 #05070B —— 用三层深色拉开层次
✅ 标题用白/近白，正文用 #D1D5DB，辅助说明用 #9CA3AF
✅ 霓虹蓝/紫/绿只用于：CTA、链接、图标、数据数字、渐变、光晕
✅ 徽章/状态一律"深底 + 同色边框 + 400 档亮字"
✅ 发光效果克制：常驻 glow 元素每视口 ≤ 2–3 个
❌ 禁止纯黑 #000000 作为大面积底色或卡片底
❌ 禁止大段正文使用霓虹色或纯白（刺眼且无层次）
❌ 禁止把亮色规范的浅底徽章（#EFF6FF、#ECFDF5 等）搬到暗色页
❌ 禁止高饱和荧光色铺背景、禁止全屏不渐隐的网格/噪点
❌ 禁止所有元素都加 glow —— 全员发光等于没有焦点
```

**对比示例：**

```html
<!-- ❌ Bad：亮色浅底徽章直接搬进暗色页，刺眼且对比度失衡 -->
<span style="background:#EFF6FF;color:#2563EB">深度推理</span>

<!-- ✅ Good：深色语义徽章 -->
<span class="badge" style="background:rgba(59,7,100,.6);
  border:1px solid rgba(107,33,168,.5);color:#A78BFA">深度推理</span>
```

```html
<!-- ❌ Bad：正文用霓虹绿 + 卡片纯黑 -->
<div style="background:#000;color:#10B981">系统状态良好</div>

<!-- ✅ Good：三层深色 + 中性正文 + 霓虹只给状态点 -->
<div class="card"><p style="color:#D1D5DB">系统状态良好</p>
  <span class="status-dot"></span></div>
```

---

## 5. 响应式规则

| 断点 | 宽度 | 典型调整 |
| :--- | :--- | :--- |
| `sm` | `640px` | 手机：看板 1 列、按钮整宽、导航链接折叠 |
| `md` | `768px` | 平板：看板 2 列、模型卡片 1 列 |
| `lg` | `1024px` | 桌面：看板 4 列、卡片 3 列、终端与文案左右分栏 |
| `xl` | `1280px` | 大屏：内容最大宽度 1152–1280px 居中 |

```css
.grid-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
@media (max-width:1024px){ .grid-stats{ grid-template-columns:repeat(2,1fr);} }
@media (max-width:640px) { .grid-stats{ grid-template-columns:1fr; } }
```
- Hero 标题字号必须随断点缩放（72px → 48px → 36px）；
- 移动端按钮优先纵向整宽堆叠（`w-full sm:w-auto`）。

---

## 6. 可访问性与动效降级

| 检查项 | 要求 |
| :--- | :--- |
| 正文对比度 | ≥ 4.5:1（`#D1D5DB` on `#0B0F17` 约 11:5:1，✅） |
| 辅助文字 | `#9CA3AF` on `#0B0F17` 约 7:1，✅；`#6B7280` 仅用于非关键信息 |
| 焦点可见 | 所有交互元素 focus 时显示 `3px rgba(59,130,246,.4)` 焦点环 |
| 触控目标 | 按钮/链接可点区域 ≥ 44×44px |
| 动效降级 | **必须**支持 `prefers-reduced-motion`，关闭脉冲与光晕动画 |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

---

## 7. CSS 变量速查（:root 完整令牌）

```css
:root {
  /* 品牌 */
  --brand-bg: #0B0F17;
  --brand-surface: #111827;
  --brand-surface-soft: rgba(17,24,39,0.45);
  --brand-terminal: #05070B;
  --brand-blue: #3B82F6;
  --brand-blue-hover: #60A5FA;
  --brand-blue-deep: #2563EB;
  --brand-purple: #8B5CF6;
  --brand-purple-hover: #A78BFA;
  --brand-green: #10B981;
  --brand-green-hover: #34D399;
  --brand-amber: #FBBF24;
  --brand-gradient: linear-gradient(135deg,#2563EB 0%,#7C3AED 50%,#34D399 100%);
  --brand-gradient-text: linear-gradient(90deg,#60A5FA,#A78BFA,#34D399);

  /* 功能色 */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #06B6D4;

  /* 中性色（暗色） */
  --color-text-primary: #F9FAFB;
  --color-text-secondary: #D1D5DB;
  --color-text-tertiary: #9CA3AF;
  --color-text-disabled: #6B7280;
  --color-border: #1F2937;
  --color-border-strong: #374151;

  /* 间距 */
  --space-1: 4px;  --space-2: 8px;  --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;

  /* 圆角 */
  --radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 12px;
  --radius-xl: 16px; --radius-full: 9999px;

  /* 阴影与光晕 */
  --shadow-card: 0 1px 2px 0 rgba(0,0,0,0.4);
  --glow-blue: 0 0 25px rgba(59,130,246,0.35);
  --glow-purple: 0 0 20px rgba(139,92,246,0.25);
  --glow-green: 0 0 16px rgba(16,185,129,0.30);

  /* 字体 */
  --font-sans: 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,
               'PingFang SC','Microsoft YaHei',sans-serif;
  --font-mono: ui-monospace,'JetBrains Mono','SF Mono',Consolas,monospace;
}
```

---

## 8. Tailwind 落地约定

若项目使用 Tailwind（参考 demo 用法）：

1. 在 `tailwind.config` 的 `theme.extend.colors.brand` 中登记上述品牌色，**禁止在类名中硬编码令牌表以外的色值**；
2. 特效可封装为工具类：`.bg-grid-pattern`、`.glow-effect`、`.glow-card:hover`；
3. 玻璃拟态用 `backdrop-blur-md` + `bg-[#0B0F17]/80` 这类透明度写法；
4. 渐变文字用 `bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400`；
5. 深色为唯一默认主题，`<html class="dark">`；不需要实现亮色切换（除非用户明确要求）。

---

## 9. 冲突决策优先级

当规则相互冲突时，按以下顺序取舍：

**可访问性 > 功能可用性 > 性能 > 品牌特效 > 视觉美观**

- 光晕/脉冲影响阅读或性能时，删减特效而非牺牲对比度；
- 数据面页面（网关、控制台）动效从简，营销首页可适度丰富；
- 任何特效都不得阻塞内容渲染或导致布局抖动。

---

## 10. 页面生成 / 审查检查清单

生成页面后逐条自检：

- [ ] 页面底色为 `#0B0F17`，卡片/终端层次分明，无纯黑大面
- [ ] 所有色值来自令牌表，无令牌外硬编码颜色
- [ ] 标题白色系、正文 `#D1D5DB`、辅助 `#9CA3AF`，霓虹色未用于大段文字
- [ ] 主 CTA 使用蓝色/蓝紫渐变 + 蓝色光晕，且为页面最强视觉焦点
- [ ] 徽章/状态为"深底 + 同色边框 + 400 亮字"，无亮色浅底徽章
- [ ] 数据数字、代码、API Key 使用 mono 字体
- [ ] 科技特效（网格/玻璃/渐变文字/光晕/脉冲/终端）按需选用，常驻 glow ≤ 2–3 处
- [ ] 网格背景带径向渐隐遮罩且 `pointer-events:none`
- [ ] 响应式：看板 4→2→1 列，Hero 字号随断点缩放
- [ ] 焦点环可见，触控目标 ≥ 44px，`prefers-reduced-motion` 动效降级已就绪
- [ ] 间距、圆角、字号符合令牌层级，无随意取值
