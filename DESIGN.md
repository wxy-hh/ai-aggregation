# DESIGN.md — AI 聚合平台设计系统

> 本文档是全局视觉与交互主题的唯一标准。所有数值与代码一一对应：`apps/web/src/app/globals.css`、`apps/web/tailwind.config.ts`、`apps/web/src/styles/`（scrollbar.css / ziwei-theme.css / home-light-tokens.css）。
> 规则：新增 UI 必须先查本文档；文档与代码冲突时，改代码对齐文档或改文档记录新决策，二者不得长期分叉。

---

## 1. 设计愿景与原则

产品是一个「深空工作台」：AI 工具区（对话/绘图/视频/语音/简历/历史）是**轻盈通透的玻璃工作台面**，命理区（八字/紫微/奇门/星座寰宇）是**沉浸的夜幕宇宙**。四条原则贯穿全部界面：

1. **轻盈通透**：玻璃材质承载容器层级，背景保持干净，磨砂只出现在容器级元素上。
2. **深空沉浸**：命理域允许大面积的深空表面、星光与金色仪式感，但信息密度与可读性优先于氛围。
3. **克制秩序**：动效、光晕、渐变服务于层级与反馈，不做无信息量的装饰；一个页面只有一个主叙事动效时刻。
4. **白话先行**：文案先结论后术语，不用英文占星/命理术语面对用户，不虚构未计算的数据。

**模式判定**（新页面先定模式再动手）：

- **Operate**（完成任务）：chat / image / video / voice / resume / history —— 可扫读性、一致性优先。
- **Experience**（沉浸体验）：destiny 四柱（八字/紫微/奇门/星座）—— 器物与氛围优先，界面退后。
- **Read**（阅读理解）：结果解读区、文档页 —— 排版与结构优先。

---

## 2. 色彩系统

### 2.1 语义令牌层（shadcn 变量，`globals.css :root / .dark`）

组件统一引用语义类（`bg-background`、`text-foreground`、`border-border`、`bg-card`、`bg-primary`…），禁止在通用组件里硬编码灰色。

| 令牌 | 浅色（HSL） | 深色（HSL） | 用途 |
| --- | --- | --- | --- |
| `--background` / `--foreground` | 228 35% 97% / 225 35% 16% | 229 26% 11% / 223 38% 94% | 页面底 / 主文字 |
| `--card` | 0 0% 100% | 228 23% 14% | 实体卡片 |
| `--primary` | 228 78% 60% | 224 86% 74% | 主行动色 |
| `--secondary` / `--muted` / `--accent` | 226 50% 95% / 225 40% 95% / 232 63% 93% | 227 20% 21% / 227 18% 20% / 234 22% 24% | 次级表面 |
| `--destructive` | 355 76% 58% | 356 66% 52% | 危险/删除 |
| `--border` / `--input` / `--ring` | 228 36% 88% / 227 38% 89% / 228 78% 60% | 227 20% 24% / 227 18% 24% / 224 86% 74% | 描边/输入框/焦点环 |
| `--radius` | 0.5rem（8px，rounded-lg 基准） | 同左 | shadcn 圆角基准 |

`darkMode: 'class'`，`dark` 类由 `stores/settings-store.ts` 挂在 `<html>`，支持 light / dark / system（persist key：`ai-app-settings`）。

### 2.2 品牌色与功能色（硬编码值的使用白名单）

语义令牌之外的固定品牌色，仅限以下场景使用：

| 色值 | 用途 | 出现位置 |
| --- | --- | --- |
| `#4969E9` → `#7D91FF` | 品牌 Logo 渐变 | chat Logo 块、destiny 品牌 |
| `#5D7CFA` → `#7D91FF` | 激活态渐变（全局侧边栏激活项）、命理强调色 | global-sidebar、八字选中 ring/徽章/雷达 |
| `#4969E9` → `#7C5CF6` | 命理主 CTA 渐变 | destiny 表单/结果页主按钮 |
| `blue-600` → `indigo-600` | 工具域主 CTA 渐变 | image 生成按钮、voice 上传 |
| `blue-600` → `indigo-500` → `cyan-500` | 三色斜渐变（仅限首页 hero 标题、视频播放钮两类大焦点） | home-content、video preview |
| `#2F6BFF` | 简历域品牌蓝（得分环） | resume |
| `#E7C873` 鎏金 / `#A78BFA` 紫微紫 | 紫微夜幕主题双主色 | ziwei-theme.css |
| `#D9A84E` / `#E7C873` 琥珀金 | 星盘主轴金句渐变、分享卡 | astrology |

