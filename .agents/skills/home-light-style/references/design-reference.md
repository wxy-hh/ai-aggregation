# `/home` 亮色桌面风格速查

## 先看什么

1. [docs/DESIGN.md](/Users/weixiaoyu/Desktop/practice/AI-aggregation/docs/DESIGN.md)
2. [apps/web/src/styles/home-light-tokens.css](/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/src/styles/home-light-tokens.css)

本文件只保留高频复用要点，避免每次都全文扫描。

## 核心风格

- 页面底色：`#F3F5FA`
- AppLayout 底色：`#F5F7FA`
- 主卡片：白色或白色半透明玻璃背景
- 主强调色：蓝紫系，核心渐变 `#5D7CFA` -> `#8794FF`
- 标题深色：`#0F172A`
- 正文次级灰：`#64748B`
- 高圆角层级：`12px`、`16px`、`32px`、`48px`
- 阴影语气：柔和漫反射，不用硬阴影

## 高优先级组件

### 页面壳层

- 左主侧栏宽 `100px`
- 二级侧栏宽 `280px`
- 主内容最大宽 `1400px`

### Hero

- 主卡片圆角 `48px`
- 内边距 `48px`
- 主标题 `60px / 900`
- 标题渐变 `#2563EB -> #6366F1 -> #06B6D4`

### 功能卡片

- 圆角 `32px`
- 内边距 `32px`
- 图标底座 `56px`
- 标题 `24px / 700`
- 按钮圆角 `12px`

### 搜索框

- 高度 `48px`
- 圆角 `12px`
- 左内边距 `40px`
- 聚焦外发光 `rgba(59, 130, 246, 0.20)`
- 默认态不能丢失输入区边界识别；即使不使用显式描边，也要保留 `/home` 同级的阴影或等价边界表达
- 参考 `/home` 时，不要写成 `border-0 + outline-none` 后又不补 focus 态

### 临时输入框映射

`/home` 搜索框之外的通用输入框仍待 `DESIGN.md` 补录，但在复用本风格时，先按下面的临时基线执行：

- 优先高度 `48px`，紧凑表单可用 `44px`
- 圆角 `12px`
- 默认态必须能一眼看出是输入框，不能和卡片底色融在一起
- 聚焦态必须可见，至少保留蓝色外发光或等价描边反馈
- 外层玻璃卡片的边框不能替代输入框本身的边界

## 不要越界

以下内容暂时不是最终规范：

- `Modal / Dialog`
- `Table`
- 通用输入框体系

如果任务碰到这些组件，先说明仍待补录，再做临时风格映射。
