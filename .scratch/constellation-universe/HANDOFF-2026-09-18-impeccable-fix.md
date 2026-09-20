# 交接文档：星座寰宇 Impeccable 排查报告 · 修复执行（2026-09-18）

> 明天继续此任务时，先读本文件，再读「核心引用」里的报告原文。分支：`feat_xingzuo`。

## 核心引用（不要重复其内容，直接去读）

- **排查报告（修复依据的唯一权威）**：`docs/reviews/2026-09-18-astrology-impeccable-audit.md`
- **官方评审快照**：`.impeccable/critique/2026-09-17T16-03-53Z__apps-web-src-app-destiny-components-astrology.md`
- **设计文档**：`docs/designs/2026-07-26-constellation-universe-design.md`（§6.2 文案基线、§9.2 宫制口径）；根 `DESIGN.md`（色彩令牌、§2.6 对比度）
- 旧交接：`.scratch/constellation-universe/HANDOFF.md`（2026-09-04，仅历史参考）

## 已确认的修复契约（grilling 五问已全部拍板，不要重开）

- **范围**：P1×4 + P2×6 + P3 两项（`astrology-qa.tsx` setTimeout 清理、`querySelectorAll` 滚动复位去重），其余 P3 不做。
- **P1-1**：只改文案说真话，**不接真 AI**（接 AI 是独立立项）。
- **P1-2 已反转**：执行中核实实现=整宫制（`apps/web/src/lib/astrology/mock-chart-facts.ts:1096` 注释有完整理由），**UI 文案是诚实的，错的是设计文档**——修法是改设计文档 §9.2 对齐实现（域1 已完成）。报告此处框架有误，勿按报告原文改 UI。
- **P1-4**：确定收益三包（IntersectionObserver 离屏暂停 + 打字机下沉为独立组件 + SizeGuard 心跳自愈停止）；`frameloop="demand"` 先查 `astrology-wheel-scene.tsx` 是否有常驻动画再定，有则不盲上、改加 `document.hidden` 暂停。
- **P2-1**：最小重排——CTA 提到价值卡之前 + 探索胶囊降级为被动标注「示例星盘 · 可点选星体体验」（补 §6.2 缺失的示例标注义务）；**示例盘可交互性保留**。
- **交付**：8 个修复域各自独立 commit（可单独 revert），全部完成后统一验收。

## 进度（截至交接时）

| 域 | 状态 | Commit |
|---|---|---|
| 基线（既有 WIP + 排查产出物） | ✅ | `daedd97`、`a915c19` |
| 域1 文案诚实性（P1-1+P1-2+P2-5） | ✅ | `f39363b` |
| 域2 对比度令牌化（P1-3，`day-muted`=#64748B，47 处替换 + DESIGN.md:106 回写） | ✅ | `e8063a9` |
| **域3 CTA 收敛（P2-2）** | ⚠️ **半成品，未提交** | — |
| 域4 引导页重排（P2-1） | ⬜ 未开始 | — |
| 域5 性能（P1-4） | ⬜ 未开始 | — |
| 域6 触控热区（P2-3） | ⬜ 未开始 | — |
| 域7 无障碍（P2-4） | ⬜ 未开始 | — |
| 域8 P3 两项 | ⬜ 未开始 | — |
| 最终验收 | ⬜ 未开始 | — |

## 域3 半成品现场（第一件事就是收尾它）

子代理做到一半被用户中断，工作区有未提交改动：

- ✅ 已建共享组件 `apps/web/src/app/destiny/_components/astrology/astrology-cta-button.tsx`（`AstrologyCtaButton` + `ASTROLOGY_CTA_GRADIENT_CLASS`，md/lg/icon 三档，注释完整）。
- ✅ 已替换 4 处：`astrology-workspace.tsx`、`astrology-entry-home.tsx`、`astrology-form.tsx`、`astrology-ritual.tsx`。
- ⬜ 未替换（grep `3B5BDB|4969E9` 兜底）：`astrology-form-step1.tsx`（约 :307）、`astrology-qa.tsx`（约 :396）、`astrology-deep-dive.tsx`（约 :184）。
- ⬜ 未验证未提交：跑 `pnpm --filter @repo/web exec tsc --noEmit` 后提交。建议 commit message：`refactor(constellation): 主 CTA 渐变收敛为共享组件，消灭手工复制与色值分叉`。
- ⚠️ **需核实**：组件头注释声称权威色值出自「DESIGN.md §2.2 命理主 CTA 渐变 `#4969E9 → #7C5CF6`」——子代理是否真在 DESIGN.md 写过这条，还是只写了组件注释，要打开 DESIGN.md 验证；若 §2.2 没有此条，补上（简短、与既有条目风格一致）。
- 优先 `resume` 原子代理（agent-8 的上下文仍在）或派新 coder 子代理按上文收尾。

## 剩余各域任务要点（详见报告第七节，此处只给锚点）

