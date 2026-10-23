# 0008. 工具执行治理收敛为深模块 `ToolExecutionPipeline`

* **编号**：ADR-0008
* **状态**：已接受
* **日期**：2026-10-08
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` Agent 多步自主循环的工具执行链路（`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`、`apps/web/src/lib/agent/tool-pipeline.ts`）

---

## 背景

架构评审报告（`architecture-review-agent.html`）Candidate 01（强烈推荐）识别：`agent-runner.ts` 已达 620 行，是 Agent 链路中变更频率最高、故障影响面最大的关键路径。其主循环内联维护 6 组治理状态与 2 处规则应用：

1. **去重缓存**（`toolCache`，稳定序列化键 / 首次过检复用 / 重复不重发 attachment）；
2. **单轮工具上限 3**（callIndex 判定，与 Ark 服务端 `maxToolCalls:3` 双保险）；
3. **全局工具上限 10**；
4. **出图专项上限 3**（独立计数器 + 专属文案）；
5. **连败熔断 3**（skip 同样计失败）；
6. **时间预算 240s**（`startedAt` 为循环私有）；
7. **合规二道检查**（工具结果进模型前的服务端拦截，依赖 app 层 `chat-safety`）；
8. **重试引导软提示**（缓存重复提示 / skip「未执行」文案）。

每次工具调用的执行块约 144 行（L373-516），把 SSE 事件推送、skip 判定、去重、执行、合规、计数与消息组装混为一体。任何治理策略微调都必须入侵核心编排状态机；而 `tool-policy.ts` 是浅模块（仅超时 / 截断 / 错误规范化），规则无处安放。治理行为此前只能经 ~1400 行的 handler 级集成测试间接覆盖。

---

## 决策

将 8 项治理收敛为深模块 `ToolExecutionPipeline`（`apps/web/src/lib/agent/tool-pipeline.ts`），编排器退化为纯粹的多步循环。**严格行为保持**：现有三套测试（`chat-handler.agent.test.ts` / `agent-runner.test.ts` / `tool-policy.test.ts`）一行不改全绿作为硬验收判据。

### 1. 窄接口（接口即测试表面）

```ts
createToolExecutionPipeline({
  registry,                    // ToolRegistry：查 spec + 校验入参
  ctx,                         // { userId, signal, errorId }
  limits: {                    // 常量仍在 app 层 agent-config（分层守卫），由 runner 传入
    maxTotalCalls, maxCallsPerRound, maxImageGenerates, maxConsecutiveFailures,
  },
  startedAt, runTimeBudgetMs,  // 时间预算
  now?,                        // 可注入时钟（默认 Date.now），单测零 mock 掌控时间
  guardContent,                // 必传合规检查器（无默认值，杜绝静默关合规）
})

interface ToolExecutionPipeline {
  beginRound(): void;          // 决策轮边界：重置轮内计数
  executeCall(call): Promise<ToolCallOutcome>;
  shouldHalt(): boolean;       // 时间 ∪ 熔断 ∪ 全局上限；循环顶与轮末共用
}

