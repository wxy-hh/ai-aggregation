# `/home` 亮色桌面风格设计规范

本文档只描述当前 `http://localhost:3032/home` 对应的 `/home` 页亮色桌面态。所有规则均来自以下事实源：

- 截图中的桌面亮色界面
- `apps/web/src/components/home/home-content.tsx`
- `apps/web/src/components/layout/app-layout.tsx`
- `apps/web/src/components/layout/global-sidebar.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`

未在截图和上述源码中同时成立的内容，不纳入本轮最终规范。

## 一、整体设计风格概述

- 设计风格关键词：浅色玻璃拟态、AI 工作台、柔和渐变、高圆角、大留白、低对比边框
- 色彩体系特点：以冷白和浅蓝灰为底，主强调色为蓝紫渐变，局部用紫、粉、青作为功能分组色
- 排版风格特点：正文使用 `DM Sans`，标题保持粗字重与紧凑字距，英文胶囊标签使用全大写高识别文本
- 空间布局特点：固定左主侧栏 `100px`，二级侧栏 `280px`，主内容最大宽度 `1400px`，卡片使用 `24px`、`32px`、`48px` 三层圆角
- 动效风格特点：`200ms` 到 `500ms` 轻量过渡，hover 以阴影增强、轻微放大、颜色提亮为主；背景光斑使用脉冲动画

## 二、基础设计规范

### 2.1 色彩系统

#### 主色调 Primary

| 色阶 | 数值       |
| ---- | ---------- |
| 50   | `#EFF6FF`  |
| 100  | `#DBEAFE`  |
| 200  | `#BFDBFE`  |
| 300  | `#93C5FD`  |
| 400  | 本页未使用 |
| 500  | `#3B82F6`  |
| 600  | `#2563EB`  |
| 700  | 本页未使用 |
| 800  | 本页未使用 |
| 900  | 本页未使用 |

#### 辅助色 Secondary

| 色阶   | 数值      |
| ------ | --------- |
| 紫 100 | `#F3E8FF` |
| 紫 200 | `#E9D5FF` |
| 紫 500 | `#A855F7` |
| 紫 600 | `#9333EA` |
| 粉 100 | `#FCE7F3` |
| 粉 200 | `#FBCFE8` |
| 粉 500 | `#EC4899` |
| 粉 600 | `#DB2777` |
| 靛 200 | `#C7D2FE` |
| 靛 500 | `#6366F1` |
| 青 500 | `#06B6D4` |

#### 中性色 Neutral

| 用途               | 数值      |
| ------------------ | --------- |
| AppLayout 页面底色 | `#F5F7FA` |
| `/home` 页面底色   | `#F3F5FA` |
| 全局基础背景 token | `#F5F6FA` |
| 卡片纯白           | `#FFFFFF` |
| 一级浅灰背景       | `#F8FAFC` |
| 二级浅灰背景       | `#F1F5F9` |
| 边框浅灰           | `#E2E8F0` |
| 文本弱化灰         | `#94A3B8` |
| 正文次级灰         | `#64748B` |
| 正文主灰           | `#475569` |
| 标题深灰           | `#0F172A` |
| 深色图片卡片起始色 | `#1E293B` |
| 深色图片卡片终止色 | `#000000` |

#### 功能色

| 类型 | 数值      |
| ---- | --------- |
| 成功 | `#22C55E` |
| 警告 | `#F59E0B` |
| 错误 | `#E54350` |
| 信息 | `#3B82F6` |

#### 特殊效果色

| 用途             | 数值                                |
| ---------------- | ----------------------------------- |
| Logo 渐变起点    | `#5D7CFA`                           |
| Logo 渐变终点    | `#8794FF`                           |
| 激活图标渐变终点 | `#7D91FF`                           |
| 激活指示条       | `#6B83FA`                           |
| 激活标签文本     | `#4E67E6`                           |
| Hero 标题渐变    | `#2563EB` -> `#6366F1` -> `#06B6D4` |
| 主按钮渐变       | `#4969E9` -> `#7B8FFF`              |
| 玻璃描边白       | `rgba(255, 255, 255, 0.60)`         |
| 玻璃背景白       | `rgba(255, 255, 255, 0.60)`         |
| 背景蓝光         | `rgba(219, 234, 254, 0.50)`         |
| 背景紫光         | `rgba(233, 213, 255, 0.30)`         |
| 背景蓝光 2       | `rgba(191, 219, 254, 0.30)`         |

