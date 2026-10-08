# 提取链式会话深模块（ChainedMessageSession）· 技术规格

Status: ready-for-agent  
日期：2026-10-08  
来源：架构评审报告 `architecture-review-agent.html` Candidate 03 · ADR-0010  

---

## Problem Statement

**维护者视角**：
在当前的 Agent 有界多步自主循环中，与底层火山 Ark Responses API 交互需要使用 `previous_response_id` 链式调用机制。
为了在链式状态下节省传输带宽与 token，编排器采用增量发送模式；而当响应缺少 id 时，又必须能够安全回退至全量发送模式。

然而在现有实现中，这一状态管理逻辑直接散落在 `agent-runner.ts` 的主循环体中：
1. 主循环闭包中显式维护了 3 个底层变量：`currentMessages`、`previousResponseId` 和 `pendingIncrement`；
2. 循环各分支（工具结果回注、搜索截断引导语续跑、响应解析）各自手动同步更新全量数组与增量变量；
3. 状态机的隐式规则复杂：任一分支遗漏同步或时序错乱，都会导致上游报错（如因 call_id 不在链上报 400，或增量消息丢失）；
4. 无法脱离网络与流处理对断链回退、断链自愈以及多轮增量进行轻量、确定性的单元测试。

**最终用户视角**：
双轨状态容易引入隐蔽的边缘 Case 缺陷，导致会话在中途意外中断或报 400 失败。

---

## Solution

提取并封装单一职责深模块 **`ChainedMessageSession`（链式会话状态机）**：
1. **统一生命周期管理**：以极窄接口暴露载荷推演 `getStepPayload()`、响应记录 `recordResponse()` 与增量追加 `appendIncrement()` / `appendToolResult()` / `appendNudge()`；
2. **内聚状态流转**：全量历史池累积、链追踪 ID 维护、增量暂存以及断链回退、断链自愈机制全部内聚在模块内部；
3. **编排器解耦**：编排器不再维护任何链状态与增量数组变量，纯粹作为消费者索取每步载荷；
4. **接口即测试表面**：通过独立的单测套件 `chained-session.test.ts` 全面验证状态机流转与自愈矩阵。

**严格行为保持**：
- 现有全部单元测试与集成测试（`agent-runner.test.ts`、`chat-handler.agent.test.ts`）100% 保持绿灯；
- 链式调用参数、消息回传格式、断链回退时机完全与既有协议保持一致。

---

## User Stories

1. 作为工程维护者，我想要将链式增量与全量回退状态内聚在深模块中，以便编排器代码更加纯粹、易读、可维护。
2. 作为工程维护者，我想要单轮决策与收尾步都能通过统一的窄接口索取发送载荷，消除重复组装代码。
3. 作为测试作者，我想要能够在无 Mock 网络流的前提下，直接针对状态机测试断链回退与自愈行为。
4. 作为最终用户，我想要 Agent 多步对话和工具调用过程高度稳定，即使上游临时丢失响应 ID 也能自动无缝降级并自愈，不影响正常回答生成。

---

## Implementation Decisions

### 1. 深模块位置与接口设计
- 文件路径：`apps/web/src/lib/agent/chained-session.ts`
- 核心接口：
  - `createChainedMessageSession(options: ChainedMessageSessionOptions): ChainedMessageSession`
  - `getStepPayload(): StepPayload`
  - `recordResponse(response: ModelResponseLike): void`
  - `appendIncrement(message: ModelMessage, options?: { withDecisionMessages?: boolean }): void`
  - `appendToolResult(toolMessage: ModelMessage): void`
  - `appendNudge(nudgeMessage: ModelMessage): void`
  - `getCurrentMessages(): ModelMessage[]`
  - `getPreviousResponseId(): string | null`

### 2. 编排器（`agent-runner.ts`）精简
- 移除 `currentMessages`、`previousResponseId`、`pendingIncrement` 3 组变量；
- 移除 `resolveStepPayload` 局部函数；
- 接入 `ChainedMessageSession` 实例驱动决策步与收尾步。

---

## Testing Strategy

1. **状态机单元测试（`apps/web/src/lib/agent/chained-session.test.ts`）**：
   - 首步全量发送载荷（无 `previousResponseId`）；
   - 单轮工具执行后转换为链式增量载荷（携带 `previousResponseId`）；
   - 多轮连续工具调用的链式增量传递；
   - 响应缺少 ID 时断链并自愈回退至全量累积历史；
   - 断链后下一轮获得新 ID 时的自愈并恢复链式；
   - 服务端搜索截断 nudge 引导语的增量与全量同步；
   - 消息深拷贝隔离，防止外部意外修改内部状态。
2. **编排器回归验证（`agent-runner.test.ts`）**：
   - 现有 11 个测试全量通过。
3. **集成回归测试（`chat-handler.agent.test.ts`）**：
   - 现有 38 个集成测试全量通过。
4. **真实浏览器验证**：
   - 按照 `qa-workflow.md` 执行真实浏览器探活与交互验收。