shadcn `button.tsx` 已品牌化：default 变体 = `from-primary to-[#7B8FFF]` 渐变 + `shadow-[0_10px_24px_rgba(93,124,250,0.32)]`，`active:scale-[0.98]`。**直接引 `@/components/ui/button`，不要另写渐变按钮**。

### 2.3 深色表面层级（按场景选，不混用）

| 表面 | 色值 | 场景 |
| --- | --- | --- |
| 全局深色底 | `#0A0B10` | app-layout 根（所有页面） |
| 通用深色卡 | `slate-950 / slate-900` | chat 抽屉、image/video 深色区、home 深卡 |
| 命理白昼层 | `linear-gradient(165deg,#F8FAFF→#EEF2F9→#E9EEF6)` | destiny 浅色氛围底 |
| 命理夜幕层 | dark: `#07080D→#0C0E16→#10131C`；入夜 radial: `#10152E→#0A0E20→#06081A` | destiny-ambient-background |
| 星盘深空 | `#0D1226`（玻璃 `/[0.88]`）、盘面 `#090E20` | astrology 结果页/章节带 |
| 紫微夜幕面板 | `rgba(12,17,40,0.85)` | ziwei-theme.css |

### 2.4 命理专用色板

**八字·五行五色**（orb 角光斑 `from-*-500/14 to-*-500/8 blur-2xl`）：金 amber/orange、木 emerald/teal、水 blue/slate、火 rose/orange、土 stone/amber；强调与选中统一 `#5D7CFA`。

**紫微·夜幕星宫**：鎏金 `#E7C873`（四化·权、金边、金钮 `.zw-gold-btn`）、紫微紫 `#A78BFA`（选中宫辉光）；四化语义色：禄=绿(pos)、权=金(gold)、科=蓝(info)、忌=红(danger)；白昼面板 `rgba(255,255,255,0.62)`。

**奇门·金局**：amber 金系（宫位卡 `border-amber-200 dark:border-amber-700/30`、选中 `from-amber-50` 加深），八门九星神煞用 violet/rose/indigo/emerald/amber 多彩区分。

**星座寰宇·十星宝珠**（`PLANET_ORB`，astrology-chart-wheel.tsx：core=高光色 / mid=主色 / edge=边缘色 / glyph=符号色 / glow=光晕色）：

| 星体 | mid 主色 | glow 光晕 |
| --- | --- | --- |
| 太阳 | `#F5D491` 鎏金 | `#F0C96A` |
| 月亮 | `#C9E4F5` 银青 | `#8FD8F0` |
| 水星 | `#C4B5FD` 紫罗兰 | `#A78BFA` |
| 金星 | `#F6C3D8` 玫瑰 | `#F0A6C6` |
| 火星 | `#F6A89D` 珊瑚红 | `#F0856F` |
| 木星 | `#F3D9A8` 琥珀 | `#E0B45E` |
| 土星 | `#D8CEB0` 沙金 | `#C9BC8E` |
| 天王星 | `#9BD8D3` 青碧 | `#66C9C0` |
| 海王星 | `#AEC6F6` 湛蓝 | `#7FA3EC` |
| 冥王星 | `#CDB4E8` 堇紫 | `#AB8BD4` |

**黄道四元素**（星座环扇区与符号同色，低透明度）：火 rose、土 emerald、风 sky、水 blue。

### 2.5 渐变使用规则

- 渐变只允许三种职能：**品牌识别**（Logo）、**主行动**（CTA 按钮）、**仪式焦点**（hero 标题/金句/播放钮）。装饰性渐变文本禁止扩散。
- 渐变文字（`bg-clip-text text-transparent`）全项目白名单仅 6 处：global-sidebar Logo、home hero 标题、video 播放键、destiny 主基调卡、astrology 主轴金句与分享卡。新增需评审。

### 2.6 对比度与文字调色

- 正文/占位文本对比度 ≥ 4.5:1，大标题 ≥ 3:1。
- 玻璃上的正文：浅色玻璃用 `slate-700` 以上，深色玻璃用 `slate-200` 以上；重要文字 Semibold 以上。
- **彩色/深空表面上的次要文字从该表面色相调色，不落中性灰**：深空蓝紫表面用夜幕令牌 `dark:text-night-muted`（`#A6AED2`，次要）/ `dark:text-night-faint`（`#828BB0`，微弱与占位符），定义于 tailwind.config.ts `colors.night`；夜幕金局用 amber 调。`dark:text-slate-400` 只允许在中性 slate 表面上使用。
- 浅色白昼表面的次要文字用 `text-day-muted`（`#64748B`，slate-500 档，白底对比度 ≈4.7:1，过 WCAG AA），定义于 tailwind.config.ts `colors.day`；与夜幕侧 `dark:text-night-faint` 配对使用，替代浅色模式下的 `text-slate-400` 次要文字（白底仅 ≈2.5:1，不达 AA）。

