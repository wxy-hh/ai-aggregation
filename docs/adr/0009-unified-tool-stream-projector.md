# 0009. 统一工具调用接缝为 `ToolStreamProjector` 适配器

* **状态**：已接受
* **日期**：2026-10-08
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 与 `@repo/shared` 的 Agent 流事件处理与决策路由链路（`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`、`apps/web/src/lib/agent/tool-projector.ts`、`packages/shared/src/agent-tools.ts`）

---

## 背景

在架构审查报告（`architecture-review-agent.html`）中，Candidate 02 识别：
豆包官方内置搜索（`web_search`）作为由 Ark 服务端执行的即时工具（`providerExecuted: true`），与平台本地自有工具（`image_generate`、`web_fetch` 及 Webhook 工具）在运行时存在“双轨制”。

在原实现中，AI SDK 的决策步流（`decision.fullStream`）产生异构事件，编排器（`agent-runner.ts`）在主循环体内承担了低阶事件适配与分支路由职责：
1. 循环内充斥 6 处防御性类型断言（`(part as { providerExecuted?: boolean })`、`(output as { action?: ... })` 等），用于探测服务端工具与提取查询词；
2. 循环内维护 `stepSawProviderExecuted` 标志位与 `searchCallsCount` 计数；
3. 循环步末显式过滤 `toolCalls`，剥离服务端调用；
4. 空决策路由存在特异分支：针对“仅有服务端工具且无文本”的场景，直接在编排器内硬编码拼装引导语（`nudge`）。

这种耦合破坏了端口与适配器（Ports & Adapters）架构原则：
- 编排器深度泄漏了底层模型流协议的特异性；
- 若未来接入其他服务端工具（如知识库检索、MCP 协议工具或代码解释器），编排器将面临代码膨胀与特异分支泛滥。

---

## 决策

引入单一职责深适配器 `ToolStreamProjector`（`apps/web/src/lib/agent/tool-projector.ts`），建立统一的工具流事件投影与动作规约接缝。**严格行为保持**：既有所有测试（包括 `agent-runner.test.ts`、`chat-handler.agent.test.ts`）100% 保持绿灯，对前端 SSE 事件协议及模型上下文无任何可观测行为破坏。

### 1. 窄接口与决策动作契约 (StepAction)

```ts
export type StepAction =
  | {
      type: 'deliver_answer';
      text: string;
    }
  | {
      type: 'nudge_continue';
      nudgeMessage: ModelMessage;
    }
  | {
      type: 'execute_local_tools';
      noteText?: string;
      localCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
    }
  | {
      type: 'empty_finish';
    };

export interface ProjectorOutcome {
  action: StepAction;
  searchCallsIncrement: number;
}

export interface ProjectorOptions {
  onEvent?: (event: ChatStreamToolCallEvent | ChatStreamToolResultEvent) => void;
}

export function projectDecisionStream(
  decisionStream: AsyncIterable<unknown>,
  rawToolCalls: Array<{ toolCallId: string; toolName: string; input: unknown; providerExecuted?: boolean }>,
  options?: ProjectorOptions
): Promise<ProjectorOutcome>;
```

### 2. 职责划分

- **`ToolStreamProjector` 适配器内收**：
  - 监听流事件：自动识别 `providerExecuted` 服务端工具调用与结果；
  - 结构解析与规范化：封装查询词提取（`extractSearchQuery`）与展示摘要组装（`查询词：${query}` / `搜索完成`）；
  - 事件归一化下发：通过 `onEvent` 统一向上层推送展示级 `tool_call` 与 `tool_result` SSE 契约事件；
  - 统计与过滤：计算服务端搜索调用增量（`searchCallsIncrement`），精准剔除无需本地执行的工具；
  - 路由推断：根据缓冲文本、本地工具列表与服务端执行活动，规约为 4 种排他性标准动作（`StepAction`）。
- **编排器 (`agent-runner.ts`) 保留**：
  - 多步循环调度与生命周期推进；
  - 仅处理规约后的标准动作 `action`：派发执行本地工具、下发最终回答、注入引导语或优雅结束；
  - 消除全部 6 处防御断言与服务端工具特异分支。
- **共享契约 (`packages/shared/src/agent-tools.ts`)**：
  - 沉淀工具动作契约类型定义，打通前后端与各模块间的领域概念。

---

## 备选方案及否决理由

1. **将 `web_search` 包装进 `ToolRegistry` 并提供假的本地 `execute`**：
   *否决理由*：`web_search` 是 Ark 在模型内部执行并直接返回结果的，本地无法“再次执行”，造假的 execute 会引入虚假执行与状态错乱。适配器负责流式识别与规约更为干净。
2. **在 AI SDK 的中间件或全局过滤器中统一拦截**：
   *否决理由*：AI SDK 目前没有跨流事件与工具调用的统一后处理中间件，且易破坏 `fullStream` 原生迭代性能。独立的投影适配器边界清晰、无侵入性。
3. **outcome 仅返回过滤后的列表，路由判断留在编排器**：
   *否决理由*：如果路由判断留在编排器，编排器依然需要感知“是否发生了服务端执行”，特异分支并未消除。必须将决策动作提升为一等公民 `StepAction`。

---

## 后果

### 正面收益
- **接缝统一**：抹平服务端工具与本地自有工具的差异，编排器无需关心工具执行位置；
- **纯粹性**：编排器彻底移除 6 处防御性类型断言，消除 `extractSearchQuery` 和特异分支；
- **高测试杠杆率**：新增 `tool-projector.test.ts` 可脱离模型与 HTTP 请求，100% 离线确定性验证流投影与动作决策；
- **扩展性**：未来新增其他服务端工具时，仅需在适配器内部追加解析投影规则，编排器零侵入。