- **域4 P2-1**：`astrology-entry-home.tsx`——CTA 的 `xl:order` 提到价值卡前；「✨ 点击宝珠或星座探索」胶囊去按钮化、改文案为「示例星盘 · 可点选星体体验」。
- **域5 P1-4**：`astrology-wheel-scene.tsx`（:1035-1077 Canvas、:957 SizeGuard 心跳）+ `astrology-result-view.tsx`（:381-399 打字机抽成 `<TypewriterHeadline>`）。
- **域6 P2-3**：`astrology-result-view.tsx:210-224` 事实卡星体切换 28×28 → ≥44px；`astrology-qa.tsx:305` min-h-7、`astrology-life-modules.tsx:295` min-h-8 同步补足。
- **域7 P2-4**：`astrology-qa.tsx` 消息列表加 `role="log"`/aria-live、:161 `aria-expanded` 硬编码改动态；表单错误 `aria-invalid`/`aria-describedby` 关联（`astrology-form-step1.tsx:47-64`、`astrology-form-step2.tsx:431`）。
- **域8 P3**：`astrology-qa.tsx:83-93` setTimeout 加清理；`astrology-result-view.tsx:370-373` 与 `astrology-ritual.tsx:161-163` 的滚动复位去重。
- **最终验收**：tsc 无新增错误 + eslint 改动文件干净 + dev server（localhost:3030）浏览器复测引导页/结果页浅色模式 + 重跑 `npx impeccable detect` 与同 slug critique 出趋势对比。

## 环境事实（避免重复踩坑）

