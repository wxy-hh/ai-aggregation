# 0038. 显式目标拆解与可干预计划卡片架构 (AGENT-PLAN-DAG)

* **状态**：已接受
* **日期**：2026-10-29
* **决策者**：AI 聚合平台工程团队
* **范围**：`packages/shared`（`chat-stream-contract` 计划 SSE 事件、`agent-tools` 计划数据模型与状态定义）、`apps/web`（`agent-runner` 前置规划节点与步进追踪、`chat-store` 计划状态管理与消息持久化、`chat-stream` 客户端流事件消费、`AgentPlanCard` 胶囊进度与抽屉交互组件）
* **关联计划**：`docs/plans/chat-agent-evolution-plan.md` (Phase 2 P1: `AGENT-PLAN-DAG`)

---

## 背景

当前系统的 Agent 模式（`agent-runner.ts`）基于经典的 ReAct 循环（最多 5 步，`streamText + tools`），存在以下核心痛点：

1. **执行完全黑盒**：在模型调用工具的 10~30 秒内，前端仅有收起的 `AgentTrace` 弱化展示单步工具名与过程旁白，用户在屏幕前只能被动干等，不知道全局任务被拆成了哪几步、当前进行到了百分之多少；
2. **缺乏确定性预期**：针对复杂调研或报告编写任务，用户无法提前得知模型的推演路径，一旦模型第一步选错方向，用户只能全盘中止重来；
3. **不可干预**：现有多步循环一旦启动，只能要么等待跑完、要么全盘点击 Stop，缺乏针对特定后续步骤的微调、跳过或补充上下文能力。

## 决策

### 1. 计划生成机制：前置显式 Planner 节点

- **规划生成**：在 Agent 模式启动后，编排器先驱动前置 Planner 节点（轻量强约束调用或首轮结构化规划），产出包含 3~5 个检查点的目标计划；
- **确定性契约**：摒弃脆弱的自由文本标签抽取（如 `<plan>`），通过专用 SSE 事件下发结构化数据，确保前端 100% 确定性渲染；
- **预算兼顾**：Planner 规划调用计入总模型调用步数，且输出严格限制在轻量 Token 预算内（$\le 512$ Tokens），保证首屏规划卡片秒级呈现。

### 2. 计划拓扑形态：有序阶段检查点 (Ordered Checkpoints)

- **做减法设计**：放弃带有多分支分叉与复杂连线的全功能图 DAG，采用**有序阶段检查点**模型：
  ```typescript
  export interface PlanStep {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    summary?: string;
  }
  ```
- **工具与步骤关联**：现有 `agent-runner` 的单线程轮次循环中，工具调用（`tool_call`）自动归属到当前处于 `running` 的检查点之下；
- **收敛收益**：状态迁移逻辑清晰，消除了环依赖死锁，且能极其优雅地在移动端垂直呈现。

### 3. 用户干预时序：乐观执行 + 随时打断/干预

- **无阻塞开跑**：计划下发后，**不强制等待用户确认**，立即自动推入第 1 个检查点的执行，端到端延迟最低；
- **人机干预 (Human-in-the-Loop)**：计划卡片提供「调整计划」与「跳过步骤」入口；
- **网络状态机联动**：用户点击干预并确认调整后，前端通过现有 `AbortController` 中止当前流，并将已完成检查点状态与修改后的新计划作为上下文携带发起后续请求，避免长连接服务端挂起的超时断线风险。

### 4. SSE 事件传输契约

在 `packages/shared/src/chat-stream-contract.ts` 中新增两类流式事件：

1. **`plan_created`**：规划节点完成时一次性推送完整计划元信息与初始步骤数组；
2. **`plan_step_update`**：检查点状态流转（进入执行、完成、失败或跳过）时推送轻量增量更新事件：
   ```typescript
   export type ChatStreamPlanCreatedEvent = {
     type: 'plan_created';
     plan: AgentPlan;
   };

   export type ChatStreamPlanStepUpdateEvent = {
     type: 'plan_step_update';
     stepId: string;
     status: PlanStepStatus;
     summary?: string;
   };
   ```

### 5. 持久化与历史回看

- **一等公民字段**：在前端 `Message` 实体及共享契约中增加 `plan?: AgentPlan` 可选字段，随消息一同落盘至浏览器 `localStorage`（以及将来的后端会话存储）；
- **历史回看表现**：刷新或切换会话后，历史消息如实呈现最终状态（完成态展示全绿勾清单，中途中止态保留中止前已完成步骤）；
- **纯净性原则**：计划卡片不污染正文 Markdown，保持导出的纯文本干净可用。

### 6. 前端视觉与移动端适配规范

- **紧凑胶囊进度条**：AI 消息正文顶部默认呈现高信息密度的单行胶囊指示器（如：`[◉ 步骤 2/3] 分析功能与定价差异 · 进行中…`）；
- **可展开步骤清单**：点击整行（热区 $\ge 44\text{px}$）垂直展开各步骤清单与详细状态；
- **移动端适配**：桌面端支持就地展开/浮层编辑，移动端（`useIsMobile`）统一采用原生质感的底部抽屉（Drawer / Dialog），遵守安全区与热区红线。

---

## 影响与后续演进

1. **用户感知**：彻底告别多步执行的黑盒焦虑，建立清晰的进度确定性；
2. **架构平滑**：完全兼容现有的 `AgentTrace`、`ArtifactWorkspace` 与额度结算机制；
3. **为 Phase 3 铺路**：为后续 Phase 3 的 `AGENT-EVAL-CHECK`（独立质检节点）与 `AGENT-HITL-ACTION`（受控写操作确认）提供了天然的承载界面与插桩挂载点。
