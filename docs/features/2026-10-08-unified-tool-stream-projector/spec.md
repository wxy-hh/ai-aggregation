# 统一工具调用接缝（ToolStreamProjector 适配器）· 技术规格

Status: ready-for-agent  
日期：2026-10-08  
来源：架构评审报告 `architecture-review-agent.html` Candidate 02（强烈推荐）· ADR-0009  

---

## Problem Statement

**维护者视角**：
在现有的 Agent 多步自主循环中，豆包 Ark 服务端执行的内置联网搜索（`web_search`，`providerExecuted: true`）与本地执行的自有工具（`image_generate`、`web_fetch` 等）并存。由于底层流事件模型不对等，编排器（`agent-runner.ts`）在主循环体内硬编码了大量防御性分支与类型断言：
1. 循环内充斥 6 处带类型断言的检查（`(part as { providerExecuted?: boolean })`、`(output as { action?: ... })` 等）；
2. 散落维护 `stepSawProviderExecuted` 状态位与 `searchCallsCount` 计数；
3. 循环步末显式过滤 `toolCalls`；
4. 空决策路由存在特异分支：针对“仅有服务端工具且无文本”的场景，直接在编排器内硬编码拼装引导语（`nudge`）。

后果：编排器被迫感知异构工具的流式传输细节与提取算法；未来若接入其他服务端工具（如模型知识库检索、MCP 协议工具或代码解释器），编排器将持续劣化。

**最终用户视角**：
底层流事件双轨制耦合，增加了编排循环因协议或解析微调引发异常的风险。

---

## Solution

在编排层与底层模型流之间建立单一职责深适配器 **`ToolStreamProjector`（工具流投影适配器）**：
1. **流事件投影与下发**：将服务端工具（`providerExecuted: true`）的开始与结束事件统一转换为展示级 `tool_call` 与 `tool_result` SSE 契约事件并向客户端推送；封装查询词提取算法（`extractSearchQuery`）与展示摘要格式化；
2. **动作契约规约**：将每轮流式决策的结果规约为统一的决策动作契约 **`StepAction`**（`deliver_answer` / `nudge_continue` / `execute_local_tools` / `empty_finish`）；
3. **编排器解耦**：编排器仅处理标准动作 `action`，彻底清空 6 处防御性断言与特异分支，实现真正的端口与适配器架构。

**严格行为保持**：
- 现有全部单元测试与集成测试（`agent-runner.test.ts`、`chat-handler.agent.test.ts`、`tool-pipeline.test.ts` 等）100% 绿灯通过；
- 前端收到的 SSE 事件序列、查询词展示摘要（`查询词：${query}` / `搜索完成`）、nudge 系统引导语文本以及 `searchCalls` 计数完全等价。

---

## User Stories

1. 作为工程维护者，我想要将服务端工具的流事件识别与解析封装在适配器中，以便编排器不再包含底层类型断言（`providerExecuted`）。
2. 作为工程维护者，我想要查询词提取（`extractSearchQuery`）细节留在适配器内部，以便后续扩展或修改上游搜索数据解析时零侵入主循环。
3. 作为工程维护者，我想要决策步的流处理产出强类型动作 `StepAction`，以便编排器只需通过单一 `switch` 分支调度后续流程。
4. 作为工程维护者，我想要保留既有的 `web_search` 计数逻辑，以便对计费观测指标（`searchCalls`）零破坏。
5. 作为测试作者，我想要能够在无真实网络与模型的情况下，通过单测（`tool-projector.test.ts`）全面验证各种流事件输入下的动作推断与事件下发。
6. 作为测试作者，我想要现有测试套件（包括 11 个 runner 测试与 38 个 handler 测试）无需做任何语义破坏性调整即可全绿通过。
7. 作为架构评审者，我想要 ADR-0009 记录本设计与备选方案，并在 `CONTEXT.md` 中收录统一工具接缝相关术语。
8. 作为最终用户，我想要在使用 Agent 进行联网搜索与多工具组合调用时，前端交互与结果体验完全无感且高度稳定。

---

## Implementation Decisions

### 1. 适配器接口与类型定义（`apps/web/src/lib/agent/tool-projector.ts`）

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
```

### 2. 共享契约沉淀（`packages/shared/src/agent-tools.ts`）
在共享模块中导出步骤动作类型定义，确立领域抽象。

### 3. 编排器重构（`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`）
- 删除内联的 `extractSearchQuery`；
- 移除 6 处防御性类型断言；
- 移除 `stepSawProviderExecuted` 标志位；
- 移除 `(await decision.toolCalls).filter(...)`；
- 将 `decision.fullStream` 消费与动作派发委托给 `projectDecisionStream`。

---

## Testing Strategy

1. **适配器单测（`tool-projector.test.ts`）**：
   - 纯服务端工具流（有文本 / 无文本截断）；
   - 自有工具流（带思考旁白 / 无旁白）；
   - 服务端与自有工具混合流；
   - 空决策流；
   - 查询词提取结构缺失兜底。
2. **编排器回归（`agent-runner.test.ts`）**：
   - 现有 11 个 runner 级测试全绿，验证链式消息与 providerExecuted 映射。
3. **集成回归（`chat-handler.agent.test.ts`）**：
   - 现有 38 个集成测试全绿。
4. **浏览器验收**：
   - 真实启动前端服务并在真实浏览器环境中验证 Agent 工具调用与联网搜索功能。
