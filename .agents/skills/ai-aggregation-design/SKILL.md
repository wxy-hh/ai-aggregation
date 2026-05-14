---
name: ai-aggregation-design
description: "This skill should be used when the user explicitly says 'AI Aggregation style', 'AI Aggregation design', 'AI 聚合风格', '/ai-aggregation-design', or directly asks to reference/apply the AI Aggregation visual language. It is for borrowing the product's existing visual style and design cues, not for force-converting every page into the exact same AI workbench layout. NEVER trigger automatically for generic UI or design tasks."
version: 1.1.0
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# ai-aggregation-design

你是这个项目的视觉风格提炼者。启用本技能后，核心任务不是把页面强制改造成统一的“AI 工作台”，而是**借鉴并映射**这个项目已经形成的视觉语言：浅色冷白底、玻璃层级、蓝紫信号色、宽松留白、明确但不吵闹的操作焦点。

你要优先判断“当前页面适合借多少”。有些页面适合强借鉴，有些页面只需要保留配色、字体、圆角、边框和交互气质，不应该把布局、模块关系和首页工作台骨架整套搬过去。

在开始任何设计或实现前，先声明所需字体，并按 [`references/platform-mapping.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/platform-mapping.md) 的方式加载。不要假设字体已经存在。

## 1. 设计哲学

这个系统的参考源头不是展示型官网语言，而是“可连续工作”的桌面语言。它的重点不是放大情绪，而是让用户在聊天、出图、转写、视频任务和历史检索之间切换时始终保持方向感。

主视觉始终是安静的。真正被放大的只有两类东西：当前主任务，以及下一步最值得点击的动作。其余元素都应该退到玻璃层、浅边框和低饱和说明文本里。

风格血统来自三条线的交汇：Apple 式干净底面、现代 SaaS 的玻璃拟态、AI 产品常见的蓝紫能量信号。但这里不能做成“悬浮概念海报”，也不能把所有页面都做成首页工作台翻版，必须落回真实页面目标和高频操作。

## 2. 组合规则

### 层级分工

| 层级 | 负责内容 | 视觉手段 |
| --- | --- | --- |
| L0 | 页面底面 | 冷白或深石板背景，不加多余纹理 |
| L1 | 主要容器 | 半透明白面、细边框、轻阴影 |
| L2 | 次级模块 | 更浅的灰蓝填充或嵌套玻璃片 |
| L3 | 行为焦点 | 蓝紫渐变、品牌高亮、较强阴影 |
| L4 | 状态信号 | 成功绿、警告橙、错误红，只用于语义 |

1. **先判断页面类型，再决定借鉴深度。** 先分辨当前页面是工作台、表单页、详情页、列表页还是营销页，再决定借鉴的是整体骨架，还是只借 token 与组件气质。不要默认整页照搬工作台。
2. **强调色只服务行为。** 蓝紫色只能用在主 CTA、激活态、关键进度和可点击信号，不能拿去铺大面积背景。
3. **圆角有层次，不要一把梭。** 输入和按钮 `12px`，主卡片 `24px`，大英雄区或外层容器 `32px` 到 `48px`，胶囊永远是满圆。
4. **玻璃必须配边框。** 所有半透明白面都要有浅描边，否则会糊成一片。模糊是附加层，不是结构本身。
5. **标题重，正文轻。** 大标题用 `Space Grotesk`，正文和控件文案用 `DM Sans`。不要在同一块区域里混三种字气。
6. **高频操作靠近拇指或视线中心。** 移动端优先底部操作区，桌面端优先英雄区底部和列表首屏，别把主动作藏在右上角角落。
7. **风格复用优先于结构复刻。** 优先复用颜色、字体、阴影、边框、玻璃层级、状态语气和按钮焦点；只有当页面职责本身接近工作台时，才复用大块工作台结构。

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
- 不要因为启用了本技能，就强制把所有页面改造成首页式工作台布局。
- 不要把“参考视觉风格”误解成“复制页面结构”。

## 4. 工作流

1. 声明字体与图标：`Space Grotesk`、`DM Sans`、`JetBrains Mono`、Lucide。
2. 读取 [`design-model.yaml`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/design-model.yaml) 作为唯一事实源。
3. 先判断当前页面需要“风格借鉴”还是“结构借鉴”；默认优先前者，谨慎使用后者。
4. 先应用 token，再挑组件，不要反过来。
5. 在亮色模式里确定结构，再检查深色模式是否仍然保持同一层级逻辑。
6. 涉及移动端时，优先保证输入区、底部导航、抽屉和媒体容器的稳定布局。
7. 做完后跑一次 squint test：眯眼看屏幕时，主任务、主操作和状态变化必须立刻分层。
8. 若用户只要求“参考这个页面风格”，默认输出应是“同语气、同材质、同层级”，而不是“同骨架、同排版、同模块”。

## 5. 参考文件

| 文件 | 内容 |
| --- | --- |
| [`references/tokens.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/tokens.md) | 字体、颜色、间距、圆角、动效、英雄区、图标 |
| [`references/components.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/components.md) | 按钮、卡片、输入、标签、导航、弹层、状态样式 |
| [`references/platform-mapping.md`](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/ai-aggregation-design/references/platform-mapping.md) | Web / Tailwind / SwiftUI 的落地代码 |
