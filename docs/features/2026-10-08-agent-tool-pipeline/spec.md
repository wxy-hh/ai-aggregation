# 深化工具执行管道（ToolExecutionPipeline 深模块）· 技术规格

Status: ready-for-agent
日期：2026-10-08
来源：架构评审报告 `architecture-review-agent.html` Candidate 01（强烈推荐）· ADR-0008 · `/grill-with-docs` 审问九项裁决

---

## Problem Statement

**维护者视角**：Agent 多步自主循环的工具执行链路（`agent-runner` 编排器）是 Agent 能力中变更频率最高、故障影响面最大的关键路径。当前其主循环内联维护 6 组治理状态——去重缓存、单轮/全局/出图三重上限计数、连败熔断计数、时间预算起点——以及 2 处规则应用（合规二道检查、重试引导软提示）。单次工具调用的执行块约 144 行，把 SSE 事件推送、skip 判定、去重、执行、合规、计数与消息组装混为一体。

后果：任一治理策略的微调（改阈值、改文案、调判定顺序）都必须入侵核心编排状态机；治理行为此前只能经约 1400 行的 handler 级集成测试间接覆盖，新增治理规则的测试成本高、回归风险大。

**最终用户视角**：治理规则与循环状态机互相耦合，使核心对话链路的回归风险长期偏高；工具对话（联网搜索、出图、Webhook 工具）的稳定演进能力被锁死。

---

## Solution

将 8 项工具治理收敛为单一深模块 **工具执行管道（ToolExecutionPipeline）**，编排器退化为纯粹的多步循环。管道以极窄接口（`beginRound / executeCall / shouldHalt`）暴露单次调用执行，内部全量吸收：去重缓存、三重上限（单轮/全局/出图专项）、连败熔断、时间预算、合规二道检查与重试引导。

**严格行为保持**：最终用户可见的对话行为（含全部边界文案、降级路径、SSE 事件时序）与重构前完全一致；现有三套测试一行不改全绿作为机器判据。

维护者收益：治理策略收归一处；编排器删除 6 组散乱状态与约百行胶水代码；新接缝（管道接口）可零 mock 直测治理矩阵——「接口即测试表面」。

---

## User Stories

1. 作为工程维护者，我想要去重缓存 / 三重上限 / 连败熔断 / 时间预算 / 合规二道检查 / 重试引导的规则与状态集中在单一深模块内，以便调整任一策略时不必理解或改动多步循环的编排状态机。
2. 作为工程维护者，我想要单轮、全局、出图专项三类上限的计数与判定与规则定义同处一地，以便修改阈值、判定顺序或文案时只改一处且被直接测试覆盖。
3. 作为工程维护者，我想要连败熔断的计数与判定收归管道、经 `shouldHalt()` 单点暴露，以便循环终止条件只有唯一权威来源。
4. 作为工程维护者，我想要时间预算判定（含可注入时钟）收归管道，以便预算行为可在单测中确定性控制，而不依赖真实等待或框架级计时 mock。
5. 作为工程维护者，我想要「合规何时过检、缓存复用不重复过检」的逻辑留在管道内部、检测器实现以函数注入，以便内容合规策略演进既不触碰编排器、也不违反 lib 层禁 import app 层的分层守卫。
6. 作为测试作者，我想要用假工具规格 + 假合规检查器 + 注入时钟在管道接口直测治理矩阵（零框架级 mock），以便治理行为测试不再需要搭建 ~1400 行的 handler 级脚手架。
7. 作为测试作者，我想要现有三套测试（handler 集成级 / runner 级 / tool-policy 级）一行不改全绿，以便「行为保持」有可机器判定的硬证据。
8. 作为后续接入方（MCP / 知识库等新工具），我想要新工具接入只注册工具规格、不触碰治理规则，以便接入成本与回归风险最小化。
9. 作为后续接入方，我想要新增治理维度（如新上限、新熔断条件）加在管道内部并有直接测试位置，以便规则演进不劣化编排器。
10. 作为代码评审者，我想要编排器只剩决策步、SSE 事件推送、消息回注组装、链式状态与收尾步，以便评审时心智模型小、变更面清晰。
11. 作为代码评审者，我想要 ADR-0008 记录 9 条已知不对称（skip 计入连败、无效调用进缓存等），以便不把刻意保留的行为误判为重构缺陷。
12. 作为最终用户，我想要重构后对话中的工具调用、出图、Webhook 工具与搜索行为与重构前完全一致（含所有边界文案），以便无感升级。
13. 作为最终用户，我想要被上限拦截、熔断或超时时的降级路径与「未执行」文案不变，以便依然得到如实的失败说明。
14. 作为最终用户，我想要被跳过的工具调用依然先收到过程卡片再收到失败结果（事件时序不变），以便界面反馈节奏不变。
15. 作为排障工程师，我想要工具失败日志的字段与位置（errorId / 原因 / 原始错误 / 超时与取消标志）不变，以便线上排障沿用既有日志检索。
16. 作为领域文档消费者，我想要 `CONTEXT.md` 收录「工具执行管道 / 连败熔断 / 出图专项上限 / 合规二道检查」术语，以便后续 spec、工单与评审用词统一。
17. 作为架构跟踪者，我想要 ADR-0008 记录备选方案的否决理由（halt 原因枚举、批量执行接口、chat-safety 下沉、单文件改名合并、outcome 判别字段），以便未来不重复讨论已被否决的方向。