---

## 3. 排版系统

### 3.1 字体栈（三个，全部系统字，零加载成本）

| 角色 | 栈 | 使用域 |
| --- | --- | --- |
| 正文 `font-sans` | `--font-dm-sans` → Inter → 系统 sans | 全局默认 |
| 标题 `font-heading` | `--font-space-grotesk` → Inter → 系统 sans（当前与正文同源，靠字重/字距区分层级） | 产品页标题、chat 标题与 markdown 标题、destiny 全系标题 |
| 展示宋体 `font-song` | `--font-song`：Songti SC → Noto Serif SC → SimSun | **仅限紫微**星曜名与盘面标题（东方器物感） |

### 3.2 字号与字重阶梯

| 层级 | 规格 | 用途 |
| --- | --- | --- |
| 展示金句 | `text-2xl sm:text-3xl` Bold，行高 1.3 内 | 星盘主轴金句、仪式页标题 |
| 页面标题 | `text-xl~2xl` Bold `font-heading` | 各页主标题 |
| 章节标题 | `text-lg` Bold `font-heading` + 右侧 `text-xs` 副注（items-baseline 同行） | 结果页章节带 |
| 卡片标题 | `text-sm~base` Semibold/Bold | 卡片、面板 |
| 正文 | `text-sm`（14px）Regular/Medium，`leading-relaxed` | 段落、解读文本 |
| 辅助微字 | `text-xs`（12px）/`text-[11px]` | 副注、徽章、元信息 |
| 数据数字 | 加 `tabular-nums`（星盘度数、计时、统计数据强制） | 度数标签、倒计时 |

- 标题字距下限 `-0.03em`，不超收；H1 级才允许 `tracking-tighter`。
- 标题上方**禁止 eyebrow/kicker 小标签**，标题自己说话；副注放标题右侧或下方。
- 标题间距遵守「上宽下窄」：标题上方间距 > 下方间距（章节间距 `mt-12`，标题到内容 `mt-4/mt-6`）。

---

## 4. 材质与深度

### 4.1 玻璃三级（容器级使用，内容区不实心玻璃）

| 档 | 参数 | 用途 |
| --- | --- | --- |
| G-1 轻量 | `bg-white/40 dark:bg-slate-900/40 backdrop-blur-md` + 1px 半透边 | 工具按钮、小面板 |
| G-2 标准 | `bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl` + `border-white/50 dark:border-white/10` | 卡片、输入坞、抽屉 |
| G-3 深度 | `from-white/60 via-white/20 to-transparent backdrop-blur-2xl`（dark: `slate-900/60→/20`）+ 顶部 1px 高光线 | hero 大卡、主容器壳、Modal |

通用工具类：`.glass` / `.glass-dark`（globals.css）；ds-* 组件类（`.ds-card-glass`、`.ds-modal` 等）供营销/工作台页复用。

规则：
- **玻璃不套玻璃**：G-3 壳内的子卡用实色/半透色，不再开 blur。
- 大面积滚动区、长文阅读区**不开** `backdrop-blur`（性能 + 可读性）。
- 玻璃边框是材质高光边缘（`border-white/60` 方向），不与厚重阴影叠加宣告海拔——阴影/边框二选一为主。

### 4.2 命理环境光系统（`destiny-ambient-background.tsx`）

destiny 全域共享：白昼/夜幕双层底 + 3 档漂浮光斑（tone: blue / violet / indigo / cosmos）+ 48px 网格纹（radial mask 淡出）。700ms 交叉渐变完成「入夜」。新命理页面**必须复用**此底座，不自造背景。

### 4.3 阴影哲学

阴影是 Z 轴高度，不是装饰。偏移与模糊正比于悬浮高度；避免高透明度「脏黑」单层阴影，深色表面上的阴影加深不加大。常用档位：

- 卡片静置：`shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)]` 级
- 悬浮/磁吸：`shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08)]` 级
- 主 CTA/聚焦：`shadow-[0_10px_24px_rgba(93,124,250,0.32)]`（品牌蓝发光）
- 命理夜幕：阴影换为辉光（`box-shadow: 0 0 Npx rgba(231,200,115,…)` 鎏金 / `rgba(167,139,250,…)` 紫微紫）

### 4.4 圆角档位（按容器大小取档，不凭感觉）

