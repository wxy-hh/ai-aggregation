# 0046. 会话协调命令化与双快照持久化 (ARCH-CK-03)

* **状态**：已接受
* **日期**：2026-11-01
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web/src/stores/conversation-orchestrator.ts`（新建）、`conversations-store.ts`、`chat-store.ts`、`comparison-store.ts`、`history-store.ts`、`audio-history-store.ts`、`relay-store.ts`、`store-events.ts`（删除）、`store-coordinator.ts`（删除）、`components/providers/store-coordinator.tsx`（改初始化入口）
* **关联计划**：`docs/plans/2026-10-30-chat-knowledge-architecture-backlog.md`（`ARCH-CK-03`）
* **关联决策**：ADR-0015（产物工作台）、ADR-0019（统一历史工作台）、ADR-0037（产物版本链）、ADR-0038（计划 DAG）、ADR-0041（审批协议）、ADR-0045（加深聊天会话状态模块）

---

## 背景

`/chat` 的跨 store 协调目前同时存在三条路径，且没有任何一条是完整的：

1. **字符串事件总线**：`chat-store` 有 18 处 `emit(CONVERSATION_UPDATED / CONVERSATION_TOOL_OVERRIDES_UPDATED / CHAT_HISTORY_SAVED)`，`conversations-store` 与 `history-store` 各有删除类 `emit`，由 `store-coordinator` 在应用生命周期中监听分发；
2. **store 间直接调用**：`conversations-store` 直接调用 `chat-store.loadConversation/stop` 与 `comparison-store.loadComparison/startNewComparison/stopModel`；`comparison-store` 反向调用 `conversations-store.switchMode/updateComparisonTurns/updateComparisonSelectedModels`；
3. **页面直接装配**：`ChatWorkspace` 自己 `createConversation + loadConversation`、`switchProvider + updateConversationSettings`。

由此产生的可观察缺陷：

- **两条死路径**：`HISTORY_DELETED` 事件全仓无 emit 点，但其监听器是唯一调用 `markSourcesInvalidBySourceIds` 的位置 → 删除历史后接力包不会标记「来源已删」；`RELAY_SOURCES_INVALIDATED` 被 emit 三次但无任何监听器。违反 REQ-006 的接力失效语义；
- **能力包绑定丢失**：`chat-store.setCapabilityPackKey` 只改运行时状态，`conversations-store.updateConversationCapabilityPack` 定义了但全仓无调用者 → 选择能力包后刷新页面，会话绑定丢失；
- **删除路径重复执行**：删除会话时 `deleteConversation` 经事件被 coordinator 再调一次；删除历史时 `history.deleteItem` 被再调一次。循环防护依赖散落在两个公开 action 上的 `_isSyncDelete` 布尔参数；
- **消息形状三层且恢复不一致**：`Message`（15+ 字段）原样存入 `Conversation.messages`，但类型只声明 7 个字段的 `ChatMessage`，靠 `as any` 通过；历史归档裁剪规则藏在 `sendMessage` 的 map 里；`/history` 唤起时 `openHistorySession` 只映射 4 个字段，`plan`/`approval` 明明已归档却被丢弃；
- **事件 payload 全部 `any`**，`store-coordinator` 的解构类型是手写局部声明，无法随字段演进获得编译期保护。

`ARCH-CK-02`（ADR-0045）已明确不拆聊天 store，并把流事件投影与运行时编排分离；本次不推翻该决策，而是补齐它未覆盖的另一半：**跨 store 协调不应放进任何 store，也不应依赖字符串事件**。

## 决策

### 1. 唯一协调位置：命令式 orchestrator

新建 `apps/web/src/stores/conversation-orchestrator.ts`，所有跨 store 的用户动作以命令函数暴露：创建并激活、切换会话、切换模式、新建会话、外部唤起、删除会话/历史、清空历史、模型与能力包同步、消息落盘、历史归档、水合恢复。命令内部按确定顺序调用各 store 的**原子 action**，并拥有传播矩阵。

`conversations-store` 退化为纯状态容器，只保留会话列表、当前指针、模式、`lastActive*` 与 `addConversation/removeConversation/patchConversation/setCurrentConversationId/setMode` 等原子 action；`switchConversation` / `switchMode` / `startNewSession` / `openHistorySession` / `prepareRelaySession` 迁移至 orchestrator，不保留薄包装。

### 2. 依赖倒置：`ConversationPort`

`chat-store` 不再 import 事件总线或其他 store，改为调用注入的窄接口 `ConversationPort`（`persistConversation` / `recordHistory` / `persistToolOverrides`），实现由 orchestrator 在初始化时注册。

**该端口存在的理由是打破模块环**（`chat-store` 不得 import orchestrator），不是为了让测试更容易 mock；测试用假实现只是附带能力。`ARCH-CK-05` 的「不新增只为 mock 存在的 seam」不适用于此，后续审查不得以该条要求删除它。

### 3. 删除事件总线

删除 `store-events.ts` 与 `store-coordinator.ts`；`components/providers/store-coordinator.tsx` 的挂载点保留（维持首屏分包收益），改为调用 `conversationOrchestrator.initialize()`。

### 4. 统一删除传播矩阵

任何删除入口（侧栏删会话、历史页单删/批删/清空、音频库删除）都经 orchestrator 命令处理，并按统一规则传播：删除会话同时删历史归档；删除历史中的 chat 同时删会话；删除 voice 同时删 audio 侧；**任何来源被删除都标记接力失效**。删除 `_isSyncDelete` 参数；`audio-history-store.deleteItem` 拆分为 `deleteVoiceRecord`（音频库入口，删两侧）与 `removeVoiceSide`（协调命令调用，只删 audio 侧）。

### 5. 双快照模型

- `ConversationSnapshotMessage`：本地会话持久化的完整运行时消息，保留推理、用量、引用、产物关联、计划与审批；刷新与侧栏切换共用这一条恢复规则。
- `ArchivedMessage`：历史归档的裁剪消息，保留正文、工具记录、计划、审批与工具产出附件；不含用户上传附件原文（base64）、过程旁白、推理内容、用量、引用与产物关联。
- `/history` 唤起补齐 `plan`/`approval` 恢复；`citations`/`artifactIds` 不恢复，作为已知语义写入 spec，不视为缺陷。
- 删除谎报字段的 `ChatMessage` 类型与相关 `as any`。

### 6. 页面双写收编

`ChatWorkspace` 的 `createConversation + loadConversation`、`switchProvider + updateConversationSettings`（含 Relay 自动切豆包）改为调用 orchestrator 的单条命令。本轮只替换调用点，不重排 JSX、不搬 effect、不动页面结构；URL 参数优先级、发送事务、Relay prepare/commit、错误提示仍归 `ARCH-CK-04`。

### 7. 水合恢复进入 orchestrator

`conversations-store` 的 `onRehydrateStorage` 只保留 `setIsLoaded(true)`；刷新后恢复运行时（`loadConversation` / `loadComparison`）的规则由 `initialize()` 统一执行，与「切换会话」共用同一条加载路径。

## 后果

### 积极收益

1. **单一事实位置**：每种跨 store 动作只有一条权威路径，顺序、中止、幂等与传播矩阵集中在一处；
2. **死路径自然消失**：接力来源失效恢复生效，能力包刷新丢失被修复；
3. **类型诚实**：事件 payload 的 `any`、`ChatMessage` 的类型说谎与 `conv.messages as any` 被删除；
4. **可测性**：orchestrator 可直接以内存 Zustand store 驱动，断言「一个动作只产生一次加载/删除/同步」；
5. **依赖方向单向**：store 之间零 import，消除 `conversations ↔ comparison` 的模块环。

### 代价与权衡

1. 新增 orchestrator（约 200–300 行）与 `ConversationPort` 类型；`conversations-store` 公开 action 从 16 个缩减到约 8 个，UI 调用点需改向；
2. 迁移期存在「部分路径走新命令、部分走旧事件」的中间状态，每批必须跑完整测试套件；最后一批删除量最大（18 处 emit + 6 个监听分支）；
3. `ConversationPort` 只有 orchestrator 一个生产 adapter，需靠本 ADR 显式豁免 `ARCH-CK-05` 的 seam 审查标准；
4. 现有 14 个编排用例搬家、4 个 chat-store 测试文件的落盘断言从监听事件改为断言端口调用，测试改造量大于实现量。

## 备选方案

1. **事件总线单一化**：把 store 间直接调用也改为 emit，coordinator 成为唯一协调者。被否决——事件无返回值，`createConversation` 的返回值与「先中止再切换再加载」的同步顺序只能塞进 payload 或拆成二次事件，且 `any` 无法消除；
2. **协调逻辑留在 `conversations-store`**：不新增 module。被否决——该 store 会同时是状态容器与协调者，外部调用者仍需理解 `loadConversation` 的 7 参顺序，深度不升反降，与 ADR-0045 拒绝的「单 store 承载一切」同向；
3. **保留事件总线兼容期双跑**：被否决——兼容期意味着同时维护两套 seam，与「唯一协调路径」的完成标准直接冲突，且容易遗留不删。

## 与既有决策的关系

- 不推翻 ADR-0045：聊天 store 仍是单一深度 module，纯函数投影器与 `runChatStreamSession` 保持；本决策只规定跨 store 协调不放进任何 store。
- 不改变 ADR-0015（产物池随会话落盘）、ADR-0019（历史大厅分层）、ADR-0037 / 0038 / 0041（产物版本、计划、审批消息字段）的领域行为。
- 恢复 REQ-006 的接力失效语义（该语义此前因事件死路径从未生效）。
