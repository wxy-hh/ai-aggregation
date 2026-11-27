# 架构审查核验与优化清单（2026-11-26）

> 来源：`docs/plans/architecture-review-20261126-194515.html`（针对 `/chat` 与 `/admin/eval` 的架构审查报告，共 6 个候选 + 2 个补充区）。
> 本文件做两件事：**逐项核验报告断言在当前代码里是否真实存在**（含报告表述偏差的修正），并给出**可执行的 md 优化清单**。
> 核验方式：只读对照源码（CodeGraph + 定点 Read），未修改任何生产代码；核验基准为 `master_newjob` 分支当前工作树，日期 2026-11-26。

---

## 一、核验结论速览

| # | 候选 | 问题是否真实存在 | 证据强度 | 报告表述是否需要修正 |
|---|---|---|---|---|
| 01 | 建立真实的 Case Executor | **存在，且最严重** | 源码直接命中 | 无需修正（可补充：`mockExecutionSeam` 字段与生产侧接缝已预留） |
| 02 | 统一实时流与 Attach 的事件应用 | **存在** | 源码直接命中 | **需修正**：重复的是「编排/调度/收尾」这一层，领域投影规则本就共享，并非两套领域规则 |
| 03 | Eval Dashboard Projection 只呈现事实 | **存在，且与 01 同源** | 源码直接命中，数字一一对应 | 无需修正（可补充：这是「演示数据冒充观测」的诚信问题，非单纯架构问题） |
| 04 | Ablation Suite Contract 驱动执行与证据 | **存在** | 源码直接命中 | 无需修正（可补充：生产 Agent 已有 `disableEvaluator` 接缝，缺的是评测侧透传） |
| 05 | 收拢 AgentPlan 的终态收敛 | **存在** | 源码直接命中（含死写入确认） | **需修正**：「刷新恢复使收敛无法生效」的因果不准，实际是两条恢复路径收敛行为不一致 |
| 06 | LiveRun 消费语义终态 | **存在，优先级最低** | 源码直接命中 | 无需修正（报告标 `Worth exploring`，定级恰当） |
| 附 A | 验证盲区（测试未进标准命令） | **存在** | 配置逐一核对 | 无需修正 |
| 附 B | 明确排除（不按文件大小重构） | 属审查者判断 | 仅核对 ADR 存在性 | 未独立核验其 interface/测试 depth 结论 |

**总体判断：6 个候选 + 验证盲区的事实断言全部成立**，报告质量高、行号大体准确。需要修正的是 3 处机制/因果表述（见第五节），以及「Top recommendation 排序」的一处逻辑缝隙（见第六节）。

---

## 二、逐项核验证据

### 候选 01 · 真实的 Case Executor —— 成立

| 报告断言 | 核验结果 |
|---|---|
| `runRealAgentBenchmark` 在 `runner.ts:426` 仍生成模拟轨迹 | ✅ `tooling/eval/runner.ts:426` = `const traceEvents = generateMockTraceEvents(testCase);` |
| 在 `:429-430` 随机生成时延与 Token | ✅ `:429-430` = `2000 + Math.random()*500` / `1500 + Math.random()*300` |
| 真实执行 interface 存在、implementation 与 dry-run 相同 | ✅ `generateMockTraceEvents` 仅 2 个调用者，正是 `runDryRunBenchmark` 与 `runRealAgentBenchmark`；`RealAgentBenchmarkOptions` 里还留有未使用的 `mockExecutionSeam?: boolean`（`runner.ts:401`） |

**比报告更严重的点**：`runner.ts:479-518` 在 `persistToDb && DATABASE_URL` 时把上述模拟结果写入 `AgentEvalRun` / `AgentEvalCaseResult`，且 `usageEstimated: false`、`isDryRun: false`。也就是说 `--smoke --confirm-real-run`、`--full`、`ablation` 真实档落库的**全是随机模拟数据，却被标记为非 dry-run 的真实观测**。这不只是「真实执行部分未落地」，而是评测数据可信度问题。