interface ToolCallOutcome {    // 最小四字段：只含 runner 真实消费面
  ok: boolean;
  contentForModel: string;     // 已组装：软提示 / 未执行文案
  summaryForDisplay: string;
  attachment?: { kind: 'image'; url: string };
}
```

按请求在 `runAgent.start()` 内创建实例；`beginRound()` 在每轮决策开始处（循环顶 break 检查之后）调用一次。

### 2. 职责划分

- **pipeline 内收**：去重缓存、单轮 / 全局 / 出图上限（含判定顺序与文案）、连败熔断计数、时间预算判定、合规二道检查、skip / 软提示文案组装；单次调用机制复用 `tool-policy.ts` 的 `runToolWithPolicy`（超时 / 截断 / 错误规范化）。
- **runner 保留**：决策步、SSE 事件推送（tool_call 先推 → tool_result 后推）、消息回注组装、链式状态（Candidate 03 范畴）、providerExecuted 映射、`searchCallsCount`、`toolProducedOutput`/`hasOutput` 结算、收尾步。

### 3. 分层与边界

- 合规检查器以**函数注入**进入 pipeline：`chat-safety.ts` 及其 `sse` 依赖留在 app 层，遵守 `lib/` 禁 import `@/app/**` 的分层守卫，零文件搬迁。
- `tool-policy.ts` 保持原位（低阶机制，`lib/webhook/executor.ts` 亦消费其 `truncate` / `DEFAULT_TOOL_POLICY`），新增文件承载深模块。
- **明确不在本次范围**：webhook 闭包上限（Candidate 04）、`previousResponseId` 链式状态（Candidate 03）、providerExecuted 双轨统一（Candidate 02）。

---

## 备选方案及否决理由

1. **halt 判定带原因枚举（`haltReason()`）或由 outcome 携带 halt 标志**：
   *否决理由*：现状循环退出无任何日志，原因枚举会新增可观测输出；outcome 携带标志则导致「轮末 halt 判定」与「循环顶查询」双机制并存。取布尔单方法 `shouldHalt()`。等价性论证：轮末检查保证「任何一轮结束时三条件均为假」，nudge-continue 路径不改动计数，故把循环顶的「仅查时间」升级为「查三者」严格等价。
2. **单轮边界用 `callIndex` 传参或批量接口 `executeRound(calls)`**：
   *否决理由*：传参让 runner 保留位置感知且接口多参数；批量接口需把 SSE 事件以回调形式拖进 pipeline（把传输层关注点混入 lib 层）。取 `beginRound()` 生命周期方法，计数与规则完全内聚；「忘调 beginRound」的风险由现有跨轮测试（全局上限测试含多轮）兜底。
3. **`chat-safety` 下沉 lib 层**：
   *否决理由*：该模块依赖 app 层 `sse`（`encodeSseEvent`）并有 chat-handler 等多处消费方，跨层搬迁超出本次重构射程。函数注入保留规则的「何时/如何复用过检结果」在 pipeline 内，仅把检测器实现留给 app 层。
4. **`tool-policy.ts` 改名合并为单文件 `tool-pipeline.ts`**：
   *否决理由*：制造 webhook executor import 与测试文件改名的链式 churn，无行为收益；新文件 + policy 降为机制同样达成「runner 不再面向 tool-policy 接口」的深化目标。
5. **outcome 增加 `kind` 判别字段（executed/cached/skipped/...）**：
   *否决理由*：当前无消费方；测试用 fake 工具 spy 断执行次数 + 文案断言已足够直接。未来需要时为纯追加，不破坏兼容。

---

## 后果

### 正面收益

- **局部性**：治理策略收归一处；编排器删除 6 组散乱状态与约百行胶水代码（620 → ~480 行）；
- **接口即测试表面**：新增 `tool-pipeline.test.ts` 可零 mock（假工具 spec + 假合规检查器 + 注入时钟）直测治理矩阵，治理行为从「handler 级间接覆盖」升级为「管道级直接覆盖」；
- **杠杆率**：后续接入新工具 / 调整治理参数不再触碰核心编排状态机。

### 已知不对称（严格行为保持，逐字沿袭；修复需另开票）

1. skip 也计入连败熔断（连续 3 次超限 skip 会触发熔断）；
2. 工具不存在 / 参数校验失败的结果也过合规并**写入去重缓存**（重复无效调用吃缓存、不重新校验）；
3. skip 路径不过合规、不进缓存；
4. 重复调用不重发 attachment（防前端按新 callId 重复渲染破出图上限）；
5. 重复调用不重复过检（合规只在首次执行跑一次，缓存存过检后内容）；
6. 检查顺序固定：中断 → 全局上限 → 单轮上限 → 时间预算 → 出图上限（互斥 else-if，顺序决定复合场景的文案与计数归属）；
7. 全局上限两种比较并存：单次 skip 用 `>`（第 11 个跳过），轮末 `shouldHalt` 用 `>=`（第 10 个执行完即停循环）；
8. 出图计数仅在前四类检查全过后自增（被取消 / 超限的 `image_generate` 不消耗出图额度）；
9. tool_call 事件先于治理判定下发（即使随即被 skip，前端也先收到卡片）。
