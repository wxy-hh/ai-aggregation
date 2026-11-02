# `/chat` 与 `/knowledge` 架构优化待办

> 生成时间：2026-10-30  
> 范围：`apps/web` 下 `/chat`、`/knowledge` 页面及其直接调用链  
> 用途：按优先级逐项立项、设计、实施和验收；本文只记录待办，不提前定义具体 interface。  
> 术语：领域术语取自 `GLOSSARY.md`；架构术语采用 `module`、`interface`、`depth`、`seam`、`adapter`、`leverage`、`locality`。  
> 关联材料：[`2026-10-28-rag-architecture-review.md`](./2026-10-28-rag-architecture-review.md)、[`chat-agent-evolution-plan.md`](./chat-agent-evolution-plan.md)、[`knowledge-backlog.md`](./knowledge-backlog.md)。

## 状态约定

- `待分析`：尚未通过拷问确认约束和范围。
- `待规格`：方向已确认，等待 spec、必要 ADR 与 Schema 4 `qa-plan.md`。
- `待实现`：规格、测试计划与阶段门禁已通过。
- `进行中`：正在实施或验证。
- `待独立审查`：实现和验证完成，等待 Standards / Spec 双轴独立审查。
- `待人工终审`：独立审查与机器校验已通过，等待人工确认。
- `已完成`：人工终审确认完成。
- `搁置`：有明确原因，暂不继续。

## 优先级总览

| 顺序 | 编号 | 待办 | 推荐强度 | 主要收益 | 依赖 | 状态 |
|---:|---|---|---|---|---|---|
| 1 | `ARCH-CK-01` | 收拢检索契约与 CrossEncoderRerank 政策 | **Strong** | 消除政策漂移与 transport seam 泄漏 | 无 | `已完成` |
| 2 | `ARCH-CK-02` | 加深聊天会话状态 module | **Strong** | 收敛多种会话生命周期知识 | 建议在 01 后独立开展 | `已完成` |
| 3 | `ARCH-CK-03` | 统一 Conversations 协调 seam | **Strong** | 建立跨 store 协调的唯一事实位置 | 与 02 联合定界 | `已完成` |
| 4 | `ARCH-CK-04` | 让 `ChatWorkspace` 回到页面编排 | **Worth exploring** | 提升导航、发送、引用和错误处理的 locality | 建议在 02、03 后 | `已完成` |
| 5 | `ARCH-CK-05` | 缩减只为 mock 存在的宽 interface | **Worth exploring** | 降低测试对 implementation 的耦合 | 可随 01、02 分批处理 | `已完成` |
| 6 | `ARCH-CK-06` | 把 `KnowledgeWorkspace` 生命周期变成可测规则 | **Worth exploring** | 固化轮询、选择和定向刷新规则 | 可独立开展 | `待分析` |
| 7 | `ARCH-CK-07` | 对齐首页 `?prompt=` 与对话输入预填 | **Worth exploring** | 修复灵感入口提示词丢失 | 建议在 04 后复用入口意图 | `待分析` |
| 8 | `ARCH-CK-08` | 修复对比模式顶部内容避让 | **Worth exploring** | 消除对比视图标题重影与模型卡片遮挡 | 可独立开展 | `待分析` |

## 执行规则

每次只启动一个主待办；`ARCH-CK-05` 只能作为当前主待办的随附清理，不能单独发起全仓重构。

每项开始前：

- [ ] 调用 `grilling`，确认约束、依赖、deep module 的职责、seam 位置和应保留的测试。
- [ ] 对照相关 ADR，避免重新讨论已决定的领域行为。
- [ ] 应用 deletion test：删除候选 module 后，复杂度必须重新散回多个调用者；若复杂度直接消失，优先删除浅层结构而非新增结构。
- [ ] 只有存在两个真实 adapter，或关键失败模式确实需要替换行为时，才保留或新增 seam。
- [ ] 明确最小范围、非目标和回滚方式。
- [ ] 按 `docs/agents/qa-workflow.md` 确定车道、spec 来源、Schema 4 `qa-plan.md` 和阶段门禁。

每项交付前：

- [ ] 测试通过 module 的正式 interface 验证行为，不以内部函数调用次数代替用户可观察结果。
- [ ] 触及对话、知识检索、历史或认证等核心链路时，完成 RealLinkSmoke 和符合宿主优先级的真实浏览器验收。
- [ ] 完成 Standards / Spec 双轴独立审查、三档分流、FixVerification 与人工终审。
- [ ] 更新本文状态、完成日期、关联 spec/ADR/qa-plan 和验证证据。

---

## `ARCH-CK-01`：收拢检索契约与 CrossEncoderRerank 政策

**状态**：`已完成`  
**推荐强度**：**Strong**  
**建议顺序**：1

### 目标

让单库检索与跨库 Agent 检索共享 CrossEncoderRerank、RelevanceScoreCutoff、RerankFallback、候选映射和引用投影规则，同时保留两类入口不同的参数语义。客户端不再跨 transport seam 依赖服务器检索 implementation 的类型。

### 证据位置

