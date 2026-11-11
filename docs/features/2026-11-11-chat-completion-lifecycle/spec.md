# 技术规格：聊天完成生命周期收口与 AgentRun 审计完整性（评审 C5）

Spec Authority: `docs/features/2026-11-11-chat-completion-lifecycle/spec.md`（唯一权威，本文件为工作副本）

Status: `ready-for-agent`
ADR: `docs/adr/0051-chat-completion-lifecycle-and-settlement-result.md`
Glossary: `GLOSSARY.md`（ChatCompletionLifecycle、SettlementResult、AgentRun、Settlement）
报告来源: `docs/reports/2026-11-10-core-architecture-review.md` 第六节 C5

---

## Problem Statement

从用户视角，现状有四个真实痛感：

1. **Agent 任务失败即审计失明**：用户在 Agent 模式下发起调研或生成任务，任务中途失败或被部分交付后，历史大厅里的运行记录只剩「失败」二字——已执行的联网搜索、工具调用流水、产物引用和真实耗时全部消失，取而代之的是数据库默认值（步数 1、空工具列表、零耗时）。用户无法回溯「任务死在哪一步、哪个工具成功了」，重跑也无从判断该修正什么。这违背 ADR-0015 承诺的「全生命周期运行记录」。
2. **记账口径名不副实**：AgentRun 记录的配额成本是完成回调里用估算公式重算的，不是计费系统实际结算的值；上游 usage 缺失时两侧公式还各自分叉。更隐蔽的是，底层结算若物理失败（Redis/DB 抖动）会被静默吞掉，审计表照样记下一段从未发生的扣费——用户看到的个人中心账目与平台真实账本可能对不上。
3. **一次完成处理牵动全身**：流结束后的收尾逻辑（结算、落库、观测、记忆派发）挤在一个路由闭包里，没有「恰好一次」的守卫——收尾途中任一侧效应抛错，会触发编排层再执行一遍收尾，可能写出第二条运行记录；观测系统网络挂起时，记忆索引派发被整个跳过，且用户要等全部收尾完成才能看到回答结束。
4. **测试防线有洞**：聊天完成链路只 mock 了主循环的流式入口，Planner 的非流式入口未隔离，测试期间真实发出过上游模型请求靠 401 降级侥幸通过——CI 存在网络偶发失败与凭证泄漏风险，任何重构都缺少可信的回归保护网。

## Solution

建立聊天完成生命周期（ChatCompletionLifecycle）收口，分两步交付：

**Step A（标准车道，先行止血）**：在 Agent 编排内提炼单一完成快照出口，让正常结束、异常中断、部分交付从同一份执行事实生成完成上报——失败任务的运行记录从此保留真实步数、工具流水、产物引用与耗时；同步补齐 4 个异常路径红灯用例与统一的双入口模型调用测试替身。

**Step B（慢车道）**：落地 ChatCompletionLifecycle module，把完成处理从路由闭包收编为正式 module：

1. **统一管辖**：普通聊天与 Agent 模式共用同一完成处理；AgentRun 记录构造规则（goalText 提取、配额成本取值、字段兜底）归 module 所有，计费决策仍归 QuotaSession、隐私授权仍归 MemoryIndex。
2. **真同源记账**：QuotaSession.finalize 升格返回 SettlementResult（settled + settledUnits），AgentRun 的配额成本直接消费结算事实——结算物理失败时审计诚实标记，不再记录虚假扣费。
3. **恰好一次与顺序契约**：完成处理内置终态守卫（重复完成 no-op + 告警），副作用按「输出合规 → 结算 → 审计落库 → 观测 flush → 记忆派发」严格同步执行，单个失败不阻断其余；观测 flush 设超时熔断。
4. **诚实的测试接缝**：聊天域集成测试统一使用双 mock 测试替身（同时隔离流式与非流式模型入口，默认拒绝一切真实外网调用），module 级测试覆盖重复完成、顺序契约与失败隔离。

## User Stories

