# /home 首页视觉设计规范

本文档沉淀 AI 聚合平台 `/home` 页的视觉语言，目标是让其他页面在复用时保持同一个系统，而不是只模仿若干 Tailwind 类名。

## 1. 风格定位

### 关键词

- 冷白
- 轻玻璃
- 科技感
- 克制发光
- 浮层感
- 现代生产力产品

### 不是什么

- 不是重灰后台
- 不是营销站大 Hero 渐变海报
- 不是夸张紫色 AI 套板
- 不是拟物金属质感

## 2. 页面骨架

`/home` 由两类区域组成：

1. 左侧二级功能栏：轻玻璃侧栏
2. 右侧主工作区：冷白背景上的主视觉玻璃容器 + 白卡内容区

这意味着系统不是“所有东西都玻璃”，而是：

- 结构层用玻璃
- 内容层保持可读性
- 局部用光圈和高光统一气质

## 3. 背景规范

### 浅色模式

推荐结构：

- 页面底色：`bg-[#F3F5FA]` 一类冷白灰
- 顶部雾层：`bg-gradient-to-b from-blue-100/50 to-transparent`
- 大型光斑：
  - 右上紫色雾团
  - 左中蓝色雾团
- 光斑要大、虚、轻，不能像贴纸

### 深色模式

- 底色切到 `slate-950` 体系
- 保留浅色结构，但大幅降低高光强度
- 光斑改成深蓝紫的低透明度版本

## 4. 主视觉玻璃卡规范

参考 `home-content.tsx` 主 Hero 容器。

### 核心结构

```tsx
bg-gradient-to-b from-white/60 via-white/20 to-transparent
backdrop-blur-2xl
rounded-[28px] lg:rounded-[48px]
shadow-[0_20px_60px_-10px_rgba(59,130,246,0.1)]
```

### 必备叠层

1. 外轮廓渐隐边框

```tsx
border border-white/60 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)]
```

2. 顶部细高光

```tsx
absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent
```

3. 内部高光

```tsx
absolute inset-0 bg-gradient-to-b from-white/30 to-transparent
```

### 设计意图

- 玻璃感来自“透明度变化 + 光感 + 模糊”
- 边界感来自“渐隐轮廓”，不是死白线
- 顶部细高光负责把卡片“提起来”

## 5. 功能卡规范

参考首页 `FeatureCard`。

### 特征

- 白底或深色底
- 明确的圆角和软投影
- 右上角局部渐变光圈
- hover 时光圈和阴影增强，但不夸张位移

### 推荐构成

- 容器：`bg-white rounded-[32px] p-8 shadow-xl border border-slate-100`
- 光圈：右上角 `bg-gradient-to-br ... blur-3xl`
- 图标容器：浅灰或浅色底的小软方块
- CTA：不抢主标题，但有明确触达反馈

### 设计意图

主视觉卡是“空气感玻璃”，功能卡是“清晰白卡 + 光圈提气”。二者不同，但属于同一系统。

## 6. 侧边与导航规范

参考：

- `global-sidebar.tsx`
- `mobile-header.tsx`
- `mobile-bottom-nav.tsx`

### 共同规则

- 轻玻璃底：`bg-white/45` 到 `bg-white/94`
- `backdrop-blur-md` 到 `backdrop-blur-xl`
- 细边框：`border-white/30` 或 `border-slate-200/80`
- 激活态用蓝紫渐变，而不是只改字色
- hover 增加提亮、轻投影、轻缩放

### 设计意图

导航元素是系统里最频繁被点击的区域，所以需要：

- 更明确的状态感
- 更高的可点击性
- 比内容卡更稳定的视觉节奏

## 7. 按钮规范

### 主按钮

- 蓝紫渐变底
- 有柔和阴影
- hover 提亮

### 次按钮

- 白色半透明底
- 细边框
- 内高光
- hover 轻提亮

### 危险按钮

- 保留红色语义
- 仍然服从玻璃系统
- 不要切成另一套厚重警告风

## 8. 输入框与字段块规范

当页面整体已经进入 `/home` 风格时，输入框不能掉回默认表单样式。

### 推荐方向

- 轻玻璃字段块
- 软白渐变底
- 细白边
- 微弱内高光
- 文本颜色保持高对比

### 不推荐

- 纯灰边白底输入框直接堆在玻璃卡上
- 字段块比外层卡更深更灰

## 9. 颜色策略

### 主色

- 蓝：`#5D7CFA` 一带
- 辅助蓝紫：`#7B8FFF`、`#8794FF`
- 标题深色：`slate-900`
- 正文灰：`slate-500` 到 `slate-600`

### 光效色

- 淡蓝：`blue-100/200`
- 淡紫：`purple-200`
- 淡青：仅在强调文字渐变中少量使用

### 危险色

- 红与玫瑰色用于危险区域
- 透明度要更轻，避免跳出系统

## 10. 阴影策略

按层级区分：

- 页面主卡：大半径、低浓度、偏蓝阴影
- 功能卡：中等阴影，hover 时增强
- 小按钮/图标：小而软的投影

避免：

- 黑色硬阴影
- 多层杂乱阴影
- 阴影太重导致卡片变脏

## 11. 动效策略

### 可以有

- `hover:shadow-*`
- `hover:scale-105`
- 光圈透明度增强
- 图标轻微放大

### 不要有

- 大幅位移
- 强弹跳
- 影响布局的缩放
- 同屏过多 pulse 动画

## 12. 禁忌项

以下内容一旦出现，通常就偏离了 `/home` 风格：

1. 大面积固定灰边
2. 卡片没有高光层，只有白底和阴影
3. 光斑太实，像彩色贴片
4. 整页所有卡片完全同构，没有层级差异
5. 按钮、输入框还是默认 shadcn 风格，没有系统对齐
6. 文案太大、太满，破坏玻璃感的留白

## 13. 复用落地顺序

把其他页面改成 `/home` 风格时，建议按顺序处理：

1. 先调页面背景
2. 再调最大那层主卡
3. 再调次级卡片
4. 再调按钮、图标、字段块
5. 最后调弹框、抽屉和 hover

不要从按钮开始补样式，否则很容易最后还是像拼装页面。

## 14. 代码参考点

### 关键文件

- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/home/home-content.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/global-sidebar.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/mobile-header.tsx`
- `/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/components/layout/mobile-bottom-nav.tsx`

### 关键样式模式

#### 主玻璃容器

```tsx
bg-gradient-to-b from-white/60 via-white/20 to-transparent
backdrop-blur-2xl
rounded-[28px]
shadow-[0_20px_60px_-10px_rgba(59,130,246,0.1)]
```

#### 渐隐边框

```tsx
border border-white/60 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)]
```

#### 顶部细高光

```tsx
absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent
```

#### 右上柔和光圈

```tsx
absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ... blur-3xl
```

## 15. 最终检查清单

在交付前逐项检查：

- 页面背景是否比普通后台更轻、更有空气感
- 大卡是否同时具备渐变底、高光、柔和边缘和轻阴影
- 次级卡片是否比主卡更清晰，但仍属于同一系统
- 图标底板、按钮、字段块是否完成系统对齐
- 危险态是否保留语义，但没有脱离整体风格
- 移动端是否仍然轻、透、整齐，没有糊成一片