- `apps/web/src/app/knowledge/_components/retrieval-debugger.tsx:28-31`
- `apps/web/src/app/knowledge/_components/retrieval-debugger.tsx:200-225`
- `apps/web/src/app/api/knowledge-bases/[id]/query/route.ts:21-42`
- `apps/web/src/app/api/knowledge-bases/[id]/query/route.ts:78-88`
- `apps/web/src/lib/rag/hybrid-retrieval.ts:42-130`
- `apps/web/src/lib/rag/hybrid-retrieval.ts:405-512`
- `apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts:27-78`
- `apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts:245-285`

### 当前 friction

- 检索调试 module 从服务器检索 implementation 导入结果类型，transport seam 与实现位置重叠。
- 单库检索与跨库 Agent 工具分别维护精排、截断、降级和结果映射，政策缺少 locality。
- 调整精排阈值、异常降级或越界索引策略时，需要同步修改和验证多处。
- HTTP 查询与 Agent DrillDownRetrieval 的输入限制不同，不能通过机械合并 schema 解决。

### Deletion test

- 删除客户端对服务器实现类型的导入后，展示调用者仍必须知道稳定响应形状，说明 transport seam 真实存在，但当前位置不合适。
- 删除任一处精排政策后，对应调用者仍需要相同行为，复杂度会重新出现，说明共享政策具备形成 deep module 的 leverage。

### 约束与非目标

- 保留 ADR-0030 的“各库粗排后统一单次 CrossEncoderRerank”。
- 保留 ADR-0036 的 DocumentOutline 与 DrillDownRetrieval 语义。
- 不强制 HTTP 查询和 Agent 工具使用相同参数 schema。
- 不更换 RerankProvider 或模型供应方。
- 不顺带重写召回算法、分词或向量索引。
- 与 `2026-10-28-rag-architecture-review.md` 候选 2 重叠；立项时复用其证据，避免建立平行方案。

### 待办

- [x] 画出单库调试路径与跨库 Agent 路径的完整调用图和数据形状。
- [x] 列出两条路径必须一致的政策，以及必须保持差异的入口语义。
- [x] 统计重复的 rerank、cutoff、fallback、越界索引和 CitationAnchor 投影规则。
- [x] 通过 `grilling` 确认 deep module 的职责和 seam 位置。
- [x] 判断是否需要 ADR；若只是落实 ADR-0030，不新增重复 ADR。
- [x] 编写 spec 与 Schema 4 `qa-plan.md`。
- [x] 先补同一候选集在两条路径中的一致性测试。
- [x] 实施最小迁移，删除被替代的重复 implementation。
- [x] 验证单库、跨库、全员低分、RerankProvider 异常和越界结果场景。
- [x] 完成 `/knowledge` 检索调试与 `/chat` 知识问答 RealLinkSmoke。
- [x] 完成独立审查和人工终审。

### 完成标准

- [x] CrossEncoderRerank、RelevanceScoreCutoff 与 RerankFallback 只有一个权威 implementation。
- [x] 单库与跨库路径在共享政策下产生一致结果。
- [x] 两类入口各自的参数限制仍由测试锁定。
- [x] 客户端不再导入服务器检索 implementation 的类型。
- [x] 旧的重复代码与只覆盖旧 implementation 的测试已删除或迁移。

### 交付记录

- 完成日期：2026-11-01
- Spec：[`.scratch/retrieval-contract-rerank-policy/spec.md`](../../.scratch/retrieval-contract-rerank-policy/spec.md)
- ADR：[`docs/adr/0030-cross-encoder-rerank-fusion-pipeline.md`](../adr/0030-cross-encoder-rerank-fusion-pipeline.md)
- QA plan：[`.scratch/retrieval-contract-rerank-policy/qa-plan.md`](../../.scratch/retrieval-contract-rerank-policy/qa-plan.md)
- 验证证据：[`.scratch/retrieval-contract-rerank-policy/evidence/`](../../.scratch/retrieval-contract-rerank-policy/evidence/) 与 `_qa/reconciliation.md`
- 审查结论：机器校验 PASS，双轴独立审查（Standards/Spec r2）改档成立，人工终审通过。

---

## `ARCH-CK-02`：加深聊天会话状态 module

**状态**：`已完成`  
**推荐强度**：**Strong**  
**建议顺序**：2

### 目标

在不改变 Artifact、AgentPlan、ApprovalRequest 和 ApprovalResume 等领域行为的前提下，缩小页面与测试必须理解的聊天状态 interface，让消息、流事件投影、持久化和恢复规则获得 locality。

### 证据位置

- `apps/web/src/stores/chat-store.ts:64-93`
- `apps/web/src/stores/chat-store.ts:96-169`
- `apps/web/src/stores/chat-store.ts:402-808`
- `apps/web/src/stores/chat-store.ts:1102-1493`
- `apps/web/src/stores/chat-store.test.ts`
- `apps/web/src/stores/chat-store.artifacts.test.ts`
- `apps/web/src/stores/chat-store.plan.test.ts`
- `apps/web/src/stores/chat-store.approval.test.ts`

### 当前 friction

