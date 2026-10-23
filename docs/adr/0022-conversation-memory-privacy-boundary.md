# 0022. 会话记忆索引的隐私边界与增量闭环

* **状态**：已接受
* **日期**：2026-10-23
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web`（设置页、`/api/profile/update`、`memory_search`、`chat-handler`）、`apps/worker`（`memory-index`）、`packages/db`（`conversation_memory_chunks`、`chunk-store`）、`packages/queue`

---

## 背景

在引入 RAG 智能体双源路由后，Agent 具备了自主调用私有知识库（`knowledge_search`）与历史会话记忆（`memory_search`）的能力。然而，用户历史会话通常包含隐私信息、私密暗号、临时密码、个人偏好与草稿讨论。若平台采取静默全局索引策略，将对用户产生严重的隐私侵犯隐患，且在用户期望清除数据时难以保障彻底性。

为践行用户数据主权与严谨的工程安全红线，必须在数据模型、异步链路、工具装配与用户交互全生命周期中确立明确的隐私边界。

## 决策

经工程团队评审，确立以下六项核心架构决策：

### 1. 严格默认关闭 (Strict Opt-in)
- 数据库 `User.memorySearchEnabled` 字段默认值严格强制为 `false`（Prisma `@default(false)`）；
- 未经用户主动在设置页显式开启前，任何会话消息均不触发向量化，亦不产生任何记忆切片；
- 设置页提供大触区（≥44px）设置 Toggle，并附带清晰明确的中文法律与隐私用途说明。

### 2. 彻底的授权撤回闭环 (Physical Cascade Purge on Revoke)
- 当用户在设置页点击关闭记忆检索时，前端弹出高风险二次确认对话框，警示「关闭后将彻底删除已索引的记忆切片」；
- 用户确认后，后端 API（`PATCH /api/profile/update`）在更新用户状态字段的同时，**必须立即同步调用 `deleteMemoryChunksByUser(userId)` 对 `conversation_memory_chunks` 存量数据执行物理硬删除**；
- 杜绝仅置标记位的「假删除」或后台延时批处理，确保撤回授权瞬间完成物理级数据销毁（QA-006 达标）。

### 3. 会话删除自动级联 (Session Deletion Cascade)
- 在数据库模式中通过外键约束 `ON DELETE CASCADE` 确保当 `ChatSession` 被用户删除时，底层关联的 `conversation_memory_chunks` 自动被物理清除；
- 数据访问层提供 `deleteMemoryChunksBySession` 独立函数，为上层业务提供显式删除与单测验证接缝。

### 4. 水位线增量防漏防重机制 (Incremental Watermark Indexing)
- **防抖延迟入队**：会话消息落地后，在 `chat-handler` 的 `onFinish` 回调中进行 30 秒防抖延迟入队（以 `sessionId` 为 BullMQ 去重 jobId）；
- **动态水位线检测**：Worker 消费任务时，首先再次核验用户 `memorySearchEnabled`（已关闭则立即中止）；随后查询该会话已有切片的最大 `chunk_index` 与最后被索引消息的时间戳及已索引消息 ID 集合；
- **防漏防重切块**：仅拉取高于水位线的新增对话消息对，使用 `@langchain/textsplitters` 递归切块、`@node-rs/jieba` 分词并向量化，新切片序号按 `lastChunkIndex + 1 + idx` 严格递增写入，兼顾性能与幂等性。

### 5. 双层 ACL 与装配层动态剔除
- **装配层动态剔除**：在 Agent 运行时上下文初始化（`createAgentRuntimeContext`）阶段，检测当前用户的 `memorySearchEnabled` 开关。若未开启，工具注册表自动剔除 `memory_search` 工具，主对话完全不向大模型暴露该工具的 JSON Schema 描述（杜绝无效探索）；
- **SQL 层强前置 ACL 隔离**：数据访问层（`chunk-store.ts`）在执行稠密余弦距离检索与词法检索时，SQL 语句强制固化 `WHERE cmc."user_id" = $userId`（由服务端会话注入，非模型入参），跨用户伪造参数严格 0 命中。

### 6. 出站透明与不可信标签包裹
- 检索召回的记忆片段在交由大模型前，统一以 `<不可信检索内容 来源="会话记忆">` 标签严格包裹，提示模型这是用户过去的陈述，审慎作为上下文参考，防止历史提示词注入（Prompt Injection）挟持系统行为。

## 影响评估与收益

- **正面收益**：
  - 授权边界清晰：用户对个人会话数据的向量化与检索拥有 100% 知情权与掌控权；
  - 销毁可核验：撤回即物理清库，不存在数据滞留与合规风险；
  - 增量高效：水位线机制避免重复切块向量化，极大节省 GPU 与 Token 开销；
  - 架构鲁棒：装配层与数据层双重隔离，杜绝任何横向越权泄漏。
- **代价与权衡**：
  - 用户关闭后若再次开启，因存量切片已彻底物理销毁，仅能基于后续新会话或重新触发全量重建（不可逆物理删除的必要代价）。
