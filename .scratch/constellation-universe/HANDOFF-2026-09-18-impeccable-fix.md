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