- `Message` 同时承载正文、推理、附件、工具调用、Artifact、Citation、AgentPlan 与 Approval。
- `ChatState` 同时暴露模型选择、能力包、工具覆盖、ArtifactWorkspace、版本回滚、PlanIntervention 和 ApprovalResume。
- 每增加一种流事件或会话能力，interface、持久化、渲染夹具和专项测试都可能扩张。
- 现有测试已经按 Artifact、AgentPlan、Approval 分组，说明单一 interface 内存在多个独立变化轴。

### Deletion test

删除整个 store 后，流消费、消息合并、Artifact、AgentPlan、Approval 与会话同步复杂度会散回页面和多个调用者。因此 store 本身提供了真实 leverage，目标不是按文件大小拆分，而是提高其 depth。

### 约束与非目标

- 不重新讨论 ADR-0015、ADR-0037、ADR-0038、ADR-0041 的领域决策。
- 不改变聊天流协议和消息持久化格式，除非 spec 明确迁移与兼容方案。
- 不把 Zustand 替换成另一套状态工具。
- 不为了缩短文件而制造更多 shallow module。
- 不要求每类领域状态都成为独立 store。

### 待办

- [x] 统计四组现有测试实际使用的状态字段和动作，画出交集与独立变化轴。
- [x] 追踪每类流事件从接收到持久化、会话同步和渲染的路径。
- [x] 找出调用者必须了解的稳定行为与仅应留在 implementation 内的规则。
- [x] 通过 `grilling` 确认外部 seam、内部 seam 与迁移顺序。
- [x] 编写 spec 与 Schema 4 `qa-plan.md`。
- [x] 先建立用户可观察的完整会话结果测试，再调整内部结构。
- [x] 分批迁移，每批只处理一个变化轴，并删除被替代的旧路径。
- [x] 验证普通聊天、ArtifactVersion、PlanIntervention、ApprovalResume、停止与失败恢复。
- [x] 完成 `/chat` RealLinkSmoke、独立审查和人工终审。

### 完成标准

- [x] 页面不需要了解流事件到领域状态的内部投影规则。
- [x] 测试主要通过稳定的会话 interface 驱动，不逐字段装配整个 store。
- [x] 增加一种现有类别的流事件时，修改集中于一个 module。
- [x] Artifact、AgentPlan、Approval 的持久化与刷新恢复行为保持不变。
- [x] 没有新增只有一个生产 adapter 且仅供 mock 使用的公开 seam。

### 交付记录

- 完成日期：2026-11-01
- Spec：`.scratch/deep-chat-session-module/spec.md`
- ADR：[`docs/adr/0045-deep-chat-session-module-and-stream-projectors.md`](../adr/0045-deep-chat-session-module-and-stream-projectors.md)
- QA plan：`.scratch/deep-chat-session-module/qa-plan.md`
- 验证证据：`evidence/test-r2.log`、`evidence/lint-r2.log`、`evidence/typecheck-r2.log`、`evidence/tc08-browser-r2.log`、`screenshots/tc08-chat-stream-smoke.png`
- 审查结论：双轴独立审查 PASS（Standards: r2-standards.md, Spec: r2-spec-axis.md, review-report.md）

---

## `ARCH-CK-03`：统一 Conversations 协调 seam

**状态**：`已完成`  
**推荐强度**：**Strong**  
**建议顺序**：3

### 目标

为会话切换、加载、删除、模式中止和关联状态同步建立唯一事实位置，消除直接 store 调用与字符串事件总线并存造成的双重 seam，并明确运行时消息与持久化消息的保真规则。

### 证据位置

- `apps/web/src/stores/conversations-store.ts:13-21`
- `apps/web/src/stores/conversations-store.ts:88-110`
- `apps/web/src/stores/conversations-store.ts:314-417`
- `apps/web/src/stores/chat-store.ts:64-93`
- `apps/web/src/stores/store-events.ts:9-31`
- `apps/web/src/stores/store-coordinator.ts:22-108`
- `apps/web/src/stores/conversations-store.orchestrator.test.ts`
- `apps/web/src/stores/store-coordinator.test.ts`

### 当前 friction

- Conversations store 直接调用 Chat 与 Comparison store，同时又通过事件总线交给协调 module 处理其他同步。
- 完整动作时序无法通过单个 seam 判断，循环防护与刷新规则分散。
- 本地 `ChatMessage` 与 `Message` 表达相邻概念，但字段覆盖不同。
- 事件 payload 使用字符串和 `any`，隐藏了 AgentPlan、Approval 等字段在持久化过程中的漂移风险。

### Deletion test

- 删除协调 module 后，历史、对话、音频和 Relay 同步会散回各 store，说明它具备 leverage。
- 删除直接跨 store 调用后，模式切换与加载编排仍然存在，说明问题是职责尚未集中到唯一 seam。
- 删除本地持久化消息形状后，调用者仍需知道哪些字段应保存，说明持久化语义本身是真实 interface。

### 约束与非目标

- 不把所有 store 合并成一个 store。
- 不引入新的全局事件系统。
- 不使用 `any` 或类型断言掩盖迁移问题。
- 不改变 Conversation、HistoryWorkspace、Relay 的领域含义。
- 与 `ARCH-CK-02` 联合定界，但一次实施只能由一个待办拥有具体改动。