`tooling/eval/cli.ts:56-77` 的 smoke 分支、`tooling/eval/ablation.ts:120-128` 的真实分支都走这条路径。ADR-0063 §1（CLI 驱动落盘 + 只读看板）、§5（三档运行模式）的骨架已在，缺的正是 real 档的真实执行实现。

---

### 候选 02 · 统一事件应用 —— 成立，但性质需精确化

| 报告断言 | 核验结果 |
|---|---|
| Attach 重写事件应用 | ⚠️ 部分成立：`apps/web/src/stores/chat-store.ts:1097-1155` 重写的是**回调编排层**，但其调用的 `projectToolCall` / `projectToolResult` / `projectPlanStepUpdate` 等与实时路径是**同一套** `chat-projectors.ts` 纯函数 |
| 每个正文帧立即落盘 | ✅ `attachAgentRun` 的 `onChunk`（`:1097-1100`）经 `updateAssistant`（`:1034-1040`）内部直接 `persist(next)`；对比实时路径 `runChatStreamSession`（`:412-438`）用 rAF 合帧 + 1s 节流落盘 |
| `finalize` 不复用工具归一、推理计时、终态投影 | ✅ Attach 的 `finalize`（`:1053-1064`）只 patch `isStreaming/runPending/reconnecting*` 等标记；实时路径完成走 `projectFinalizeStreamingMessage`（`:540-552`），内含 `sanitizeToolCalls`（工具归一）、`freezeReasoningDuration`（推理计时）、`finalizePlanExecution(plan,'completed')`（终态投影）、`usage` 落盘 |

**性质修正**：报告的 Deletion test 说「删除任一副本都不会删除领域规则，规则仍留在另一副本」——这与事实不符，因为领域规则（纯投影器）本来就只有一份、已共享。真正有两份的是 **glue 层**：刷新调度（rAF/节流 vs 每帧）、落盘时机、完成/失败/中止的收尾投影、Usage/Plan/ToolCalls 的收敛。因此优化目标应表述为「统一**事件应用编排**（调度 + 收尾）」，而非「统一领域事件应用」。这不改变问题成立，但决定改动范围（改 `chat-store.ts` 两处编排，不动 `chat-projectors.ts`）。

---

### 候选 03 · 看板只呈现事实 —— 成立，两层独立造假

**route 层**（`apps/web/src/app/api/admin/eval/reports/route.ts`）：
- `:77-87` 无 `latestRun` 时回退 `40 题 / 35 通过 / 87.5% / 2445ms / ¥0.126`；
- `:112-145` 无横评数据时构造 3 个模型（deepseek/doubao/spark）；
- `:148-201` 无失败用例时构造 5 条示例负结果；
- `:220-247` 无消融数据时构造 `suite-default-reference` 预设矩阵。

**page 层**（`apps/web/src/app/admin/eval/page.tsx`）：
- `:79-229` 定义 `DEFAULT_FAILED_CASES` / `DEFAULT_ABLATION_RUNS` / `DEFAULT_MODEL_COMPARISON`；
- `:238-240` 三个 state 的**初始值就是示例数据**（未请求先展示）；
- `:253-271` 接口返回空数组时再次回填 `DEFAULT_*`；
- `:273-276` `catch` 里 `setFailedCases(DEFAULT_FAILED_CASES)` —— 报告说的「请求失败仍显示示例失败轨迹」✅；
- `:300-323` 导出标题为 `# Agent & RAG 评测基准报告 (官方全量导出)`，内容用的正是上述 state，可把示例导出成「官方全量」✅。

`apps/web/src/app/api/admin/eval/reports/route.test.ts` 确实存在（5433 字节），报告引用有效。

**关键**：route 与 page 的示例回填是**两个独立 module**，只删一处另一处仍造假 —— 报告的 Deletion test 成立。这与候选 01 同源：评测链路从「生成」到「呈现」全链路不可信。

---