| 档位 | 值 | 用途 |
| --- | --- | --- |
| `rounded-lg` | 10px（`--radius` 基准） | 小控件、标签、缩略图 |
| `rounded-xl` / `rounded-2xl` | 12–16px | 按钮、输入框、标准卡片（全项目主力档） |
| `rounded-[24px]`→`[28px]` | 24–28px | G-2 大卡片、命理 standard 卡（响应式升档） |
| `rounded-[28px]`→`[32px]` | 28–32px | G-3 壳层：chat 主容器、命理 hero、首页 hero（lg 可至 48px） |
| `rounded-full` | 胶囊 | 主 CTA、徽章、分段控件、头像（全项目用量最大） |

---

## 5. 间距与布局

- **8px 网格**：padding/margin/gap/组件高度取 8 的倍数（4px 半档仅限图标-文字微距）。
- **容器**：通用 `container` 居中（2xl=1400px）；命理结果页 `max-w-6xl xl:max-w-7xl`；阅读列宽控制在 65–75 字符。
- **断点**：sm 640 / md 768 / lg 1024（侧边栏↔底部导航切换点）/ xl 1280。
- **移动优先**：先手机布局再增强；底部区域优先于侧边栏（底部导航、底部抽屉、fixed 操作条）；热区 ≥ 44px；底部输入区/录音钮/浮层必须适配 `env(safe-area-inset-bottom)`；长列表不嵌套滚动，输入框与操作栏保持稳定。

---

## 6. 动效语言

### 6.1 原则

- **一个页面一个主叙事时刻**（星盘的仪式揭示、紫微的入夜、视频预览的播放），其余动效做反馈不做表演。
- 入场动画用「指数缓出 + 已近可见的起点」（opacity 0→1 + y 4~12px），不做全屏飞入。
- 优先 transform/opacity；需要更丰富质感时可上 blur / clip-path / mask / shadow，前提是保持 60fps。

### 6.2 缓动与时长

| 场景 | 时长 | 曲线 |
| --- | --- | --- |
| 微交互（hover/active/开关） | 180–200ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| 容器展开/抽屉/Modal | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| 共享元素转场（layoutId） | 500ms | `[0.32, 0.72, 0, 1]` |
| 弹簧（framer） | — | 面板：stiffness 400 / damping 40；视差倾斜：110/18；宝珠点亮：260/16 |

### 6.3 keyframes 注册表（新增动画先入册，命名带域前缀）

| 前缀/名称 | 时长 | 用途 |
| --- | --- | --- |
| 全局 `gradient` / `loading` / `accordion-*` / `avatar-glow-breathe` | 3s / 1.5s / 0.2s / 3.4s | 渐变文字流动、进度条、手风琴、头像光晕 |
| `acw-cta-shine` | ~4s 一次 | 星座主 CTA 星光扫过（仪式时刻） |
| `acw-float3d` + `.acw-wheel-float` | 14s | 星盘 3D 舞台悬浮公转（±3.5°/±4.5°） |
| `acw-breathe` | 4.6s | 星体光晕呼吸（错峰 i*0.7s） |
| `acw-orbit-cw / ccw` | 220s / 340s 反向 | 星盘仪器表圈公转（`transform-box: fill-box`） |
| `acw-dash-flow` + `.acw-aspect-flow` | 8s | 相位能量流光（pathLength 500，亮段 26，错峰 i*-1.15s） |
| `acw-soft-breathe` + `.acw-skeleton-breathe` / `.acw-thinking-dot` | 2.4s / 1.2s | 异步等待态呼吸（解读分区骨架块、问答思考三点；仅透明度变化，reduce-motion 下静态定格 0.7） |
| `ziwei-twinkle / spin-slow / spin-rev / dash-flow` | — | 紫微星闪、刻度环缓旋、星轨流光 |
| `ziwei-palace-enter / fade-up` | — | 宫位 staggered 入场、内容揭示 |
| `ziwei-breathe / related-glow / active-glow` | — | 星云呼吸、三方四正鎏金辉光、选中宫紫微紫辉光 |
| `astrology-nebula-breathe` | 16s/20s/24s 错相位 | 「夜幕观星」紫金双调星云呼吸（透明度 ≤0.14，reduce-motion 静止） |
| `astrology-invite-pulse` | 1.8s | 「夜幕观星」首访邀请鎏金脉冲（仅一次，reduce-motion 静止） |

### 6.4 动效技术选型