### 2.2 排版系统

#### 字体家族

| 类型             | 数值                                        |
| ---------------- | ------------------------------------------- |
| 主字体           | `"DM Sans", sans-serif`                     |
| 备用标题字体变量 | `"Space Grotesk", sans-serif`               |
| 代码字体         | 当前 `/home` 页面未显式定义，不纳入本轮基准 |

说明：

- `body` 使用 `DM Sans`
- `/home` 页面根节点使用 `font-sans`
- `Space Grotesk` 在全局已加载，但当前 `/home` 亮色桌面态未显式套用到具体文本元素

#### 字体大小

| 层级            | 数值   |
| --------------- | ------ |
| Hero H1         | `60px` |
| 页面分区标题    | `20px` |
| 功能卡片标题    | `24px` |
| 正文大号        | `18px` |
| 正文标准        | `16px` |
| 正文小号        | `14px` |
| 辅助说明 / 标签 | `12px` |
| Logo 版本号     | `8px`  |
| Logo 标识       | `10px` |

#### 字体粗细

| 层级                         | 数值           |
| ---------------------------- | -------------- |
| Hero H1                      | `900`          |
| 页面标题 / 卡片标题          | `700`          |
| 胶囊标签 / 主按钮 / 分区标题 | `600` 或 `700` |
| 普通正文                     | `400` 或 `500` |
| Logo 标识                    | `900`          |

#### 行高

| 层级         | 数值    |
| ------------ | ------- |
| Hero H1      | `1.25`  |
| 普通正文     | `1.50`  |
| 功能卡片说明 | `1.625` |
| Logo 文本    | `1`     |

#### 字间距

| 层级         | 数值                       |
| ------------ | -------------------------- |
| Hero H1      | `-0.025em`                 |
| 分区英文标签 | `0.05em`                   |
| Logo 标识    | `-0.05em` 到更紧凑的默认值 |
| 其他中文正文 | `0`                        |

#### 文本颜色

| 用途                           | 数值      |
| ------------------------------ | --------- |
| Hero 标题主体                  | `#0F172A` |
| 功能卡片标题                   | `#0F172A` |
| 正文主文本                     | `#475569` |
| 正文说明文本                   | `#64748B` |
| 弱化标题 / 占位符 / 图标默认色 | `#94A3B8` |
| 激活蓝文字                     | `#2563EB` |
| 紫色强调                       | `#9333EA` |
| 粉色强调                       | `#DB2777` |

### 2.3 间距系统

#### 基础间距单位

- 本页使用 `4px` 递进体系
- 关键步长：`4px`、`8px`、`12px`、`16px`、`24px`、`32px`、`48px`

#### 内边距 Padding

| 元素                 | 数值                              |
| -------------------- | --------------------------------- |
| 全局侧栏上下         | `24px`                            |
| 二级侧栏桌面内边距   | `24px`                            |
| 主内容容器桌面内边距 | 左右 `32px`，上下 `40px`          |
| Hero 卡片桌面内边距  | `48px`                            |
| 功能卡片内边距       | `32px`                            |
| 命令卡片内边距       | `12px`                            |
| 文件项内边距         | `8px`                             |
| 搜索框内边距         | 上下 `12px`，左 `40px`，右 `16px` |
| Hero 胶囊标签内边距  | 左右 `12px`，上下 `4px`           |
| 功能卡片按钮内边距   | 左右 `24px`，上下 `12px`          |

#### 外边距 Margin