### 待办

- [x] 列出每个跨 store 用户动作及其直接调用、事件处理和最终副作用。
- [x] 找出同一动作可能被两条路径重复执行的场景。
- [x] 定义运行时消息到持久化消息必须保留、转换和丢弃的字段清单。
- [x] 通过 `grilling` 确认唯一协调 seam 的位置与 adapter 角色。
- [x] 编写 spec 与 Schema 4 `qa-plan.md`。
- [x] 先补“一个用户动作只产生一次效果”的测试。
- [x] 补充 AgentPlan、Approval、Artifact 引用经过加载与保存后的保真测试。
- [x] 迁移直接调用或事件路径，并删除被替代的一套协调逻辑。
- [x] 验证会话切换、删除、刷新恢复、模式切换和 Relay 失效。
- [x] 完成 `/chat` 与 `/history` RealLinkSmoke、独立审查和人工终审。

### 完成标准

- [x] 每种跨 store 动作只有一个权威协调路径。
- [x] 协调时序、循环防护和消息转换规则集中在一个 module。
- [x] 事件 payload 与持久化 interface 不再使用 `any`。
- [x] 一个会话动作只触发一次加载、删除或同步。
- [x] Conversation 刷新后关键消息字段保持完整。

### 交付记录

- 完成日期：2026-11-01
- Spec：`.scratch/conversation-orchestrator/spec.md`
- ADR：[`docs/adr/0046-conversation-orchestrator-and-dual-snapshot-persistence.md`](../adr/0046-conversation-orchestrator-and-dual-snapshot-persistence.md)
- QA plan：[`.scratch/conversation-orchestrator/qa-plan.md`](../../.scratch/conversation-orchestrator/qa-plan.md)
- 验证证据：`evidence/deliver-test-4.log`、`deliver-typecheck-4.log`、`deliver-lint-4.log`；浏览器 `evidence/tc01-browser-11.log`、`tc02-browser-10.log`、`tc03-browser-2.log`、`tc04-browser-6.log`（TC04-1/TC04-3 记 BLOCKED：`tc04-blocked-1.log`）；截图 `screenshots/tc01-chat-switch.png`、`tc02-delete-propagation.png`、`tc03-associated-state.png`、`tc04-refresh-fidelity.png`；对账表 `_qa/reconciliation.md`
- 审查结论：双轴独立审查 r1→r2 完成（S-H1/H2/H3、S-J2/J4 本次修并经 r2 复核已修；S-J1 转专项、S-J3 驳回改档成立；Spec 轴 r2 无发现，见 `review-report.md`）；`qa-check review` 机器结果为 BLOCKED（`ASSERTION_BLOCKED`：TC04-1/TC04-3 因嵌入服务 402 无法构造引用语料），人工终审裁决接受该阻塞并确认完成

---

## `ARCH-CK-04`：让 `ChatWorkspace` 回到页面编排

**状态**：`已完成`  
**推荐强度**：**Worth exploring**  
**建议顺序**：4

### 目标

让 `ChatWorkspace` 只组合稳定的页面结果，不直接解释 URL 初始化、会话创建、Relay 事务、模型同步、Citation 聚合和错误呈现等规则。

### 证据位置

- `apps/web/src/app/chat/chat-workspace.tsx:169-220`
- `apps/web/src/app/chat/chat-workspace.tsx:226-468`
- `apps/web/src/app/chat/chat-workspace.tsx:504-644`
- `apps/web/src/app/chat/chat-workspace.tsx:690-1386`
- `apps/web/src/app/chat/chat-workspace.capability-pack.test.tsx`

### 当前 friction

- 页面同时维护预览、滚动、响应式布局等 UI 状态，以及 URL、会话和 Relay 业务时序。
- 发送前创建会话、Relay prepare/commit、模型双写和引用索引均位于渲染 module 内。
- 同一 `error` 被两个 effect 用不同 toast 消费，存在重复提示风险。
- 现有 workspace 测试需要装配大量依赖，且主要覆盖 CapabilityPack 场景。

### Deletion test

删除整个 `ChatWorkspace` 后，大部分复杂度会回到路由页，因此该 module 并非 pass-through。需要深化的是页面内部彼此独立的规则集，而不是按 JSX 行数拆文件。

### 约束与非目标

- 第一轮只固定并修正重复错误提示等可观察行为，不顺带重做页面视觉。
- 不因桌面端和移动端 JSX 较长就机械拆出 shallow module。
- 不改变 Relay、CapabilityPack、CitationReferenceCard 或 DocumentPreview 的领域行为。
- 若 `ARCH-CK-02`、`ARCH-CK-03` 已提供稳定 interface，应直接复用，不建立平行 seam。
- 修改 UI 前必须读取 `DESIGN.md` 和 `.claude/rules/ui.md`。

### 阶段 1 已确认（2026-11-02）