- **framer-motion** 仅限：星盘（3D 舞台/轮盘/揭示序列）、video 面板、resume、global-sidebar、destiny 桌面导航。布局级共享元素转场用 `layoutId`。
- **WebGL 场景用 react-three-fiber + drei + @react-three/postprocessing**（仅限星座结果页「星渊」深空星盘，`astrology-wheel-scene.tsx`）：动效全部走 `useFrame` 帧循环（相机/悬浮/闪烁/流光），不进 CSS keyframes 注册表；场景代码 `next/dynamic ssr:false` 按需分包，WebGL 探测失败或加载中一律回退 SVG 轮。
- 其余域用 `tailwindcss-animate` 入场类（`animate-in fade-in slide-in-from-bottom-4` 等）+ CSS keyframes。
- **3D 变换链必须全链 `preserve-3d`**：perspective 容器到 translateZ 子层之间任何一层缺 `[transform-style:preserve-3d]` 都会压扁 3D 并破坏 hit-test（真实点击错位事故已发生一次，见 astrology-ritual wheelSlot 修复）。
- **R3F Canvas 在 transform 祖先内必须 `resize.offsetSize:true` + 尺寸守卫**：R3F 经 react-use-measure 以 `getBoundingClientRect` 测量容器（受祖先 transform 影响），`acw-wheel-float` 这类 3D 倾斜动画会让测量值随姿态透视压缩（实测 425→402×389）；且 CanvasImpl 的 layout effect 无依赖数组，组件每次重渲染（悬停 setState 即触发）都重放脏尺寸 → 整盘瞬缩后由守卫拉回（即「鼠标移入先放大又恢复」实证根因）。`offsetSize:true` 改读 offsetWidth/Height（布局值，免疫 transform），是源头修复；`astrology-wheel-scene.tsx` 的 `SizeGuard` 作为第二道防线仍是标配，新增 WebGL 场景两者必须同时具备。守卫要点：① 必须直接比对 R3F 内部 `state.size` 与容器布局盒——`setSize` 不保证改到 canvas CSS，只比 `clientWidth` 会漏检（实测 ±5px 漂移持续数秒不自愈）；② ResizeObserver 常驻监听 + 1s 心跳兜底，不能只靠挂载后的定时器窗口。
- **指针驱动的 3D 场景必须 clamp pointer**：R3F 用 `offsetY ÷ state.size.height` 算指针，size 一旦被污染成矮值（实测 518×15.5），`pointer.y` 爆到 ±30+，任何乘在指针上的旋转/位移都会把场景转出视锥（即「鼠标移入黑屏」实证根因）。所有 `state.pointer` 参与的姿态计算必须先 `clamp(-1, 1)`，这是症状层最后防线（星渊 `SceneRig` 为参照实现）。
- **framer 动画 SVG `d` 属性必须把 `d` 放进 `initial`**，否则首帧写入字符串 `"undefined"` 触发浏览器告警（astrology-chart-wheel 相位弧修复实例）。
- **可复用 SVG 组件的 defs id 必须实例唯一**（`useId()` 前缀）：同页多实例时 `url(#id)` 解析到文档首个匹配，若首个匹配位于 `display:none` 实例内（如移动端横条轮的 `xl:hidden`），Chrome 不绘制其渐变/滤镜，可见实例整盘透明洗白（浅色主题下盘心变页面底色，实证于表单页预览轮）。`astrology-chart-wheel.tsx` 的 `gid()` 为参照实现。

### 6.5 reduce-motion 规则

全局兜底（globals.css）：动画/过渡时长归零。域内额外要求：

- 装饰性循环动画**显式关闭或静止**（`.acw-wheel-float` 静止、`.acw-breathe` 定格 0.7 亮度、`.acw-aspect-flow` 隐藏、`.ziwei-comet` display:none）。
- SMIL/JS 驱动动画不受 CSS 时长约束，必须单独判 `useReducedMotion()`。
- **WebGL 场景在 reduce-motion 下输出静态构图**：无入场推近/无漂浮/无视差/无闪烁/无流星，星体与相位保持完整可读（星渊场景 `reduceMotion` 分支为参照实现）。
- 功能反馈（选中、展开）保留瞬时状态切换，不留 0.3s 残影。

---

## 7. 图标与图形

- 图标统一 **lucide-react**，同一场景内 stroke 宽度一致；不用 emoji/Unicode 字符充当功能图标。
- 占星/命理符号（星座、行星、宫位、星曜）**必须自绘 SVG**（`astrology-glyphs.tsx` 等），因为 Unicode 占星字符在部分系统字体缺字形。
- 星盘、雷达、得分环等数据图形用精确 SVG 几何（ crisp vector ），不用 SVG 模仿照片/插画。

---

## 8. 组件规范

### 8.1 按钮

