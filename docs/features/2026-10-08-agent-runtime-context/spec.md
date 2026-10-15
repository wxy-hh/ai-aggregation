# 坍缩 Webhook 快照脚手架（AgentRuntimeContext）· 技术规格

Status: ready-for-agent
日期：2026-10-08
来源：架构评审报告 `architecture-review-agent.html` Candidate 04 · ADR-0011

---

## Problem Statement

**维护者视角**：
在 agent 模式请求链路中，用户自定义 Webhook 工具的装配与调次统计属于低阶脚手架，
但目前全部由 HTTP 路由层 `chat-handler.ts` 亲自承担：

1. **路由层亲自查库**：`defaultGetUserTools` 在路由内执行 `prisma.userWebhookTool.findMany`，
   并手写 try/catch 降级（加载失败 → 告警 → 空列表）；
2. **路由层装配快照对象**：`createUserWebhookToolsSnapshot(userTools)` 产出
   `{ registry, getWebhookCallsCount }` 双字段对象，路由必须理解其生命周期与闭包语义；
3. **路由层反查闭包 getter**：`onFinish` 结算回调里调用 `webhookSnapshot.getWebhookCallsCount()`
   取调次，结算 metadata 的组装耦合了快照对象的内部结构；
4. 路由层因此承载了 30+ 行与鉴权、限流、配额无关的粘合胶水，属于浅层装配泄漏。

**最终用户视角**：
不直接可见；但脚手架散落会提高 agent 对话链路的回归风险（如漏记调次导致结算观测失真）。

---

## Solution

引入深模块 **`AgentRuntimeContext`（Agent 运行时上下文）**，把工具装配与统计完全收归运行时内部：

1. **按需加载**：`createAgentRuntimeContext({ userId, errorId, loadUserTools })` 内部完成
   用户 Webhook 工具查询与失败降级（告警文案与旧实现保持一致）；
2. **装配内聚**：内部调用 `createUserWebhookToolsSnapshot` 合并内置注册表与用户工具，
   并持有每请求生命周期的调次闭包计数器；
3. **完成态统一交付**：`finishMetadata()` 在流完成时产出 `{ webhookCalls }`，
   由编排器 `runAgent` 随 `ChatStreamFinish` 一次性交给结算侧，路由层不再触碰闭包 getter；
4. **路由层瘦身**：`chat-handler` 只保留「创建上下文 → 传给 runAgent → 读 finish 字段」三步，
   删除 `defaultGetUserTools`、快照创建与 getter 反查。

**严格行为保持**：
- 结算 metadata 的 `webhookCalls` 语义（实际派发次数、被上限拦截不计入）完全不变；
- 工具加载失败降级路径、告警文案、`getUserTools` 测试注入点全部保留；
- 现有全部单测与集成测试 100% 保持绿灯。

---

## User Stories

1. 作为工程维护者，我想要工具装配与调次统计内聚在运行时上下文里，以便路由层只关心鉴权、限流、配额与分流。
2. 作为计费/观测维护者，我想要完成态元数据由单一来源（运行时上下文）产出，以便 metadata 字段口径可单点验证。
3. 作为测试作者，我想要通过 `loadUserTools` 与 `baseRegistry` 两个注入点离线验证装配、降级与计数契约。
4. 作为最终用户，我想要 agent 对话与 Webhook 工具调用行为在重构后完全不变。

---

## Implementation Decisions

### 1. 深模块位置与接口设计
- 文件路径：`apps/web/src/app/api/chat/_lib/agent/runtime-context.ts`（与 `agent-runner.ts`、
  `tools/user-webhook.ts` 同域，承载 DB 依赖，故不放入纯逻辑的 `@/lib/agent/`）；
- 核心接口：
  - `createAgentRuntimeContext(options: AgentRuntimeContextOptions): Promise<AgentRuntimeContext>`
  - `AgentRuntimeContext.registry: ToolRegistry`（只读，供编排器派发）
  - `AgentRuntimeContext.finishMetadata(): { webhookCalls: number }`
  - 注入点：`loadUserTools?`（缺省查库）、`baseRegistry?`（缺省内置单例）、`errorId?`（日志关联）
- 默认加载实现从 `chat-handler.defaultGetUserTools` 平移，查询条件不变
  （`enabled: true` 且 `user.isAnonymous: false`）。

### 2. 完成态交付链路
- `ChatStreamFinish` 新增可选字段 `webhookCalls?: number`（与既有 `searchCalls` 并列，仅观测）；
- `runAgent` 的 `AgentRunOptions.registry` 改为 `runtime: AgentRuntimeContext`，
  成功与异常两条 `onFinish` 路径均写入 `webhookCalls: runtime.finishMetadata().webhookCalls`；
- `chat-handler.onFinish` 结算 metadata 改读 `finish.webhookCalls ?? 0`。

### 3. 路由层瘦身
- 删除 `chat-handler.ts` 中的 `defaultGetUserTools` 与 `prisma` 导入；
- `ChatHandlerConfig.getUserTools` 注入点保留，语义改为「透传给运行时上下文的可选数据源」；
- agent 分支内以 `agentRuntime` 与 `agentBudget` 成对创建，分流条件为二者同时存在。

---

## Testing Strategy

1. **深模块单测（`runtime-context.test.ts`）**：
   - 启用工具进入合并注册表（`wh_` 前缀）、停用工具隔离、内置工具可用；
   - 加载失败降级：告警留痕、不抛错、注册表回落 `baseRegistry`、元数据为 0；
   - 空工具列表直接复用 `baseRegistry` 单例；
   - `finishMetadata` 计数随实际派发递增，达 `AGENT_MAX_WEBHOOK_CALLS` 后拦截且不增计数、
     审计写入 `outcome='skipped'`。
2. **编排器回归（`agent-runner.test.ts`）**：11 个测试改用 `testRuntime(registry)` 构造上下文，全绿。
3. **集成回归（`chat-handler.agent-webhook.test.ts` / `chat-handler.agent.test.ts`）**：
   HTTP 级主接缝与 38 个 agent 集成测试全绿，`metadata.webhookCalls` 断言不变。
4. **真实浏览器验证**：按 `qa-workflow.md` 阶段 5 执行 `/chat` Agent 模式冒烟（结果落盘
   `.scratch/agent-runtime-context/qa-plan.md`）。