- 形态：纯函数规则 + `conversationOrchestrator` 命令，不新建页面控制器 hook；属于落实 ADR-0045 与 ADR-0046，不新增 ADR。
- URL 入口：`resolveChatEntryIntent(search, snapshot)` 纯函数返回判别联合，`enterChatFromUrl(search)` 命令执行；执行后删除全部入口参数键（`new`/`goal`/`pack`/`agent`/`historyId`/`comparisonId`），保留 `relayId`、`prompt` 与未知参数。
- URL 入口优先级沿用现状：`comparisonId` > `historyId` > `new` > 无指针时恢复首个单聊 > 保持当前；`goal`/`pack`/`agent` 只在 `new` 分支内生效，`historyId` 指向非 chat 记录时静默忽略；页面在 `isLoaded` 后只调用一次，幂等由页面初始化标记保证。
- URL 参数处置：保留 `goal`/`pack`/`agent` 消费分支（E-1 契约，当前无内部生成方）；`prompt` 不补消费，另立 `ARCH-CK-07`。
- 发送事务：新增 orchestrator `sendChatMessage(content)` 命令，负责 ensure 会话、Relay 两段式与成功清理 chat-store 附件；页面保留吸底滚动与接力图片 UI state 清理，原样透传四态结果。
- Relay 到达：新增 `applyRelayArrival(bundle)` 命令，判定并执行「准备单聊会话 + 非豆包时切模型」，返回 `{ switchedModel }` 供页面提示；草稿与图片附件 state 留在页面。
- Citation 聚合：新建纯函数 module，聚合、去重、排序与空结果回退单锚点均在其中；`MatchedCitationAnchor` 类型从 `document-preview-drawer.tsx` 移入该 module。
- 错误提示：合并为单一 effect，文案用通用「请求失败，请稍后重试」，补页面级回归用例。
- 测试口径：规则测试全部落在纯函数/命令层，页面只新增 1 个错误回归测试并复用现有 mock；本轮新增测试不新增任何 `vi.mock`。

### 待办

- [x] 为重复错误提示建立确定性回归用例，确认是否真实发生。
- [x] 列出 URL 参数到页面状态的初始化规则及优先级。
- [x] 列出发送事务中会话创建、Relay prepare/commit 和失败恢复时序。
- [x] 统计 Citation 聚合和预览导航的调用者知识面。
- [x] 通过 `grilling` 确认哪些规则值得形成 deep module。
- [x] 编写 spec 与 Schema 4 `qa-plan.md`。
- [x] 按规则集逐批迁移，保持页面渲染结构稳定。
- [x] 验证新会话、历史会话、CapabilityPack、Relay、引用预览、错误和停止场景。
- [x] 在 375px 窄屏和桌面端完成真实浏览器验收。
- [x] 完成独立审查和人工终审。

### 完成标准

- [x] 每个错误只产生一次符合约定的用户提示。
- [x] URL、发送事务与 Citation 规则可通过窄 interface 独立测试。
- [x] `ChatWorkspace` 不再直接维护跨 store 业务时序。
- [x] 桌面端与移动端行为及布局没有回退。
- [x] 页面测试的 mock 装配量下降，且未通过新的 shallow module 转移复杂度。

### 交付记录

- 完成日期：2026-11-02
- Spec：`.scratch/chat-workspace-orchestration/spec.md`
- ADR：落实 ADR-0045、ADR-0046
- QA plan：`.scratch/chat-workspace-orchestration/qa-plan.md`
- 验证证据：全量测试 224 文件 2134 用例、typecheck、lint 通过；浏览器验收 5 份日志 `evidence/tc07~tc11` 与 5 份截图 `screenshots/tc07~tc11`；对账表 `_qa/reconciliation.md`（69 项断言 100% PASS，0 FAIL，0 BLOCKED）
- 审查结论：双轴独立审查 r1→r4 完成（S-H1/J2/J3/J4/J5/J6/J8、P-W1/W2 本次修复核已修；S-J1/J7、P-W4/M4/X1 驳回；P-W3 转专项立项 ARCH-CK-08；P-M1~M3 经检索平滑降级与 DeepSeek 适配在 r4 全量通过）；`qa-check review` 机器结果 PASS，人工终审确认交付

---

## `ARCH-CK-05`：缩减只为 mock 存在的宽 interface

**状态**：`已完成`  
**推荐强度**：**Worth exploring**  
**建议顺序**：随 `ARCH-CK-01`、`ARCH-CK-02` 分批执行

### 目标

逐字段审查测试注入 interface，只保留具有真实 adapter 或关键失败模式价值的 seam，让测试验证 module 行为，而不是重组其 implementation。

### 证据位置

- `apps/web/src/stores/chat-store.ts:153-169`
- `apps/web/src/stores/chat-store.ts:791-808`
- `apps/web/src/lib/rag/hybrid-retrieval.ts:122-130`
- `apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts:67-78`
- `apps/web/src/app/api/chat/_lib/agent/tools/knowledge-outline.ts:26-32`

### 当前 friction

- 多个 interface 暴露大量可选函数，生产路径通常只使用默认实现。
- 每增加一个内部步骤，测试 interface 倾向增加一个字段。
- 测试通过替换内部函数验证行为，implementation 重排会导致大量无关测试修改。
- `KnowledgeSearchDeps` 同时暴露检索、知识库查询、权限校验、FAQ、embedding、rerank 与开关细节，interface 接近 implementation 知识面。