### 候选 04 · Ablation Suite Contract —— 成立

| 报告断言 | 核验结果 |
|---|---|
| `ablation.ts:120-128` 未把实验开关传入执行 | ✅ 真实档只传 `mode/confirmRealRun/modelProvider/modelId/suiteId/experimentLabel/persistToDb`，三个 `configSnapshot` 开关一个都没传 |
| dry-run 用偏置常量制造差异 | ✅ `ablation.ts:74-97` 的 `latencyDelta: -180 / -650`、`passRateBias: -0.05 / -0.125`，在 `:105-118` 直接改 `passedCases / passRate / avgLatencyMs` |
| 真实运行只在结果对象上补标签 | ✅ `:131-138` 把 `configSnapshot` 贴在返回对象上；`runner.ts:492-495` 落库的 `configSnapshot` 只有 `{ mode, judgeModel }` |
| commit 与语料证据未进持久记录 | ✅ `schema.prisma:820-821` 有 `commitHash` / `isDirty` 字段，但 `runner.ts:482-517` 的 `create` **未写入**；`ablation.ts:55-59` 已做语料指纹强校验，但 `corpusFingerprintValid` 也不入库 |

**可补充的有利条件**：`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts:130-131` 的 `AgentRunOptions` 已有 `disableEvaluator?: boolean`（注释明写「消融实验变量切缝」）。即生产 Agent 侧的变量接缝已存在，缺的是**评测 runner → Agent 执行的透传链路**，不必从零造开关。

---

### 候选 05 · AgentPlan 终态收敛 —— 成立，因果需修正

| 报告断言 | 核验结果 |
|---|---|
| 成功路径广播收敛事件 | ✅ `agent-runner.ts:1009-1030` 遍历 `running/pending` 步骤，`emitStepUpdate`（`:361-375`）同时改 `currentPlan` 并 `enqueue(plan_step_update)` 广播 |
| 异常路径只修改服务端局部变量 | ✅ `:1087-1089` 仅 `currentPlan = finalizePlanExecution(...)`；其后 `:1099` 的 `buildFinishPayload`（定义 `:321-346`）不读 `currentPlan`，异常分支内无 `emitStepUpdate`、无 `plan_step_update` 广播 —— **确认为死写入**，报告的 Deletion test 成立 |
| 四种解释 | ✅ 成功广播 / 异常死写入 / `loadConversation` 客户端收敛 / `conversation-orchestrator` 不收敛，共 4 处不一致 |

**因果修正**：报告称「刷新恢复先把 `isStreaming` 置 false，使后续按该字段触发的计划收敛无法生效」。实际代码是**两条恢复路径行为不一致**：
- `apps/web/src/stores/chat-store.ts:962-979`（`loadConversation`）：对 `m.isStreaming` 消息**已执行** `finalizePlanExecution(m.plan,'aborted')`，再置 `isStreaming:false`；
- `apps/web/src/stores/conversation-orchestrator.ts:240-258`（`restoreHydratedMessages`）：只置 `isStreaming:false / stopped:true / runPending:true`，**完全没有 plan 收敛**。

所以问题不是「收敛被 false 阻断」，而是**其中一条恢复路径根本没有收敛逻辑**，导致 running Checkpoint 可能继续 `animate-spin`。修法应统一到「运行终态事实 × Checkpoint 状态」的唯一收敛函数，并让两条恢复路径都调用它。

---

### 候选 06 · LiveRun 语义终态 —— 成立，优先级最低