- 首选 `@/components/ui/button`（已品牌化：主变体渐变+发光阴影、`active:scale-[0.98]`、destructive 粉渐变、outline 白玻璃）。
- 命理主 CTA 用胶囊：`rounded-full bg-gradient-to-r from-blue-600 to-indigo-600`（或 `#4969E9→#7C5CF6`），hover `scale-[1.02]`，active `scale-[0.98]`。星座寰宇模块统一引 `astrology/_components/astrology-cta-button.tsx` 的 `<AstrologyCtaButton>`（按钮）与 `ASTROLOGY_CTA_GRADIENT_CLASS`（选中态胶囊等装饰渐变），不再手写色值。
- 状态齐全：hover（上浮 -1px 或 scale 1.02）/ active（scale 0.98）/ focus-visible（2px ring）/ disabled（opacity-40，无动效）/ loading（Spinner + pointer-events-none）。
- 尺寸：大 52px / 中 44px / 小 32px；移动端主操作不小于 44px。

### 8.2 输入框

- 实体高对比底（不开 blur）：浅色 `bg-white/80`、深色 `bg-slate-900/80`；聚焦 `border-blue-500/50` + 4px 外发光 ring；错误 `border-rose-500/60` + 文案说明问题与恢复方式。
- 标签在上方 8px（`text-xs font-semibold`），辅助/错误文在下方 6px。

### 8.3 卡片

- 工具域：`bg-white dark:bg-slate-800 rounded-2xl border` 实卡为主（滚动性能）。
- 命理域：G-3 三档——hero `rounded-[28px]→[32px]`、standard `[24px]→[28px]`、compact `rounded-2xl bg-white/85`。
- hover：上浮 2px + 阴影升一档；卡片内不写「大数字+小标签」的 hero-metric 模板。

### 8.4 浮层（Modal / Drawer / 底部抽屉）

- 遮罩 `bg-slate-950/50 backdrop-blur-md`；主体 G-3 玻璃；入场 scale 0.95→1 + fade，200ms。
- 移动端表单类弹层**一律底部抽屉**（`rounded-t-[28px]`、顶部抓手、安全区内边距），不用居中 Modal。
- **决策记录（命理域信息型弹层）**：`lg`（1024）起用居中 Modal、`lg` 以下用底部抽屉——640-1023 的触屏平板保持抽屉形态（与 §5 的形态切换点一致）。居中断点的入场动效必须把居中位移烘进关键帧（`data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]` + `zoom-in-95`，同 shadcn dialog 标准模式），否则关键帧的 transform 会覆盖 `-translate-x/y-1/2`，弹层从右下偏半屏滑入再落位。
- ESC 关闭 + 背景滚锁；焦点进入抽屉，关闭归还触发元素。

### 8.5 导航

- 桌面侧边栏（global-sidebar）：白玻璃 `bg-white/80 border-white/30`，激活项 `#5D7CFA→#7D91FF` 渐变 + `shadow-indigo-500/35`。
- 移动底部导航（mobile-bottom-nav）：`bg-white/[0.94] dark:bg-[#111218]/[0.94] backdrop-blur-xl`，激活色带渐变，安全区内边距。
- 斜杠透明度只能写刻度值（5 的倍数，如 `/90`、`/95`）或方括号任意值（如 `/[0.94]`）：裸写 `/94`、`/92` 这类非刻度值 Tailwind v3 不生成 CSS，样式静默丢失（本条由底栏 `bg-white/94` 的实际失效证实）。
- 移动顶栏：fixed + blur-xl；紫微夜幕联动时变 `bg-[#0C1128]/85` + 金边（页级主题联动的唯一先例）。

---

## 9. 浏览器表面（页面没画的部分也归设计管）

| 表面 | 标准 | 现状 |
| --- | --- | --- |
| 焦点环 | `focus-visible` 2px 实色描边 + offset；ds-focusable 用 `--ds-accent-blue` | ✅ 已覆盖 |
| 文本选区 `::selection` | 品牌靛蓝底（`rgba(99,102,241,0.24)` 浅色 / `rgba(129,140,248,0.36)` 深色），文字保持高对比 | ✅ 已实施（globals.css base 层） |
| 输入光标 `caret-color` | 表单域 `#4969E9`（dark `#8B9DFF`） | ✅ 已实施（globals.css base 层） |
| 滚动条 | `styles/scrollbar.css`：custom-scrollbar / sidebar-scrollbar / hide-scrollbar / ziwei-night-scrollbar；滚动容器必须引用其一 | ✅ 已有体系（引用覆盖率待查） |
| 数字 | 表格/度数/计时强制 `tabular-nums` | ✅ 星盘/语音已覆盖 |
| 链接下划线 | 链接/文字按钮统一 `underline-offset: 4px` + 装饰色 40% 透明度 | 🟡 部分覆盖（button.tsx、entry-home、奇门），未全局统一 |