### Deletion test

逐个字段判断：

1. 是否存在第二个生产 adapter；
2. 是否必须替换该行为才能验证关键失败模式；
3. 是否能通过更高层输入与结果验证同一行为；
4. 删除字段后，复杂度是消失，还是散回多个重要测试。

删除后仅影响 mock 装配且复杂度直接消失的字段，应优先移除。删除后会使关键失败测试依赖真实外部系统的字段，可能是有效的内部 seam。

### 约束与非目标

- 不一次性删除所有依赖注入。
- `RerankProvider` 有真实生产 adapter，且是 ADR-0030 明确 seam，不纳入删除范围。
- `ChatStreamSessionDeps` 已带来脱离 Zustand 测试完整会话结果的 leverage，必须单独评估，不能机械删除。
- 不新增纯粹为了让测试更容易 mock 的公开 seam。
- 本项不单独发动全仓变更，应跟随拥有相关行为的主待办执行。

### 待办

- [x] 为每个依赖字段记录生产 adapter 数量、覆盖的失败模式和使用它的测试。
- [x] 标记“真实 seam”“有价值的内部 seam”“仅供 mock 的假设 seam”。
- [x] 在主待办的 spec 中明确本轮删除或保留的字段。
- [x] 先建立通过正式 interface 验证结果的替代测试。
- [x] 删除无 leverage 的注入字段与对应装配代码。
- [x] 确认测试仍可覆盖数据库失败、RerankProvider 失败、权限拒绝和流中断等关键场景。
- [x] 记录删除前后 interface 字段数量与测试装配量。

### 完成标准

- [x] 每个保留 seam 都有第二个真实 adapter，或有不可替代的关键失败测试价值。
- [x] 测试不再需要知道完整内部流水线由哪些函数组成。
- [x] implementation 可重排而无需大面积修改行为测试。
- [x] 没有降低关键错误模式的测试覆盖。

### 交付记录

- 完成日期：2026-11-02
- 所属主待办：专项主待办（标准车道）
- Spec：`.scratch/mock-interface-reduction/spec.md`
- QA plan：`.scratch/mock-interface-reduction/qa-plan.md`
- 验证证据：交付验证 7 项全部通过（`evidence/qa-final-*-r4.log`，全仓 40 tests、typecheck、lint、静态目录断言）；对账表 `_qa/reconciliation.md`（7 项断言 100% PASS，0 FAIL，0 BLOCKED）
- 审查结论：双轴独立审查 r1→r2 完成（Standards 轴 S-J1 本次修经 r2 复核已修；Spec 轴 P-M1/P-W1/P-W2/P-W3 本次修经 r2 复核已修，r2 双轴均无新发现，见 `review-report.md`）；`qa-check review` 机器结果 PASS，人工终审确认交付

---

## `ARCH-CK-06`：把 `KnowledgeWorkspace` 生命周期变成可测规则

**状态**：`待分析`  
**推荐强度**：**Worth exploring**  
**建议顺序**：6，可独立提前

### 目标

把知识库选择有效性、文档加载、处理状态轮询、上传或创建后的状态更新，以及 Dialog 完成后的定向刷新收敛为可通过稳定 interface 验证的生命周期规则。

### 证据位置

- `apps/web/src/app/knowledge/knowledge-workspace.tsx:76-117`
- `apps/web/src/app/knowledge/knowledge-workspace.tsx:118-176`
- `apps/web/src/app/knowledge/knowledge-workspace.tsx:178-255`
- `apps/web/src/app/knowledge/knowledge-workspace.tsx:259-581`
- `apps/web/src/app/knowledge/knowledge-workspace.tsx:646-687`

### 当前 friction

- 知识库、文档、创建、URL 导入、上传、预览和 metadata 状态集中在顶层页面。
- 轮询启停依赖 effect、当前选择和文档状态的隐式组合。
- 上传后的刷新、创建后的选中状态和 Dialog 完成后的刷新范围由页面回调分散决定。
- 子 module 已有专项测试，但未找到覆盖顶层生命周期的 `KnowledgeWorkspace` 测试。

### Deletion test

删除 `KnowledgeWorkspace` 后，选择、轮询、上传和刷新时序会整体回到路由页，说明它具备价值。问题是数据生命周期与 UI 组合没有形成可测的 depth，而非页面 module 本身多余。

`DocumentPreviewDrawer` 不属于拆分目标。它有多个真实调用者，隐藏正文加载、CitationSnapshotFallback、ChunkNavigator 和 CitationAnchorHighlight；删除后复杂度会散回 `/chat`、`/knowledge` 与检索调试 module，已有良好 leverage。

### 约束与非目标

- 不重写 FAQ、UrlDocument、DocumentMetadata 或 DocumentPreview 的既有 module。
- 不改变 3 秒轮询间隔，除非 spec 有证据要求。
- 不引入新的全局状态工具。
- 不把每个局部状态拆成独立 module。
- 修改 UI 前必须读取 `DESIGN.md` 和 `.claude/rules/ui.md`。

