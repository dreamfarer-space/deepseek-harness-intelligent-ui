<div align="center">

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/hero.zh.svg" alt="DeepSeek Harness Intelligent UI：为 DeepSeek Harness 带来生成式、可交互的界面" width="100%">

[English](README.md) · **中文**

[![CI](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-intelligent-ui?color=4d6bfe&label=npm)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![npm 下载量（近 18 个月）](https://img.shields.io/npm/dt/deepseek-harness-intelligent-ui?color=22d3ee&label=npm%20downloads)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7%20%E2%80%93%200.2.x-22d3ee)](docs/compatibility.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-34d399)](https://nodejs.org)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-a78bfa)](docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-97a1c9)](LICENSE)

[演示](#-演示) · [快速开始](#-快速开始) · [如何选择](#-agent-如何选择呈现方式) · [组件](#-组件目录ui_render) · [沙箱组件](#-沙箱组件ui_render_widget) · [扩展](#-扩展) · [安全](#-安全模型) · [配置](#%EF%B8%8F-配置) · [质量](#-真实模型质量基线) · [开发](#-开发与验证)

</div>

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）提供**生成式、可交互的 UI**。用户用自然语言提问，Agent 自行决定怎样作答：

- **普通文本**：用文字最清楚的时候；
- **原生组件**：看板、数据表格、图表、散点图与热力图、时间线、带滑块的函数图像、KaTeX 公式、Mermaid 流程图、代码差异、文件树、JSON 树、表单和选择题卡片；
- 完全自定义的**沙箱实时组件**：Three.js 三维场景、Canvas 模拟、小应用。

界面随回答流式、渐进地出现。排序、筛选、滑块、旋转、缩放、切换标签页都在浏览器内即时响应，只有显式操作（按钮、表单、选择题、`Bridge.sendPrompt`）才会回到 Agent，可以在当前会话中继续，也可以新开会话。

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
排序、搜索、筛选、分页、导出、悬停、滑块、旋转、标签页都在浏览器内完成，不调用模型。

</td>
</tr>
<tr>
<td valign="top">

### 🧩 26 种组件
从卡片、标签页到数据表格、`Scatter`、`Heatmap`、`Plot`、`Math`、`Mermaid`、`CodeDiff` 和 `Choice`，渲染前先校验。

</td>
<td valign="top">

### 🔒 默认沙箱隔离
不透明源 iframe、严格 CSP、带 token 的消息校验、限流的 Bridge，全部在真实浏览器中实测。

</td>
<td valign="top">

### 💾 状态不丢失
标签页、排序、筛选、表单值、滑块和 `UI.state` 在回合折叠、原位修改、页面刷新、中途停止后都能恢复。

</td>
</tr>
</table>

## 🎬 演示

### 真实 DeepSeek 模型，端到端

https://github.com/user-attachments/assets/e4eb0adc-659e-4c80-b473-449aa42ca00f

<img align="right" width="110" src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/scripts/eval/demo/assets/whale/greet.webp" alt="担任演示解说的 DeepSeek 鲸鱼娘">

[质量基线](#-真实模型质量基线)的全部 11 个浏览器用例，由 **`deepseek-flash`** 在 DSH Web 0.2.0-rc.1 中现场生成（2026-10-16）：纯文本、图表、数据表、表单回传、`Plot`、Three.js 与「让模型修复」、停止 → 重新生成、两轮原位修改、Fast 3G、CDN 不可达、手机宽度。失败原样保留并标为 ✗。由 DeepSeek 鲸鱼娘解说（见[致谢](#致谢)）。完整视频：[docs/assets/real-model/demo.mp4](docs/assets/real-model/demo.mp4)（2 分 27 秒）。

<details>
<summary><b>🖼️ 结果一览</b>（各用例截图）</summary>
<br>

| 多系列柱状图：**✗**（调用中途被截断） | `ui_patch` 两轮原位修改：✓ |
|:---:|:---:|
| ![图表](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/chart.png) | ![原位修改](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/patched.png) |
| *图表内容正确，但卡片显示「生成已中断」* | *「改成折线图」→「加上小程序 30/45/60/80」：同一张卡片，第 3 版* |
| **提交表单 → 模型使用提交的值：✓** | **阻尼振动 `Plot`，滑块实时重绘：✓** |
| ![表单回传](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/form-followup.png) | ![Plot](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/plot.png) |
| **Three.js：✗，再由「让模型修复」修好** | **中途停止 → 重新生成：✓** |
| ![Three.js 修复后](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/three-repaired.png) | ![重新生成](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/regenerated.png) |
| **Fast 3G、禁用缓存：✓** | **CDN 不可达：✓（按设计降级）** |
| ![弱网络](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/weak-network.png) | ![无网络](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/offline.png) |
| **手机宽度（390 px）：✓** | **可排序数据表：✗（Agent 去查资料了）** |
| ![移动端](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/mobile.png) | ![数据表](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/table.png) |

无法播放视频的页面（如 npm）可以看 GIF 版：[demo.gif](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/demo.gif)。

</details>

### 功能一览

以下视频都是在 **DeepSeek Harness 桌面版**中通过 magpie 调用真实 DeepSeek 模型现场录制的，没有脚本化回答。镜头跟随鼠标，放大到正在操作的区域；等待模型回答的部分做了快进（右上角显示倍速）。

**`Choice`：选一个方案，在当前会话中继续或新开会话** · DeepSeek-V4.1-Flash

https://github.com/user-attachments/assets/1317993c-17b1-4fca-9356-c365afcc6101

**`Table` 数据表格：按类型排序、搜索、按列筛选、分页、导出 CSV** · DeepSeek-V4.1-Flash

https://github.com/user-attachments/assets/be9c74e4-2ed3-402c-bd08-d57ea8516eec

**`Scatter` 与 `Heatmap`：悬停、点按、键盘查看；缺失值用斜线标出，不显示为 0** · DeepSeek-Flash

https://github.com/user-attachments/assets/cb575946-bab5-4551-9621-489dee55df07

**`CodeDiff`、`FileTree` 与 `JsonView`：代码按文本显示、上下文可折叠、复制 JSONPath** · DeepSeek-Flash

https://github.com/user-attachments/assets/75900041-3880-4e21-97f8-21bfd41872ad

## 🚀 快速开始

需要 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **0.1.7 – 0.2.x**（`>=0.1.7-rc.1 <0.3.0`）和 Node.js ≥ 22.13，Windows、Linux、macOS 均可。安装不需要编译：npm 包自带预构建的浏览器端 bundle，没有任何安装脚本。

```sh
dsh plugin --profile web add deepseek-harness-intelligent-ui
```

重启 DSH Web（`dsh web`），试着提一个需要可视化的问题，例如 *“按渠道对比 Q1–Q4 营收”* 或 *“让我在 3D 里探索 x²+y²+z²=2Rz”*。**桌面版**在 **Plugins → Add plugin** 中输入同一个包名即可。

引导式安装器会先检查 Node、`dsh` 版本、pnpm 和 profile，再执行同样的 `dsh plugin add`：

```sh
npx deepseek-harness-intelligent-ui install     # 可选 --profile <名称>、--dsh <路径>、--dry-run
npx deepseek-harness-intelligent-ui doctor      # 只诊断，不做修改
```

| 操作 | 命令 |
|---|---|
| 升级 | `dsh plugin --profile web add deepseek-harness-intelligent-ui@latest` |
| 试用预发布版（存在 `next` 标签时） | `dsh plugin --profile web add deepseek-harness-intelligent-ui@next` |
| 固定版本 | `dsh plugin --profile web add deepseek-harness-intelligent-ui@0.2.7` |
| 卸载 | `dsh plugin --profile web remove deepseek-harness-intelligent-ui`（或 `npx deepseek-harness-intelligent-ui uninstall`） |
| 从源码目录安装 | `dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui` |

<details>
<summary><b>🩺 常见问题</b></summary>
<br>

- *提示 `pnpm was not found`*：DSH 用 pnpm 安装插件。运行 `corepack enable`（Node 自带）或 `npm i -g pnpm`。
- *提示 `… is incompatible with dsh X`*：当前 DSH 版本不在支持范围内。升级 DSH（`npm i -g @deepseek-ai/dsh@latest`），或在[兼容性文档](docs/compatibility.md)里找支持该版本的插件发行版。
- *从 0.1.x 升级（以前用 `file:` 安装的 `dsh-intelligent-ui`）*：先运行 `dsh plugin --profile web remove dsh-intelligent-ui`。新旧两个包会插入同一个 `intelligent-ui` 行，`doctor` 能检测到这种冲突。
- *界面没有出现*：安装后要重启 DSH Web，并确认启动的是安装插件时指定的 profile。

</details>

**兼容性。** CI 在每次推送和每晚定时任务中，用 Windows、Linux、macOS 对 DSH `0.1.7-rc.2`、`0.2.0-rc.1`、`latest`、`next`、`alpha` 安装打包后的插件并运行完整的浏览器 E2E，DSH 一发新版就能发现问题。详情和本地验证记录见 [docs/compatibility.md](docs/compatibility.md)。

## 🧠 Agent 如何选择呈现方式

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/routing.zh.svg" alt="Agent 把每次提问路由到纯文本、ui_render 或 ui_render_widget；本地交互不调用模型，显式操作才回到 Agent" width="100%">

插件注入一段系统提示（[`src/guidance.js`](src/guidance.js)），让模型每一轮自行选择：

- **普通文本**：寒暄、简短事实、解释说明、要复制的代码、工作区内的编程任务。
- **`ui_render`**：结构化内容，例如对比、要探索的数据、看板、流程、公式、函数、代码评审、在几个方案中做选择、收集输入。
- **`ui_render_widget`**：组件目录画不出的东西，例如三维、模拟、动画、游戏、自定义工具。
- **本地优先**：凡是能在浏览器里算出来的，都必须即时更新，不调用模型。

`/ui <需求>` 可强制以 UI 作答。

| 工具 | 适用场景 | 渲染方式 |
|---|---|---|
| `ui_render` | 结构化回答 | 固定目录中的原生 React 组件，随 JSON 流式渐进渲染 |
| `ui_patch` | 修改之前显示的界面 | 组件级操作，未改动的组件保留交互状态（[详情](#-原位增量更新ui_patch)） |
| `ui_render_widget` | 自定义可视化、三维、模拟、小应用 | 不透明源沙箱 iframe 中的 HTML/CSS/JS：先 CSS，再实时 morph HTML，最后执行 JS，全程**一个** iframe |

## 🧩 组件目录（`ui_render`）

| 类别 | 组件 |
|---|---|
| 布局 | `Card`、`Stack`、`Grid`、`Tabs`（支持键盘操作） |
| 文本与提示 | `Text`（markdown 子集）、`Code`、`Alert`、`Badge`、`Divider` |
| 数据 | `Stat`、`Progress`、`List`、`Timeline`；**`Table`** 数据表格：按类型排序（数值、ISO 日期、布尔）、搜索、按列筛选、分页、CSV/Markdown 导出 |
| 图表 | **`Chart`**（柱状、折线、面积、饼图；可堆叠，图例显隐，悬停/点按/键盘提示，数据导出）、**`Scatter`**（连续坐标散点图）、**`Heatmap`**（顺序或发散色标，缺失值单独标识） |
| 数学与图示 | **`Plot`**（y = f(x)，拖动滑块即时重绘；安全表达式编译器，不用 `eval`）、**`Math`**（KaTeX）、**`Mermaid`** |
| 代码与结构 | **`CodeDiff`**（多文件新旧对比或 unified patch）、**`FileTree`**（状态徽标）、**`JsonView`**（JSONPath、复制） |
| 交互 | `Button`、**`Choice`**（选择题卡片）、`Form`（文本、数字、范围滑块、下拉、勾选、日期、多行文本） |

- **先校验再渲染。** DSH 的工具 schema 不支持递归，所以界面以扁平节点列表加 id 引用传输。Host 会拒绝未知类型或属性、悬空或重复的 id、环、形状不一致（图表系列、热力图行列）、非有限数值、无法编译的 `Plot` 表达式和超限数据，返回 `ok:false` 并附出错路径，模型据此修正后重试。
- **只渲染文本。** 单元格、代码、JSON 和标签都作为 React 文本渲染，不作为 HTML。CSV 导出遵循 RFC 4180，带 UTF-8 BOM，并防止表格公式注入。
- **可访问、自适应。** 图表可获得焦点并用键盘查看，树形组件使用 `role=tree`，触屏上控件更大；图表按卡片实际宽度布局，手机上坐标轴文字依然清晰。
- **`Math` 与 `Mermaid`** 在与组件相同的沙箱中从 CDN 白名单加载，CDN 不可达时显示静态降级；使用[离线资源包](docs/offline-resources.md)可完全离线。

### 选择题与新开会话

`Choice` 显示一个问题、若干选项卡片和两个按钮。**在当前会话中继续**会把选中项的 prompt 作为下一条消息发送；**新开会话**会在同一工作区创建新会话、提交该 prompt 并跳转过去。新会话不会复制当前对话历史，所以每个选项的 prompt 都是自包含的。`Button` 设置 `sessionTarget: "new"` 也能做到同样的事。启动过程是幂等的：双击、失败后重试或刷新页面都不会把任务启动两次。

后续组件（`Map`、`Calendar`）的路线图与设计说明：[docs/component-roadmap.md](docs/component-roadmap.md)。

## 🔁 原位增量更新（`ui_patch`）

用户要求修改之前显示的界面时（例如“把柱状图换成折线图，其余不变”），Agent 按组件 id 打补丁，不必重新发送整棵组件树。

- **标识：** 每次 `ui_render` 的结果都会给出界面的 `uiId` 和版本号 1；每个被接受的补丁都会给出新版本号和组件的 `id:类型` 概览。
- **操作：** `setProps`（合并，`unset` 删除）、`replaceNode`、`insertChild`、`removeNode`，按顺序执行，**要么全部生效，要么全部不生效**；新版本还要通过与全新 `ui_render` 相同的校验。
- **并发：** `baseVersion` 为必填；基于旧版本的补丁会被拒绝并告知当前版本，补丁不会并行执行。
- **作用范围：** Host 不保存状态，而是重放本会话自己的历史来重建当前版本，所以补丁只能作用于同一会话中的界面。
- **交互状态：** 组件 id 在各版本间不变，未被替换的组件保留排序、筛选、标签页、表单输入、提交锁定和滑块位置；被替换的组件状态重置。
- **显示：** 补丁流式生成时，上一版本保持可用；成功后新版本显示在回复下方，旧副本收起为“已更新为第 N 版”。被拒绝、失败或中断的补丁不改动任何内容。
- **沙箱组件**会被重新渲染而不是打补丁，`UI.state` 依然保留。

## 🪟 沙箱组件（`ui_render_widget`）

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/widget-streaming.zh.svg" alt="组件字段按顺序流式到达：先显示占位，再实时 morph 预览，最后在同一个 iframe 中定稿并执行代码" width="100%">

字段遵循 OpenIntelligentUI 的流式协议，顺序固定：`title`、`initialHeight`、`placeholderMessages`、`css`、`html`、`jsFunctions`、`jsExpressions`。`css` 完成前显示占位文字；随后打开预览 iframe，把部分 HTML 实时 morph 进去（[idiomorph](https://github.com/bigskysoftware/idiomorph)）；参数完整后，在**同一个 iframe 内原地定稿**并执行代码。

| 运行时辅助（全局 `UI`） | 作用 |
|---|---|
| `UI.three(el, opts)` | renderer、场景、灯光和 OrbitControls（拖动旋转，滚轮或双指缩放），按需渲染并自适应尺寸 |
| `UI.canvas(el, draw)` | 高清 2D 画布，尺寸或主题变化时自动重绘 |
| `UI.state` / `UI.setState()` | 持久化状态；带 `id` 的输入控件自动保存并恢复 |
| `UI.color('accent')` / `UI.css()` | 不透明主题色（可用于 three.js 和 Canvas）/ 原始 CSS 值 |
| `UI.onTheme(cb)`、`UI.scheme`、`UI.reducedMotion` | 响应主题变化与减少动效偏好 |
| `.ui-row`、`.ui-control`、`.ui-card`、`.ui-stage` | 辅助样式类 |

- **Bridge：** `Bridge.sendPrompt({ text })` 在宿主应答前禁用触发它的控件；`Bridge.openLink({ url })` 打开链接；`Websandbox.connection.remote.*` 为兼容 OpenIntelligentUI 而保留。
- **依赖库：** 通过 importmap 从 esm.sh 引入 `three`、`three/addons/…`、`d3`、`chart.js/auto`、`gsap`、`canvas-confetti`。
- **错误恢复：** 出现脚本错误时显示错误数量，并提供“重新加载”和“让模型修复”（把错误发给 Agent）。

### 显示位置与状态保持

- 回合进行中，UI 在工具调用处内联显示；从准备、执行到结果始终是同一个组件实例。
- 回合结束后，DSH 会把工具调用折叠进“过程”区域，插件把 UI **重新显示在回复下方**，内联处改为一行提示。
- 交互状态按界面保存在内存和 `localStorage` 中（有上限），移到回复下方或刷新页面后都会恢复；UI 本身从持久化的会话日志重建。
- 中途停止时保留已完成的部分（组件的静态预览或已生成的组件），并提供提示和“重新生成”；即使 DSH 丢弃了仍在流式输出的调用也是如此。

## 🔌 扩展

| | |
|---|---|
| **第三方组件** | 可信伴随插件可注册带版本和命名空间的组件，Host 与浏览器共用 props 校验，支持 React 渲染与禁用、卸载。模型输出不能注册或加载代码。[扩展接口与 GitDiffViewer 模板](docs/component-extensions.md) |
| **受控数据与动作** | `Table` 与 `Chart` 可共享按会话隔离的只读 `dataRef`，在本地搜索、筛选、排序和分页。可信宿主可注册经 Schema 校验的动作，只有用户原生点击才会执行，并有权限检查、写操作确认和幂等回执。[接入文档](docs/controlled-data-actions.md) |
| **便携渲染器** | `renderer/renderer.js` 可在 DSH Web 之外渲染已接受的 `ui_render`、`ui_patch` 和沙箱组件，例如在移动端 WebView 中。[远程客户端约定](docs/portable-renderer.md) |
| **离线资源** | 可选资源包内置锁定版本的 KaTeX/字体、Mermaid、Three.js、D3、Chart.js 和 canvas-confetti，公式、流程图和标准 3D 场景无需 CDN。[离线资源包](docs/offline-resources.md) |

## 🔒 安全模型

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/security.zh.svg" alt="组件运行在不透明源沙箱 iframe 中并受严格 CSP 约束；访问宿主页面会被拦截，只有通过 token 校验的 postMessage 才能到达限流的 Bridge" width="100%">

- **隔离：** `<iframe sandbox="allow-scripts allow-forms">` 配合 `srcdoc`，**不加** `allow-same-origin`。E2E 在浏览器中实测：`parent.document`、`localStorage`、`document.cookie` 均抛出 `SecurityError`，`fetch` 被拦截，`window.origin` 为 `"null"`。
- **CSP：** `default-src 'none'`；脚本、样式、字体、图片只能来自 `cdnAllowlist`；未开启 `allowNetwork` 时 `connect-src 'none'`；`form-action 'none'`、`base-uri 'none'`。
- **消息校验：** 只接受来自该 iframe 自身 `contentWindow`、带随机 token 且格式合法的消息；伪造消息会被丢弃（E2E 实测）。
- **sendPrompt 限制：** 挂载后 1 秒内拒绝，2 秒内最多一次，长度受 `sendPromptMaxChars` 限制，以普通用户消息排队发送。
- **openLink：** 只允许 https，可用 `openLinkAllowedOrigins` 进一步限制。
- **组件目录：** 文本作为 React 元素渲染，不作为 HTML；`Plot` 表达式只能调用固定的数学函数，无法使用 `eval`、`Function` 或访问属性；新开会话和宿主动作都要求用户原生点击。

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
| `sendPromptMaxChars` | `4000` | 组件、按钮、表单、选择题单条消息的最大长度 |
| `openLinkAllowedOrigins` | `[]` | 非空时，`openLink` 只能打开这些来源 |

## 📊 真实模型质量基线

工具调用的参数能解析，不等于用户真正拿到了可用的界面。`npm run eval:real` 把三层结果**分开**统计，任何一层通过都不能代替另一层。

| 层 | 证明什么 | 最新 · 2026-10-16 · `deepseek-flash` |
| --- | --- | :---: |
| **Mock E2E** | 渲染、流式、交互、持久化与隔离（回答是**脚本化**的） | **30 / 30** |
| **真实模型 · API** | 选对工具、**首次**就给出合法参数、渲染出的界面包含所要求的组件和数据 | **30 / 32**（94%） |
| **真实模型 · 浏览器** | 模型生成的界面在真实 DSH Web + Chrome 中可用：能渲染、能交互、经得起停止/恢复和弱网，控制台无错误 | 自动化 **9 / 11**<br>人工复核后 **8 / 11** |

| 耗时（真实模型） | p50 | p95 |
| --- | ---: | ---: |
| 首次出现可见预览 | 7.6 s | 70.2 s |
| 界面生成完成 | 11.8 s | 73.4 s |
| 流结束后的浏览器端执行 | 26 ms | 2.9 s |

长尾来自体积较大的 Three.js 组件（预览开始前要先写出 10–20 KB 代码）。失败都是模型与 Agent 的真实行为：调用中途被截断、Agent 去上网查资料而没有出界面、Three.js 作用域错误经「让模型修复」修好、首次参数无效后重试改对。各用例、检查项与完整结论见 [docs/real-model-eval.md](docs/real-model-eval.md)。

<details>
<summary><b>▶️ 如何运行</b></summary>
<br>

密钥只从环境变量读取；如果报告里仍含有密钥，运行会拒绝写出报告。

```sh
export DEEPSEEK_API_KEY='<your-key>'               # PowerShell：$env:DEEPSEEK_API_KEY = '<your-key>'
npm run eval:real                                   # Mock E2E + API + 浏览器；任何失败都以退出码 1 结束
npm run eval:real -- --repeat 3                     # 单用例成功率与 p50/p95
npm run eval:real -- --record && npm run eval:demo  # 录制并剪辑演示视频
```

| 选项 | 作用 |
| --- | --- |
| `--stage mock,api,browser` | 只运行部分层（默认 `all`）；`A`–`F` 选择 API 类别（`F`：成对的呈现方式决策用例，[#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58)） |
| `--only B3,R-chart` | 只运行这些用例 |
| `--keep-other-layers` | 保留本次没有运行的层或用例，各自保留原来的日期 |
| `--append` | 配合 `--only`：把重跑结果作为额外样本加入，绝不用一次侥幸成功覆盖失败 |
| `--rescore` | 用当前断言、基于已保存的对话记录重新判定上一次 API 运行，不调用模型 |
| `--report <file.json>` | 把报告写到其他文件，例如每个提示词版本一份，用来对比基线与候选提示词 |
| `DEEPSEEK_EVAL_MODEL` | 模型 id（默认 `deepseek-flash`） |

GitHub 上的 **Real-model eval** 工作流可按需手动触发，使用仓库密钥 `DEEPSEEK_API_KEY` 运行同一条命令；用 `deepseek-flash` 完整跑一遍约花费 ¥1.5。

</details>

<details>
<summary><b>🔬 每个用例检查什么</b></summary>
<br>

**API 阶段**（`scripts/eval/api-stage.mjs`，16 个用例，断言 v3；每条要求单独成为一项检查）：

- **纯文本（A1–A4）：** 不调用界面工具，给出有内容的回答。
- **图表与数据表（B1–B3、B5）：** 按含义识别的指标卡；包含全部五列的可排序表格；含 Q1–Q4、同时有线上与线下两个系列的柱状图；至少 4 个里程碑的时间线。
- **表单（B4、D1）：** 滑块、复选框和下拉选择；D1 按浏览器方式提交，并要求后续回答使用提交的值。
- **数学 Plot（C2）：** 三个滑块且都出现在表达式中，函数形状为 `exp(…)·sin/cos(…)`。
- **Three.js 与组件（C1、C3、C4）：** 使用 `UI.three()` 或 `import("three")`，有动画、光照、启动/暂停和参数控件。
- **多轮修改（D2、D3）：** 新增一列且每个值都正确、旧值保留；柱状 → 折线，再按准确数值加入第三个系列。
- **呈现方式决策（F，尚未进入已记录的运行）：** 21 个成对用例，主题不变、只改变任务（解释 vs. 拖动参数、解释 Three.js vs. 对话内可旋转场景、可复制代码 vs. 修改仓库、Markdown 表格 vs. 用户数据的可搜索表格、写公式 vs. 推导中插入曲线、结尾 Choice vs. 每节一张图），另有必须保持已筛选表格不变的 patch、3D 回合之后的纯文本限制，以及没有数据源的实时数据请求。`no-ui` 失败表示不必要的 UI，`needs-ui` 失败表示漏掉了 UI。详见 [#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58)。

**浏览器阶段**（`scripts/eval/browser-stage.mjs`，11 个用例，每个都在新会话中）：纯文本不创建卡片；图表有图例、Q1–Q4 和本地悬停；数据表重新排序不调用模型；用真实鼠标键盘填写并提交表单；Plot 滑块重绘；Three.js 画布确有内容（像素统计）且可拖动，失败时尝试「让模型修复」；停止 → 预览 → 重新生成；两轮原位修改；Fast 3G；屏蔽 CDN；390 px 手机宽度。每个用例都记录控制台错误，每张截图都经过人工复核。

</details>

## 🛠 开发与验证

```sh
npm install
npm run build            # client-src/ → client/client.js 与 renderer/renderer.js
npm test                 # 单元与组件测试（vitest）
npm run typecheck
npm run e2e:all          # 构建 → 安装到临时 DSH 目录 → 脚本化模型 + 真实 DSH Web → 浏览器检查
npm run e2e:controlled   # 受控数据与动作（真实 Chromium）
npm run e2e:extensions   # 第三方组件模板（真实 Chromium）
npm run e2e:offline      # 断网环境下的离线资源包
npm run smoke -- --spec ./deepseek-harness-intelligent-ui-<版本>.tgz   # 对打包结果做安装冒烟测试
npm run demo:features    # 在 DSH 桌面版中重新录制功能演示视频
npm run docs:art         # 重新生成 README 插图
```

- **目录结构：** `src/` 是 Host 端（纯 ESM，无需构建）；`client-src/` 是浏览器端（TSX，用 esbuild 打包）。`client/client.js` 与 `renderer/renderer.js` 提交到仓库并随包发布，npm、`file:` 和 git 安装都不需要构建；产物过期时 CI 会失败。不要添加 `prepare`/`postinstall` 脚本，DSH 的 pnpm 会拦截插件构建脚本。
- **E2E** 需要 Chrome（可用 `CHROME_PATH` 指定）和 PATH 中的 `dsh`（可用 `DSH_BIN` 指定），可在 Windows、Linux、macOS 上运行。`--spec <tgz>` 测试打包结果，`--record` 重新录制脚本化演示，`E2E_DATA_ONLY=1` / `E2E_SESSION_ONLY=1` 只运行其中一组。
- **功能演示视频：** 以 `--remote-debugging-port=9333` 启动桌面版并选好模型，然后运行 `npm run demo:features`（见 [`scripts/demo/`](scripts/demo)）。

<details>
<summary><b>✅ 浏览器 E2E 检查什么</b>（<code>scripts/e2e/browser.mjs</code>）</summary>
<br>

- 普通问答保持纯文本；看板流式渐进出现。
- 图表悬停、表格排序、标签页都在本地完成；表单回传后得到新界面。
- `ui_patch` 把图表从柱状改为折线：无效的首次尝试被拒绝，旧副本收起，状态保留（刷新后也保留）。
- 组件预览在同一个 iframe 中定稿；Three.js 场景能渲染、旋转、缩放；R 滑块在本地生效；`Bridge.sendPrompt` 能往返。
- KaTeX 与 Mermaid 能渲染；Plot 滑块在本地生效；早先的界面保留状态。
- 停止 → 静态预览 → 重新生成；深色主题；手机宽度无溢出；刷新后恢复所有界面与状态。
- 沙箱隔离，伪造消息被忽略。
- **数据组件：** 搜索加范围与日期筛选、CSV 内容与防公式注入、散点图悬停、热力图键盘操作区分 0 与缺失值、CodeDiff 不执行 HTML，以上都不调用模型。
- **新开会话：** 原生按钮只启动一个独立会话，不复制历史。
- 控制台没有插件错误。

</details>

<details>
<summary><b>📦 发布流程</b>（维护者）</summary>
<br>

1. 开一个 `chore: prepare x.y.z release` PR：在 [CHANGELOG.md](CHANGELOG.md) 中新增 `## [x.y.z]` 小节，运行 `npm version x.y.z --no-git-tag-version` 和 `npm run build`，更新 README 中的固定版本示例，并用 `npm run release:check` 检查。
2. CI 通过后合并。
3. 在合并提交上打 `vx.y.z` tag 并推送。Release 工作流会运行 CI 矩阵，通过 Trusted Publishing 带 provenance 发布到 npm（预发布版使用 `next` 标签），在三个系统上对已发布的包做冒烟测试，并用 CHANGELOG 的对应小节创建 GitHub Release。

OIDC 与仓库设置见 [docs/releasing.md](docs/releasing.md)。

</details>

## 📚 文档

| 文档 | 内容 |
|---|---|
| [compatibility.md](docs/compatibility.md) | 支持的 DSH、Node 与操作系统版本；CI 测试范围 |
| [component-roadmap.md](docs/component-roadmap.md) | #17 交付的组件；`Map` 与 `Calendar` 设计提案 |
| [component-extensions.md](docs/component-extensions.md) | 第三方组件接口与模板 |
| [controlled-data-actions.md](docs/controlled-data-actions.md) | 宿主数据绑定与 Schema 校验的动作 |
| [portable-renderer.md](docs/portable-renderer.md) | 在 DSH Web 之外渲染 |
| [offline-resources.md](docs/offline-resources.md) | 离线 KaTeX/Mermaid/Three.js 资源包 |
| [real-model-eval.md](docs/real-model-eval.md) | 真实模型评测：用例、检查项与结论 |
| [releasing.md](docs/releasing.md) | 发布完整性与 npm Trusted Publishing |
| [CHANGELOG.md](CHANGELOG.md) | 各版本变更 |

## 已知限制

- 默认在线包的公式、Mermaid 与组件导入库依赖可达的 CDN。[离线资源包](docs/offline-resources.md)支持公式、Mermaid 和标准 Three.js 场景；其他 Three.js 插件、GSAP、外部媒体不包含在内。资源加载失败时会显示明确的降级提示或脚本错误。
- 交互状态保存在当前浏览器的 `localStorage` 中，不跨设备同步。
- 流式中途被丢弃的调用按回合起止时间归属；如果远程 DSH 主机与浏览器的时钟偏差较大，这张卡片可能不显示。

## 致谢

概念、流式组件协议和部分提示词来自 [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI)（MIT），见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

担任端到端演示解说的 DeepSeek 鲸鱼娘（共 26 个姿态）来自 [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume)（MIT © Sutera-Diffusus，立绘作者 [@SuteraWu](https://github.com/SuteraWu)）。原始文件及许可证见 [`scripts/eval/demo/assets/whale/`](scripts/eval/demo/assets/whale)，不包含在 npm 包中。

本项目采用 [MIT](LICENSE) 许可。
