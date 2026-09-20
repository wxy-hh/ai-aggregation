---
target: 星座寰宇 astrology 模块
total_score: 28
max_score: 32
na_heuristics: 7, 10
p0_count: 0
p1_count: 0
target_identity: "file:/Users/weixiaoyu/Desktop/practice/AI-aggregation-other/ai-aggregation/apps/web/src/app/destiny/_components/astrology"
timestamp: 2026-09-17T18-19-43Z
slug: apps-web-src-app-destiny-components-astrology
---
# 星座寰宇 · Impeccable 修复后独立复评（fresh eyes re-critique）

> **Method**：本轮是**修复后复评**，不是重跑一次完整 critique。基线时代 = `daedd97`（快照 `2026-09-17T16-03-53Z`，26/32 + 14/20）；复评时代 = `c75429c`（`git log --oneline daedd97..HEAD` 共 9 个提交，其中 8 个修复域 + 1 个交接文档）。
> **实际做过的核验**：①读基线快照、`docs/reviews/2026-09-18-astrology-impeccable-audit.md`、交接文档；②逐个 `git show` 8 个修复提交；③通读 astrology 目录 24 个文件（8126 行）+ `lib/astrology` 相关实现（`mock-chart-facts.ts` 宫制序列、`mock-qa.ts` 引用片形态）；④用本地 dev server（`localhost:3030`）跑 Playwright 1.61 无头 Chromium，视口 1440×900 与 390×844：走完「入口 → 两步表单 → 仪式 → 结果 → 事实卡 → 星语问答」全链路，注入 `HTMLCanvasElement.prototype.getContext` 补丁统计 **WebGL draw call**（停帧/恢复的客观代理指标），用 DOM 合成走查器估算次要文字**实际对比度**，量测触控热区、`aria-*` 现况；⑤`node .agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/app/destiny/_components/astrology` → `[]` exit 0；⑥`tsc --noEmit`（apps/web）→ 5 个存量错误全在 `src/components/layout/`，astrology 目录 0 错误。
> **约束遵守**：只读源码；未修改 `apps/`、`packages/`、`docs/` 任何文件；未 commit/checkout/stash；唯一新建文件是本快照，临时脚本全部走 stdin，截图落 `.impeccable/*.png`。
> **口径说明（重要）**：基线快照声明 `max_score: 32 / na_heuristics: 7`，但其启发式表格 9 行相加为 29，与其声明的 26 不符；26 = 4+3+3+2+4+4+3+3，即基线**实际按 8 项计分**（把 #10 也剔除了，只是没写进 `na_heuristics`）。为保持可比，本轮沿用同一 8 项口径（#7 Experience 首跑流程 n/a；#10 按 mode-applicability 规则一并 n/a，并在修复核验表里另行核对「帮助内容」），因此 `na_heuristics` 写 `7, 10`、分母仍为 32。若把 #10 计入（9 项、分母 36），本轮为 **32/36**（基线表格口径 29/36）。
> **基线分数照抄**，非本轮实测的部分一律标注「基线」。

---

## 一、Design Health Score（Nielsen 10 启发式，与基线逐格对比）