---

## Implementation Decisions

### 1. 新增深模块：工具执行管道

在 `lib/agent` 层新增深模块 `ToolExecutionPipeline`（组合既有 `tool-policy` 低阶机制），按请求在编排器内创建实例。接口形状来自 `/grill-with-docs` 审问产出（ADR-0008）：

```ts
interface ToolCallOutcome {          // 最小四字段：只含编排器真实消费面
  ok: boolean;
  contentForModel: string;           // 已组装：软提示 / 未执行文案
  summaryForDisplay: string;
  attachment?: { kind: 'image'; url: string };
}

interface ToolExecutionPipeline {
  beginRound(): void;                // 决策轮边界：重置轮内计数
  executeCall(call: { toolCallId: string; toolName: string; input: unknown }): Promise<ToolCallOutcome>;
  shouldHalt(): boolean;             // 时间 ∪ 熔断 ∪ 全局上限；循环顶与轮末共用
}

createToolExecutionPipeline({
  registry,                          // 查规格 + 校验入参
  ctx,                               // { userId, signal, errorId }
  limits: {                          // 常量仍留在 agent-config，由编排器传入
    maxTotalCalls, maxCallsPerRound, maxImageGenerates, maxConsecutiveFailures,
  },
  startedAt, runTimeBudgetMs,        // 时间预算
  now?,                              // 可注入时钟（默认 Date.now）
  guardContent,                      // 必传合规检查器（无默认值，杜绝静默关合规）
})
```

### 2. 管道内收清单（8 项治理）

去重缓存（稳定序列化键、首次过检结果复用、重复不重发 attachment、重复附软提示）、单轮上限、全局上限、出图专项上限（含专属文案）、连败熔断计数、时间预算判定、合规二道检查、skip / 软提示文案组装（重试引导）。单次调用的超时 / 截断 / 错误规范化继续复用 `tool-policy` 的低阶机制。

### 3. 编排器保留清单

决策步 `streamText`、SSE 事件推送（`tool_call` 先推 → `executeCall` → `tool_result` 后推）、消息回注组装、链式状态（`previousResponseId` / `pendingIncrement` / 全量回退）、providerExecuted 映射与 `searchCallsCount`、`toolProducedOutput` / 三态结算、收尾步。

### 4. 分层与依赖方向

- 治理常量（`AGENT_MAX_*`）仍在 app 层 `agent-config`，经 `limits` 结构化传入管道（lib 层禁 import `@/app/**`）。
- 合规检查器以**函数注入**进入管道；`chat-safety` 及其 `sse` 依赖不搬迁（保持分层守卫与零文件搬迁）。
- `tool-policy.ts` 保持原位、导出不变（低阶机制，另有 webhook executor 消费其 `truncate` / `DEFAULT_TOOL_POLICY`）；深模块新增独立文件承载。
- `stableSerialize`（缓存键序列化）迁移进管道（其唯一用途）。

### 5. 语义细节冻结（严格行为保持）

- `shouldHalt()` 在循环顶与轮末共用；等价性论证：轮末检查保证「任何一轮结束时三条件均为假」，引导语续轮路径不改动计数，故循环顶由「仅查时间」升级为「查三者」严格等价。中断（`signal.aborted`）检查保留在编排器循环顶原位。
- `beginRound()` 在每轮决策开始处（循环顶 break 检查之后）调用一次。
- 每个调用的判定顺序固定：中断 → 全局上限 → 单轮上限 → 时间预算 → 出图上限（互斥链）。
- 全局上限两种比较并存：单次 skip 用 `>`（第 11 个跳过），`shouldHalt` 用 `>=`（第 10 个执行完即停循环）。
- 9 条已知不对称逐字沿袭，清单见 ADR-0008「已知不对称」（skip 计入连败熔断、工具不存在/参数校验失败的结果也过合规并写入缓存、skip 路径不过合规不进缓存、重复调用不重发 attachment、不重复过检、检查顺序、两种比较、出图计数自增条件、tool_call 事件先于治理判定下发）。

