# AI Aggregation - Components

## 1. 按钮

### 变体

| Variant | 背景 | 文本 | 边框 | 高度 | 圆角 |
| --- | --- | --- | --- | --- | --- |
| Primary | `linear-gradient(90deg, #4969E9 0%, #7B8FFF 100%)` | `#FFFFFF` | `transparent` | 40px / 44px | 12px |
| Secondary | `rgba(255,255,255,0.72)` | `#475569` | `1px solid rgba(255,255,255,0.75)` | 40px / 44px | 12px |
| Outline | `rgba(255,255,255,0.72)` | `#475569` | `1px solid #D5DAEB` | 40px | 12px |
| Ghost | `transparent` | `#64748B` | `none` | 40px | 12px |
| Destructive | `linear-gradient(90deg, #E54350 0%, #F26E8C 100%)` | `#FFFFFF` | `transparent` | 40px | 12px |

### 状态

| State | 变化 |
| --- | --- |
| Hover | 提亮 3%，阴影增强一级，允许 `translateY(-1px)` |
| Active | 允许 `scale(0.98)`，禁止更重阴影 |
| Focus | 2px 品牌色 focus ring |
| Disabled | 透明度降到 50%，取消位移动效 |

## 2. 卡片与表面

### 标准卡片

- 背景：`--surface1`
- 描边：`1px solid rgba(255,255,255,0.60)` 或 `1px solid var(--border)`
- 圆角：`24px`
- 模糊：玻璃卡允许 `backdrop-filter: blur(24px)`
- 阴影：`--shadow-2`

### Hero 工作台

- 背景：从 `rgba(255,255,255,0.60)` 到透明的纵向渐变
- 圆角：`48px`
- 阴影：`--shadow-3`
- 上沿可加一道细高光线，不要加厚描边

### 紧凑卡片

- 背景：`--surface2`
- 圆角：`16px`
- 阴影：`--shadow-1`
- 适用于文件项、快捷操作、状态块

## 3. 输入

| 项目 | 值 |
| --- | --- |
| 高度 | 48px |
| 背景 | `#FFFFFF` |
| 边框 | `1px solid #E2E8F0` |
| Focus | `0 0 0 2px rgba(59,130,246,0.20)` |
| 圆角 | 12px |
| 字体 | `DM Sans 14px` |
| 占位文本 | `--text4` |

规则：搜索框允许更强的空气感，但绝不允许无边输入直接漂浮在底面上。

## 4. 标签与状态胶囊

| 类型 | 背景 | 文本 | 说明 |
| --- | --- | --- | --- |
| 默认 | `--surface2` | `--text2` | 中性标签 |
| 品牌 | `--accent-subtle` | `#4E67E6` | 当前激活、推荐 |
| 成功 | `#F0FDF4` | `#22C55E` | 已完成、正常 |
| 警告 | `#FFFBEB` | `#F59E0B` | 处理中、待确认 |
| 错误 | `#FFF1F2` | `#E54350` | 失败、异常 |

所有胶囊统一：

- `display: inline-flex`
- `align-items: center`
- `line-height: 1`
- `padding: 4px 10px`
- `border-radius: 999px`

## 5. 侧栏导航

### 图标砖

| 项目 | 值 |
| --- | --- |
| 尺寸 | 40px x 40px |
| 默认背景 | `rgba(255,255,255,0.45)` |
| 默认边框 | `1px solid rgba(255,255,255,0.30)` |
| 默认文本 | `#64748B` |
| 激活背景 | `linear-gradient(135deg, #5D7CFA 0%, #7D91FF 100%)` |
| 激活文本 | `#FFFFFF` |
| 激活指示条 | `#6B83FA` |

规则：导航项不是菜单行，而是轻量图标砖。文字标签只做 10px 微文案，不参与抢层级。

## 6. 分段控件与 Tabs

- 容器背景：`--surface3`
- 容器圆角：`999px` 或 `12px`
- 激活背景：`--surface1`
- 激活文字：`--text1`
- 未激活文字：`--text3`
- 内描边或微阴影只加在激活项上

## 7. 开关

- 轨道：`44px x 24px`
- 默认轨道：`--surface3`
- 激活轨道：`--accent`
- 滑块：白色圆点，投影用 `--shadow-1`
- 焦点：2px 品牌色 ring

## 8. 弹层

### Dialog

| 项目 | 值 |
| --- | --- |
| 背景 | `--surface1` |
| 描边 | `1px solid var(--border)` |
| 圆角 | `32px` |
| 内边距 | 24px |
| 阴影 | `--shadow-3` |
| 遮罩 | `rgba(6, 8, 12, 0.42)` 到 `rgba(0,0,0,0.80)` 之间 |

### Drawer / Sheet

- 顶部圆角 `32px`
- 内容区使用 `--surface1`
- 底部操作区需额外留出安全区

## 9. 状态模式

### Empty

- 图标或插画：品牌浅蓝或浅紫
- 标题：`--h3`
- 描述：`--body-sm`
- CTA：单主按钮，不要双主按钮

### Loading

- 使用细进度条、轻 shimmer 或脉冲光团
- 禁止厚重骨架屏把页面涂满

### Error

- 错误提示必须带下一步动作
- 红色只用于语义提示，不扩大到整块面板背景