| # | 启发式 | 基线 | 本轮 | 变化依据（本轮实测/代码证据） |
|---|--------|------|------|------------------------------|
| 1 | 系统状态可见性 | 4 | **4** | 四阶段主语统一「系统」（`astrology-ritual.tsx:50-60`），无虚假百分比；四阶段活体区存在（`:347-349`；结果页同类 `role=status` 已实测）；停帧治理不影响用户可见状态 |
| 2 | 贴近真实世界语言 | 3 | **3** | 未动：表单步骤名「黄道历法基准/地平经纬校准」术语墙仍在（不属本轮契约） |
| 3 | 用户控制与自由 | 3 | **3** | 未动：仪式 3.2s 不可跳过（基线判可接受）；「重新演算/返回上一步」保持 |
| 4 | 一致性与标准 | 2 | **4** | 基线点名的两处冲突（宫制口径 ↔ 设计文档、副标题 ↔ 设计基线）均已消解；CTA 渐变 8 处收敛为单一出处。残留小不一致（同型引用片 44/44/28px 三种高度）记入 N2/N10，不足以压回 3 |
| 5 | 错误预防 | 4 | **4** | 未动且更稳：表单错误关联补齐后，出错态可见性与语义同步（实测 `aria-invalid` false→true） |
| 6 | 识别优于回忆 | 4 | **4** | 未动：轮旁白话清单、事实卡 ⇄ 模块双向定位保持 |
| 7 | 灵活性与效率 | n/a | **n/a** | Experience 首跑沉浸流程，与基线同（快捷键非目标） |
| 8 | 美学与极简 | 3 | **3** | 引导页更「一次一事」（CTA 前置）是加分；但引用片被抬到 44px、事实卡头部增高 16px、星体切换条可视数下降，动效密度与 P2-6 主轴层级问题（未做）仍在 |
| 9 | 错误恢复 | 3 | **3** | 未动，未复测（失败恢复卡本轮未触发） |
| 10 | 帮助与文档 | (3，未计入基线总数) | **n/a** | 按 Experience 面 mode 规则剔除；内容口径已在 P1-2 核验（见修复核验表） |
| **总分** | | **26/32** | **28/32** | 基线声明的 26 与其表格 29 的口径差见上文；同口径（8 项）比较：26 → 28（+2） |

## 二、Audit 技术健康分（5 维，与基线逐格对比）

| 维度 | 基线 | 本轮 | 变化依据 |
|------|------|------|----------|
| 无障碍 | 3/4 | **3/4** | 系统性对比度不达标已消解（浅色次要文字 100% 走 `day-muted`），表单/问答 ARIA 关联实测正确；但残留**实测 4.43:1 < AA 4.5** 的 5 个节点（N5）、`aria-controls` 收起态悬空（N4）、事实卡「模块引用片」仍 28px（N1） |
| 性能 | 2/4 | **4/4** | 三包全部落地且**实证**：可见 4263 draw calls/1.2s → 离屏/隐藏工作区/隐藏页/重渲染后 0 → 回视口恢复 4263；打字机 34ms 只重渲染 h2 子树；心跳有界（3 拍自愈退场） |
| 主题化 | 3/4 | **4/4** | 主 CTA 渐变收敛为 `astrology-cta-button.tsx` 单出处；`day-muted` 令牌回写 `tailwind.config.ts:81-83` 与 `DESIGN.md:106`；暗色侧实测未回退（`依据` 仍为 night-faint `rgb(130,139,176)`） |
| 响应式 | 3/4 | **3/4** | 点名的 28px 缺口已补（实测 44×44）；但同一笔改动换来移动端可发现性代价：事实卡星体切换条 190px 窗口 / 480px 内容 → **10 颗只露 4 颗且无滚动提示**（桌面 280px 窗口露 5 颗），保持 3 |
| 实现完整性 | 3/4 | **4/4** | 用户可见的 AI 能力声称已清零（全文 grep 无命中）；新增 4 个模块（cta-button / typewriter-headline / scroll / frameloop governor）全部有引用、无死代码；`tsc` 无新增错误 |
| **总分** | **14/20** | **18/20** | +4 |

## 三、修复核验表（基线每一条 P 项 → 现状判定 + 证据）

