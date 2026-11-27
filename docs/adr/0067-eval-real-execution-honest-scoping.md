# 0067. 评测真实执行以「止血 + 骨架」收口，未评分用例与事实来源显式化

* **状态**：已接受
* **日期**：2026-11-26
* **范围**：`tooling/eval/`、`packages/shared/src/eval/`、`GLOSSARY.md`「评测基准与观测」章节；不触及 `apps/web` 生产 `/chat` 运行时链路
* **相关**：ADR-0063、`docs/plans/architecture-optimization-checklist-20261126.md` 候选 01 / OPT-0 / OPT-1 / OPT-3、`GLOSSARY.md`

---

## 背景

2026-11-26 的架构核验（`architecture-optimization-checklist-20261126.md:36`）确认：`runRealAgentBenchmark` 全程使用 `generateMockTraceEvents` + 随机时延/Token（`tooling/eval/runner.ts:426`、`:429-430`），并在 `persistToDb && DATABASE_URL` 时把该模拟结果写入 `AgentEvalRun` / `AgentEvalCaseResult`，落库侧标记 `usageEstimated:false`（`runner.ts:479-518`、`:501`），同时在返回摘要中标记 `isDryRun:false`（`:530`）。`isDryRun` 只是返回摘要字段，Prisma `AgentEvalRun` 并无此列；落库数据本身也没有任何「这是模拟」的标记。即 `--smoke --confirm-real-run` / `--full` / ablation 真实档落库的全是随机模拟数据，这不是「真实执行未落地」，而是评测数据可信度问题。

进一步核对发现 ADR-0063 §3（`docs/adr/0063-agent-eval-benchmark-architecture.md:42-46`，沙箱种子 + `EVAL_BENCHMARK_KB` + 隔离评测租户）**从未落地**：全仓无 seed 实现，`packages/shared/src/eval/corpus.ts:11` 的 `EVAL_SANDBOX_TENANT_ID` 仅剩常量、无消费者。生产 SSE 的 `ChatStreamEvent` 联合（`packages/shared/src/chat-stream-contract.ts:270`）也不含裁决所需的 `chunks_retrieved` / `ssrf_blocked`，`tool_approval_request` / `plan_created` / `tool_call` 还存在字段名与形状差异，而 `gradeCaseResult`（`packages/shared/src/eval/grading.ts:3`）只吃 `TraceEvent`。此外 `AgentEvalCaseResult.passed/score` 为非空字段、`AgentEvalRun` 既无 `isDryRun` 也无 `scoredCases/unscoredCases` / 评分状态列（`packages/db/prisma/schema.prisma:812-860`），现有持久化结构无法表达「未评分」。

2026-11-26 经 `/grill-with-docs` 七轮拷问逐项澄清业务边界与真实取舍，达成以下共识，特制定本决策。

---

## 决策（七轮共识）

1. **边界 = 止血 + 骨架，不宣称端到端真实**。候选 01 本轮只交付 fail-closed 与接缝：真实适配器就绪前，禁止把 `generateMockTraceEvents` 结果当作真实观测、禁止把模拟结果落库为真实档；抽出 `CaseExecutor` 接缝，`DryRunReplayAdapter` 保留现有模拟轨迹为 dry-run 唯一事件源，`RealAgentAdapter` 真实调用与线上同一 `runAgent`；明确承认部分裁决事实在生产流无观测点。OPT-0 测试门禁先行，OPT-3 看板诚实化独立交付。不把「接缝完成」表述成「40 题真实评测已完成」。
2. **本轮 real 档一律不写数据库**。real 档只输出真实执行摘要与报告（CLI / Markdown），不写 `AgentEvalRun` / `AgentEvalCaseResult`；待独立专项补齐持久化契约（评分状态、缺失事实、已评分/未评分数量、事实来源层级、`isDryRun` 等列与迁移）后再开放落库。理由是现有非空 `passed/score` 无法表达「未评分」，硬落库必然把观测缺口写成 `passed:false`（假阴性）。real 档不落库不阻碍 OPT-3：看板诚实空态本就独立，且明确「真数据落地后自然填充」（`architecture-optimization-checklist-20261126.md:155`）。
3. **引入「未评分」显式态，并预声明观测能力矩阵**。`CaseResult` / 裁决层增加「不可裁决 / 观测缺口 / 执行错误」区分；根据用例 `expected` 推导所需裁决事实，再与 adapter **预先声明**的可观测能力比对，据以下三态判定，**不得事后发现事件不存在即免评分**（否则模型不调用工具也能借「没有事件」逃避失败）：
   - 执行成功、但所需事实超出观测能力 → **未评分**，不进 `passedCases` / `passRate` 分母，摘要写明所缺事实；
   - 所需事实在能力范围内、实际执行未产生满足断言的事实 → **未通过**；
   - 超时 / 异常 / 中止 → **执行错误**，单独统计，不混同前两态。
   看板分列「已评分 / 未评分 / 执行错误」。绝不从最终回答文本反推并合成 `chunks_retrieved` / `ssrf_blocked` / `approval_intercepted`——那只是换一种假数据。