### 6. 明确不在本次范围（防止重构膨胀）

Webhook 调用上限（工具闭包内，Candidate 04）、链式会话状态（Candidate 03）、providerExecuted 双轨统一（Candidate 02）、9 条已知不对称的修复（另开票）。

---

## Testing Decisions

**好测试的标准**：只测管道的接口契约（外部行为），不断言内部实现细节——用假工具规格的 spy 断言「是否执行 / 执行几次」、用返回文案断言「回注内容形态」，不触碰私有计数器的存在形式。

**主接缝（新增）**：管道接口层单测，零框架级 mock——

- 假工具规格经真实 `createToolRegistry` 注册（execute 用 spy）＋假合规检查器（可断言调用次数与载荷）＋注入时钟；前例：`tool-policy.test.ts` 的假规格直测风格。
- 治理矩阵（每项至少一例）：去重命中不重执行 / 附软提示 / 不重发 attachment / 不重复过检；单轮第 4 个起 skip；全局第 11 个 skip 且 `shouldHalt` 在第 10 个后为真；出图第 4 次专属文案；连败熔断（含 skip 计入、成功清零）；时间预算耗尽（注入时钟推进）；中断 skip；工具不存在与参数校验失败进缓存且过合规；skip 不过检不进缓存；判定顺序复合场景（同时命中多个条件的归属）；`beginRound` 跨轮重置。

**回归接缝（既有，一行不改）**：

- `agent-runner.test.ts`（runner 级，仅 mock `streamText`）：链式增量发送、全量回退、收尾步、providerExecuted 映射、事件时序。
- `chat-handler.agent.test.ts`（handler 集成级，~1400 行）：单轮上限、全局上限、连败熔断、出图上限、预算与结算的全链路行为——行为保持的最终机器判据。
- `tool-policy.test.ts`：低阶机制回归。

**最终卡点（阶段 5，真实浏览器）**：本地起 web → 聊天页开启 agent 模式 → 发送触发工具链路的消息 → 验证过程卡片（tool_call/tool_result 成对）、最终回答与无 Console 报错；截图落盘 `.scratch/agent-tool-pipeline/screenshots/`，执行记录追加 `.scratch/agent-tool-pipeline/qa-plan.md`。

**验收判据（三道卡点全过）**：既有三套测试 + typecheck 全绿（一行不改）；新管道测试套件全绿；浏览器冒烟通过且行为与重构前一致。

---

## Out of Scope

- Candidate 02（工具调用接缝：providerExecuted 双轨统一）与 Candidate 03（链式会话模块）与 Candidate 04（Webhook 快照坍缩 / AgentRuntimeContext）。
- 9 条已知不对称的修复（本轮严格行为保持；修复需另开票并重估验收面）。
- `chat-safety` 下沉 lib 层；`tool-policy.ts` 改名合并；`agent-config` 常量搬迁。
- Webhook 调用上限机制向管道迁移。
- 治理参数的动态化 / 配置化（阈值仍为编译期常量）。

---

## Further Notes

- **依据链**：架构评审报告 Candidate 01（强烈推荐）→ `/grill-with-docs` 九项裁决（Q1 严格行为保持 / Q2 范围边界 / Q3 shouldHalt 布尔 / Q4 beginRound 生命周期 / Q5 函数注入 / Q6 最小 outcome / Q7 新增文件布局 / Q8 怪癖全保留）→ ADR-0008。
- **实施顺序建议**：先写管道测试套件（红）→ 实现管道模块（绿）→ 编排器瘦身（既有测试持续绿）→ typecheck → 浏览器验收 → 双轴 code-review → pr（证据链引用 qa-plan 执行记录与截图）。
- **流水线定位**：按 `docs/agents/qa-workflow.md` 剪裁，本为中型号改动（单会话、单区域重构），跳过 3A 工单拆解，走 `/to-spec → /qa-test-planner → /implement（TDD）→ 浏览器验收 → /pr`。
- **已知不对称治理**：9 条清单在 ADR-0008 存档；后续若决定修复任一条，须以新 spec 承接并在其中重新定义验收判据，不得在本重构内顺手修改。