---

## 10. 功能面设计简报

| 域 | 模式 | 一句话基调 | 标志装置 |
| --- | --- | --- | --- |
| 首页 home | Operate | 轻盈玻璃门户 | 48px 圆角 hero 玻璃壳、三色渐变大标题、三功能卡双色光晕 |
| 对话 chat | Operate | 通透工作台 | 28px 玻璃主壳、流式光标（蓝条 pulse）、快捷动作四色图标卡 |
| 绘图 image | Operate | 画廊工具台 | 风格九宫格渐变卡、底部 sticky 生成栏 |
| 视频 video | Operate | 演播预览间 | 三色渐变播放钮、时间轴+缩略图序列、spring 侧栏 |
| 语音 voice | Operate | 录音棚 | 录音 ping 圆点+红色计时横幅、波形条、上传进度流光 |
| 历史 history | Operate | 档案馆 | 瀑布流卡、全屏黑玻璃预览层 |
| 简历 resume | Operate | 浅色工作台 | `#2F6BFF` 得分环、AI 抽屉、移动 tab 表单 |
| 八字 | Experience | 五行命盘 | 五行 orb 角光斑卡、`#5D7CFA` 雷达与选中、IO 揭示 |
| 紫微 | Experience | 夜幕星宫 | 页级入夜、鎏金+紫微紫、宋体星曜、专属滚动条 |
| 奇门 | Experience | 金色局盘 | amber 金系宫卡、多彩门星神煞 |
| 星座寰宇 astrology | Experience | 悬浮天象仪 | 「星渊」WebGL 深空星盘（星云/星野/宝珠溢光/相位流光）、仪式揭示、金句主轴 |

新功能面加入时，先在此表登记模式与基调，再动手。

### 10.1 星座结果页「星渊」WebGL 深空星盘（`astrology-wheel-scene.tsx`）

**设计立意**：星盘不是一张平面图，而是一扇圆形舷窗——用户凑近看自己那片深空。浅色主题下深空圆窗与亮页形成「舷窗对比」，是有意的视觉锚点，不要把它调亮。

**七层纵深**（从底到顶，装饰层永不参与事实表达）：

1. 深渊底色 `#040713` + 压暗窗盘（Vignette 收拢视线）
2. FBM 星云气（自定义 shader，低频缓慢涌动）
3. 三层视差星野（mulberry32 种子确定性排布，独立闪烁相位，帧间/端间一致）
4. 黄道玻璃蚀刻环（四元素扇区着色 + 自绘 SVG 符号）
5. 相位能量弧（几何与 SVG 轮同口径，流光点循环）
6. 十星自发光宝珠（ORB_PALETTE 十色色谱 + 光晕精灵 + 错峰呼吸，Bloom 真实溢光）
7. 盘心星核 + 涟漪；偶发流星（13s 周期）

**动效编排**：入场相机推近 17.5→14.2（影院揭幕，1.35s ease-out）→ 指针视差（±0.05rad）+ 14s 悬浮呼吸 → 点选星体触发超新星冲击波 + 寻星雷达环 + Html 胶囊标签。键盘可达：←→ 循环星体、Enter 选中、Esc 取消，契约与 SVG 轮一致（`selectedBody`/`onSelectBody` 不变）。

**事实纪律**：行星角度/相位/宫位几何全部来自 `lib/astrology/wheel-scene-layout.ts`（纯函数，单测覆盖），与 SVG 轮同一映射口径（screenTheta=180-(lon-ascLon)）；装饰层（星野/星云/流星）只是氛围，永不编码事实。

**降级链**（`astrology-wheel-scene-switch.tsx`）：SSR/首帧 → SVG 轮；WebGL 探测失败 → 永久 SVG；three chunk 加载中 → SVG 原地接管。三级之间无闪烁、无可访问性空洞。移动端 compact 档：粒子减半 + dpr 收敛 + 关闭 MSAA。

### 10.2 星座结果页「夜幕观星」暗夜模式（`.astrology-night`）

**设计立意**：星盘属于夜空。白昼是「阅读报告」，夜幕是「凝视星盘」——同一份事实，两种观看姿态。视觉语言保持星座寰宇自己的深空基因，不引入紫微的 zw-* 宋体星宫体系。

