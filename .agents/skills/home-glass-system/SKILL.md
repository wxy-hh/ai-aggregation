---
name: home-glass-system 首页玻璃设计系统
description: 复用 AI 聚合平台 `/home` 首页的视觉语言与设计系统。只要用户提到“参考 /home”“做成首页风格”“统一成首页那套玻璃质感”“浅色高级磨砂玻璃”“冷白渐变玻璃卡片”“顶部细高光、柔和光斑、轻浮层阴影”等需求，就应优先使用本 skill。适用于页面改版、卡片重绘、弹框抛光、导航统一、设计规范沉淀，以及把其他页面收敛到与 `/home` 同一套系统语言的场景。
---

# 首页玻璃设计系统

这个 skill 用来把其他页面收敛到 AI 聚合平台 `/home` 首页已经验证过的视觉语言里。它不是泛泛的 glassmorphism，而是这套项目专属的“冷白渐变玻璃系统”。

## 先做什么

1. 先读 `references/DESIGN.md`，理解页面背景、主卡、功能卡、按钮、图标容器、交互层级的规则。
2. 再读目标页面代码，判断它属于以下哪一类：
   - 页面主视觉区
   - 大卡片容器
   - 功能/信息卡片
   - 弹框/抽屉
   - 侧边栏或导航入口
   - 小型统计块/字段块/按钮
3. 按照对应层级应用规则，不要把所有区域都画成同一种玻璃块。

## 核心原则

### 1. 先有层级，再有效果

`/home` 的质感不是靠一个 `border` 或一个 `backdrop-blur` 堆出来的，而是靠层级：

- 页面背景层：冷白底 + 淡蓝/淡紫光斑
- 主容器层：渐变玻璃底 + 顶部细高光 + 半隐式边缘
- 次级卡片层：纯白或半白卡片 + 柔和投影 + 局部渐变光圈
- 组件内层：按钮、字段块、图标底板用更浅一层的玻璃或软白底

如果页面只有“一个灰白卡片 + 一圈固定边框”，就还没有进入首页风格。

### 2. 这是“冷白科技感”，不是“重灰商务感”

- 浅色主题优先使用冷白、淡蓝、淡紫的微弱色偏
- 避免大片灰色实体块
- 避免米黄、棕橙、厚重深蓝
- 避免过饱和霓虹色覆盖整张卡片

### 3. 光感要克制，但必须存在

每个重点容器至少检查这三件事是否成立：

1. 顶部是否有细高光线
2. 内层是否有一层轻微由上到下的白色高光
3. 某个角落是否有模糊光斑或渐变光圈，避免卡片发死

### 4. 阴影要“浮”，不能“糊”

- 优先用大半径、低浓度的蓝灰阴影
- 不要用短、黑、实的投影
- hover 时可以略微增强阴影和高光，但不要造成布局跳动

## 实施方法

### 页面背景

优先组合以下元素：

- 基底色：`#F3F5FA` 到 `#FAFBFF` 之间的冷白灰
- 顶部或侧边渐变雾层：`from-blue-100/50 to-transparent`
- 一到两个大面积模糊光斑：蓝或紫，透明度低
- 深色模式保留结构，但降低浅色高光，避免脏雾感

### 主卡片

主卡片应接近 `/home` 主视觉区：

- 背景：`bg-gradient-to-b from-white/60 via-white/20 to-transparent`
- 模糊：`backdrop-blur-2xl` 或相近级别
- 圆角：大卡 `rounded-[28px]` 到 `rounded-[48px]`
- 轮廓：不是固定灰边，而是 `border border-white/60` 配合遮罩渐隐
- 叠层：
  - 顶部细高光线
  - 内部自上而下白色高光
  - 柔和阴影

### 次级卡片

功能卡、统计卡、资料卡遵循：

- 明度高于页面背景，但不做实心纯白板
- 可用纯白卡配局部光圈，也可用轻玻璃卡
- 卡片必须有 hover 或 active 的轻反馈
- 光圈位置优先放在右上或右侧，避免挡正文

### 小型元素

按钮、图标底板、字段块需要延续系统语言：

- 图标底板：软白底、轻边框、轻投影
- 次按钮：白色半透明底 + 细边 + hover 提亮
- 主按钮：蓝紫渐变 + 柔和阴影
- 字段块：不能退回普通灰输入框，应使用轻玻璃或软白渐变面板

## 禁止事项

不要做这些：

- 不要使用固定灰色描边作为主要轮廓来源
- 不要把整页都铺成同一层玻璃卡
- 不要把每个卡片都加很重的 blur 和阴影
- 不要使用大面积紫色渐变英雄区替代首页这套冷白系统
- 不要用一堆独立装饰球、装饰 orb、漂浮彩块破坏克制感
- 不要让 hover 用缩放把布局顶开

## 输出要求

当你使用这个 skill 改页面时，默认要做到：

1. 说明当前页面属于哪种层级问题
2. 指出你会对齐 `/home` 的哪些具体语言
3. 改完后检查：
   - 背景是否更轻
   - 卡片边界是否不再死灰
   - 是否有高光、光斑、轻阴影三件套
   - 按钮、字段块、弹框是否和主卡统一

## 代码参考

优先参考这些现有文件：

- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/home/home-content.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/global-sidebar.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/mobile-header.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/mobile-bottom-nav.tsx`

如果需要完整设计规范，继续阅读 `references/DESIGN.md`。

## 使用示例

### 示例 1

用户说：`把个人中心做成 /home 的风格`

你应该：

- 使用本 skill
- 把个人中心拆成背景层、主卡层、字段层、弹框层分别处理
- 不要只把卡片颜色调浅

### 示例 2

用户说：`这个页面和首页不是一个系统，参考 home 重做一下卡片`

你应该：

- 使用本 skill
- 对照首页的主卡、功能卡、导航按钮分析问题
- 给出具体对齐点：渐变玻璃底、顶部细高光、柔和光斑、轻浮层阴影

### 示例 3

用户说：`帮我抽出一套可复用的首页设计规范`

你应该：

- 使用本 skill
- 优先沉淀页面背景、主卡、次卡、按钮、图标容器、禁忌项和检查清单

## 示例调用模板

下面这些模板可以直接复制给模型使用。需要时把页面名、文件路径、目标区域替换掉即可。

### 1. 整页改版模板

适用于：一个页面整体和 `/home` 不像，要统一成同一套系统。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请把 `PAGE_NAME` 页面整体重做成 `/home` 的视觉语言，严格参考首页的冷白渐变玻璃系统。
要求你重点对齐这些效果：
- 渐变玻璃底
- 顶部细高光
- 柔和光斑
- 更轻的浮层阴影
- 半隐式边缘，不要固定灰边

请按这几个层级一起处理：
1. 页面背景
2. 主卡片
3. 次级卡片
4. 按钮、图标底板、字段块
5. 弹框或抽屉

不要只改单个卡片颜色，要确保它和 `/home` 是同一个设计系统。
```

### 2. 卡片重绘模板

适用于：页面结构可以不动，但卡片质感不对。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请把 `PAGE_NAME` 页面里的这些卡片改成 `/home` 风格：
- `CARD_1`
- `CARD_2`
- `CARD_3`

当前问题是：卡片偏灰、边框太死、没有首页那种渐变玻璃底、顶部细高光、柔和光斑和轻浮层阴影。

要求：
- 不改业务逻辑
- 保持现有布局结构
- 只重做卡片层级、边缘、高光、阴影和背景语言
- 卡片里面的小块和按钮也要一起对齐
```

### 3. 弹框对齐模板

适用于：页内卡片已经像 `/home`，但 Dialog/Drawer 还不像。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请把 `PAGE_NAME` 里的弹框改成 `/home` 同系的玻璃浮层风格。

重点对齐：
- 弹框容器的渐变玻璃底
- 顶部细高光
- 柔和白色内高光
- 轻蓝或轻红光斑
- 比普通卡片更轻一点的浮层阴影

同时把弹框里的输入框、文本域、次按钮也收敛到同一套系统，不要保留默认组件样式。
```

### 4. 导航和侧边栏模板

适用于：侧边栏、顶部栏、底部栏、头像入口等局部导航不统一。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请把 `PAGE_NAME` 相关导航区域统一成 `/home` 同系风格，参考首页侧边栏和全局导航语言。

处理范围：
- `TARGET_NAV_AREA`

要求：
- 轻玻璃底
- 细边框
- 激活态使用蓝紫渐变或更明确的高亮
- hover 有提亮、轻阴影和轻缩放
- 不要出现厚重灰底按钮
```

### 5. 局部抛光模板

适用于：页面大体已经差不多，只剩一两个区域不协调。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请只抛光 `PAGE_NAME` 里的 `TARGET_SECTION`，让它和 `/home` 的玻璃系统完全一致。

当前问题：
- `PROBLEM_1`
- `PROBLEM_2`

请重点检查：
- 有没有固定灰边
- 有没有渐变玻璃底
- 有没有顶部细高光
- 有没有柔和光斑
- 阴影是不是还太重或太死
- 内部小组件是不是还停留在默认样式
```

### 6. 个人中心类页面模板

适用于：资料页、设置页、账户页这类有信息卡、操作卡、危险区、弹框的页面。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

请把 `PAGE_NAME` 做成和 `/home` 同一套冷白渐变玻璃系统。

这个页面包含：
- 基本信息卡
- 统计/资源卡
- 操作按钮卡
- 危险区域
- 编辑弹框

要求你按层级处理，不要只统一颜色：
- 页面背景更轻
- 主卡要有渐变玻璃底、顶部细高光、柔和光斑、轻浮层阴影
- 字段块、按钮、图标底板不能掉回默认组件风格
- 危险区域保留红色语义，但仍然要属于同一系统
```

### 7. 输出设计规范模板

适用于：你想让模型先沉淀规范，再动页面。

```md
[$home-glass-system 首页玻璃设计系统](/Users/weixiaoyu/Desktop/practice/AI-aggregation/.agents/skills/home-glass-system/SKILL.md)

先不要直接改代码。请先基于 `/home` 的视觉语言，输出一份适用于 `PAGE_NAME` 的设计对齐方案。

方案至少覆盖：
- 页面背景
- 主卡片
- 次级卡片
- 按钮
- 输入框/字段块
- 弹框
- 阴影和高光策略
- 不该做什么

等方案确认后，再开始改代码。
```
