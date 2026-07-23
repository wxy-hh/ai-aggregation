# 计划审查报告 — 跨模态单引用接力（标准 L）

> Feature：`2026-07-14-cross-modal-reference-relay`
> 审查对象：`docs/features/2026-07-14-cross-modal-reference-relay/初步实现计划.md`
> 审查级别：full（标准 L 强制；架构/跨模块/共享状态/风险/UX）
> 方法：2 个对抗性审查子代理（架构+可行性、风险边界+UX）对着真实代码逐条证伪 + 审查者独立核实关键发现
> 审查时间：2026-07-15

## 0. 审查结论

计划整体结构（Phase A→E、T1–T13、依赖图、红线）成立，但存在 **1 个 CRITICAL + 4 个 HIGH** 阻塞发现，均已独立核实为真，**必须在进入实现前修订计划**。另有 5 个 MEDIUM、1 个 LOW 与 3 条遗留风险，一并纳入修订。本报告所附修订已全部落回 `初步实现计划.md`。

**阻塞判定**：按 `standard-ml.md`，CRITICAL/HIGH 必须「修复、反驳或用户明确接受风险」后方可进入实现。本批 CRITICAL/HIGH 全部为「修复」（修订计划），无可反驳项，无需用户接受风险——但其中 3 项引出新的范围决策点（D4/D5/D6），需在 `implementation_approval` 门禁由用户拍板。

## 1. 独立核实记录（审查者对关键发现的二次确认）

| 核实项 | 结论 | 证据 |
|--------|------|------|
| 测试基建是否存在 | **Vitest/Playwright 均已配置**（计划 C8 事实错误） | `apps/web/package.json`：`test: vitest --run`、`test:e2e: playwright test`；`apps/web/vitest.config.ts`、`playwright.config.ts` 真实存在（文件日期 2026-07-15）；依赖 `vitest@^4.0.18`、`@playwright/test@^1.61.1`；`project-workflow.md:35/37` 现为 `automated_tests: "present"`、`webapp_testing: "enabled"` |
| queuedQuestion 是否自动发送 | **是，会立即自动发送** | `ai-copilot-conversation.tsx:241-246` useEffect 收到 `queuedQuestion` 即 `void sendQuestion(...)`；`sendQuestion:145/:166` 经 `authFetch('/api/destiny/copilot')` 发起模型调用 |
| 需求是否禁止该机制 | **明确禁止** | 需求 §4.6.4（`:374`）「不得复用会立即发送的快捷问题机制」；`:115`、`:391`「不自动发送」 |

> 说明：测试基建配置文件日期为审查当天（2026-07-15），很可能在计划初次勘察后才补齐，导致计划基于过时事实。审查以**当前磁盘事实**为准。

## 2. 阻塞发现（CRITICAL / HIGH）— 必须修复

### CRITICAL-1 命理顾问复用 queuedQuestion 会自动发送，违反最高不变量
- **发现**：计划 C6/T10「命理『预填顾问』直接复用 `queuedQuestion` 通道」，但该通道收到值后立即调 `sendQuestion` 自动发送并产生模型调用。
- **证据**：`ai-copilot-conversation.tsx:241-246`；`ai-copilot-drawer.tsx` 的 QUICK_ASKS 正是经 `setLocalQueuedQuestion` 触发自动发送；需求 §4.6.4 明令禁止复用该机制。
- **影响**：直接违反红线 1「不得自动产生模型费用」与需求 §4.6.4/§4.7（`:115/:374/:391`）。
- **处置（修复）**：不用 `queuedQuestion` 承载接力预填。给 `AICoPilotConversation` 新增独立 `externalDraft?: { id: number; text: string }` prop，其 effect **仅 `setInput(externalDraft.text)` 不调 `sendQuestion`**，`queuedQuestion` 保持现有快捷问题语义不变。同步修订 C6、T10 产出与验证项（「预填通道 ≠ queuedQuestion」）。