**机制与硬边界**（为什么是嵌套 `dark` 而不是第二套主题变量）：Tailwind `darkMode: 'class'`，结果页容器嵌套 `dark` 类即可让全部 `dark:` 样式局部翻转——星野自动切午夜深空、流星自动出现，零组件改动。`.astrology-night` 标记类只做「夜幕降临」的增量氛围，不重写已有深色样式。代价是 `dark:` 为祖先级联：全局暗色时 `<html>` 自带 `.dark`，页内无法局部撤销，**白昼视图在全局暗色下不可交付**——因此契约是「全局暗 → 恒夜幕（且为增强版），切换钮不渲染；手动偏好仅在全局亮时生效」，与紫微 zw-* 变量体系（暗全局下仍可白昼）是有意的能力差。

**增量氛围三层**（globals.css `.astrology-night` 作用域，全部克制在底色层）：

1. 紫金双调星云：紫微 / 恒星金 / 靛蓝三处呼吸光斑（16s/20s/24s 错相位，透明度 ≤0.14），暮色不是均匀的黑，是有远近的天；
2. `night-card` 鎏金描边卡：暗夜纯黑阴影不可读，用「`rgba(231,200,115,0.14)` 描边色温 + 深空下沉阴影 + 顶部微光内边」让卡片浮在星幕上——只覆盖护照头与生活模块卡，大三要素卡已有日金/靛紫双色阴影体系，不抹平；
3. `night-wheel-glow` 底盘金辉：轮盘像悬在观星台上，底盘泛暖金星轨余晖。

**纪律**：切换钮热区 ≥44px、aria-label 中文；星云/邀请脉冲在 reduce-motion 下静止；作用范围仅结果相位与失败恢复卡，表单/仪式相位不夜幕化（填写是日光下的事）；星渊 WebGL 场景本体不随开关变化（它始终是深空，是舷窗不是皮肤）。

**入夜联动面**（夜幕不是内容区自己的事，周边 chrome 必须同步，否则亮玻璃浮在夜底上文字不可读）：桌面左导航（`destiny-desktop-nav.tsx` 的 `night` 条件并入星座结果态）、移动端分段控件（`destiny-page-client.tsx` 的 `isResultNight`）、移动端全局顶栏/底栏（`mobile-header.tsx` / `mobile-bottom-nav.tsx`）——与紫微入夜同一联动面，但星座侧必须经 `resolveAstrologyNightTheme` 判定（白昼态结果页是亮玻璃，chrome 不得入夜；紫微侧 chrome 不看偏好是既有口径，未动）。

---

## 11. 设计禁忌

1. **玻璃套玻璃**：G-3 壳内不再开 blur；性能与视觉双输。
2. **深色表面落中性灰**：次要文字从表面色相调色（见 2.6）。
3. **emoji/Unicode 凑图标**：图标 lucide，命理符号自绘 SVG。
4. **生硬单层重阴影**（`rgba(0,0,0,0.5)` 级）：玻璃瞬间变塑料板。
5. **线性缓动与同款入场**：禁止 linear；禁止每个 section 复制同一个入场动画。
6. **eyebrow/kicker 标签、章节编号（01/02/03）**：标题自己承担层级。
7. **渐变文字扩散**：6 处白名单之外不新增（见 2.5）。
8. **长滚动容器开 `backdrop-blur`**；`<1024px` 非必要组件去 blur 换高遮罩实色。
9. **不稳定数据上盘**：星盘/命盘不绘制未计算的宫位、轴线与度数（宁缺毋假）。
10. **3D 链断节**：perspective 与 translateZ 之间必须全链 preserve-3d（见 6.4）。

---

## 12. 交付一致性检查清单

UI 交付前逐项自检（对应章节）：

- [ ] 语义令牌引用，无硬编码灰色（2.1）
- [ ] 深浅两色主题都过一遍截图，深色表面次要文字非中性灰（2.3/2.6）
- [ ] 对比度：正文 ≥4.5:1，大标题 ≥3:1（2.6）
- [ ] 标题无 eyebrow，间距上宽下窄（3.2）
- [ ] 圆角/玻璃/阴影取档正确，无玻璃套玻璃（4）
- [ ] 8px 网格；移动端热区 ≥44、安全区适配（5）
- [ ] 动效：一个主叙事时刻；reduce-motion 下装饰动画全部静止且功能反馈保留（6）
- [ ] 图标 lucide/自绘 SVG，无 emoji 图标（7）
- [ ] 按钮/输入框状态五件套齐全（8.1/8.2）
- [ ] 焦点环可见；数字 tabular-nums；选区/光标若已全局实施则无需重复（9）
- [ ] 新增 keyframes 已注册入册（6.3）；新功能面已登记（10）