- `apps/web/src/app/api/chat/_lib/agent/run-stream.ts:16-35` `terminalTypeOfFrame` 反解 `data:` JSON 中的 `done/error`；`:38-50` `consumeTerminal` 做跨 chunk 缓冲；`:57-96` `pumpRunStream` 在 finally 里据此 `run.finalize(status)`；
- 同一反解在 `:145-148`（实时订阅回调）、`:165-171`（历史帧重放）**又各做一次** ✅ 报告说的「订阅实现又按 chunk 解析一次」成立；
- 词汇不一致：`run-registry.ts:40` 的 `LiveRunStatus` 是 4 态（`running/completed/aborted/failed`），而 `run-stream.ts:13` 的 `TerminalStatus` 只有 `completed/failed`，`aborted` 靠 `:90` 的 `controller.signal.aborted` 另推 ✅；
- 语义终态在 AgentRunner 已存在：`agent-runner.ts:1041-1046` 的 `onFinish(buildFinishPayload({outcome}))` 用于结算/审计，但没有传给 LiveRun ✅。

改动方向（由 AgentRunner 声明唯一终态事实）与 ADR-0061 §6「中止与结算恰好一次」同向，且不触碰 ADR-0061 §2「进程内存唯一真源、不引入 Redis/seq」—— 报告边界说明正确。定级 `Worth exploring` 恰当：属重构收敛，非缺陷。

---

### 附加区 A · 验证盲区 —— 成立，且应作为前置门禁

逐一核对：
- `apps/web/vitest.config.ts:11` `include: ['**/*.{test,spec}.{...}']`，工作目录为 `apps/web`，不会向上收集 `../../tooling/eval/__tests__`；
- `packages/shared/vitest.config.ts:5` `include: ['src/**/*.{test,spec}.ts']`，只收 `packages/shared/src`；
- 根 `package.json:29` `"test:eval": "pnpm --filter @repo/web test:eval"` → `apps/web/package.json:13` `"test:eval": "vitest --run src/eval/"`，指向 `apps/web/src/eval/`（artifact-patch 旧评测目录）；
- `tooling/` 无独立 `package.json`，不是 pnpm workspace package，`turbo.json` 的 `test` 任务不会覆盖它。

结果：`tooling/eval/__tests__/` 下的 `runner.test.ts`、`real-runner.test.ts`、`ablation.test.ts`、`legacy-eval.test.ts` **4 个测试没有任何标准命令会执行**。在动候选 01/04 之前先补门禁，是必要的（否则改了运行器却无回归网）。

### 附加区 B · 明确排除

ADR-0045、ADR-0046 文件均存在。该区是审查者的架构判断（「已有清晰 interface 与测试 depth」「主要是展示实现」「仍是唯一协调 seam」），本轮**未独立核验** `ChatCompletionLifecycle` / `ChatWorkspace` 的 interface 与测试覆盖，故不否决也不背书，建议保留为观察项。另：报告使用的 `ChatStreamProjector` 名称在代码中对应 `chat-projectors.ts` 的一组纯函数，并无同名单一类，属用词与代码不完全对应，不影响结论。

---

## 三、优化清单（按优先级）

> 排序原则：**先做减法、先阻断误导、先建回归网，再补能力**。与报告「先 01」的排序有分歧，理由见第六节。

### P0 · 第一批（低成本、阻断误导、建立门禁）

#### OPT-0 · 让评测运行器测试进入标准命令
- **对应**：附加区 A（验证盲区）
- **现状**：`tooling/eval/__tests__/` 4 个测试不被任何 `test` / `test:eval` 收集
- **改动**：新增最小 vitest 配置（或根级 `vitest.config.ts` 的 project 条目）收集 `tooling/eval/__tests__/`；在根 `package.json` 增加一条 `test:eval:runner` 并让 `test:eval` 串联，或直接纳入 `test`。**优先复用现有 vitest 依赖，不新增包**
- **验收**：`pnpm test:eval` 输出包含 `runner.test.ts` / `real-runner.test.ts` / `ablation.test.ts` 且通过；故意改坏 `generateMockTraceEvents` 能使测试变红
- **依赖**：无，是 OPT-1 / OPT-4 的前置