### HIGH-1 计划 C8/D1 测试基建事实错误
- **发现**：计划 C8 断言「`automated-tests: none`，无 Vitest/Jest/Playwright」，D1 据此设「是否引入最小化 Vitest」决策点；实际基建已存在。
- **证据**：见 §1 核实表。
- **影响**：D1 决策点失效；T3/T4 验证方式、T13 验证矩阵遗漏 `pnpm test`/`pnpm test:e2e`。
- **处置（修复）**：更正 C8 为「Vitest 4 + Playwright 已配置」；删除 D1，改为「默认用 Vitest 覆盖接力纯函数（`target-registry`/`adapters`/`destiny-capabilities`），L 级关键路径用 Playwright 做浏览器验证」；T13 验证矩阵纳入 `pnpm test` 与 `pnpm test:e2e`。

### HIGH-2 T6 遗漏 chat-store.ts 派生元数据写入点
- **发现**：对话「发送成功才记派生」的写入发生在 `chat-store.ts` 的 `sendMessage` 成功路径（`createChatHistoryItem`），但 T6 产出未列 `stores/chat-store.ts`。
- **影响**：派生元数据无落点，REQ-016「成功记派生」在对话模块断链。
- **处置（修复）**：T6 产出增加 `apps/web/src/stores/chat-store.ts`（在 `sendMessage` 成功路径把 `derivedFromRelayId/derivedFromReferenceIds` 写入新建历史项，成功后清活动引用）。

### HIGH-3 三个来源操作区为 hover-only，移动端无显式入口
- **发现**：对话 `message-item.tsx:119`（`opacity-0 group-hover:opacity-100`）、图像结果工具栏 `image/page.tsx:451`、视频预览工具栏 `preview-canvas.tsx:250` 均为 hover 才显示。
- **影响**：移动端无 hover，接力入口不可发现，违反 REQ-002「显式接力入口、右键/长按非唯一入口」与验收场景 10。
- **处置（修复）**：T6/T7/T9 各加「移动端显式入口」——接力动作不依赖 hover（移动端常显图标行或常驻溢出 ⋯ 菜单项，桌面可保留 hover）。纳入 T12 统一核对。

### HIGH-4 对比模式下 ChatInput 不渲染，文本引用无落点
- **发现**：T6 只给 `ChatInput` 加预填通道，但 `app/chat/page.tsx:900-904` 在对比模式渲染 `ComparisonView`（由 `ComparisonInput` 接管输入区），`ChatInput` 根本不挂载。
- **影响**：REQ-007「单聊和并行对比都能接收文本引用」在对比模式无承接点，验收场景 11 目标侧必失败。
- **处置（修复）**：T6 产出增加 `components/chat/comparison/comparison-input.tsx`（与 `ChatInput` 对称的可选预填/「填入输入框」通道）；`?relayId=` 恢复按当前 `comparisonMode` 把草稿路由到对应输入区；对比模式引用条放在模型选择区与共享输入区之间。

## 3. 中等发现（MEDIUM）— 纳入修订

| # | 发现 | 处置 |
|---|------|------|
| M-1 | relay-store 经 Dexie 持久化但缺异步 hydration gate，`?relayId=` 恢复可能与 Dexie 读竞态，把有效引用误判「已失效」 | T2 增加 `isInitialized` + `onRehydrateStorage`（对齐 `history-store.ts:351-354` 模式），目标页恢复前等待初始化完成 |
| M-2 | relay-store `setItem` 无 try/catch，大图 DataURL 快照触发 QuotaExceededError 时未处理，违反 REQ-008/§4.3.3「写入失败保留元信息 + 重新选择来源」 | T2 `createBundle` 包 try/catch：失败时落仅含元信息（标题/来源/尺寸）、无 `mediaUrl` 的 bundle 并置 `mediaInvalid: true`，ReferenceBar 据此显示「重新选择来源」；T7 验证项加「超大图快照写入失败」场景 |
| M-3 | `?relayId=` 落点未定义：现有初始化兜底会把草稿切到 `conversations[0]`，「当前对话/新对话」两目标无落点 | T6 明确会话落点策略：目标=「新对话」用 `?new=true&relayId=`；目标=「当前对话」在 bundle 记 `sourceConversationId`，初始化 effect 增加 relayId 分支优先切到该会话（不存在则新建空会话），避免落入兜底 |
| M-4 | T8「合法选区=完全在转写容器内」未定义容器边界；双语模式每段渲染原文/译文两列，跨列选区会把译文混入原文快照 | T8 以「原文列容器」为唯一合法选区边界（译文列/跨列选区一律回退全文并标注「完整转写」）；按 original/translation/bilingual 三模式分别取容器 ref 校验；验证项加「双语跨列选区回退全文」 |
| M-5 | 对比模式派生记录需 hook `comparison-store.ts` 发送成功路径，与计划红线 4「不碰对比核心」存在张力 | 引出决策点 D4（见 §5） |

