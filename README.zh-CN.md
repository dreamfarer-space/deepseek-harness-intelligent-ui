<div align="center">

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/hero.zh.svg" alt="DeepSeek Harness Intelligent UI：为 DeepSeek Harness 带来生成式、可交互的界面" width="100%">

[English](README.md) · **中文**

[![CI](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-intelligent-ui?color=4d6bfe&label=npm)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7%20%E2%80%93%200.2.x-22d3ee)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-34d399)](https://nodejs.org)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-a78bfa)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-97a1c9)](LICENSE)

[演示](#-演示) · [质量](#-真实模型质量基线) · [快速开始](#-快速开始) · [如何选择](#-agent-如何选择呈现方式) · [沙箱组件](#-沙箱组件ui_render_widget) · [安全](#-安全模型) · [配置](#%EF%B8%8F-配置) · [开发](#-开发与验证)

</div>

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）提供**生成式、可交互的 UI**。用户用自然语言提问，Agent 自行决定怎样作答：

- 普通文本；
- 原生组件：看板、表格、图表、时间线、带滑块的函数图像、KaTeX 公式、Mermaid 流程图、表单；
- 完全自定义的**沙箱实时组件**：Three.js 三维场景、Canvas 模拟、小应用。

界面随回答流式、渐进地出现。滑块、旋转、缩放、排序、切换标签页都在浏览器内即时响应，只有显式操作（按钮、表单、`Bridge.sendPrompt`）才会回到 Agent。

本插件把 CopilotKit [OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) 的思路（Open Generative UI + A2UI 风格声明式组件）移植到 DSH 自带的扩展点上，不依赖 CopilotKit、LangGraph 或外部路由服务。

## ✨ 亮点

<table>
<tr>
<td width="33%" valign="top">

### 🧠 自主决策
无需任何命令。每一轮由 Agent 依据系统提示，自行选择文本、原生组件或实时组件。

</td>
<td width="33%" valign="top">

### ⚡ 流式渐进
JSON 还在生成，组件就已出现。实时组件在**同一个** iframe 中 morph 并原地定稿，不重建、不闪烁。

</td>
<td width="33%" valign="top">

### 🖱️ 本地优先
滑块、旋转、缩放、排序、标签页、悬停提示都在浏览器内完成，不调用模型。

</td>
</tr>
<tr>
<td valign="top">

### 🧩 20 种组件
卡片、栅格、标签页、表格、图表、时间线、`Plot`、KaTeX `Math`、`Mermaid`、表单，渲染前先校验。

</td>
<td valign="top">

### 🔒 默认沙箱隔离
不透明源 iframe、严格 CSP、带 token 的消息校验、限流的 Bridge，全部在真实浏览器中实测。

</td>
<td valign="top">

### 💾 状态不丢失
标签页、排序、表单值、滑块和 `UI.state` 在回合折叠、页面刷新、中途停止后都能恢复。

</td>
</tr>
</table>

## 🎬 演示

### 真实 DeepSeek 模型，端到端

https://github.com/user-attachments/assets/e4eb0adc-659e-4c80-b473-449aa42ca00f

<details>
<summary><b>🎞️ GIF 精选片段</b>（适用于无法播放视频的页面，如 npm）</summary>
<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/demo.gif" alt="真实 deepseek-flash 模型在 DSH Web 中的表现，由鲸鱼娘解说：表单回传、带滑块的阻尼振动 Plot、用 ui_patch 两轮原位修改图表" width="100%">
</p>

</details>

<img align="right" width="120" src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/scripts/eval/demo/assets/whale/greet.webp" alt="担任演示解说的 DeepSeek 鲸鱼娘">

🎥 **完整视频（H.264，2 分 27 秒，9.5 MB）：** [docs/assets/real-model/demo.mp4](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/assets/real-model/demo.mp4)。视频覆盖全部 11 个浏览器用例，每一章都停在真实结果上：纯文本、图表、数据表、表单回传、Plot、Three.js 与「让模型修复」、停止 → 重新生成、两轮原位修改、Fast 3G、CDN 不可达、手机宽度。由 DeepSeek 鲸鱼娘解说，立绘来自 [dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume)（MIT，见[致谢](#致谢)）。

> [!NOTE]
> 2026-10-16 由 `npm run eval:real -- --stage browser --record` 录制，`npm run eval:demo` 剪辑合成。每张卡片都是真实 **`deepseek-flash`** 模型在装有本插件的真实 **DSH Web 0.2.0-rc.1** 里当场生成的。没有任何脚本回放，**失败也原样保留**：每章标题卡都标出 ✓ 或 ✗，解说会说明哪里出了问题。模型生成期间视频加速播放，右下角秒表显示真实耗时。评测结果见[真实模型质量基线](#-真实模型质量基线)。

| 多系列柱状图：**✗**（调用中途被截断） | `ui_patch` 两轮原位修改：✓ |
|:---:|:---:|
| ![图表](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/chart.png) | ![原位修改](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/patched.png) |
| *图表内容正确，但卡片显示「生成已中断」：还有组件没生成完* | *「改成折线图」→「加上小程序 30/45/60/80」：同一张卡片，第 3 版，数值准确* |
| **提交表单 → 模型使用提交的值：✓** | **阻尼振动 `Plot`，滑块实时重绘：✓** |
| ![表单回传](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/form-followup.png) | ![Plot](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/plot.png) |
| *提交的 全国 / 4 / 乐观 生成了季度预测* | *y = A·e^(−γt)·cos(ωt) 及包络线；拖动滑块不调用模型* |
| **Three.js：✗，再由「让模型修复」修好** | **中途停止 → 重新生成：✓** |
| ![Three.js 修复后](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/three-repaired.png) | ![重新生成](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/regenerated.png) |
| *首次生成报错 `view is not defined`；修复后球心 (0,0,R)，带坐标轴* | *中断的卡片保留静态预览，「重新生成」得到完整场景* |
| **Fast 3G、禁用缓存：✓** | **CDN 不可达：✓（按设计降级）** |
| ![弱网络](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/weak-network.png) | ![无网络](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/offline.png) |
| *three.js 加载变慢，但仍正常渲染* | *失败直接显示在卡片上，对话不受影响* |
| **手机宽度（390 px）：✓** | **可排序数据表：✗（5 分钟内没出表）** |
| ![移动端](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/mobile.png) | ![数据表](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/table.png) |
| *无溢出，指标与图表都能放下* | *Agent 把时间都花在上网查车型参数上* |

<details>
<summary><b>🧪 脚本化模型演示</b>（插件管线 E2E：深色主题、刷新恢复、沙箱隔离）</summary>
<br>

![DeepSeek Harness Intelligent UI 脚本化模型演示](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/demo.gif)

🎥 [docs/assets/demo.mp4](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/assets/demo.mp4)。由 `npm run e2e:all -- --record` 录制，背后是 `scripts/e2e/` 中的**脚本化 mock**，回答内容是预设的。它展示的是插件管线（流式、渲染、双向通信、持久化、隔离），不代表真实模型的表现。

| 看板流式出现并定稿 | Three.js 组件：R 滑块、旋转、缩放 |
|:---:|:---:|
| ![看板](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/3-dashboard.png) | ![球面](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/7-widget-rotated.png) |

| 深色主题 | 手机宽度（深色） | 刷新后恢复 |
|:---:|:---:|:---:|
| ![深色](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/11b-dark-widget.png) | ![移动端](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/12-mobile-dark.png) | ![刷新](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/14-reload.png) |

</details>

## 🚀 快速开始

需要 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **0.1.7 – 0.2.x**（`>=0.1.7-rc.1 <0.3.0`）和 Node.js ≥ 22.13，Windows、Linux、macOS 均可。安装过程不需要编译：npm 包自带预构建的浏览器端 bundle，也没有任何安装脚本。

```sh
dsh plugin --profile web add deepseek-harness-intelligent-ui
```

然后重启 DSH Web（`dsh web`），试着提一个需要可视化的问题，例如 *“按渠道对比 Q1–Q4 营收”* 或 *“让我在 3D 里探索 x²+y²+z²=2Rz”*。

也可以用引导式安装器。它会先检查 Node、`dsh` 版本、pnpm 和 profile，检查通过后执行同样的 `dsh plugin add`：

```sh
npx deepseek-harness-intelligent-ui install            # 可选 --profile <名称>、--dsh <路径>、--dry-run
npx deepseek-harness-intelligent-ui doctor             # 只诊断，不做修改
```

| 操作 | 命令 |
|---|---|
| 升级 | `dsh plugin --profile web add deepseek-harness-intelligent-ui@latest` |
| 试用预发布版（仅在存在 `next` 标签时） | `dsh plugin --profile web add deepseek-harness-intelligent-ui@next` |
| 固定版本 | `dsh plugin --profile web add deepseek-harness-intelligent-ui@0.2.5` |
| 卸载 | `dsh plugin --profile web remove deepseek-harness-intelligent-ui`（或 `npx deepseek-harness-intelligent-ui uninstall`） |
| 从源码目录安装 | `dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui` |

<details>
<summary><b>🩺 常见问题</b></summary>
<br>

- *提示 `pnpm was not found`*：DSH 用 pnpm 安装插件。运行 `corepack enable`（Node 自带）或 `npm i -g pnpm`。
- *提示 `… is incompatible with dsh X`*：当前 DSH 版本不在支持范围内。可以升级 DSH（`npm i -g @deepseek-ai/dsh@latest`），或在[兼容性文档](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)里找支持该版本的插件发行版。
- *从 0.1.x 升级（以前用 `file:` 安装的 `dsh-intelligent-ui`）*：先运行 `dsh plugin --profile web remove dsh-intelligent-ui`。新旧两个包会插入同一个 `intelligent-ui` 行，`doctor` 能检测到这种冲突。
- *界面没有出现*：安装后要重启 DSH Web，并确认启动的是安装插件时指定的 profile（`dsh web`）。

</details>

### 兼容性

| DeepSeek Harness | 安装冒烟测试 | 浏览器 E2E（24 项） |
|---|:---:|:---:|
| `0.1.7-rc.2` | ✅ | ✅ |
| `0.2.0-rc.1` | ✅ | ✅ |
| `0.2.0-rc.2`（`latest`） | ✅ | ✅ |
| `0.2.1-alpha.2` | ✅ | ✅ |
| `0.2.1-alpha.4` | ✅ | ✅ |
| `0.2.1-alpha.5`（`alpha`） | ✅ | ✅ |
| `0.2.1-rc.2`（`next`） | ✅ | ✅ |

CI 每天定时在 Windows、Linux、macOS 上跑完整矩阵，DSH 一发新版就能发现问题。详见 [docs/compatibility.md](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)。

## 🧠 Agent 如何选择呈现方式

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/routing.zh.svg" alt="Agent 把每次提问路由到纯文本、ui_render 或 ui_render_widget；本地交互不调用模型，显式操作才回到 Agent" width="100%">

插件注入一段系统提示（`src/guidance.js`），让模型每一轮自行选择，用户无需输入任何命令：

- **普通文本**：寒暄、简短事实、解释说明、要复制的代码、工作区内的编程任务。
- **`ui_render`**：结构化内容，例如对比、数据、看板、流程、公式、可调参数的函数、选项、收集输入。
- **`ui_render_widget`**：用户想探索、操作或观察组件目录画不出的东西，例如三维、模拟、动画、游戏、自定义工具。
- **本地优先**：凡是能在浏览器里算出来的（滑块、旋转、缩放、筛选、排序、重新计算），都必须即时更新，不调用模型。

`/ui <需求>` 命令仍然保留，用于强制以 UI 作答。

| 工具 | 适用场景 | 渲染方式 |
|---|---|---|
| `ui_render` | 结构化回答 | 固定目录中的原生 React 组件，随 JSON 流式渐进渲染 |
| `ui_patch` | 修改之前显示的界面 | 对该界面做组件级操作，未改动的组件保留交互状态（[详情](#-原位增量更新ui_patch)） |
| `ui_render_widget` | 自定义可视化、三维、模拟、小应用 | 不透明源沙箱 iframe 中的 HTML/CSS/JS：先 CSS，再实时 morph HTML，最后执行 JS，全程**一个** iframe |

## 🧩 组件目录（`ui_render`）

| 类别 | 组件 |
|---|---|
| 布局 | `Card`、`Stack`、`Grid`、`Tabs`（支持键盘操作） |
| 文本与提示 | `Text`（markdown 子集）、`Code`、`Alert`、`Badge`、`Divider` |
| 数据 | `Stat`、`Progress`、`List`、`Table`（可排序）、`Timeline` |
| 图表 | `Chart`（柱状、折线、面积、饼图；可堆叠，悬停提示，可点图例显隐系列） |
| 数学与图示 | **`Plot`**、**`Math`**（KaTeX）、**`Mermaid`** |
| 交互 | `Button`、`Form` |

- **`Plot`**：绘制 y = f(x)，参数滑块拖动后曲线即时重绘。表达式由安全编译器解析，不使用 `eval`。
- **`Form`**：字段类型有文本、数字、**范围滑块**、下拉、勾选、日期、多行文本。
- **`Button` 与 `Form`**：点击或提交后，内容作为下一条用户消息发给 Agent。

**传输与校验：** DSH 的工具 schema 不支持递归，所以界面以**扁平节点列表加 id 引用**的形式传输。Host 先校验再确认，检查项包括未知类型或属性；id 悬空、重复或成环；一个节点有多个父节点；图表数据长度不一致；`Plot` 表达式无法编译、参数默认值越界等。发现问题时返回 `ok:false` 并附带出错路径，模型据此修正后重试。

**`Math` 与 `Mermaid` 的渲染：** 两者在与组件相同的沙箱中，从 CDN 白名单加载 KaTeX 或 Mermaid。第三方代码不在 DSH 页面中运行。CDN 不可用时，显示源码与明确的静态降级提示。[可选离线资源包](docs/offline-resources.md) 内置锁定版本的 KaTeX/字体、Mermaid、Three.js/OrbitControls、D3、Chart.js 和 canvas-confetti，无需开放沙箱网络。

## 🔁 原位增量更新（`ui_patch`）

用户要求修改之前显示的界面时（例如“把柱状图换成折线图，其余不变”），Agent 按组件 id 打补丁，不必重新发送整棵组件树。

- **标识：** 每次 `ui_render` 的结果都会告诉模型该界面的 `uiId`（即其调用 id）和版本号 1。每次补丁被接受后，结果会给出新版本号和组件的 `id:类型` 概览。
- **操作：** `setProps`（合并属性，`unset` 删除属性）、`replaceNode`（保留 id，替换类型、属性或子节点）、`insertChild`（在容器下插入新组件）、`removeNode`。操作按顺序执行，**要么全部生效，要么全部不生效**。生成的新版本还要通过与全新 `ui_render` 相同的完整校验（类型、属性、引用、成环、深度、规模、Tabs 标签数）。
- **并发：** `baseVersion` 为必填项。基于旧版本的补丁会作为过期请求被拒绝，并告知当前版本，模型据此重新生成补丁后重试。补丁始终独占执行、不会并行，因此版本构成一条有序链。
- **作用范围：** Host 不保存任何状态，而是重放本会话自己的历史（先是被接受的 render，再是被接受的 patch）来重建当前版本，所以补丁只能作用于同一会话中的界面。未知 id、其他会话的界面，以及因上下文压缩而不可见的界面都会被拒绝，此时模型改用 `ui_render`。
- **交互状态：** 组件 id 在各版本间保持不变，交互状态按 `uiId` + 组件 id 保存。补丁未替换的组件都会保留表格排序、选中的标签页、表单输入、已提交锁定和 `Plot` 滑块位置。被 `replaceNode` 替换的组件状态重置；要重置任意组件，换一个新 id 即可。补丁新增的表单字段使用默认值。
- **显示：** 补丁在流式生成或执行时，卡片只显示一行“正在更新界面…”，上一版本保持可用，绝不会出现改了一半的界面。成功后，新版本显示在新回复下方，旧副本收起为“已更新为第 N 版”。被拒绝、失败或中断的补丁不会改动上一版本。完整快照保存在持久化的工具结果元数据中，刷新页面后显示的就是最新版本。
- **沙箱组件**（`ui_render_widget`）暂不支持打补丁：Agent 会重新渲染它，重新渲染时 `UI.state` 依然保留。

## 🪟 沙箱组件（`ui_render_widget`）

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/widget-streaming.zh.svg" alt="组件字段按顺序流式到达：先显示占位，再实时 morph 预览，最后在同一个 iframe 中定稿并执行代码" width="100%">

字段顺序固定：`title`、`initialHeight`、`placeholderMessages`、`css`、`html`、`jsFunctions`、`jsExpressions`。

- **流式过程：**
  1. `css` 完成前，显示占位文字。
  2. `css` 完成后打开预览 iframe，把清洗过的部分 HTML 实时 morph 进去（[idiomorph](https://github.com/bigskysoftware/idiomorph)）。
  3. 参数完整后，在**同一个 iframe 内原地定稿**：morph 最终 HTML，然后执行代码。iframe 不重建，没有白屏闪烁，高度也不跳动。
- **运行时辅助（全局 `UI`）：**

  | 辅助方法 | 作用 |
  |---|---|
  | `UI.three(el, opts)` | 返回 renderer、场景、灯光和 OrbitControls（拖动旋转，滚轮或双指缩放），按需渲染并自适应尺寸 |
  | `UI.canvas(el, draw)` | 高清 2D 画布，尺寸或主题变化时自动重绘 |
  | `UI.state` / `UI.setState()` | 持久化状态；带 `id` 的输入控件会自动保存并恢复 |
  | `UI.color('accent')` / `UI.css()` | 不透明主题色（可直接用于 three.js 和 Canvas）/ 原始 CSS 值 |
  | `UI.onTheme(cb)`、`UI.scheme`、`UI.reducedMotion` | 响应主题变化与减少动效偏好 |
  | `.ui-row`、`.ui-control`、`.ui-card`、`.ui-stage` | 辅助样式类 |

- **Bridge：**
  - `Bridge.sendPrompt({ text })`：在宿主应答前，自动禁用触发它的按钮，防止重复提交。
  - `Bridge.openLink({ url })`：打开链接。
  - `Websandbox.connection.remote.*`：为兼容 OpenIntelligentUI 而保留。
- **依赖库：** 通过 importmap 从 esm.sh 引入 `three`、`three/addons/…`、`d3`、`chart.js/auto`、`gsap`、`canvas-confetti`。
- **错误恢复：** 出现脚本错误时显示错误数量，并提供“重新加载”和“让模型修复”两个按钮。后者会把错误信息发给 Agent。

### 显示位置与状态保持

- **显示位置：**
  - 回合进行中，UI 在工具调用处内联显示。从准备、执行到结果，始终是同一个组件实例，交互状态不会丢。
  - 回合结束后，插件通过 `conversation.chat.turnTail` 把 UI **重新显示在回复下方**，内联处改为一行提示。
- **按界面保存的交互状态**（以工具调用为单位，打过补丁的各版本共用原 `ui_render` 调用的状态）：当前标签页、表格排序、表单值、已提交锁定、Plot 滑块、组件控件值、`UI.state`、iframe 高度。这些状态保存在内存和 `localStorage` 中（有容量上限），移到回复下方或刷新页面后都会恢复。UI 本身则从持久化的会话日志重建。
- **中途停止：**
  - 已进入会话日志的调用：保留已完成的部分（组件的静态预览，或已生成的组件），并显示提示和“重新生成”按钮。
  - 参数仍在流式输出时就被停止的调用：DSH 会整体丢弃它。插件会暂存已生成的内容，同样在被停止的回合下方显示。

## 🔒 安全模型

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/security.zh.svg" alt="组件运行在不透明源沙箱 iframe 中并受严格 CSP 约束；访问宿主页面会被拦截，只有通过 token 校验的 postMessage 才能到达限流的 Bridge" width="100%">

- **隔离：** iframe 设置 `sandbox="allow-scripts allow-forms"` 并使用 `srcdoc`，**不加** `allow-same-origin`。E2E 在浏览器中实测：访问 `parent.document`、`localStorage`、`cookie` 均抛出 `SecurityError`，`fetch` 被拦截，`window.origin` 为 `"null"`。
- **CSP：** `default-src 'none'`；脚本、样式、字体、图片只能来自 `cdnAllowlist`；默认 `connect-src 'none'`；`form-action 'none'`、`base-uri 'none'`。
- **消息校验：** 宿主只接受来自该 iframe 的 `contentWindow`、带随机 token、且格式合法的消息。持久化的组件状态是有大小上限的 JSON。E2E 实测，从页面或 iframe 伪造的消息都会被丢弃。
- **sendPrompt 限制：** 挂载后 1 秒内拒绝发送；2 秒内最多发送一次；长度受 `sendPromptMaxChars` 限制；以普通的排队用户消息发送。
- **openLink：** 只允许 https，可用 `openLinkAllowedOrigins` 白名单进一步限制。
- **Plot 表达式：** 由分词器和解析器编译，只能调用固定的数学函数表，无法使用 `eval`、`Function` 或访问属性。

## ⚙️ 配置

安装后 bundle patch 会自动插入 `intelligent-ui` 这一行。要修改配置，在 profile 的 `cordis.patch.yml` 中添加：

```yaml
- id: intelligent-ui
  config:
    allowNetwork: true
    cdnAllowlist: [https://esm.sh, https://cdn.jsdelivr.net]
```

| 配置项 | 默认值 | 含义 |
|---|---|---|
| `enableCatalog` | `true` | 注册 `ui_render` 和 `ui_patch` |
| `enableWidget` | `true` | 注册 `ui_render_widget` |
| `injectGuidance` | `true` | 注入“何时使用 UI”的系统提示 |
| `cdnAllowlist` | esm.sh、jsdelivr、unpkg | 组件（以及 Math/Mermaid）可加载资源的来源 |
| `allowNetwork` | `false` | 允许组件对上述来源发起 `fetch` 和 WebSocket |
| `maxWidgetHeight` | `2400` | iframe 最大高度（px） |
| `maxWidgetBytes` | `400000` | 超过此大小的组件会被拒绝 |
| `sendPromptMaxChars` | `4000` | 组件、按钮、表单单条消息的最大长度 |
| `openLinkAllowedOrigins` | `[]` | 非空时，`openLink` 只能打开这些来源 |

## 🛠 开发与验证

```sh
npm install
npm run build
npm test                      # 单元/组件测试（含 DSH 兼容性检查与安装器 CLI）
npm run typecheck
npm run e2e:all               # 构建 → 安装到临时 DSH 目录 → mock 模型 + 真实 DSH Web → 30 项浏览器检查
npm run e2e:all -- --record   # 同时重新录制 docs/assets/demo.mp4 / demo.gif（需要 ffmpeg）
npm run e2e:all -- --spec ./deepseek-harness-intelligent-ui-<版本>.tgz   # 改为对 npm pack 打出的包做 E2E
npm run smoke -- --spec ./deepseek-harness-intelligent-ui-<版本>.tgz     # 安装冒烟测试（不需要浏览器）
npm run docs:art              # 重新生成 docs/assets/readme/ 下的 README 动画插图
npm run eval:real             # 真实模型质量基线（需要 DEEPSEEK_API_KEY），见下文
```

E2E 可以在 Windows、Linux、macOS 上运行。它会按平台自动查找 Chrome（可用 `CHROME_PATH` 指定），`DSH_BIN` 可指定其他 `dsh` 可执行文件。检查项见 `scripts/e2e/browser.mjs`，最近一次报告在 [`docs/e2e-report.json`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/e2e-report.json)。GitHub Actions 会在三个系统上，针对每个受支持的 DSH 版本跑完全部测试。

`client/client.js` 已提交到仓库并随包发布，所以 npm、`file:` 和 git 安装都不需要构建。不要添加 `prepare` 或 `postinstall` 脚本，因为 DSH 使用的 pnpm 会拦截插件的构建脚本。

<details>
<summary><b>📦 发布流程</b>（维护者）</summary>
<br>

发布安全与 OIDC 配置见[维护者说明](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/releasing.md)。

1. 在 [CHANGELOG.md](CHANGELOG.md) 中新增 `## [x.y.z]` 小节。
2. 运行 `npm version x.y.z`（或 `npm version prerelease --preid rc`）。这一步会用新版本号重新构建 `client/client.js` 并打 tag。
3. 运行 `git push --follow-tags`。tag 推送后，Release 工作流会依次执行：
   - 运行完整的 CI 矩阵；
   - 带 provenance 发布到 npm（预发布版使用 `next` 标签）；
   - 在三个系统上对已发布的包做冒烟测试；
   - 用 CHANGELOG 的对应小节和 tarball 创建 GitHub Release。
4. 本地可以先运行 `npm run release:check` 做同样的预检。

</details>

## 📊 真实模型质量基线

工具调用的参数能解析，不等于用户真正拿到了可用、正确的界面。`npm run eval:real` 把三层结果**分开**统计，任何一层通过都不能代替另一层：

| 层 | 证明什么 | 最新 · 2026-10-16 · `deepseek-flash` |
| --- | --- | :---: |
| **Mock E2E** | 渲染、流式、交互、持久化与隔离（模型回答是**脚本化**的） | **30 / 30** |
| **真实模型 · API** | 模型选对工具、**首次**就给出合法参数、渲染出的界面包含所要求的组件和数据。模型看到的是插件真实的工具与引导，并执行工具自身的 `execute()`（含 `ui_patch`） | **30 / 32**（94%） |
| **真实模型 · 浏览器** | 模型生成的界面在真实 DSH Web + Chrome 中真正可用：能渲染、能交互、经得起停止/恢复和弱网，控制台无错误 | 自动化 **9 / 11**<br>人工复核后 **8 / 11** |

| 耗时（真实模型） | p50 | p95 |
| --- | ---: | ---: |
| 首次出现可见预览（浏览器） | 7.6 s | 70.2 s |
| 界面生成完成（浏览器） | 11.8 s | 73.4 s |
| 流结束后的浏览器端执行（组件代码、从 CDN 加载 three.js） | 26 ms | 2.9 s |
| 单次模型 API 调用 | 2.4 s | 75.7 s |

长尾来自体积较大的 Three.js 组件：模型要先写出 10–20 KB 代码，预览才会开始。

**本次评测发现的问题。** 以下都是模型与 Agent 的真实行为，不是评测噪声，每一条都对应[完整报告](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval.md)中失败或被标注的用例：

- **工具调用中途被截断（R-chart）：** 图表本身渲染正确，但这一轮在还有组件流式生成时就结束了。插件正确地把卡片降级为「生成已中断，以下为已完成的部分」，并提供「重新生成」。自动化内容检查通过了，但人工复核判为失败；现在新增的检查会让任何留下中断卡片的用例失败。
- **Agent 去查资料而不是出界面（R-table）：** DSH 的 Agent 把 5 分钟预算全花在上网查车型参数上（20 步，约 130 万 token），始终没有渲染出表格。
- **Three.js 作用域错误：** 两次录制，出现同一类错误的两种形式：本次是 `view is not defined`，上次是 `THREE is not defined`，都是组件代码在作用域之外使用了变量。卡片上标出「1 个脚本错误」，两次都是用户点击 **「让模型修复」** 后得到了正常场景。
- **首次参数无效（API）：** 嵌套 `props` 漏写右花括号（D2，两轮都出现），以及组件 id 重复（B1）。插件会拒绝这些调用，模型重试后能改对，但用户会短暂看到一张被拒绝的卡片，所以这些用例算作失败。
- **界面之外的 Agent 行为：** DSH 的 Agent 可能先搜索工作区、先反问用户，或派子智能体查资料。浏览器阶段会像真实用户一样回答反问（选推荐项），并等待界面本身出现，而不只是等这一轮结束。

<details>
<summary><b>▶️ 如何运行</b></summary>
<br>

把密钥放进环境变量。不会读取任何凭据文件；如果报告里仍含有密钥，运行会拒绝写出报告。

```sh
export DEEPSEEK_API_KEY='<your-key>'          # PowerShell：$env:DEEPSEEK_API_KEY = '<your-key>'
npm run eval:real                              # Mock E2E + API + 浏览器；任何失败都以退出码 1 结束
npm run eval:real -- --repeat 3                # 每个 API 用例跑 3 次 → 单用例成功率与 p50/p95
npm run eval:real -- --record && npm run eval:demo   # 同时录制并剪辑演示视频
npm run eval:gallery                           # 把 README 截图统一排版为 1200×750
```

| 选项 | 作用 |
| --- | --- |
| `--stage mock,api,browser` | 只运行部分层（默认 `all`）。仍可用 `A`/`B`/`C`/`D` 选择 API 类别。 |
| `--only B3,R-chart` | 只运行这些用例。 |
| `--keep-other-layers` | 保留本次没有运行的层（配合 `--only` 时保留其他用例），各自保留原来的日期。 |
| `--append` | 配合 `--only`：把重跑结果作为额外样本加入，绝不用一次侥幸成功覆盖失败。 |
| `--rescore` | 用当前断言、基于已保存的对话记录重新判定上一次 API 运行，不调用模型。 |
| `DEEPSEEK_EVAL_MODEL` | 模型 id（默认 `deepseek-flash`）。 |

GitHub 上的 **Real-model eval** 工作流可按需手动触发，使用仓库密钥 `DEEPSEEK_API_KEY` 运行同一条命令，并上传报告和截图。用 `deepseek-flash` 完整跑一遍约花费 ¥1.5。

</details>

<details>
<summary><b>🔬 每个用例检查什么</b></summary>
<br>

**API 阶段**（`scripts/eval/api-stage.mjs`，16 个用例，断言 v3）。每条要求单独成为一项检查，报告会写明具体是*哪一条*失败：

- **纯文本（A1–A4）：** 不调用任何界面工具，给出有内容的回答。
- **图表与数据表（B1–B3、B5）：**
  - 按含义识别的指标卡（收入、活跃用户（含月活/MAU）、转化率、客单价）；
  - 包含全部五个所需列的可排序表格；
  - **含 Q1–Q4、且同时有线上与线下两个系列的柱状图**（2026-10-10 那份 B3 回答只有表单、没有图表，现作为测试夹具保留，必须判为失败）；
  - 至少 4 个里程碑的时间线（`Timeline`，或包含 4 个以上按序年份的 Mermaid 图）。
- **表单（B4、D1）：** 包含滑块、复选框和下拉选择。D1 按浏览器的方式提交表单，并要求后续回答使用提交的区域、季度数和情景。
- **数学 Plot（C2）：** 三个滑块，*每个滑块都出现在表达式中*，函数形状为 `exp(…)·sin/cos(…)`。
- **Three.js 与组件（C1、C3、C4）：** 使用 `UI.three()`/`import("three")`，有动画、光照、启动/暂停和参数控件。
- **多轮修改：** D2 新增一列，每款机型的值都正确，旧值全部保留。D3 连续修改两次（柱状 → 折线，再按准确数值加入第三个系列，原系列不变）。是否用 `ui_patch` 原位修改也会记录。

每个用例都记录：工具选择、首次 Schema 是否有效与是否恢复、每次调用的 API 耗时、API 返回的模型 id 与 `system_fingerprint`，以及提示词哈希。

**浏览器阶段**（`scripts/eval/browser-stage.mjs`，11 个用例，每个都在新会话中运行）：

- **纯文本：** 不创建任何卡片。
- **图表：** 有图例、Q1–Q4、至少 8 根柱子，本地悬停提示。
- **数据表：** 点击表头重新排序，不调用模型。
- **表单：** 用真实鼠标和键盘填写并提交；后续回答必须提到提交的值；表单随后锁定。
- **Plot：** 拖动滑块会重绘曲线。
- **Three.js：** 画布**确实绘制了内容而非空白**（像素统计），拖动会改变画面，且没有组件脚本错误。失败时会尝试「让模型修复」并报告结果。
- **停止/恢复：** 中途停止 → 静态预览、提示和「重新生成」→ 完整场景。
- **两轮原位修改：** 只有一张活跃卡片，第 3 版，折线图，第三个系列。
- **弱网络：** Fast 3G，禁用缓存。
- **无网络：** 屏蔽 CDN；失败必须显示在卡片上，DSH 页面不能有未捕获错误，对话必须能继续。
- **手机宽度（390 px）：** 无溢出；指标网格最多 2 列。

每个用例还会记录控制台错误，并区分宿主页面和组件 iframe。额度用尽等 DSH 运行失败记为*基础设施*错误，不计入模型成功率。

自动化检查无法评判视觉质量，所以报告还附有对每张截图的**抽样人工复核**。

</details>

> [!IMPORTANT]
> [2026-10-10 的报告](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/history/2026-10-10-real-model-eval-report.json)（15/15）只是**历史快照**，不是通过率。它出自一个只检查 API 的旧判分器：B3 没有渲染出图表却被判为通过，而且没有保存重新判分所需的参数。当前结果见 [`docs/real-model-eval.md`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval.md)（可读版）和 [`docs/real-model-eval-report.json`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval-report.json)。

## 已知限制

- 默认在线包的公式、Mermaid 与组件导入库依赖可达 CDN。[可选离线资源包](docs/offline-resources.md) 支持公式、Mermaid 和标准 Three.js 场景；其他 Three.js 插件、GSAP、外部媒体不包含在内。资源失败会显示明确的静态降级或脚本错误。
- 交互状态保存在当前浏览器的 `localStorage` 中，不跨设备同步。
- 对“流式中途被丢弃的调用”，插件按回合的起止时间归属。如果远程 DSH 主机与浏览器的时钟偏差较大，这张卡片可能不显示。已进入会话日志的调用不受影响。

## 致谢

概念、流式组件协议和部分提示词来自 [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI)（MIT 许可）。本项目采用 MIT 许可。

**演示视频中的鲸鱼娘。** 担任视频解说的 DeepSeek 鲸鱼娘（共 26 个姿态）来自 [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume)（MIT © Sutera-Diffusus，立绘作者 [@SuteraWu](https://github.com/SuteraWu)）。原始文件及其许可证见 [`scripts/eval/demo/assets/whale/`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/tree/main/scripts/eval/demo/assets/whale)，不包含在 npm 包中。

## 受控数据与结构化动作

Table 与 Chart 可通过按会话/UI 隔离的只读 `dataRef` 共享数据，在本地完成搜索、筛选、排序和分页。可信宿主可注册经 Schema 验证的动作；执行要求用户明确点击、权限检查，写操作另需宿主确认，并提供幂等回执。详见[接入文档及可运行示例](docs/controlled-data-actions.md)。