1. As a 平台用户，I want Agent 任务失败后运行记录仍显示已执行的工具调用流水，so that 我能回溯任务死在哪一步、哪个工具成功过。
2. As a 平台用户，I want Agent 任务部分交付时运行记录保留已产出的产物引用与真实耗时，so that 我能判断该基于已有产物继续还是完整重跑。
3. As a 平台用户，I want 任务首轮即失败时运行记录诚实显示步数 1 与实际耗时而非默认值，so that 我对系统记录保持信任。
4. As a 平台用户，I want 审批挂起后被中断的任务在运行记录里留下挂起工具的痕迹，so that 我恢复或重跑时知道当时卡在哪个工具。
5. As a 平台用户，I want 运行记录里的配额成本与实际扣费一致，so that 个人中心账目可信。
6. As a 平台用户，I want 底层结算失败时运行记录不记虚假扣费，so that 平台账目与审计长期对得上。
7. As a 平台管理员，I want 免预留会话的完成仍归档真实用量，so that 个人中心分项审计不缺口。
8. As a 平台用户，I want 普通聊天的完成同样被统一收口，so that 结算、观测与记忆行为在两种模式下稳定一致。
9. As a 平台用户（对比模式），I want 多模型并发请求的每个模型流独立完成结算与收尾，so that 对比结果不被收尾逻辑互相干扰。
10. As a 平台用户，I want 命中合规审计的输出仍被打标留痕进计费台账，so that 安全审计不断链。
11. As a 平台用户，I want 观测系统故障时回答正常收尾、记忆索引不丢失，so that 一次生成不会因为可观测性后端抖动而留下后遗症。
12. As a 平台用户，I want 观测 flush 卡死时回答在有限时间内结束，so that 我不会盯着转圈迟迟等不到回答完成。
13. As a 平台用户，I want 收尾过程出错不会重复扣费或重复写入运行记录，so that 我的额度与审计不被系统内部错误双倍消耗。
14. As a 平台用户，I want 非法的完成状态被安全收敛为失败并释放预留，so that 异常路径不会卡死我的额度。
15. As a 平台维护者，I want 新增完成元数据或副作用时只改完成 module 一处，so that 正常与异常路径不会再次手工漂移。
16. As a 平台维护者，I want Agent 编排只负责产出完整的执行事实报告，so that 编排逻辑不被计费与审计细节污染。
17. As a 平台维护者，I want 计费会话的结算结果成为审计构造的唯一输入，so that 不需要在路由层重算或复制计费公式。
18. As a 平台维护者，I want 聊天集成测试统一替换完整的模型调用入口，so that 测试永远不会真实访问上游模型。
19. As a 平台维护者，I want 完成 module 对重复调用返回明确的幂等结果并告警，so that 上游编排缺陷能被观测到而不是静默吞掉。
20. As a 平台维护者，I want 路由测试仍在配额会话接缝上断言，so that 测试不复制计费决策表也能守住结算契约（ADR-0003）。
21. As a 平台维护者，I want 每个收尾副作用的成败都暴露在完成摘要里，so that 单测可以白盒校验顺序与隔离、线上可以接告警。
22. As a 平台维护者，I want 失败路径的运行记录与成功路径从同一出口构造，so that 字段完整性不再依赖两个调用点的人工同步。

## Implementation Decisions

以下决策已在 `/grill-with-docs` 拷问中逐项与用户确认，并记录于 ADR-0051。

1. **分期交付（两步走）**：
   - Step A（标准车道）：Agent 编排内提炼单一 `buildFinishPayload` 快照出口，正常与异常路径同源生成完成上报；补异常路径红灯用例与双 mock 测试替身。兑现 ADR-0015 未竟承诺，不新立 ADR。
   - Step B（慢车道）：落地 ChatCompletionLifecycle module。