| 元素                        | 数值   |
| --------------------------- | ------ |
| 页面标题到底部搜索框        | `24px` |
| 搜索框到底部工具区          | `32px` |
| Hero 头部到底部功能卡片网格 | `64px` |
| Hero 区到底部最近创作区     | `64px` |
| 功能卡片标题到底部正文      | `12px` |
| 功能卡片正文到底部按钮      | `32px` |
| 最近创作标题到底部列表      | `24px` |

#### 容器宽度

| 容器             | 数值            |
| ---------------- | --------------- |
| 全局侧栏宽度     | `100px`         |
| 二级侧栏桌面宽度 | `280px`         |
| 主内容最大宽度   | `1400px`        |
| Hero 背景光斑 1  | `384px x 384px` |
| Hero 背景光斑 2  | `288px x 288px` |

#### 栅格系统

| 场景             | 规则                                       |
| ---------------- | ------------------------------------------ |
| 功能卡片网格     | 桌面 `3` 列，列间距 `32px`                 |
| 最近创作网格     | 超宽桌面 `4` 列，列间距 `24px`             |
| 二级侧栏内部列表 | 单列纵向排列，间距 `4px`、`12px` 或 `16px` |

### 2.4 阴影与圆角

#### 阴影系统

| 层级                       | 数值                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| Hero 主卡片                | `0 20px 60px -10px rgba(59, 130, 246, 0.10)`                                  |
| 主按钮默认                 | `0 10px 24px rgba(93, 124, 250, 0.32)`                                        |
| 主按钮悬停                 | `0 14px 30px rgba(93, 124, 250, 0.36)`                                        |
| 描边按钮                   | `0 8px 20px rgba(76, 95, 154, 0.10)`                                          |
| 次按钮                     | `inset 0 1px 0 rgba(255, 255, 255, 0.70), 0 6px 16px rgba(78, 99, 160, 0.12)` |
| 功能卡片                   | 使用 `shadow-xl`，视觉接近中强度漫反射阴影                                    |
| 功能卡片悬停               | 使用 `shadow-2xl`，较默认明显增强                                             |
| 轻量卡片 / 搜索框 / 文件块 | `shadow-sm`                                                                   |
| 每日灵感卡片悬停           | `shadow-md`                                                                   |
| 侧栏激活图标               | `shadow-lg` + `shadow-indigo-500/35`                                          |

#### 圆角系统

| 层级                                   | 数值     |
| -------------------------------------- | -------- |
| 超大 Hero 桌面圆角                     | `48px`   |
| Hero 移动基础圆角                      | `28px`   |
| 功能卡片                               | `32px`   |
| 普通卡片 / 新建项目卡片 / 最近创作卡片 | `16px`   |
| 输入框 / 图标按钮 / 功能按钮           | `12px`   |
| 小图标底座                             | `8px`    |
| 圆形头像 / 状态点 / 胶囊标签           | `9999px` |

## 三、核心组件设计规范

### 3.1 按钮组件

#### 主要按钮 Primary Button

- 默认背景：`linear-gradient(90deg, #4969E9 0%, #7B8FFF 100%)`
- 文本颜色：`#FFFFFF`
- 圆角：`12px`
- 高度：`40px`
- 水平内边距：`16px`
- 阴影：`0 10px 24px rgba(93, 124, 250, 0.32)`
- 悬停：亮度提升到约 `105%`，阴影切换为 `0 14px 30px rgba(93, 124, 250, 0.36)`
- 点击：整体缩放 `0.98`
- 禁用：透明度 `0.5`，不可点击

#### 次要按钮 Secondary Button

- 背景：`#ECEFF9`
- 文本颜色：`#2C3A6D`
- 圆角：`12px`
- 高度：`40px`
- 阴影：`inset 0 1px 0 rgba(255, 255, 255, 0.70), 0 6px 16px rgba(78, 99, 160, 0.12)`
- 悬停：背景降低到约 `85%` 不透明度

#### 文字按钮 Text Button

- 当前页使用的是 ghost 变体
- 默认文本：`#475569`
- 悬停背景：`#E2E5F8` 的 `80%`
- 悬停文本：`#363F78`
- 圆角：`12px`

#### 图标按钮 Icon Button