#### OPT-3 · 看板诚实化（删除示例回填 + 显式空态）
- **对应**：候选 03
- **现状**：route 4 处 + page 3 组 `DEFAULT_*` / catch 回填，导出 titled「官方全量」
- **改动**：
  1. 删除 `route.ts:77-87 / 112-145 / 148-201 / 220-247` 的四处示例构造，空集合返回 `null` / `[]` / 空投影；
  2. 删除 `page.tsx:79-229` 三处 `DEFAULT_*` 常量与 `:238-240` 的示例初值，空态渲染明确的「暂无评测数据」；
  3. `:253-271` 的空数组回填、`:273-276` catch 里的 `DEFAULT_FAILED_CASES` 一并删除；
  4. `:300-323` 导出标题去掉「官方全量」，并在报告头写入数据来源（suiteId / createdAt / 运行模式）与「无数据」标记；`summary` 为 null 时禁用导出按钮；
  5. 把汇总/横评/失败用例/消融矩阵/空状态语义收拢到一个纯只读投影函数（可置于 `apps/web/src/app/api/admin/eval/reports/` 邻近模块），route 与 page 只消费同一视图事实
- **验收**：空数据库下页面四区域均显示空态、无 `0.875`/`2445` 等数字；请求 500 时不出现示例失败轨迹；无数据时不产生导出文件；扩充 `route.test.ts` 覆盖「无数据库 = 诚实空态」
- **边界**：不冲突 ADR-0063 §1（仍是只读看板，不在 HTTP route 内执行评测）
- **依赖**：**不依赖 OPT-1**（先诚实显示空，真数据落地后自然填充）

### P1 · 核心能力主线（最大工作量）

#### OPT-1 · 真实的 Case Executor
- **对应**：候选 01（报告 Top recommendation）
- **现状**：`runner.ts:404-545` 真实档全程 `generateMockTraceEvents` + 随机时延/Token，并落库标记为非 dry-run
- **改动**：
  1. 抽出 `CaseExecutor` 接缝：`executeCase(testCase, adapter) → { traceEvents, usage, latencyMs }`；
  2. 两个 adapter：`DryRunReplayAdapter`（回放固定轨迹，保留现有 `generateMockTraceEvents` 作为**唯一**事件源）、`RealAgentAdapter`（调用真实 Agent 运行，事件投影为 `TraceEvent[]`，用量与时延取真实事实）；
  3. `runRealAgentBenchmark` 改走 `RealAgentAdapter`，删除 `:429-430` 的 `Math.random()`；`usageEstimated` 依据 adapter 是否拿到真实 usage 决定；
  4. `mockExecutionSeam`（`runner.ts:401`）与 `cli.ts` 三档参数对齐；`DeterministicGrading`（`gradeCaseResult`）保持纯函数不变；
  5. **在没有真实 adapter 可用前，先把 `--confirm-real-run` 落库路径标注为 `isDryRun: true` / 阻断落库**，避免继续产生「标记为真实的假数据」
- **验收**：同一 `BenchmarkCase` 在 dry-run 与 real 两条路径产生不同 `traceEvents` 来源；real 路径不出现 `generateMockTraceEvents`；`real-runner.test.ts`（经 OPT-0 收集）断言真实 adapter 被注入、用量来自执行事实
- **边界**：不冲突 ADR-0063 §2/§5/§6；保留 CLI 执行与只读看板分工
- **依赖**：OPT-0

#### OPT-4 · Ablation Suite Contract 驱动执行与证据
- **对应**：候选 04
- **改动**：
  1. `ablation.ts:66-98` 的 `configSnapshot` 定义为唯一契约，增加不变量校验（固定模型/数据集/语料指纹/超时、单变量差量断言）；
  2. 删除 `latencyDelta` / `passRateBias` 偏置常量与 `:105-118` 的手工调指标，dry-run 也走 `CaseExecutor` 的回放 adapter，差异只能来自真实变量；
  3. `:120-128` 把开关透传给 `runRealAgentBenchmark` → `RealAgentAdapter` → 生产 Agent 的 `disableEvaluator` / `enablePlanning` 等既有接缝（`agent-runner.ts:128-131`）；
  4. `runner.ts:482-517` 落库补齐 `commitHash` / `isDirty` / `corpusFingerprintValid` / 完整 `configSnapshot`（`schema.prisma:820-823` 字段已存在）；
  5. 看板只比较通过同一契约校验的 `AgentEvalRun`