### 待办

- [ ] 画出选择知识库、加载文档、启动轮询、停止轮询和定向刷新的状态图。
- [ ] 明确文档处理终态及每个终态的轮询停止条件。
- [ ] 为切换知识库时旧轮询停止建立测试。
- [ ] 为文档进入终态后停止刷新建立测试。
- [ ] 为上传或创建失败时选择状态保持建立测试。
- [ ] 为 Dialog 成功后只刷新相关数据建立测试。
- [ ] 通过 `grilling` 确认数据生命周期 deep module 的职责和 seam。
- [ ] 编写 spec 与 Schema 4 `qa-plan.md`。
- [ ] 实施最小迁移，保持现有子 module interface 稳定。
- [ ] 验证文件上传、UrlDocument 入库、metadata 编辑、FAQ 与 DocumentPreview。
- [ ] 在 375px 窄屏和桌面端完成真实浏览器验收。
- [ ] 完成独立审查和人工终审。

### 完成标准

- [ ] 切换知识库后旧轮询不会继续更新当前页面。
- [ ] 所有文档进入终态后轮询停止。
- [ ] 上传、创建或 Dialog 失败不会破坏当前有效选择。
- [ ] 成功操作只刷新受影响的数据。
- [ ] 页面通过稳定结果渲染，不直接解释轮询和刷新时序。

### 交付记录

- 完成日期：
- Spec：
- ADR：
- QA plan：
- 验证证据：
- 审查结论：

---

## `ARCH-CK-07`：对齐首页 `?prompt=` 与对话输入预填

**状态**：`待分析`  
**推荐强度**：**Worth exploring**  
**建议顺序**：建议在 `ARCH-CK-04` 后

### 目标

让首页与最近创作入口携带的 `?prompt=` 在进入 `/chat` 后预填到输入框，与 `?goal=` 的预填语义一致，不自动发送。

### 证据位置

- `apps/web/src/components/home/home-content.tsx:98`
- `apps/web/src/components/home/home-content.tsx:141`
- `apps/web/src/app/chat/chat-workspace.tsx:401-404`

### 当前 friction

- 首页「灵感」入口生成 `/chat?new=true&prompt=...`，但 `ChatWorkspace` 只读取 `new`/`goal`/`pack`/`agent`，`prompt` 被静默丢弃。
- `?goal=` 与 `?prompt=` 表达同一意图却只有一条生效，参数语义漂移。

### 约束与非目标

- 复用 `ARCH-CK-04` 的 ChatEntryIntent，不建立第二条 URL 解析路径。
- 不改变首页跳转文案与视觉。
- 不新增自动发送行为。

### 待办

- [ ] 确认 `prompt` 与 `goal` 合并为同一意图字段，或在入口意图中并列并定优先级。
- [ ] 编写 spec 与 Schema 4 `qa-plan.md`。
- [ ] 为首页「灵感」→ 对话预填建立端到端用例。
- [ ] 在 375px 窄屏与桌面端完成真实浏览器验收。

### 完成标准

- [ ] 带 `?prompt=` 进入对话后输入框预填对应文本且不自动发送。
- [ ] `?goal=` 与 `?prompt=` 的预填行为有明确优先级或等价语义。
- [ ] URL 清理后不残留已消费参数。

### 交付记录

- 完成日期：
- Spec：
- ADR：
- QA plan：
- 验证证据：
- 审查结论：

---

## `ARCH-CK-08`：修复对比模式顶部内容避让

**状态**：`待分析`  
**推荐强度**：**Worth exploring**  
**建议顺序**：可独立开展

### 目标

让 `/chat` 对比模式的内容区避开悬浮顶栏，消除标题重影与模型概览卡片被遮挡。

### 证据位置

- `apps/web/src/app/chat/chat-workspace.tsx`（对比模式直接挂载 `ComparisonView`）
- `.scratch/chat-workspace-orchestration/screenshots/tc07-entry.png`（`ARCH-CK-04` 验收截图，标题与对比内容重影）

### 当前 friction

- 单聊消息区通过顶部内边距避开悬浮顶栏，对比视图未设置同等避让，内容顶入半透明 header 下方。
- 该问题在 `ARCH-CK-04` 基线 `3ff3393` 已存在，非该轮引入。

### 约束与非目标

- 只补顶部避让与遮罩关系，不重做对比视图布局。
- 修改前读取 `DESIGN.md` 与 `.claude/rules/ui.md`。

### 待办

- [ ] 在桌面端与 375px 窄屏复现并确认避让值。
- [ ] 编写 spec 与 Schema 4 `qa-plan.md`。
- [ ] 补齐后验证对比视图滚动与输入区不被遮挡。

### 完成标准

- [ ] 对比模式标题与首轮内容不重叠，模型概览卡片完整可见。
- [ ] 单聊模式布局无回退。

### 交付记录

- 完成日期：
- Spec：
- ADR：
- QA plan：
- 验证证据：
- 审查结论：

---

## 明确不做

以下内容不因本轮架构审查而自动进入待办：