- 常规尺寸：`40px x 40px`
- 圆角：`12px`
- 默认背景：`rgba(255, 255, 255, 0.45)`
- 默认边框：`rgba(255, 255, 255, 0.30)`
- 默认图标：`#94A3B8`
- 悬停背景：`rgba(255, 255, 255, 0.80)`
- 悬停图标：`#5D7CFA`
- 悬停缩放：`1.05`
- 点击缩放：`0.95`

#### 按钮尺寸

| 尺寸 | 高度   | 圆角   | 水平内边距 |
| ---- | ------ | ------ | ---------- |
| 小   | `36px` | `8px`  | `12px`     |
| 中   | `40px` | `12px` | `16px`     |
| 大   | `44px` | `12px` | `32px`     |

### 3.2 卡片组件

#### 标准卡片

- 背景色：`#FFFFFF`
- 圆角：`16px` 或 `32px`
- 边框：`1px solid #F1F5F9` 或更浅的白色半透明描边
- 阴影：从 `shadow-sm` 到 `shadow-xl`
- 内边距：`16px`、`24px`、`32px` 三档

#### 带图卡片

- 最近创作图片预览比例：`4 / 3`
- 图片容器圆角：`12px`
- 图片卡片标题与预览间距：`16px`
- 图片覆盖方式：`background-size: cover; background-position: center`

#### 可点击卡片

- 默认光标：`pointer`
- 悬停：增强阴影，必要时放大内部媒体层 `1.05`
- 点击：不改变整体布局，只保留阴影和轻缩放反馈

### 3.3 导航组件

#### 顶部导航栏

- 当前截图对应桌面态未出现顶部导航栏
- 本轮不建立桌面顶部导航规范

#### 侧边导航栏

**全局侧栏**

- 宽度：`100px`
- 背景：`#FFFFFF`
- 右边框：`1px solid #E2E8F0`
- 上下内边距：`24px`
- 导航项图标容器：`40px x 40px`
- 导航项默认文本：`10px`、`500`
- 激活指示条：`4px x 40px`，颜色 `#6B83FA`

**二级侧栏**

- 宽度：`280px`
- 背景：`rgba(255, 255, 255, 0.60)`
- 毛玻璃：`blur(24px)`
- 右边框：`1px solid rgba(226, 232, 240, 0.50)`
- 内边距：`24px`

#### 面包屑导航

- 当前截图和 `/home` 源码未出现
- 本轮不建立规范

### 3.4 表单组件

#### 输入框

本轮唯一正式输入框基准是 `/home` 搜索框：

- 高度：`48px`
- 背景：`#FFFFFF`
- 圆角：`12px`
- 边框：无显式边框
- 左图标区：`16px x 16px` 图标，距离左边 `12px`
- 文本字号：`14px`
- 文本颜色：`#475569`
- 占位符颜色：`#94A3B8`
- 默认阴影：`shadow-sm`
- 聚焦态：`2px` 外发光，颜色 `rgba(59, 130, 246, 0.20)`
- 轮廓：`outline: none`

#### 单选框 / 复选框

- 当前截图和 `/home` 源码未出现
- 本轮不建立最终规范

#### 下拉选择框

- 当前截图和 `/home` 源码未出现
- 本轮不建立最终规范

#### 提交按钮

- 复用主按钮规范

### 3.5 其他组件

#### 标签 Tag / Badge

- Hero 顶部胶囊标签高度：`24px`
- 内边距：左右 `12px`，上下 `4px`
- 背景：`rgba(59, 130, 246, 0.10)`
- 文本：`#2563EB`
- 圆角：全圆角
- 状态点：`8px x 8px`，颜色 `#3B82F6`

#### 徽章 Badge

- 常用工具右侧小徽章字号：`10px`
- 内边距：左右 `6px`，上下 `2px`
- 圆角：约 `4px`
- 蓝色徽章：文字 `#3B82F6`，背景 `#EFF6FF`

#### 进度条 Progress Bar

- 当前截图和 `/home` 源码未出现
- 本轮不建立最终规范

#### 弹窗 Modal