4. **执行器出口分「裁决事实」与「计量事实」，并显式标注来源**。`CaseExecutor` 出口分两部分：裁决事实（`TraceEvent[]` + `missingFacts`）与计量事实（`usage` / `latencyMs` / `usageEstimated` / `provenance`）。真实适配器同时捕获流与 `onFinish: ChatStreamFinish`（`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts:321-346`）；`usageEstimated` 由是否拿到真实 usage 决定。禁止把 SSE 的 `done.usage` 当成真实多步总用量，禁止把 dry-run 的常量 + 随机标成 `usageEstimated:false`。`gradeCaseResult` 保持纯函数。能力矩阵须覆盖的已知语义损耗：`plan_created` 初始快照须与后续 `plan_step_update` 折叠成终态，不能用初始快照冒充终态；`done` / `agent_note` 不等于 `final_answer`，无正文的 `empty_finish` 按实际断言判负而非未评分；SSRF 题即使工具返回 `failed` 也不得反推为 `ssrf_blocked`；数据集 `expectedToolName` 用 `knowledgeSearch` / `webFetch` 等驼峰名，而生产注册表为 `knowledge_search` / `web_fetch`（`apps/web/src/app/api/chat/_lib/agent/tools/`），命名归一须进入能力矩阵与 Spec 验收项。
5. **删除布尔开关，改为显式依赖注入**。删除死字段 `mockExecutionSeam`（`runner.ts:401` 仅声明、函数体从未读取），改为向 `runRealAgentBenchmark` 注入 `CaseExecutor` adapter；测试注入 Replay/Stub 验证编排（fail-closed、未评分门控、provenance、`usageEstimated`），重写 `tooling/eval/__tests__/real-runner.test.ts:60-77` 中「`confirmRealRun:true` 却断言 `isDryRun:false` 且 `passed` 来自模拟轨迹」的错误契约。任何注入 replay 的用例，`isDryRun` 必须按注入来源如实标注。
6. **观测缺口接受为本轮显式终态，补点列为独立专项**。已知**至少 10 题**因生产流缺 `chunks_retrieved`（RAG 7 题）或 `ssrf_blocked`（SSRF 3 题）不可评分；其余 30 题**尚未证明**都能真实评分（见决策 4 的命名与语义损耗），故不承诺「已评分 30 / 未评分 10」的确定数字。real 档诚实呈现「已知至少 10 题不可评分 + 其余题按能力矩阵实际判定」；补观测点 + 建沙箱种子列为独立专项。本轮不动生产 `/chat` 链路、不改 `chat-stream-contract.ts`、不动 `chat-projectors.ts`。
7. **领域术语结晶**。`GLOSSARY.md` 新增 `UnscoredCase`（明确排除执行错误、须按预声明能力矩阵判定）/ `OrchestrationLevelExecution` / `EvalFactProvenance`，修订 `AgentEvalRun` 的通过率分母语义与「观测能力不足时只出报告不落库」；`CaseExecutor`、`RealAgentAdapter`、`provenance`、`missingFacts`、`mockExecutionSeam` 等实现概念一律不进字典。

---

## 取代的既有决策与依据

