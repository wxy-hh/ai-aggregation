# 0045. 加深聊天会话状态模块与纯函数流事件投影器 (ARCH-CK-02)

* **状态**：已接受
* **日期**：2026-10-31
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web/src/stores/chat-store.ts`、`apps/web/src/stores/chat-projectors.ts`、`apps/web/src/stores/chat-session.test.ts`
* **关联计划**：`docs/plans/2026-10-30-chat-knowledge-architecture-backlog.md`（`ARCH-CK-02`）
* **关联决策**：ADR-0015（产物工作台）、ADR-0037（产物版本链与章节补丁）、ADR-0038（智能体计划 DAG）、ADR-0041（人机协同审批协议）

---

## 背景

当前 `chat-store.ts` 超过 1500 行，承担了整个聊天页面的状态容器（15+ 个字段、20+ 个 Actions），并内嵌了 400+ 行的流式会话编排器 `runChatStreamSession`。
随着系统演进，`Message` 同时承载文本、深度思考、工具调用流水、过程旁白、产物标识、结构化引用、计划 DAG 与审批卡片等 9 种流事件状态。
现状问题（friction）：
1. **职责过载与缺乏 Locality**：流事件解码、状态不可变突变、rAF 渲染合帧、1 秒节流落盘、生命周期终止清理全部纠缠在同一个超长异步函数中。任何增加或调整流事件逻辑的操作都会触碰这一敏感函数；
2. **测试重度依赖宽 Interface**：现有的 6 组自动化测试为了验证特定字段的演进（如 Plan 推进或 Approval 状态变更），不得不构造复杂的 `ChatStreamSessionDeps` 假对象并驱动伪流。

## 决策

### 1. 架构定位：加深单一 Store 深度，而非横向拆解多个 Shallow Store

- **保持单一 Zustand Store 外部契约兼容**：不把聊天状态机械拆散为 `artifactStore`、`planStore`、`approvalStore` 等平行全局 store。由于消息、产物、计划与审批在业务本质上具备强相关性（共属于同一场单聊会话），强行拆解会导致严重的跨 store 协调摩擦与事件广播膨胀（直接恶化 `ARCH-CK-03`）；
- **外部接口向下兼容**：保留既有页面（如 `ChatWorkspace`）所依赖的 `useChatStore` 接口，保护现有 69 个用例平滑运行。

### 2. 核心分层：纯函数状态投影器（Pure Projectors）+ 运行时会话编排器（Runtime Orchestrator）

- **下层：纯函数流事件投影器（`chat-projectors.ts`）**：
  将四大独立变化轴的状态不可变计算收拢为零副作用、零 DOM 耦合的纯函数：
  1. `projectStreamTextAndReasoning`：处理首个 token 计时、思考时长冻结、合帧文本暂存；
  2. `projectToolAndNoteEvent`：处理工具调用 running 状态追加、toolResult 终态更新、生成图转附件、过程旁白增量切片；
  3. `projectArtifactStreamEvent`：处理产物 start/delta/end 生命周期与版本引擎（复用 `@repo/shared` 的 `applyArtifactEvent`）；
  4. `projectPlanAndApprovalEvent`：处理计划节点推进与审批卡片解析/失效。
  - **纯函数契约**：`(state, event) => { nextState, sideEffectFlags }`，纯计算、毫秒级测试断言。
- **上层：运行时会话编排器（`runChatStreamSession`）**：
  职责收敛为纯粹的管道驱动：负责消费底层 SSE 流、调用纯投影器更新快照、驱动 rAF 合帧节流与 1 秒持久化落盘，不再包含具体领域字段的突变细节。

### 3. 接缝设计：保留 `ChatStreamSessionDeps` 稳定签名

- 依据 `ARCH-CK-05` 随附清理准则与 deletion test 分析，`ChatStreamSessionDeps` 为测试脱离 Zustand 和页面直接验证完整会话行为提供了真实 leverage；
- 本次重构不削减或变动 `ChatStreamSessionDeps` 的字段签名，确保现有 `chat-session.test.ts`（16 个用例）免受颠簸。

## 后果

### 积极收益

1. **高深度与高局部性（Depth & Locality）**：流事件到状态模型的映射规则集中在 `chat-projectors.ts`，主 store 大幅瘦身；新增或调整流事件类型时，修改范围局限于特定纯函数；
2. **测试驱动体验提升**：测试可以直接针对纯投影函数进行极限边界断言，无需启动模拟流；
3. **零破坏性破坏**：现有 88 个测试套件和页面渲染行为 100% 保持原有表现。

### 代价与权衡

1. 引入了一层纯投影函数抽象，增加了一个代码文件 `chat-projectors.ts`；
2. 调度逻辑（合帧、节流落盘）与纯投影之间需要通过返回的结果标志（如 `shouldPersistImmediately`）进行通信。

## 备选方案

1. **激进契约重塑（全面替换为统一 SessionController）**：破坏性改动过大，需同步修改大量页面逻辑与测试代码，违背渐进重构原则；
2. **中间件管道模式（Stream Interceptor Pipeline）**：过度工程化，为单 store 引入复杂中间件链，显著增加排查与调用栈成本。