- 当前仓库存在基础 `Dialog` 组件，但未纳入本轮 `/home` 亮色桌面像素级规范
- 待你后续专项优化后再补录

#### 提示框 Tooltip

- 当前截图和 `/home` 源码未出现
- 本轮不建立最终规范

## 四、可复用样式代码

### 4.1 CSS 变量定义

见 [apps/web/src/styles/home-light-tokens.css](/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/styles/home-light-tokens.css)。

该文件包含：

- `:root` 颜色、字体、间距、阴影、圆角 token
- `home-shell`、`home-secondary-sidebar`、`home-search`、`home-hero`、`home-feature-card`、`home-command-card`、`home-file-item`、`home-creation-card`、`home-pill-badge` 复用类
- Tailwind 类与 token 的映射注释

### 4.2 组件样式复用原则

1. 新页面先复用 token，再复用组件类
2. 遇到同类结构时，优先保持以下不变：
   - 外层背景层级
   - 圆角层级
   - 阴影层级
   - 文本层级
   - hover 动作幅度
3. 本轮不允许擅自为弹框、表格、通用输入框追加“看起来像 home”的最终样式；这些组件必须等待后续规范补齐

## 五、待补组件占位说明

以下组件在本轮仅记录状态，不定义像素级最终规范：

- `Modal / Dialog`
- `Table`
- `/home` 搜索框之外的通用输入框体系
- 截图中未出现、且你后续会专项优化的其他组件

后续补充原则：

1. 以后续优化后的源码为唯一事实源
2. 追加到本文件对应章节，不另起平行规范
3. 新增 token 必须和现有 `home-light-tokens.css` 命名体系兼容

---

name: Luminal Tech
colors:
tech-blue: '#2F6BFF'
deep-sea: '#0B1B3A'
accent-cyan: '#22D3EE'
mesh-bg-light: '#F6F8FF'
glass-border: rgba(255, 255, 255, 0.60)
glass-surface: rgba(255, 255, 255, 0.60)
icon-bg-start: '#ffffff'
icon-bg-end: '#f1f5f9'
typography:
display-xl:
fontFamily: Space Grotesk
fontSize: 72px
fontWeight: '900'
lineHeight: '1.1'
letterSpacing: -0.04em
display-xl-mobile:
fontFamily: Space Grotesk
fontSize: 40px
fontWeight: '900'
lineHeight: '1.1'
headline-lg:
fontFamily: Space Grotesk
fontSize: 36px
fontWeight: '700'
lineHeight: '1.2'
headline-md:
fontFamily: Space Grotesk
fontSize: 24px
fontWeight: '700'
lineHeight: '1.3'
body-lg:
fontFamily: Noto Sans SC
fontSize: 18px
fontWeight: '400'
lineHeight: '1.6'
body-md:
fontFamily: Noto Sans SC
fontSize: 14px
fontWeight: '400'
lineHeight: '1.5'
label-bold:
fontFamily: Space Grotesk
fontSize: 11px
fontWeight: '700'
lineHeight: '1'
letterSpacing: 0.15em
rounded:
sm: 0.25rem
DEFAULT: 0.5rem
md: 0.75rem
lg: 1rem
xl: 1.5rem
full: 9999px
spacing:
sidebar-width: 88px
discovery-width: 288px
gutter: 24px
section-gap: 40px
card-padding: 32px
safe-area: 40px

---

## Brand & Style

Luminal Tech is a high-performance, AI-driven productivity suite designed for professional creators who demand both power and aesthetic refinement. The brand personality is **visionary, precise, and fluid**, bridging the gap between complex computational power and intuitive creative flow.

The visual style is a sophisticated evolution of **Glassmorphism**, characterized by multi-layered translucent surfaces, vibrant mesh-gradient backgrounds, and subtle 3D effects. It avoids the heaviness of traditional skuomorphism, instead opting for "tactile digitalism"—where elements feel like polished glass or physical resin floating in a luminous, atmospheric space. The goal is to evoke a sense of focused calm and infinite possibility.

## Colors

