# 0051. 聊天完成生命周期收口与结算结果契约（评审 C5）

* **编号**：ADR-0051
* **状态**：已接受
* **日期**：2026-11-11
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web`（`chat-handler`、`agent-runner`、Provider adapter、`agent-runs` 落盘、观测 flush、记忆派发）、`packages/db`（`QuotaSession.finalize` 返回契约）

---

## 背景

聊天流的完成处理此前由 `chat-handler` 的路由闭包 `onFinish` 直接编排：输出合规 → `QuotaSession.finalize` → `agent_runs` 落库 → Langfuse flush → 记忆索引派发。该结构已出现三类漂移：(1) `agent-runner` 正常路径提交完整审计字段（steps/toolCalls/artifactRefs/durationMs/evaluator），异常路径只交终态与计数，失败或部分交付的 AgentRun 丢失已执行的工具与产物审计，违背 ADR-0015「全生命周期运行记录」目标；(2) `finalize` 返回 `void` 且结算失败被静默吞掉，`agent_runs.quotaCost` 由调用方用 `resolveChatStreamUsage` 重算，「与配额结算原子同源落账」名不副实；(3) 测试只 mock `streamText`，Planner 的 `generateText` 未隔离，曾真实发出上游请求靠 401 降级通过。审查报告 C5（docs/reports/2026-11-10-core-architecture-review.md）经十问拷问收敛出本决策。

## 决策

1. **两步走分期**：
   - **Step A（标准车道）**：`agent-runner` 内提炼单一 `buildFinishPayload()` 快照出口，正常与异常路径同源生成 finish；补 4 个红灯用例（首轮即挂、多步中途故障、审批挂起后中断、Planner 降级隔离）；引入双 mock 测试 helper 同时隔离 `streamText` 与 `generateText`。兑现 ADR-0015 未竟承诺，不新立 ADR。
   - **Step B（慢车道）**：落地 `ChatCompletionLifecycle` module，按本 ADR 第 2～5 条执行。
2. **module 职责 = 编排 + 审计构造**：`ChatCompletionLifecycle` 统一管辖普通聊天与 Agent 模式的完成处理，拥有「恰好一次」完成处理、严格同步的副作用顺序契约（输出合规 → 结算 → 审计落库 → 观测 flush → 记忆派发）与 AgentRun 记录构造规则；`QuotaSession` 继续拥有计费决策表，`MemoryIndex` 继续拥有隐私授权，非 Agent 模式携带的审计字段静默 warn 忽略。运行快照内聚于 `agent-runner`（闭包累积 + 单出口），不上移 RuntimeContext。
3. **结算结果契约（SettlementResult）**：`QuotaSession.finalize` 返回 `{ settled, settledUnits }`——failed/释放成功为 `{ true, 0 }`，成功/部分为实际结算额，免预留为归档额，底层结算物理失败为 `{ false, ... }`；AgentRun 的 `quotaCost` 消费该返回值构造，实现账实真同源。`settle/release` 吞错行为不变（是否改抛属计费行为变更，不裹入本决策）。
4. **守卫与时序语义**：module 内置终态守卫，重复完成调用 no-op + 结构化 warn（带 requestId 与双 outcome）；`complete()` 对业务异常永不 reject（outcome 非法降级为 failed 兜底并驱动释放），程序契约崩塌（空上下文）才 fail-fast；非关键副作用设超时熔断（flush 500ms 上限）。同步边界维持现状：全部副作用在客户端 `done` 事件前 await 完成，不异步后置。
5. **测试接缝**：chat 域集成测试统一使用共享双 mock helper（`mock-ai-sdk`，与 `fake-quota-session` 同级），默认 `generateText` reject 杜绝真实外网泄漏；module 级测试覆盖 duplicate-complete、副作用顺序、辅助副作用失败不阻断；路由测试仍在 QuotaSession seam 断言，不复刻计费决策表（ADR-0003）。

## 取代与修订

- **扩展**：ADR-0015 第 4 条「与配额结算原子同源落库」——原决策目标正确但实现名不副实，本 ADR 第 3 条以 SettlementResult 契约落实其真实语义。
- **不变**：ADR-0003（路由测试 seam 断言）、ADR-0022（记忆隐私边界）、ADR-0039（EvaluatorNode 审计）、ADR-0041（审批裁剪）、ADR-0045/0046（输出流契约与双快照）均不修订。

## 备选方案及否决理由

1. **纯时序编排器**（module 不管 AgentRun 构造）：调用方拿不到结算值，quotaCost 只能重算或传高阶回调，同源无解；构造规则留在闭包则漂移重现。
2. **审计/观测/记忆异步后置**（done 先发）：违反 ADR-0015 原子同源；Serverless 下流 close 后执行上下文可能被回收导致审计丢失；网络挂起场景以超时熔断解决而非异步化。
3. **生产层注入 ModelInvoker**：为测试凭空造生产抽象（SDK 本身就是接缝），网关需穿透 `runAgent → Planner/Evaluator`，侵蚀 ADR-0008～0011 装配边界；影子流量等多模型需求属 Provider 适配器层议题。
4. **快照上移 AgentRuntimeContext**：编排事实（轮次、流抽取产物、质检结果）非上下文层所能见，硬收构成 God Object；当前无多 Agent 嵌套汇总需求。
5. **普通聊天保留独立完成处理**：留下第二处完成编排，时序与幂等规则两处维护再漂移，与收口目标直接矛盾。

## 后果

- **审计完整性**：失败/部分交付的 AgentRun 保留真实工具流水、产物引用与耗时，DB 默认值不再冒充审计事实。
- **诚实记账**：结算物理失败时 AgentRun 不记虚假扣费；`settled` 维度可接告警。
- **接口变化**：`QuotaSession.finalize` 返回类型加宽（既有 6 处调用方忽略返回值，向后兼容）；`onFinish` 闭包由 module 取代，调用方仅提供 `ChatCompletionContext` + `ChatStreamFinish`。
- **流收尾延迟**：全部副作用维持同步，延迟与现状持平；flush 超时熔断兜底网络挂起。
- **验收基线**：Step A 4 条红灯用例 + 双 mock helper；Step B duplicate-complete/顺序/隔离用例 + 对话核心链路真实浏览器验收（阶段 5 不可豁免）。作为 C5 交付的验收契约（后续 `/to-spec` 与 `/qa-test-planner` 落盘 Schema 4 细节）。