| 原决策 | 证据路径 | 本 ADR 取代为 | 依据 |
|---|---|---|---|
| real 档立即产出端到端真实结果；`--full` 全量 40 题产出最终大盘数据 | `docs/adr/0063-agent-eval-benchmark-architecture.md:63-68`（§5） | 收紧为「全量执行、按能力矩阵部分可评分」；真实适配器就绪前 fail-closed，且本轮 real 档不写 DB | 源码证明 real 档全程模拟轨迹且以 `usageEstimated:false` 落库、返回摘要标 `isDryRun:false`（`runner.ts:426` / `:429-430` / `:479-518` / `:501` / `:530`） |
| 客观硬断言为第一公民，每题被判 0/1 | `docs/adr/0063-agent-eval-benchmark-architecture.md:30-40`（§2） | 增加「未评分 / 执行错误」态，通过率分母改为「已评分题」；未评分须由预声明能力矩阵判定 | 生产 SSE 无 `chunks_retrieved` / `ssrf_blocked`（`chat-stream-contract.ts:270`），沿用原裁决会把观测缺口系统性记成模型失败（假阴性）；现有 `passed/score` 非空列无法表达第三态 |
| real 档执行结果落库为 `AgentEvalRun` / `AgentEvalCaseResult` 以驱动看板 | `docs/adr/0063-agent-eval-benchmark-architecture.md:23-28`（§1，CLI 驱动落盘 + 只读看板） | 本轮 real 档只出报告摘要、不落库；落库能力待持久化契约专项补齐后恢复 | `schema.prisma:812-860` 无非空 `passed/score` 之外的评分状态列、无 `scoredCases` / `isDryRun`，本轮不引入迁移 |
| `mockExecutionSeam` 布尔开关在测试中让 real 档产出「看起来真实」的结果 | `architecture-optimization-checklist-20261126.md:166`（OPT-1 第 4 项）、`real-runner.test.ts:60-77` | 删除该字段、改 adapter 注入，测试重写 | 字段在 `runner.ts` 函数体从未被读取；现有测试用它断言 `isDryRun:false`，等于给漏洞背书 |
| 隐含口径「real 档 = 完整生产端到端」 | 隐含，无成文 | 明确定义为「编排级真实执行」：真实调用编排器与模型，绕过 HTTP 入口、认证、配额预留/结算与 ChatCompletionLifecycle | `runAgent` 是编排器而非路由层；已有同类复用先例 `apps/web/src/eval/artifact-patch/runner.ts:39` |
| 清单 OPT-1 验收口径「real 路径不出现 `generateMockTraceEvents`；落库补齐字段」 | `architecture-optimization-checklist-20261126.md:167-170`（OPT-1 验收 / 边界） | 验收改为：real 档 fail-closed、不落库、未评分三态来自能力矩阵、provenance 可断言；「落库补齐 `commitHash` / `configSnapshot`」移出本轮（属 OPT-4 与持久化专项） | 本轮既已决定 real 不落库，落库字段补齐失去落点；强行保留会与决策 2 冲突 |

**既有决策落地状态澄清（非取代）**：ADR-0063 §3 的沙箱种子 / `EVAL_BENCHMARK_KB` / 隔离评测租户全仓无实现，本轮明确记录为「尚未落地、不宣称完成」，不改 ADR-0063 原文；ADR-0063 §2 的 `DeterministicGrading` 已落地且保持纯函数，清单 `:231` 的 ADR 引用据此校正。

---

## 代价与非目标

- 代价：real 档本轮不产生任何持久化数据（无历史趋势、看板无真数据，报告仅在本次进程/CLI 输出可见）；`packages/shared/src/eval/types.ts` 与 `grading.ts` 契约、`tooling/eval` 运行器、`cli.ts` / `ablation.ts` 两调用点、测试门禁（根 `package.json` / vitest 配置）与 `real-runner.test.ts` 均在改动面内；`AgentEvalSuite` 的 ablation 真实档同样受「不落库」约束；看板须能表达「部分评分 / 未评分 / 执行错误」而非只有通过率。持久化契约（评分状态列、`scoredCases` / `unscoredCases`、`isDryRun`、事实来源层级）与迁移一并留到独立专项。
- 非目标：不建沙箱种子、不补生产 SSE 事件类型、不改 `chat-stream-contract.ts`、不碰生产 `/chat` 运行时链路、不从文本反推合成裁决事件、不在本轮宣称 40 题评测有效性提升、**不在本轮把 real 档结果写入数据库**、不做 Prisma 迁移。
- 安全题红线：审批拦截与 SSRF 用例不得用自动审批或放宽安全策略来制造通过。

## 效果证据口径

本决策**不声称任何质量、性能或评测有效性收益**；所有理由按机制描述记入共识（先停止「随机模拟值被当真实观测落库/导出」、再让事实来源可复核、缺口显式化）。若日后主张「补观测点或真实执行提升了评测有效性」，需另做可复现的对照评测作为效果证据，本 ADR 不将其写成已证实的收益。