The palette is anchored by **Tech Blue**, a high-vibrancy primary that signifies intelligence and energy. This is balanced by **Deep Sea**, a near-black navy used for high-level hierarchy and text to ground the airy glass elements.

- **Primary (Tech Blue):** Used for active states, primary CTAs, and key brand moments.
- **Secondary (Deep Sea):** Reserved for headlines and structural navigation containers.
- **Accents (Cyan & Purple):** Used sparingly for specialized AI roles (e.g., Cyan for creative tools, Purple for audio/logic).
- **Backgrounds:** Employs a multi-point radial mesh gradient starting from `#F6F8FF` to create depth and eliminate flat "dead" space.

## Typography

The system utilizes a dual-font strategy. **Space Grotesk** is the display face, providing a technical, futuristic edge with its geometric terminals and tight apertures. It is used for all headlines and navigation labels to reinforce the "AI Suite" identity.

**Noto Sans SC** (or standard Sans-Serif) serves as the workhorse body font. It provides high legibility for Chinese and Latin characters alike, ensuring that complex AI-generated text is easy to scan.

Typography hierarchy is reinforced through letter spacing on small labels (tracking 15-20% for uppercase labels) and aggressive tight tracking on large display headers.

## Layout & Spacing

The interface follows a **Triple-Pane Architecture**:

1.  **Global Command Strip (88px):** A slim, high-depth rail for core navigation and system settings.
2.  **Discovery/Context Sidebar (288px):** A semi-transparent pane for local navigation and utility tools.
3.  **Canvas/Workspace:** A fluid, wide-margin area for primary content.

The layout uses a "Floating Canvas" model where the background mesh remains fixed while content panels sit on top. Spacing is generous, utilizing an 8px base grid, but often expanding to 24px or 40px to maintain the airy, "uncluttered" feel essential for creative focus.

## Elevation & Depth

Depth is the primary communicator of hierarchy, achieved through three distinct methods:

1.  **Glass Panels:** Backgrounds use `white/60` opacity with high `backdrop-blur` (28px). This creates a "frosted" layer that feels physically separate from the mesh background.
2.  **3D Icons:** Icons are housed in rounded squares with a subtle `linear-gradient(145deg, #ffffff, #f1f5f9)`. They feature an "inner glow" (inset white shadow) and a soft drop shadow, making them appear like physical plastic keys.
3.  **Active States:** When an element is selected, it transitions from white/glass to a vibrant gradient (`#2F6BFF` to `#1E40AF`) and gains a colored outer glow (`shadow-tech-blue/20`), signaling it has "powered on."

## Shapes

The shape language is defined by **hyper-rounded corners** and organic silhouettes.

- **Large Panels (Cards/Hero):** 28px to 40px corner radius, creating a soft, friendly container.
- **Primary Icons/Buttons:** 16px corner radius (Semi-squircle).
- **Utility Items:** 12px corner radius.

The extreme roundedness serves to contrast against the technical "Grotesk" typography, balancing "high-tech" with "high-human" accessibility.

## Components

### 3D Navigation Icons

The hallmark of the system. These are 48x48px squares with a 16px radius. They must include an inset top-light shadow to simulate a beveled edge. On hover, they translate -4px on the Y-axis to enhance the "tactile" feel.

### Glass Module Cards

Cards should not have solid backgrounds. Use `white/60` with a 1px solid white border. On hover, the background opacity increases to `white/100`, and the card should slightly rotate on the X/Y axis (CSS `perspective`) to respond to the cursor position.

### Flyout Menus

Menus appear 16px to the right of the trigger. They use a 24px backdrop blur and a 20% opacity border. Items within the flyout use a "Soft Fill" hover state (e.g., `bg-blue-50` or `bg-white/80`).

### Action Chips

Small pill-shaped indicators used within cards for "tags" or "recent actions." These should use low-contrast backgrounds (e.g., `blue-50/50`) with high-contrast text.

### Search Input

The search bar is treated as a glass element with a 12px radius. The placeholder text should be `slate-400`, and the border should "glow" with a `tech-blue/30` tint upon focus.
