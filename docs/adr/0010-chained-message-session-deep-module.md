# 0010. 提取链式会话深模块 `ChainedMessageSession`

* **状态**：已接受
* **日期**：2026-10-08
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 的 Agent 状态机与链式上下文管理（`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`、`apps/web/src/lib/agent/chained-session.ts`）

---

## 背景

在架构审查报告（`architecture-review-agent.html`）中，Candidate 03 识别：
在现有的 Agent 有界多步自主循环编排器（`agent-runner.ts`）中，链式调用状态（Responses API 的 `previous_response_id`）与全量回退机制存在隐式双轨状态泄漏问题：

1. **双轨状态手动同步散落**：
   编排器内部显式维护了 3 组底层状态变量：
   - `currentMessages: ModelMessage[]`（全量消息历史池）；
   - `previousResponseId: string | null`（当前链跟踪 ID）；
   - `pendingIncrement: ModelMessage | null`（待发送的增量消息）。
   这些状态的变更逻辑分散在循环内的不同分支（工具结果回注分支、服务端搜索截断 nudge 引导语分支、响应解析分支）以及循环外部的局部辅助函数（`resolveStepPayload`）中。

2. **脆弱性与维护心智负担**：
   在多步循环中，一旦任一分支漏记 `pendingIncrement` 或漏更新 `currentMessages`，或者在断链后误传了旧 `previousResponseId`，会导致发送给火山 Ark Responses API 的消息格式不合法或引用了不存在的调用链，引发 400 协议错误。

3. **测试表面过宽**：
   链式增量追踪与断链自愈重发的逻辑与底层网络请求、流式处理深度绑定在一起。要验证断链回退逻辑，必须模拟完整的 `streamText` 调用流与 SSE 事件处理，无法以零 Mock 的轻量方式对状态机进行针对性测试。

---

## 决策

引入单一职责深模块 **`ChainedMessageSession`**（`apps/web/src/lib/agent/chained-session.ts`），将链状态追踪、增量暂存、全量历史池维护与断链自愈重发逻辑完全收敛至该深模块内部。

### 1. 极窄接口与数据契约

```ts
export interface StepPayload {
  /** 本步待发送给模型的消息列表（链式为增量消息，回退时为全量累积历史） */
  messages: ModelMessage[];
  /** 链式调用时的上一轮响应 ID；未建链或断链回退时为 undefined */
  previousResponseId?: string;
  /** 是否处于链式状态（便于观测与调试） */
  isChained: boolean;
}

export interface ChainedMessageSessionOptions {
  /** 初始对话历史消息 */
  initialMessages: ChatMessage[] | ModelMessage[];
}

export interface ModelResponseLike {
  id?: string;
  messages?: ModelMessage[];
}

export interface ChainedMessageSession {
  /** 索取当前步骤发送载荷（窄接口）：自动根据当前链状态决定是发增量还是发全量 */
  getStepPayload(): StepPayload;

  /**
   * 记录模型响应：
   * 1. 提取 responseId 更新链追踪状态；若无 id 则标记断链（自愈回退机制触发）
   * 2. 暂存决策响应产生的 assistant 消息，供回退池使用
   */
  recordResponse(response: ModelResponseLike): void;

  /**
   * 追加待发增量消息（支持工具执行结果或引导语）
   * 内部同时推演增量状态与维护全量回退池
   */
  appendIncrement(
    message: ModelMessage,
    options?: { withDecisionMessages?: boolean }
  ): void;

  /** 追加工具执行结果增量（便捷语义包装） */
  appendToolResult(toolMessage: ModelMessage): void;

  /** 追加引导语增量（便捷语义包装） */
  appendNudge(nudgeMessage: ModelMessage): void;

  /** 获取当前累积的全量历史池（用于审计或状态快照） */
  getCurrentMessages(): ModelMessage[];

  /** 获取当前链追踪 ID */
  getPreviousResponseId(): string | null;
}
```

### 2. 状态机自愈原理 (Auto-fallback & Self-healing)

- **首轮调用**：无 `previousResponseId` 与 `pendingIncrement`，输出 `isChained: false`，发送初始全量历史；
- **正常建链**：模型响应包含 `id: "resp_1"`，记录后注入工具结果增量；下一轮 `getStepPayload()` 输出 `isChained: true`，仅发送该条增量工具消息，并带上 `previousResponseId: "resp_1"`；
- **断链回退**：若某一轮模型响应缺少 `id`（例如上游异常或非 Responses 兼容通道），`recordResponse` 自动将链追踪置为 `null`；下一轮索取载荷时，自动回退为全量 `currentMessages` 历史，且不附带 `previousResponseId`，防止上游因断链报 400；
- **断链后自愈**：在全量回退重发后，若后续模型响应重新返回有效 `id`，状态机自动衔接新链路，后续步骤恢复链式增量发送。

### 3. 编排器重构

在 `agent-runner.ts` 中：
- 删除 `currentMessages`、`previousResponseId`、`pendingIncrement` 三个散落变量；
- 删除局部函数 `resolveStepPayload`；
- 在主循环决策步与收尾步统一调用 `session.getStepPayload()`；
- 收到响应后调用 `session.recordResponse(...)`；
- 收到 nudge 引导语调用 `session.appendNudge(action.nudgeMessage)`；
- 本地工具执行完毕调用 `session.appendToolResult(toolMessage)`。

---

## 备选方案及否决理由

1. **直接由 AI SDK 内部自动处理链式增量**：
   *否决理由*：AI SDK 目前的 `providerOptions.openai.previousResponseId` 仅支持被动传入，且 AI SDK 默认的 `store: true` 行为会将历史项序列化为 `item_reference`，该行为会被火山 Ark 拒绝。必须在应用层做确定性增量与回退管理。
2. **在 `agent-runner.ts` 内部继续保留私有方法**：
   *否决理由*：内部私有方法无法作为独立的深模块单独进行确定性单测，状态依然混杂在编排器闭包中，无法实现“接口即测试表面”。

---

## 后果

### 正面收益
- **消除隐式状态泄漏**：将分散在循环多处的增量与历史同步逻辑内聚在深模块内部；
- **接口极窄**：编排器无需知道增量数组与全量数组的同步规则，只需索取载荷与提交结果；
- **接口即测试表面**：`ChainedMessageSession` 可完全脱离异步流、模型接口与 SSE 管道独立单测，全面覆盖各种断链、自愈与多轮状态；
- **行为严格等价**：现有 11 个 runner 单元测试与 38 个 handler 集成测试 100% 保持绿灯。