| 项 | 判定 | 证据（文件:行号 / 实测） |
|----|------|--------------------------|
| **P1-1** 文案声称 AI 能力 | **已解决** | `astrology-ritual.tsx:58` 第四阶段改「系统正在基于星盘事实整理宇宙重点」、`:43,:15` 注释同步；`astrology-entry-home.tsx:108,296` 改「解读基于星盘事实生成」。全目录 grep `AI 解读|AI 深度生成|AI 请求|AI 生成`：**用户可见串 0 命中**（仅剩注释与 `lib/astrology/*` 的类型/接口说明）。残留：设计文档 §6.2 表格仍写「解读由 AI 生成」，见 N6 |
| **P1-2** 宫制口径矛盾 | **已解决**（按契约改文档） | 实现确为整宫制：`apps/web/src/lib/astrology/mock-chart-facts.ts:1096,1118`；UI 文案 `astrology-entry-home.tsx:294`、`astrology-result-view.tsx:582,887` 与实现一致；设计文档 §9.2 已改为「mock/冻结阶段固定整宫制，Placidus 为接入真实星历后的目标默认」`docs/designs/2026-07-26-constellation-universe-design.md:481`。UI 未按报告原文改成 Placidus —— 与交接契约一致 |
| **P1-3** 浅色次要文字对比度 | **部分解决** | 令牌落地：`tailwind.config.ts:81-83`（`day.muted = #64748B`）+ `DESIGN.md:106`；替换 55 处（`git show e8063a9`：新增含 `day-muted` 代码行 55 / 删除含 `text-slate-400` 行 55，一一对应）。当前 grep `text-slate-400`：仅 `astrology-result-view.tsx:197` 的 `dark:` 侧（合规）。**但实测**：结果页 44 个 `day-muted` 节点中 39 个 4.74–4.76:1（白卡 ✅），5 个 4.43:1（裸页面底色 `#F5F7FA` ❌ 差 0.07）→ 详见 N5 |
| **P1-4** WebGL 常驻 + 34ms 整树 + 1s 心跳 | **已解决** | ①`FrameloopGovernor`（`astrology-wheel-scene.tsx:1012-1080`，Canvas 内挂载 `:1158-1160`）四条路径全部实测：切到八字工作区（画布仍在 DOM、`display:none`）0 draw call；`visibilityState=hidden`（桩）0；滚出视口 0；回视口恢复 4263。②额外验证「重渲染顶掉 frameloop」路径：离屏时用 JS 直点「查看全部术语数据」强制 result-view 重渲染 → 仍 0（订阅兜底生效）。③SizeGuard 心跳有界（`:964-978`，连续 3 拍无偏差 `clearInterval`，隐藏/不可测量不计拍）。④打字机下沉 `astrology-typewriter-headline.tsx`：`typedCount` 只在子组件（`:36`），父组件仅 `onDone` 一次（`astrology-result-view.tsx:378-383`）；读屏契约实测：打字中 `role=status` 文本为空，落定后一次性出现完整主轴；`依据` chips 门控实测落定后才出现 |
| **P2-1** 引导页一次一事 | **已解决** | 代码：主操作区 `order-1`（`astrology-entry-home.tsx:181-183`）、价值卡 `order-2`（`:219`）、时间未知 `order-3`（`:245`）——桌面 `xl:order-*` 压后逻辑已删除；探索胶囊改为**被动 span**（`:124-129`，文案「示例星盘 · 可点选星体体验」，补上 §6.2 标注义务，且置于盘面上方未被 HUD 遮挡）。实测：桌面 CTA `top 421-477` 先于价值卡 `505-644`；移动 CTA `top 702` 先于价值卡 `828`；标注 `labelIsButton=false` |
| **P2-2** CTA 渐变 7 处手工复制 | **已解决** | 新增 `astrology-cta-button.tsx`（`:19` 色值常量、`:22-36` 三档尺寸、`:43-51` 组件）；替换 8 处（`astrology-workspace.tsx:143`、`astrology-entry-home.tsx:190`、`astrology-form.tsx:342`、`astrology-ritual.tsx:242`、`astrology-qa.tsx:411` + 选中态胶囊 `astrology-deep-dive.tsx:183`、`astrology-form.tsx:242/265/276`、`astrology-form-step1.tsx:322`、`astrology-form-step2.tsx:262/386`、`astrology-share-entry.tsx:76`）；引导页 `#3B5BDB` 分叉归位。残留非按钮渐变 2 处（装饰光晕 `astrology-entry-home.tsx:188`、步骤徽标 `astrology-ritual.tsx:309`）+ spinner 色值 `astrology-share-entry.tsx:312`，均为装饰，非「另写渐变按钮」。`DESIGN.md:51` 有色值权威、`:255` 记录共享组件出处 |
| **P2-3** 亚 44px 触控热区 | **已解决（同名类残留见 N1/N10）** | 事实卡星体切换 `h-11 w-11`（`astrology-result-view.tsx:207-227`）实测 10 颗全 44×44；问答引用片 `min-h-11`（`astrology-qa.tsx:323-324`）实测 44；生活模块事实片 `min-h-11`（`astrology-life-modules.tsx:295`）。同型「模块引用片」在事实卡仍 28px（`astrology-result-view.tsx:325`）→ N1 |
| **P2-4** 问答/表单无障碍缺口 | **已解决** | 问答消息区 `role=log + aria-live=polite + aria-label`（`astrology-qa.tsx:289-295`）实测存在；入口按钮 `aria-expanded` 实测 false→true、移动端 `aria-haspopup=dialog`、桌面不渲染该属性（`astrology-qa.tsx:172-174`）；表单：日期三选/时/分/时段 radiogroup/城市 combobox 均 `aria-invalid` + 仅在出错时关联 `aria-describedby`（`astrology-form-step1.tsx:113-114,152-153,234-262`、`astrology-form-step2.tsx:145-147,295-296,323-324,365-366,463-464`），实测三处错误 id 均指向真实存在元素；昵称字段刻意不加（校验器无该错误键，避免死属性）——判断正确。残留：`aria-controls` 收起态悬空 → N4 |
| **P2-5** 文案偏离设计基线 | **已解决** | 副标题 `astrology-entry-home.tsx:105` 与设计文档 §6.2 `:159` 逐字一致（「一分钟，看懂你的性格底色、关系模式与本周行动」）；「洞悉/生命潜能」清零；用户可见文案中「宝珠」「✨」清零（仅剩代码注释与 `✦` 品牌字形） |
| **P2-6** 主轴视觉重量 | **未解决（按契约不做）** | 实测未变：`astrology-typewriter-headline.tsx:87` 仍 `clamp(40px,4vw,56px)`（1440 宽实测 56px）、`:72` 仍按第一个逗号切分金色区。与基线一致，非本轮范围 |
| **P3** 问答 520ms setTimeout 无清理 | **已解决** | `astrology-qa.tsx:74-81`（ref + 卸载清理）、`:92-103`（写入/清空 ref） |
| **P3** 滚动复位重复两处 | **已解决** | 新增 `astrology-scroll.ts:8-14`；`astrology-result-view.tsx:370-372` 与 `astrology-ritual.tsx:156-158` 均改为调用同一 helper |
| **P3** mock 文案重复 / SVG 焦点反馈 / 分享卡小字 | **未解决（按契约不做）** | 未改动，与基线一致；不做评价 |

