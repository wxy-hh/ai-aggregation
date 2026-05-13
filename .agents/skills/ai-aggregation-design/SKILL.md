---
name: ai-aggregation-design
description: "This skill should be used when the user explicitly says 'AI Aggregation style', 'AI Aggregation design', 'AI 聚合风格', '/ai-aggregation-design', or directly asks to use/apply the AI Aggregation design system. NEVER trigger automatically for generic UI or design tasks."
version: 1.0.0
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# ai-aggregation-design

你是这个项目的设计系统执行者。启用本技能后，所有界面都要回到同一套“AI 工作台”语法：浅色冷白底、玻璃层级、蓝紫信号色、宽松留白、明确但不吵闹的操作焦点。

在开始任何设计或实现前，先声明所需字体，并按 [`references/platform-mapping.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/platform-mapping.md) 的方式加载。不要假设字体已经存在。

## 1. 设计哲学

这个系统不是展示型官网语言，而是“可连续工作”的桌面语言。它的重点不是放大情绪，而是让用户在聊天、出图、转写、视频任务和历史检索之间切换时始终保持方向感。

主视觉始终是安静的。真正被放大的只有两类东西：当前主任务，以及下一步最值得点击的动作。其余元素都应该退到玻璃层、浅边框和低饱和说明文本里。

风格血统来自三条线的交汇：Apple 式干净底面、现代 SaaS 的玻璃拟态、AI 产品常见的蓝紫能量信号。但这里不能做成“悬浮概念海报”，必须落回真实工作流和高频操作。

## 2. 组合规则

### 层级分工

| 层级 | 负责内容 | 视觉手段 |
| --- | --- | --- |
| L0 | 页面底面 | 冷白或深石板背景，不加多余纹理 |
| L1 | 主要容器 | 半透明白面、细边框、轻阴影 |
| L2 | 次级模块 | 更浅的灰蓝填充或嵌套玻璃片 |
| L3 | 行为焦点 | 蓝紫渐变、品牌高亮、较强阴影 |
| L4 | 状态信号 | 成功绿、警告橙、错误红，只用于语义 |

1. **先铺工作台，再放功能。** 先建立页面底面、主容器、分区关系，再摆按钮、标签、图标。不要直接堆卡片。
2. **强调色只服务行为。** 蓝紫色只能用在主 CTA、激活态、关键进度和可点击信号，不能拿去铺大面积背景。
3. **圆角有层次，不要一把梭。** 输入和按钮 `12px`，主卡片 `24px`，大英雄区或外层容器 `32px` 到 `48px`，胶囊永远是满圆。
4. **玻璃必须配边框。** 所有半透明白面都要有浅描边，否则会糊成一片。模糊是附加层，不是结构本身。
5. **标题重，正文轻。** 大标题用 `Space Grotesk`，正文和控件文案用 `DM Sans`。不要在同一块区域里混三种字气。
6. **高频操作靠近拇指或视线中心。** 移动端优先底部操作区，桌面端优先英雄区底部和列表首屏，别把主动作藏在右上角角落。

## 3. 反模式

- 不要使用深紫到黑的大面积赛博霓虹背景。
- 不要把整页每个区块都做成悬浮卡片。
- 不要把蓝紫强调色拿来做正文颜色。
- 不要出现大于 `48px` 的卡片圆角，除非它是最外层英雄容器。
- 不要使用厚重投影去制造“高级感”。
- 不要让多个 CTA 同时拥有同等亮度和同等体量。
- 不要把图标按钮做成仅图标可点的小热区。
- 不要用纯白背景加纯黑文字硬碰硬，整体必须保持冷白和灰蓝缓冲。
- 不要把复杂配置一次性摊平在移动端首屏。
- 不要依赖 hover 才让关键信息出现。

## 4. 工作流

1. 声明字体与图标：`Space Grotesk`、`DM Sans`、`JetBrains Mono`、Lucide。
2. 读取 [`design-model.yaml`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/design-model.yaml) 作为唯一事实源。
3. 先应用 token，再挑组件，不要反过来。
4. 在亮色模式里确定结构，再检查深色模式是否仍然保持同一层级逻辑。
5. 涉及移动端时，优先保证输入区、底部导航、抽屉和媒体容器的稳定布局。
6. 做完后跑一次 squint test：眯眼看屏幕时，主任务、主操作和状态变化必须立刻分层。

## 5. 参考文件

| 文件 | 内容 |
| --- | --- |
| [`references/tokens.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/tokens.md) | 字体、颜色、间距、圆角、动效、英雄区、图标 |
| [`references/components.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/components.md) | 按钮、卡片、输入、标签、导航、弹层、状态样式 |
| [`references/platform-mapping.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/platform-mapping.md) | Web / Tailwind / SwiftUI 的落地代码 |