- **验收**：三组实验仅一个变量不同；删除配置与偏置常量后执行路径无法产出预设差异；DB 记录可追溯到 commit 与语料指纹；`ablation.test.ts` 断言变量差集而非字面量
- **边界**：依赖 OPT-1 的真实 adapter；补齐 ADR-0063 §4 严格对照，不与之冲突
- **依赖**：OPT-1、OPT-0

### P2 · 架构收敛（可与 P1 并行，独立交付）

#### OPT-2 · 统一实时流与 Attach 的事件应用编排
- **对应**：候选 02（按第二节修正后的范围）
- **改动**：把 `chat-store.ts` 的 `runChatStreamSession`（`:359-712`）与 `attachAgentRun`（`:1020-1210`）两个回调编排收敛到同一「事件应用编排」函数；来源差异（Live SSE adapter / RunEventLog 重放 adapter）留在 seam 外；**不改动 `chat-projectors.ts` 的纯投影器**
- **重点收拢项**：刷新调度（rAF + 1s 节流应同时覆盖 Attach）、落盘时机、`finalize` 复用 `projectFinalizeStreamingMessage`（工具归一 / 推理计时 / `finalizePlanExecution` / usage）
- **验收**：同一事件序列分别经 Live 与 Replay 两个来源注入，得到逐字段一致的 `ConversationSnapshot`（含 `toolCalls` 归一态、`reasoningDurationMs`、plan 终态）；补一条「两种来源同序列」测试
- **边界**：不推翻 ADR-0045 §1（单一 Zustand Store），不引入平行 Store

#### OPT-5 · 收拢 AgentPlan 终态收敛
- **对应**：候选 05
- **改动**：新增唯一收敛函数 `convergePlanTerminal(terminalFact, checkpointState)`，产出唯一变更事实，同时驱动 `plan_step_update` 广播与快照恢复；把 4 处收敛改为调用它：`agent-runner.ts:1009-1030`（成功）、`:1087-1089`（异常，当前为死写入，须改为广播）、`chat-store.ts:962-979`（loadConversation）、`conversation-orchestrator.ts:240-258`（restoreHydratedMessages，当前无收敛，须补）；审批暂停保持独立语义
- **验收**：「终态 × 步骤状态」表驱动测试覆盖完成/失败/中止/审批暂停；异常分支产生 `plan_step_update` 广播；两条刷新恢复路径结果一致；无 running Checkpoint 残留 `animate-spin`
- **边界**：不改 ADR-0038 的 AgentPlan DAG，不改 ADR-0041 的 ApprovalResume

#### OPT-6 · LiveRun 消费语义终态
- **对应**：候选 06
- **改动**：由 AgentRunner 声明唯一终态事实（复用 `onFinish` 的 `outcome`，扩展为包含 `aborted`），`pumpRunStream` / `createRunSubscriptionStream` 不再各自反解 `done/error` 字节；传输层只负责编码与重放，`terminalTypeOfFrame` 收敛为单一用途或删除
- **验收**：跨 module 终态矩阵测试（`success/partial/failed/aborted` × LiveRun 状态 / RunEventLog 终态事件 / ChatCompletionLifecycle）；删除字节反解后终态仍正确写入 `settledAt`
- **边界**：与 ADR-0061 §6 同向；保留进程内 RunEventLog，不引入 Redis / 数据库运行态 / seq（ADR-0061 §2）

---

## 四、依赖关系与建议节奏

```
OPT-0 (测试门禁) ──┬──> OPT-1 (真实 Case Executor) ──> OPT-4 (Ablation 契约)
                   │
OPT-3 (看板诚实化, 独立) ──────────────────────────────┘ (真数据落地后自然填充)

可并行、互不依赖：OPT-2 / OPT-5 / OPT-6
```