## 四、新发现（按严重度分级，均含证据与影响）

> 总体：**未发现把既有功能做坏的回归**（无 P0/P1，无控制台报错、无布局破版）。以下 3 条 P2 属于「修复副作用 / 目标未竟」，3 条 P3 属于「扫尾不齐」，另有 4 条存量观察。

**N1（P2 · 可访问性）同型「模块引用片」只补了一半：事实卡里仍是 28px**
- 证据：`astrology-result-view.tsx:325` `inline-flex min-h-7 …`（事实卡「在以下生活模块中被引用」）；对照 `astrology-life-modules.tsx:295` 同型 chip 已 `min-h-11`。实测（390×844，事实卡抽屉内）按钮「我是谁」= **71×28**。
- 影响：这正是 P2-3 要治的「移动端亚 44px 交互热区」；事实卡在 <xl 就是移动抽屉，用户最常在抽屉里点它做反向定位。两处同角色控件现在一个 44px 一个 28px，也是可见的一致性瑕疵。

**N2（P3 · 视觉密度/一致性）44px 被套到了非交互标签上**
- 证据：`astrology-qa.tsx:323-324` 的 `cls` 常量同时供可点击 `button`（`:326-339`）与**纯标签** `span`（`:341-347`）复用。实测：引用片 `span`「关键相位」（`lib/astrology/mock-qa.ts:210` 产出，无 moduleId/body）高 **44px**，与真按钮同高；10px 字号 + 44px 胶囊＝大胶囊小字，问答面板内容实测 390px（把 min-h 临时改回 28px 为 374px）塞进 250px 窗口，滚动更多。
- 影响：纯标签无热区需求，抬高只是变胖；同族控件高度 44/44/28 三值并存。
- 建议：`min-h-11` 只给 `button`；标签侧保持 `min-h-7`，或按钮用 `after:` 伪元素扩热区而不改视觉高度。

