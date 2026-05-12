---
name: home-light-style
description: 复用 AI 聚合平台 `/home` 页亮色桌面视觉风格、布局比例和已定稿组件规范。用于把其他页面做成与 `/home` 一致的浅色玻璃工作台风格，或在评审、重构、补样式时要求严格对齐 `docs/DESIGN.md` 与 `apps/web/src/styles/home-light-tokens.css` 的场景。
---

# Home Light Style

## Overview

使用这项技能时，不重新发明一套“像 home 的风格”。先读取既有规范，主要是借鉴极高水准的设计，融合了玻璃拟态（Glassmorphism）与流光溢彩（Vibrant Gradients）风格。

这项技能的核心是复用 `/home` 的视觉语言，而不是强行复制 `/home` 的页面结构。尤其面对已有页面时，优先保留原有功能目标、信息架构、交互路径与操作节奏，只把视觉风格、组件语气和版式秩序校准到同一套规范里。

## 工作流程

### 1. 先读取事实源

按这个顺序读取：

1. [docs/DESIGN.md](/Users/weixiaoyu/Desktop/practice/AI-aggregation/docs/DESIGN.md)
2. [apps/web/src/styles/home-light-tokens.css](/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/styles/home-light-tokens.css)
3. [references/design-reference.md](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-light-style/references/design-reference.md)

如果目标页面已经有现成实现，再读取它自己的页面组件、布局组件和关联样式。

### 2. 先做映射，再做改动

把目标页面拆成以下层级，并逐层映射到 `/home`：

- 页面壳层：背景、容器宽度、左右栏关系、滚动区
- 主视觉区：大卡片、标题、说明文案、光效、胶囊标签
- 业务卡片：卡片圆角、阴影、边框、图标底座、按钮样式
- 列表项：间距、hover、文本层级、状态点

映射时遵守下面的判断顺序：

1. 先保留目标页面自己的功能分区、核心流程和交互方式
2. 再判断哪些区域适合借用 `/home` 的视觉结构
3. 仅在不影响任务效率、理解成本和操作连续性的前提下，调整布局比例或卡片编排
4. 如果目标页面的场景与 `/home` 不同，优先复用视觉要素，不强行复刻 `/home` 的左右栏、大卡片或首页式主视觉

优先复用已有 token 和组件类：

- `home-shell`
- `home-secondary-sidebar`
- `home-search`
- `home-hero`
- `home-feature-card`
- `home-command-card`
- `home-file-item`
- `home-creation-card`
- `home-pill-badge`

### 3. 保持这些约束不变

- 只使用已定稿的亮色桌面规范
- 不把暗色态、移动端样式混入当前任务，除非用户明确要求
- 不把截图里没出现、且 `DESIGN.md` 标记为待补的组件伪装成“最终版”
- 不随意换主色、圆角体系、阴影体系或页面比例
- 不为了“更像 `/home`”而牺牲现有页面的业务语义、功能优先级、表单逻辑、内容层级或交互效率
- 对已有页面，默认做“视觉统一”和“组件语气统一”，而不是“布局重做”；只有用户明确要求时，才大幅改动页面结构

### 4. 处理未定稿组件

如果任务涉及以下内容：

- `Modal / Dialog`
- `Table`
- `/home` 搜索框之外的通用输入框
- 其他 `DESIGN.md` 已标记为待补的组件

执行规则：

1. 明确说明它们尚未纳入最终规范
2. 优先保持和 `/home` 同级的背景、边框、圆角、阴影语气
3. 不把临时映射写成“官方规范”
4. 如果任务要求产出文档，标注为“待 `DESIGN.md` 补充章节确认”

## 输出要求

- 所有用户可见文案保持中文
- 所有颜色写成十六进制或现有透明色
- 所有尺寸写成 `px`
- 需要解释设计依据时，引用 `DESIGN.md` 中已经定稿的条目
- 需要新增样式时，优先补在 `apps/web/src/styles/home-light-tokens.css` 的同名体系内

## 快速判断

遇到下面的请求时直接使用本技能：

- “把这个页面做成和 `/home` 一样的风格”
- “复刻首页亮色桌面 UI”
- “按 home 页的视觉语言重做卡片和侧栏”
- “让这个页面统一到 `/home` 的亮色设计规范”