- **第 1 步**：OPT-0 + OPT-3（同批）。二者都是删除/收口为主的小改动，立刻阻断「假数据被当官方报告导出」的误导，并建立回归网。
- **第 2 步**：OPT-1（主线，工作量最大）→ OPT-4。
- **第 3 步**：OPT-2 / OPT-5 / OPT-6 按 `/chat` 迭代节奏择机并行。

> 若严格按报告「先 01」执行，建议至少**同步做 OPT-3 的第 5 项（禁用/标注导出）**，否则在真实执行落地前，`/admin/eval` 仍会持续对外导出标记为「官方全量」的示例数据。

---

## 五、报告表述偏差修正（汇总）

| 位置 | 报告原表述 | 核验后修正 |
|---|---|---|
| 候选 02 Deletion test | 「删除任一副本都不会删除领域规则，规则仍留在另一副本」 | 领域规则（纯投影器）本就共享且只有一份；有两份的是 **glue 层**（刷新调度、落盘时机、终态收尾）。优化对象应为「事件应用编排」，非「领域事件应用」 |
| 候选 05 Problem | 「刷新恢复先把 `isStreaming` 置 false，使后续按该字段触发的计划收敛无法生效」 | `loadConversation` 已对 `isStreaming` 消息做 `finalizePlanExecution(...,'aborted')`；真正缺收敛的是 `restoreHydratedMessages`。问题是**两条恢复路径不一致**，不是 false 阻断了收敛 |
| 候选 01 ADR 引用 | 「正是 §2、§5、§6 尚未落地的真实执行部分」 | 更准确对应 §1（CLI 落盘的是假数据）+ §5（三档中 real 档实现缺失）；§2 的 `DeterministicGrading` 已落地且应保持纯函数 |
| 全文用词 | `ChatStreamProjector` | 代码中为 `chat-projectors.ts` 的一组纯函数，无同名类；不影响结论 |
| 附加区 B | 「已有清晰 interface 与测试 depth」等排除理由 | 属判断性结论，本轮未独立核验 `ChatCompletionLifecycle` / `ChatWorkspace` 的覆盖情况，列为观察项而非已确认 |

---

## 六、与报告 Top recommendation 的分歧

报告建议「先实施候选 01：真实的 Case Executor」，理由是「没有这块 depth，候选 03 的看板与候选 04 的 AblationMatrix 仍只能展示不可验证的数字」。

**同意 01 是能力主线、且是工作量最大的一项；但对排序有一处异议**：

- 该理由对 **候选 04 / AblationMatrix** 完全成立 —— 没有真实执行，矩阵只能比较随机偏置；
- 对 **候选 03** 不成立 —— 03 的价值恰恰是「**不展示数字**」（诚实空态 + 禁用误导性导出），它不需要等 01 提供真数据。反过来，01 落地前每多一天，看板就多一天把随机模拟值导出成「官方全量报告」；
- 按「先做减法」原则，03 是纯删除 + 空态（改动小、可逆、无外部依赖），01 是新建 adapter 与执行链路（改动大、需门禁）。先做 03 不阻碍 01，还能让 01 落地后的效果立刻可见。

因此本清单把 **OPT-0 + OPT-3 列为第一批**，01/04 作为紧随其后的能力主线。若团队决定维持报告原排序，建议至少把 OPT-3 的「导出标注/空数据禁用导出」拆出同步落地。

---

## 七、本轮未做的事（边界声明）

- 未修改任何生产代码、未执行 `git add` / `commit` / `push`；
- 本任务为只读核验 + 文档产出，不涉及代码编写或架构重构，故代码审查（`qa-check review`）与浏览器验收均豁免；
- 未运行测试（OPT-0 尚未落地，评测运行器测试当前不在标准命令内，运行也无从覆盖），文中所有「现状」均为静态源码核对结论；
- 附加区 B 的排除结论、以及 `ChatCompletionLifecycle` 的测试 depth，未做独立验证。