**N3（P2 · 移动端可用性）星体切换条 44px 后可发现性下降，且无滚动提示**
- 证据（实测，`astrology-result-view.tsx:207`）：移动抽屉 `max-w-[190px]` 容器 / `scrollWidth 480` / 单项 44+4 → **10 颗只露 4 颗**（桌面 `max-w-[280px]` 露 5 颗）；把同一批按钮内联改回 28px（浏览器内 hack，未改源码）→ 桌面露 8 颗。同一行左侧「全部星体」按钮仍是 `min-h-8`（32px），一行内两种高度。
- 影响：审计的本意是「横排十颗星易误触」，修完误触少了，但「找到想要的星」成本变高（一次只能看到 4 颗、无渐变/箭头提示可横滑），移动端尤甚。
- 建议：<xl 把容器改为 `flex-1 min-w-0`（吃掉「星体深度解构」标题空位）并在右缘加渐隐提示；或改两行/宫格。

**N4（P3 · 语义准确性）`aria-controls` 在收起态指向未挂载元素**
- 证据：`astrology-qa.tsx:173` 固定输出 `aria-controls="astro-qa-conversation"`，而目标 `<div id="astro-qa-conversation">` 只在展开时渲染（`:137` 桌面内联 / `:197` 移动 Dialog，Radix 关闭态不挂载）。实测：收起态（桌面、移动）`targetExists=false`；移动展开态为 `true`（此时 `aria-expanded=true`，语义成立）；桌面展开态按钮本身消失。
- 影响：低——悬空 IDREF 会被 AT 忽略，不产生错误朗读；但既然是按无障碍契约补的属性，应收口：只在 `open` 时输出该属性（或移动端用 `aria-haspopup="dialog"` 表达即可）。

**N5（P2 · 对比度）`day-muted` 在白卡上过 AA，在裸页面底色上仍差 0.07**
- 证据（DOM 合成走查 + 最近不透明背景）：`#64748B` 对 `#FFFFFF` = 4.76:1 ✅；对页面底色 `#F5F7FA`（`destiny-page-client` 壳层 `bg-[#F5F7FA]`）= **4.43:1 ❌**。实测结果页 44 个 `day-muted` 节点：**5 个 4.43**（「依据」「太阳 · 月亮 · 上升」「点选任一星体…」「每张卡都能展开依据…」「完整盘面与关键相位…」，字号 11–12px，均需 4.5:1），其余 4.74–4.76；入口页 1 个节点同为 4.43。环境光渐变（`#F8FAFF→#E9EEF6`）叠在底色上，页面下部的实际值还会更低（≈4.1）。
- 影响：修复说明写的是「过 WCAG AA」，实测**未完全达成**；相较基线 2.5:1 已是质变，但一键可修的 0.07 差距留着可惜，且这些 11–12px 行内注脚恰是「解释性文字」。
- 建议：令牌下调一档（如 `#5B6673`，白底 ≈5.5:1、`#F5F7FA` ≈5.1:1），或在裸底色文案上改用 `text-slate-600`。

**N6（P3 · 文档一致性）设计文档仍在写「解读由 AI 生成」**
- 证据：`docs/designs/2026-07-26-constellation-universe-design.md:160`「星体位置为计算结果，解读由 AI 生成」；UI 已改为「解读基于星盘事实生成」（`astrology-entry-home.tsx:108,296`）。同文件 `:610` 亦有「只有 AI 解读阶段可使用 AI 主语」的清单项，而实现四段主语全为「系统」。
- 影响：P1-2 用的手法就是「改文档对齐实现」，同一类口径同步只做了宫制一处；下次按文档改文案的人会重新引入 P1-1。

**N7（观察 · 存量，非本轮引入）三要素卡「入场门控」是死类**
- 证据：`astrology-result-view.tsx:643-656`（`initial={reduceMotion || !headlineDone ? false : …}` + `animate` + `!headlineDone && !reduceMotion && 'opacity-0'`）。实测打字中（h2 长度 2→24）`article` 类名含 `opacity-0` 但 `getComputedStyle().opacity === '1'`、内联 `opacity: 1; transform: none;` —— framer-motion 以 `initial={false}` 直接落到 animate 目标，内联样式压过类名。基线 `daedd97` 同构（`:695,:708`）→ **语义与基线等价，但该门控从未生效**；真正有效的门控是「依据 chips 条件渲染」（实测落定后出现）。
- 影响：不影响本轮评分（不是回归），但说明「三大要素卡在主轴落定后上浮」的设计意图没有实现，属可顺手修的死类。

