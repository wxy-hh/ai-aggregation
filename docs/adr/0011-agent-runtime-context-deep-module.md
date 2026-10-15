# 0011. 收敛运行时脚手架深模块 `AgentRuntimeContext`

* **状态**：已接受
* **日期**：2026-10-08
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 的 Agent 运行时装配与结算观测（`apps/web/src/app/api/chat/_lib/chat-handler.ts`、`apps/web/src/app/api/chat/_lib/agent/runtime-context.ts`、`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`）

---

## 背景

在架构审查报告（`architecture-review-agent.html`）中，Candidate 04 识别：
HTTP 路由层 `chat-handler.ts` 充当了「浅装配工」，亲自承担了与鉴权、限流、配额无关的低阶工具脚手架：

1. **路由层亲自查库**：`defaultGetUserTools` 在路由内执行 `prisma.userWebhookTool.findMany`，
   并手写 try/catch 降级分支（加载失败 → 告警留痕 → 空列表）；
2. **路由层装配快照对象**：`createUserWebhookToolsSnapshot(userTools)` 产出
   `{ registry, getWebhookCallsCount }` 双字段快照，路由必须理解该对象的生命周期与闭包语义；
3. **路由层反查闭包 getter**：`onFinish` 结算回调中调用 `webhookSnapshot.getWebhookCallsCount()`
   提取调次写入 metadata，结算字段的组装耦合了快照内部结构；
4. **测试表面脆弱**：装配与统计逻辑混在路由主流程中，无法脱离 HTTP 请求验证加载降级、
   注册表合并与调次计数契约。

---

## 决策

引入单一职责深模块 **`AgentRuntimeContext`**（`apps/web/src/app/api/chat/_lib/agent/runtime-context.ts`），
将用户工具加载、注册表装配与完成态观测元数据的产出完全收敛至运行时内部。

### 1. 极窄接口与数据契约

```ts
export interface AgentRuntimeFinishMetadata {
  /** 本次请求用户 Webhook 工具实际派发次数（被每请求上限拦截的调用不计入） */
  webhookCalls: number;
}

export interface AgentRuntimeContext {
  /** 合并后的工具注册表（内置工具 + 用户自定义 Webhook 工具），供编排器派发 */
  readonly registry: ToolRegistry;
  /** 流完成时索取观测元数据（窄接口：读取运行时内部闭包计数） */
  finishMetadata(): AgentRuntimeFinishMetadata;
}

export interface AgentRuntimeContextOptions {
  userId: string;
  /** 日志关联 id（工具加载失败时留痕用） */
  errorId?: string;
  /** 用户工具加载注入点（测试替身 / 自定义数据源），缺省走数据库查询 */
  loadUserTools?: (userId: string) => Promise<UserWebhookTool[]>;
  /** 基础注册表（缺省为内置工具注册表单例），供测试注入内存注册表 */
  baseRegistry?: ToolRegistry;
}

export async function createAgentRuntimeContext(
  options: AgentRuntimeContextOptions
): Promise<AgentRuntimeContext>;
```

### 2. 运行时内部黑盒

- **加载与降级**：`loadUserTools ?? defaultLoadUserTools`（查询条件与旧实现一致：
  `enabled: true` 且 `user.isAnonymous: false`）；任何异常被吞掉并告警降级，
  告警文案 `'[chat] 加载用户自定义工具失败，按无用户工具继续'` 保持不变（既有测试接缝不动）；
- **装配**：内部调用 `createUserWebhookToolsSnapshot(userTools, baseRegistry)`，
  合并注册表与每请求调次闭包计数器对外不可见；
- **交付**：`finishMetadata()` 在流完成时读取计数，返回值为普通数据（无闭包泄漏）。

### 3. 编排器与路由层重构

- `AgentRunOptions.registry: ToolRegistry` → `runtime: AgentRuntimeContext`，
  编排器以 `const registry = runtime.registry` 取用；
- 成功与异常两条 `onFinish` 路径均写入 `webhookCalls: runtime.finishMetadata().webhookCalls`；
- `ChatStreamFinish` 新增可选字段 `webhookCalls?: number`（与 `searchCalls` 并列，仅观测不影响计费）；
- `chat-handler` 删除 `defaultGetUserTools` 与 `prisma` 导入，`onFinish` 结算 metadata 改读
  `finish.webhookCalls ?? 0`，agent 分支只负责创建上下文并传给 `runAgent`。

---

## 备选方案及否决理由

1. **路由层继续持有快照，仅把查询下沉到别处**：
   *否决理由*：结算 getter 反查与快照生命周期理解仍留在路由层，浅装配泄漏未消除。
2. **由 `tool-pipeline` 深模块顺带统计 webhook 调次**：
   *否决理由*：管道统计的是「全部工具」的治理计数，webhook 每请求上限属于用户工具装配域的闭包语义，
   混入会破坏管道的单一职责与既有测试表面。
3. **`runAgent` 同时接收 `registry` 与 `runtime` 两个入参**：
   *否决理由*：注册表出现双份来源，易产生不一致；单一 `runtime` 入参让注册表与观测元数据同源。

---

## 后果

### 正面收益
- **局部性**：工具配置加载、注册表合并与调次统计完全内聚，路由层剥离 30+ 行粘合胶水；
- **接口即测试表面**：`runtime-context.test.ts` 用两个注入点离线验证装配、降级与计数契约，零 Mock 数据库；
- **元数据交付标准化**：`finish.webhookCalls` 与 `searchCalls` 并列，结算字段口径单点可测；
- **行为严格等价**：runner 11 项、agent 集成 38 项、webhook HTTP 主接缝与全量 1319 项测试保持绿灯。

### 负面/权衡
- `runAgent` 选项从 `registry` 改为 `runtime`，11 处 runner 测试需以 `testRuntime(registry)` 适配（一次性成本）；
- 运行时模块引入 `@repo/db` 依赖，故归属 `_lib/agent/` 而非纯逻辑的 `@/lib/agent/`。