2. **module 职责 = 编排 + 审计构造**：ChatCompletionLifecycle 统一管辖普通聊天与 Agent 模式；拥有「恰好一次」完成处理、严格同步的副作用顺序契约与 AgentRun 记录构造规则。QuotaSession 继续拥有计费决策表，MemoryIndex 继续拥有隐私授权与增量索引。被推翻的备选项：纯时序编排器（quotaCost 同源无解）、普通聊天独立收尾（散点重现）。
3. **运行快照内聚于 Agent 编排**：steps/toolCalls/artifactRefs/durationMs/evaluator 由编排闭包累积，经单一快照出口进入完成上报；不上移 RuntimeContext（编排事实非上下文层所能见），不拆给工具管道（审批挂起/恢复结果融合交互协议，管道无法独自承担）。
4. **结算结果契约（SettlementResult）**：QuotaSession.finalize 返回 `{ settled: boolean; settledUnits: number }`——failed/释放成功为 `{true, 0}`，成功/部分为实际结算额，免预留为归档额，底层结算物理失败为 `{false, ...}`。AgentRun 的 quotaCost 消费该返回值构造，落实 ADR-0015「原子同源」的真实语义。`settle/release` 吞错行为不变（是否改抛属计费行为变更，明确不裹入）。既有 6 处 finalize 调用方全部忽略返回值，返回类型加宽向后兼容。
5. **守卫与时序语义**：module 内置终态守卫——重复完成 no-op + 结构化告警（带请求标识与双终态）；`complete()` 对业务异常永不 reject（outcome 非法降级为 failed 兜底并驱动释放），程序契约崩塌（空上下文）才 fail-fast；非关键副作用超时熔断（观测 flush 500ms 上限）。同步边界维持现状：全部副作用在客户端 `done` 事件前完成，不异步后置（被推翻的备选项：异步化——违反 ADR-0015 原子同源，且 Serverless 下有执行上下文回收风险）。
6. **module 公共接口形状**（来自拷问期论证，仅保留决策要点）：

```typescript
// 输入：会话上下文 + 完成事实；输出：完成摘要（供测试断言与审计告警）
interface ChatCompletionContext {
  userId: string; requestId: string; errorId: string;
  conversationId?: string | null;
  effectiveProvider: string; modelName: string;
  messages: Array<{ content?: string }>;
  reservedSession: QuotaSession;
  memorySearchEnabled?: boolean;  // 由调用方透传，缺省时 module 内部单查兜底
  agentContext?: { enabled: boolean; activeCapabilityPack?: { key: string }; overriddenProvider?: string; overriddenModel?: string };
}
interface ChatCompletionSummary {
  settled: boolean; settledUnits: number; agentRunId?: string;
  sideEffects: { safetyFlag?: string | null; quotaSettled: boolean; agentRunPersisted: boolean; observabilityFlushed: boolean; memoryJobDispatched: boolean };
}
```

7. **副作用顺序契约**：输出合规 → finalize 结算 → AgentRun 落库 → 观测 flush（超时熔断）→ 记忆派发。合规必须最前（safetyFlag 进 finalize 元数据）；每个副作用独立隔离，失败不阻断后续；非 Agent 模式携带的审计字段静默告警忽略。
8. **测试接缝**：聊天域集成测试统一使用共享双 mock 测试替身（同时替换流式与非流式模型入口，非流式入口默认 reject 以杜绝真实外网泄漏），与配额会话假件同级放置；不建生产层模型调用网关（SDK 即接缝，为测试造生产抽象属过度设计）。
9. **无 Schema 变更**：agent_runs 表结构不变；变更仅为 QuotaSession.finalize 返回类型加宽与 onFinish 闭包被 module 取代。
10. **质量收益的证据口径**：「审计完整性」「账实同源」为机制性收益（由单一出口与 SettlementResult 消费直接保证），不需额外效果评测；若宣称「收尾延迟改善」则需可复现的对照计时，本 spec 不做此宣称（延迟与现状持平）。

## Testing Decisions