## 4. 低优先级（LOW）

- **L-1**：T5 产出含 `index.ts` barrel，违反 CLAUDE.md「避免 barrel 文件、用直接路径导入」约定。**处置**：删除 T5 的 `index.ts`，relay 组件一律直接路径导入（如 `@/components/relay/relay-action`）。

## 5. 新增/更新决策点（需 implementation_approval 门禁拍板）

- **D1（已解决）**：测试基建已存在，原「是否引入 Vitest」决策点撤销。默认：纯函数用 Vitest，L 级关键路径用 Playwright。
- **D4（对比模式派生记录范围）**：REQ-016 要求成功记派生，但对比模式记派生需在 `comparison-store.ts` 发送成功处加 hook，触及红线 4。
  - 推荐（A）：v1 在对比发送成功处加**单一附加 hook** 记录派生（`createComparisonHistoryItem` 已存在），改动小且满足 REQ-016；红线 4 的「不重构对比内核」本意是避免大改，附加 hook 不违背。
  - 备选（B）：v1 对比模式只**发起**接力、不记录派生，派生记录留给 v2；与 REQ-016 有缺口，需用户接受。
  - **默认推荐 A**。
- **D5（刷新后草稿恢复粒度）**：REQ-004「刷新可恢复」。ChatInput/ComparisonInput 草稿均为组件本地 `useState`，只持久化 bundle 时刷新会丢用户已编辑的草稿。
  - 推荐（A）：relay-store 增 `draftByTarget: Record<RelayModule, string>`，编辑时同步、刷新后恢复，完整满足 REQ-004。
  - 备选（B）：v1 刷新只恢复引用（bundle），草稿由适配器确定性重生成（刷新前的手工编辑丢失），记为 accepted limitation。
  - **默认推荐 A**（成本可控、体验正确）。
- **D6（RTASR active:false=已确认 的语义依赖）**：实时接力以 `active:false` 判「已确认」。当前代码成立，但 hook 丢弃了网关 `isEnd` 终态信号；若未来网关支持对旧 segId 纠错，该解释失效，快照可能含变化中文本。
  - 处置：v1 维持 `active:false` 判定（当前成立），在 T8 注释标注该语义依赖与风险，不阻塞。

## 6. 遗留风险（记录，不阻塞实现）

1. **回撤独立性**：D3/T11「视频落历史」与 T9 同改 `use-video-generation.ts`，两任务改动面重叠，计划宣称的「各任务可单独回撤」在该文件上不成立。**缓解**：T9 与 T11 对 `use-video-generation.ts` 的改动合并到同一回撤单元，或在回撤文档中显式标注该文件由两任务共享。
2. **RTASR 语义**：见 D6（观察项，当前不成立）。
3. **对比模式派生**：见 D4，待用户拍板。

## 7. 修订落点汇总（已写回 `初步实现计划.md`）

- §0 约束表：更正 C6、C8。
- T2：补 hydration gate、写入失败降级、`draftByTarget` 草稿持久化（D5-A）。
- T3/T4：验证方式改 Vitest 单测。
- T5：删 `index.ts`。
- T6：补 `chat-store.ts`、`comparison-input.tsx`、移动端显式入口、会话落点策略（M-3）。
- T7/T9：补移动端显式入口（HIGH-3）。
- T8：补双语选区边界（M-4）、RTASR 语义注释（D6）。
- T10：`queuedQuestion` → `externalDraft` 独立预填通道（CRITICAL-1）。
- §4 决策点：撤销 D1、新增 D4/D5/D6。
- T13：验证矩阵纳入 `pnpm test`、`pnpm test:e2e`。