**N8（观察 · 存量）framer-motion 控制台噪声约 100+ 条/流程**
- 证据：「You are trying to animate opacity from undefined to "1"」——入口页加载即出现 29 条（早于本轮新增组件），表单页累计 87，结果页 116；非本轮引入。

**N9（观察 · 维护风险）`FrameloopGovernor` 直接改写 R3F 内部字段**
- 证据：`astrology-wheel-scene.tsx:1033`（`clock.elapsedTime = pausedElapsed`）、`:1038`（`store.setState({ internal: {…, frames: 0} })`）。这些是对的：核对 `@react-three/fiber@9.7.0` 源码确认 `setFrameloop` 会 `clock.stop()+elapsedTime=0`、`update()` 的 `'never'` 分支会用 RAF 时间戳覆盖 `elapsedTime`、`CanvasImpl` 的 layout effect 无依赖数组每次渲染都重放 `configure()`（`dist/react-three-fiber.esm.js:70-106`）。但依赖内部实现细节，**升级 R3F 时须重验**（本次已按 9.7.0 逐个核对）。

**N10（观察 · 存量）残留亚 44px 交互件清单（实测 390×844）**
关闭事实卡 32×32、事实卡「我是谁」71×28（N1）、「收起星语问答」28×28、问答发送钮 40×40（`astrology-cta-button.tsx:35` icon 档）、问答引导问题 38、问答输入框 40、分享分段 36（`astrology-share-entry.tsx:71` `h-9`，但同文件 `:25` 注释仍写「热区 ≥44px」，注释与实现不符）、深读区锚点 40、修改资料 40。P2-3 点名的三处已达标，其余属存量。

## 五、核验中的证伪与未验证项（避免误报与过度声称）

- **证伪 1**：结果页 `fullPage` 截图（`.impeccable/astrology-review-result-mobile-light.png`）在「生活的五个切面」之后出现约 1200px 空白 —— 追查为**截图伪影**：五张模块卡用 `whileInView`（`astrology-life-modules.tsx:190-194`），`fullPage` 截图在 IO 回调/动画落定前捕获。真实滚动后实测卡片 `opacity: 1`（`.impeccable/astrology-review-modules-mobile-light.png`），非缺陷。
- **证伪 2**：桌面事实卡「全部星体」按钮折成两行 —— 用浏览器内临时把切换条按钮改回 28px 复测，**仍然两行**，判定为存量布局（非本轮引入）。
- **未验证**：真机（iOS/Android）触摸、安全区与横向滚动手感；读屏软件实听（仅到 DOM/属性与活体区文本层）；仪式页帧与失败恢复卡（本轮未触发）；对比度为 DOM 合成估算（环境光渐变按近似处理，实测可能 ±0.2）；未跑 CLI 的 URL 渲染态扫描；性能以 draw call 为代理（未取 DevTools 帧率/功耗）。

## 六、趋势对比结论

**Design Health 26/32 → 28/32（+2）；技术健康 14/20 → 18/20（+4）。** 四个 P1 里三个彻底闭环：AI 话术清零（全目录 grep 无用户可见 AI 声称）、宫制口径按契约「改文档对齐实现」并经代码核对、WebGL 常驻三条路径 + 重渲染兜底全部拿到 0 draw call 的实测证据；第四个（浅色对比度）从 ~2.5:1 提到 4.43–4.76:1，**仍差半步 AA**，是四项中唯一未竟的。剩余风险集中在三类：①**令牌取值差一档**（裸底色 4.43:1，N5）；②**44px 扫尾不齐且用力过偏**（事实卡 28px 交互片漏补 N1、非交互标签被抬到 44px N2、星体切换条只剩 4/10 可见 N3）；③**文档口径同步只做了宫制一处**（设计文档仍写「解读由 AI 生成」N6）。下一步建议按「改一个色值 → 改一个类名 → 放宽一处容器宽度 → 同步一段文档」的顺序做四个小改动（N5/N1/N3/N6），再考虑 P2-6 主轴层级与 P3 余项；N7（门控死类）可作为顺手修。