- **子代理模型用 `kimi-code/k3-256k`**；opencode-go/* 已不可用（用户明确）。
- **存量 typecheck 错误 5 个**：`src/components/layout/`（apps-modal.tsx:397、global-sidebar.tsx:196、mobile-app-drawer.tsx:123），与本次修复无关——验收标准是「无新增」，不是「全绿」。
- 暗色主题对比度合格，问题只在浅色；`text-slate-400` 文字用途已清零（仅剩 result-view:195 的 dark 侧与 stroke 装饰，均合规）。
- 浏览器工具触摸仿真通道点击不生效（工具限制）；移动端真机触摸交互是已知盲区，本轮验收不要求。
- 项目规范：全程中文、注释中文、最小改动、移动端 44×44 热区、改 UI 同步 DESIGN.md。

## Suggested skills

- `/implement` —— 继续执行域3 收尾与域4-8（本契约即 spec）。
- `/code-review` —— 全部域完成后，对 `daedd97..HEAD` 范围做双轴审查。
- `/diagnosing-bugs` —— 浏览器复测或 critique 趋势对比发现回归时启用。
- `/grilling` —— 仅当需要变更已拍板契约（如 P1-4 的 demand 策略）时再开。

---

# 完成状态（2026-09-18 收尾 · 本任务已结项）

## 提交清单（`daedd97` → `0582e38`）

| 域 | Commit | 内容 |
|---|---|---|
| 基线 | `daedd97`、`a915c19`、`114cfe7` | 既有 WIP（WebGL 场景）+ 排查报告与快照 + 本交接文档 |
| 1 | `f39363b` | 文案诚实性（P1-1 / P1-2 / P2-5） |
| 2 | `e8063a9` | `day-muted` 对比度令牌（P1-3，47 处 + DESIGN.md 回写） |
| 3 | `74f2d17` | 主 CTA 渐变收敛为共享组件（P2-2）。**收尾时发现半成品遗留**：`astrology-form.tsx` 开标签改了闭合标签没改，JSX 不配对（tsc 报 TS17002），已修 |
| 4 | `ded282c` | 引导页一次一事：CTA 提到价值卡前 + 探索胶囊降级为示例盘被动标注（P2-1） |
| 5 | `f19bb91` | 性能三包：`FrameloopGovernor` 停帧 / SizeGuard 有界心跳 / `TypewriterHeadline`（P1-4） |
| 6 | `d32ef62` | 触控热区 44px：事实卡星体切换、问答引用片、模块事实片（P2-3） |
| 7 | `8f3300c` | 无障碍：`role="log"`、动态 `aria-expanded`、错误与输入关联（P2-4） |
| 8 | `c75429c` | P3 两项：问答 setTimeout 卸载清理、滚动复位去重 |
| 复评整改 | `ed3ed47` | 独立复评发现的三处同型/新增缺口（见下） |
| 复评快照 | `0582e38` | `.impeccable/critique/2026-09-17T18-19-43Z__…md` |

## 验收证据（全部实测，非推断）

- **类型/规范**：`pnpm --filter @repo/web exec tsc --noEmit` 仅剩 5 条存量错误（全在 `src/components/layout/`）；本轮改动文件 eslint 全量零输出。
- **E2E**：`apps/web/e2e/constellation-universe.spec.ts` 3 用例 × 桌面/移动两视口 **8/8 通过**（含首页冒烟）。
- **浏览器探针**（dev server :3030，无头 Chromium）：
  - P2-1：桌面 CTA y=421 < 价值卡 y=505；「示例星盘 · 可点选星体体验」为 `span`（按钮数 0）。
  - P1-4：`window.__orrery` 可见时逐帧刷新（gy 0.0996→0.0839）→ 切到八字工作区后**冻结**（0.078218 两次相同）→ 切回星座**恢复**（0.0271→0.0149）；打字机落定后「依据」chips 出现。
  - P2-3：事实卡星体切换 10/10 实测 **44×44**；关联模块跳链 71×44；360/390/1440 三视口文档零横向溢出。
  - P2-4：问答消息区 `role="log"[aria-live="polite"]` 存在；可点引用片 44px、纯标签紧凑。
  - 浅色 + 暗色截图存档：`.impeccable/astro-verify-*.png`（gitignore）。
- **检测器**：`npx impeccable detect` 源码扫描 astrology 目录 **0 发现**（exit 0）；URL 渲染态桌面 79 / 移动 73（基线 78/73，无回退）。`?tab=astrology` 是**本轮首次**纳入扫描的 URL，多出的 5 条 `text-occlusion` 位于未改动的 SVG 星盘（编号/角点标签被同层 SVG 覆盖），属既有实现。
- **独立复评 critique**（`.impeccable/critique/2026-09-17T18-19-43Z__…md`）：Design **26/32 → 28/32**，技术 **14/20 → 18/20**（性能 2→4、主题化 3→4、实现完整性 3→4），**剩余 P1 = 0**；基线 13 条问题里 11 条判「已解决」、P1-3 判「部分解决」、P2-6 判「按契约未做」。

## 独立复评提出的新问题与处置

| 编号 | 级别 | 处置 |
|---|---|---|
| N1 关联生活模块跳链仍 `min-h-7`（同型切片只补一半） | P2 | ✅ `ed3ed47` 补到 44px |
| N2 问答引用片把 44px 也给不可点标签（域6 引入的密度回退） | P3 | ✅ `ed3ed47` 收回到只给可点按钮 |
| N3 44px 后移动端星体横排可发现性下降 | P2 | ✅ `ed3ed47` 移动上限 190→226px（≈5 颗 + 露头），桌面保持 280px |
| N4 `aria-controls` 收起态悬空 | P3 | ✅ `ed3ed47` 改为仅展开态渲染 |
| N5 `#64748B` 对白 4.76:1 ✅ / 对页面底色 `#f5f7fa` 4.43:1 ⚠️ | P2 | ⬜ **未改**：契约钉死 `#64748B`，需用户拍板（见下） |
| N6 设计文档仍写「解读由 AI 生成」 | P3 | ⬜ **未改**：属产品意图问题（文档描述目标态还是当前态），留给用户 |
| N7 三要素卡入场门控类名被 framer-motion 内联样式压过 | 存量 | ⬜ 记录在案（`daedd97` 同构，非本轮引入） |
| N8 framer-motion 控制台噪声 100+ 条/流程 | 存量 | ⬜ 记录在案 |
| N9 `FrameloopGovernor` 依赖 R3F `internal.frames` 等内部字段 | 存量 | ⬜ 已按 9.7.0 源码逐条核对，**升级 R3F 需重验** |
| N10 残留亚 44px：事实卡关闭 32、桌面「全部星体」32、问答发送 40、分享分段 36（注释却称「≥44px」） | 存量 | ⬜ 记录在案，未纳入本轮 |

## 明确未做（按已拍板契约）

- **P2-6 主轴视觉重量**（`clamp(40px,4vw,56px)` 仍大于引导页 52px；琥珀金仍按第一个逗号切分；段落 `mt-12` 未收紧）。
- **P3 其余三项**：mock 解读文案模板重复、SVG 星体焦点反馈仅 1.15 倍缩放、分享卡底栏 8-10px 免责文字。

## 建议下一步（按优先级）

1. **P2-6 主轴视觉重量**——唯一未被触碰的 P2；需要 mock 解读库显式标注 4-8 字关键词，而不是排版层猜逗号。
2. **对比度收口**（若要严格过 AA）：`day-muted` 由 `#64748B` 调到 ≈`#5B6472`（`#f5f7fa` 上 5.6:1，白底 6.0:1），同步 DESIGN.md §2.6 与 tailwind.config.ts `colors.day`。当前 4.43:1 只差 0.07，视觉几乎无差。
3. **设计文档口径**：`docs/designs/2026-07-26-constellation-universe-design.md` 中「解读由 AI 生成」与 UI「解读基于星盘事实生成」二选一对齐。
4. 存量亚 44px 清单（N10）一次性收口；顺手改掉 `astrology-share-entry.tsx` 上方那句与实现不符的「热区 ≥44px」注释。
5. 真机触摸 / 安全区 / 读屏实听——本轮与基线一致的盲区，未因本轮改动扩大。