- **好测试的标准**：只断言外部可观察行为——完成上报的字段完整性、AgentRun 落库内容、结算透传、副作用顺序与隔离、重复完成的幂等；不断言 module 内部私有状态与调用顺序的实现细节。路由层测试仍在配额会话接缝断言（ADR-0003），fake 配置固定 SettlementResult 后断言透传，不复刻计费决策表。
- **测试接缝（已在拷问中确认）**：(1) 配额会话接缝——假件（fake-quota-session 先例）；(2) 完成 module 接缝——complete() 输入上下文 + 完成事实；(3) 模型调用测试接缝——共享双 mock 替身（mock-ai-sdk）；(4) Agent 编排快照出口——正常/异常同源构造。理想情况是全链路测试只经 (1)(2)(3) 三个接缝。
- **Step A 红灯用例**（落于 Agent 运行记录落盘集成测试）：
  1. 模型首轮即挂：断言 outcome=failed、steps=1、toolCalls=[]、artifactRefs=[]、durationMs>0（非数据库默认 0）。
  2. 多步执行中途故障：第一轮工具成功、第二轮挂掉，断言 outcome=partial、toolCalls 完整保留第一轮记录与真实耗时、steps=2。
  3. 审批挂起后中断：断言 outcome=partial、记录包含挂起工具信息。
  4. Planner 降级隔离：非流式入口抛错时编排诚实降级走无计划分支，全流程零外网调用平稳收尾。
- **Step B module 测试矩阵**：duplicate-complete（连续/重复调用 no-op + 告警断言）；副作用顺序（summary.sideEffects 全维度断言）；辅助副作用失败不阻断主响应（逐个让落库/flush/派发失败）；outcome 非法降级 failed 并驱动释放；非 Agent 携带审计字段静默忽略；AgentRun quotaCost 消费 finalize 返回值（同源断言）。
- **先例**：agent-runs-persistence.test.ts（落盘集成测试骨架）、chat-handler.agent-webhook.test.ts（双 mock 先例：流式+非流式同替身内替换、非流式默认 reject）、fake-quota-session.ts（配额假件）、quota-session 测试（finalize 既有行为基线）。
- **真实链路验收**：Step A/B 均触及对话核心链路，交付前完成阶段 5 真实浏览器验收（普通用户账户走 Agent 任务成功与失败两条路径，核对运行记录字段完整性）。

## 交付命令

```bash
pnpm --filter @repo/web test "src/app/api/chat"
pnpm --filter @repo/web test "src/lib"
pnpm --filter @repo/web typecheck
pnpm --filter @repo/db test
pnpm --filter @repo/db typecheck
pnpm --filter @repo/web lint
pnpm typecheck
```

## Out of Scope

- C4 聊天输入传输契约（已由 ADR-0050 立项）；审计字段从完成上报形状中的物理分离（类型契约净化，属后续独立项）。
- 批量预留的批量语义本身（BatchReservation 契约归 C4/ADR-0050，本 spec 只保证对比模式的每个模型流被完成 module 正常覆盖）。
- settle/release 失败时改抛错的计费行为变更；合规审计独立建表。
- 运行快照上移 RuntimeContext、工具流水移交工具管道、生产层模型调用网关。
- 多 Agent 嵌套执行的事实汇总；完成副作用异步化/后置化。
- 记忆索引的隐私授权、增量索引与分词逻辑本身（ADR-0022 边界内）。
- 完成生命周期 module 在命理一元链路的复用（C3/ADR-0049 已收口，不在本 spec 扩张）。

## Further Notes

- **车道**：Step A 标准车道、Step B 慢车道（跨 6+ 模块并修改计费公共签名）。后续 `/to-tickets` 按依赖拆单：Step A 红灯用例与快照出口在前，module 立项在后。
- **依赖关系**：Step B 依赖 Step A 的红灯基线（重构保护网）；SettlementResult 契约（决策 4）落地前，module 的审计构造只能临时透传 finish 用量，故结算返回契约应作为 Step B 的第一道工序。
- **验收基线**：Step A 4 条红灯用例 + 双 mock 替身；Step B duplicate-complete/顺序/隔离用例 + 对话核心链路真实浏览器验收（阶段 5 不可豁免）。