- 不拆分 `DocumentPreviewDrawer`；其 deletion test 表明它已有良好 depth、leverage 与 locality。
- 不重议 Artifact、AgentPlan、EvaluatorNode、SelfHealingLoop 或 ApprovalResume 的产品方向。
- 不合并所有检索入口的参数 schema。
- 不替换 Zustand、Next.js、BullMQ、Prisma 或当前 RerankProvider。
- 不以文件行数作为拆分理由。
- 不新增只有一个生产 adapter 的假设 seam。
- 不将 `ARCH-CK-05` 扩展为全仓“为了测试而抽象”的重构。

## 进度日志

| 日期 | 编号 | 状态变化 | 说明 | 关联材料 |
|---|---|---|---|---|
| 2026-10-30 | 全部 | → `待分析` | 根据 `/chat` 与 `/knowledge` 架构扫描建立初始待办 | 本文 |
| 2026-10-31 | `ARCH-CK-02` | `待分析` → `对齐完成（待Spec）` | 完成阶段 1 架构质询与领域建模，确立纯函数投影器方案 | ADR-0045 |
| 2026-11-01 | `ARCH-CK-02` | `对齐完成（待Spec）` → `已完成` | 完成双轴独立审查与真实浏览器验证，落实纯函数投影器解耦 | ADR-0045、qa-plan.md |
| 2026-11-01 | `ARCH-CK-01` | `待分析` → `已完成` | 收拢检索传输契约，建立 applyCrossEncoderRerank 单一事实源深模块，完成 ego-browser 阶段 5 验证与双轴审查 | ADR-0030、qa-plan.md |
| 2026-11-01 | `ARCH-CK-05` | `待分析` → `进行中（随01首批）` | 随 ARCH-CK-01 缩减 HybridRetrievalDeps 与 KnowledgeSearchDeps 可选字段数至 6，清理 rerank.ts 垫片 | ADR-0030 |
| 2026-11-01 | `ARCH-CK-03` | `待分析` → `待规格` | 完成阶段 1 架构质询与领域建模；确认命令式 orchestrator、依赖倒置端口、统一删除矩阵与双快照模型；发现并纳入两条事件死路径与能力包刷新丢失 | ADR-0046、GLOSSARY.md |
| 2026-11-01 | `ARCH-CK-03` | `待规格`（spec 已编写，待工单与 qa-plan） | 完成阶段 2 规格与测试接缝设计；主 seam 为 orchestrator 公开命令，内部 seam 为 ConversationPort 假实现 | `.scratch/conversation-orchestrator/spec.md` |
| 2026-11-01 | `ARCH-CK-03` | `待规格`（工单已拆分，待 qa-plan） | 完成阶段 3A 工单拆分：6 个垂直切片，01 无阻塞，02/03/04 依赖 01，05 依赖 01+04，06 为事件总线删除收尾 | `.scratch/conversation-orchestrator/issues/` |
| 2026-11-01 | `ARCH-CK-03` | `待规格` → `待实现` | 完成阶段 3B：11 个 TC、62 条断言，`qa-check plan` PASS，基线三条交付命令全绿，审查基线已冻结 | `.scratch/conversation-orchestrator/qa-plan.md` |
| 2026-11-01 | `ARCH-CK-03` | `待实现` → `实现完成（待验收）` | 6 个工单全部实现，删除事件总线与协调器，聊天 store 落盘经 `ConversationPort`；全量测试 218 文件 2084 用例、typecheck、lint 通过，构建首屏共享 chunk 104 kB；待阶段 5 浏览器验收与双轴独立审查 | `.scratch/conversation-orchestrator/issues/` |
| 2026-11-02 | `ARCH-CK-03` | `实现完成（待验收）` → `已完成` | 实现于 2026-11-01 交付并提交（3ff3393）；双轴审查 r2 与 `qa-check review` 的 BLOCKED 项（TC04-1/TC04-3 外部 402）经人工终审裁决接受，确认完成 | ADR-0046、`review-report.md`、`qa-plan.md` |
| 2026-11-02 | `ARCH-CK-04` | `待分析` → `待规格` | 完成阶段 1 架构质询：确认纯函数入口意图 + orchestrator 命令；发送事务、Relay 到达下沉；Citation 聚合纯函数；错误提示合并为单一 effect；保留 goal/pack/agent，另立 `ARCH-CK-07` 记录 prompt 预填缺失；不新增 ADR（落实 ADR-0045/0046） | 本文、GLOSSARY.md |
| 2026-11-02 | `ARCH-CK-04` | `待规格`（spec 已编写，待 qa-plan） | 完成阶段 2 规格：44 条用户故事、4 条测试接缝与交付命令；标准车道，下一步 `/qa-test-planner` | `.scratch/chat-workspace-orchestration/spec.md` |
| 2026-11-02 | `ARCH-CK-04` | `待规格` → `已完成` | 完成阶段 3B~6 全流程，69 项断言 100% 通过（0 FAIL，0 BLOCKED），消除知识库 500 崩溃（纯词法全文检索平滑降级），修复附件发送时序与引用清理联动，双轴审查 r4 无发现，人工终审通过 | `.scratch/chat-workspace-orchestration/` |
