# 代码审查报告 — 跨模态单引用接力

> Feature：`2026-07-14-cross-modal-reference-relay`（标准 L）
> BASE_SHA：6f88320；改动为工作区已 `git add` 未 commit 的 67 个文件（+3501/-208）
> 审查依据：`需求说明书.md`（REQ-001~017、17 验收场景）、`初步实现计划.md`（含 plan-review D4/D5/D6 修订）、`rollback-units.md`、CLAUDE.md、`.claude/rules/specs/web/index.md`
> 说明：本报告原路径 `docs/reviews/2026-07-15-cross-modal-relay-code-review.md`，compact 收尾时被 finalizer 删除后由上下文重建归档于此。

## 结论

需修复（无 CRITICAL；HIGH 集中在执行失败路径的引用恢复缺陷与命理侧 REQ 缺口，均可局部修复，不影响整体架构成立）

> **复检更新（2026-07-15）**：6 HIGH 全部修复并回归通过（typecheck / 全量 lint / vitest 130）；MEDIUM 中 M1/M2/M5 与 LOW 中 L1/L2/L3 已修；M3/M4 经评估记为 accepted gap（见各条 Disposition）。修复证据：见下方各条「复检」。

## 统计

- CRITICAL: 0
- HIGH: 6（复检：6 fixed）
- MEDIUM: 5（复检：3 fixed / 2 accepted gap）
- LOW: 3（复检：3 fixed）

## Findings

### H1. 执行失败路径引用与草稿不可恢复 — HIGH
- **位置**：`apps/web/src/components/relay/use-relay-receive.ts:98-107`；调用方 `apps/web/src/app/chat/page.tsx:505`、`apps/web/src/components/chat/comparison/comparison-input.tsx:72`、`apps/web/src/app/image/page.tsx:131`、`apps/web/src/app/video/_components/video-editor.tsx:95`
- **问题**：`consumeForExecution()` 在**执行前**调用，并立即 `clearActiveForTarget` + `clearDraftForTarget`，而失败路径（chat catch 分支、comparison 各 run failed、image/video catch）均不恢复活动引用与草稿。
- **影响**：直接违反 REQ-016「执行失败时保留引用和草稿，允许原地重试」与计划红线「失败时保留引用和草稿」。任一模块执行失败后，引用条消失、持久化草稿被清，用户必须重新发起接力。验收场景覆盖矩阵自标「失败保留引用重试」实际不成立。
- **建议**：将「consume」拆成两阶段——执行前 `prepareExecution()` 只读派生元数据（不清状态），成功回调里再 `commitExecution()` 清引用与草稿；或失败分支显式 `setActiveForTarget(target, bundle.id)` + 恢复 `draftByTarget`。四个调用点统一改造，并在 chat 取消（AbortError）路径同样验证保留。
- **Disposition**：fixed（两阶段 prepareExecution/commitExecution；chat/对比/图片/视频四调用点统一改造，chat 取消路径保留引用）

### H2. 奇门接力完成后引用条驻留且派生元数据未写历史 — HIGH
- **位置**：`apps/web/src/app/destiny/_components/qimen-workspace.tsx:105-117`（预填 effect）与 `:168-178`（`createDestinyHistoryItem` + `addItem`）
- **问题**：奇门只在到达时预填 `description`，起局成功后的历史写入点没有调用 `relay.consumeForExecution()`，也没有把派生元数据传给 `createDestinyHistoryItem`。
- **影响**：违反 REQ-016「目标执行成功后…输入区恢复无引用状态」（起局成功后「待解读引用」横幅仍在，下次进命理页还挂着）与 REQ-013「图像、视频、对话和命理等新结果可以记录派生来源元数据」（命理类历史项全程无派生记录）。REQ §4.6.5「起局成功后完成接力」未实现。
- **建议**：在 `addItem` 成功分支取 `relay.consumeForExecution()` 的返回值并透传给 `createDestinyHistoryItem`（helper 加 `derivation` 选项，与 `createVideoHistoryItem` 对齐）。同类缺口同样存在于八字/紫微命盘历史写入（`bazi-workspace.tsx:398-410`），如确认命理派生纳入首版范围，一并补齐；若明确裁剪，需在 status/requirements-coverage 记为 accepted gap。
- **Disposition**：fixed（createDestinyHistoryItem 加 derivation 选项；奇门起局成功两阶段写派生+commit，八字/紫微历史写派生）

### H3. 紫微斗数接力链路缺失：选紫微后永不完成接力、无顾问预填 — HIGH
- **位置**：`apps/web/src/app/destiny/_components/destiny-page-client.tsx:24-27, 111`（`onPick` 直接 `setActiveModule`）；`apps/web/src/app/destiny/_components/ziwei-workspace.tsx`（无任何 relay 引用）；对照 `bazi-workspace.tsx:104-118`
- **问题**：`RelayMethodPicker` 列出八字/紫微/奇门三选，但 `onPick('ziwei')` 只是切 tab；`ziwei-workspace.tsx` 未接 `useRelayReceive`、无 `externalDraft` 预填链路（该文件本身不用 `DestinyShell`/AI 顾问）。
- **影响**：REQ-011「八字、紫微斗数、奇门遁甲平级展示」与 REQ §4.6.4「八字与紫微生成报告后，引用文本预填为命理顾问首个问题」对紫微不成立——用户选择紫微后引用被静默搁置（切回表单步横幅虽在，但紫微结果步没有任何承接），与验收场景 4/5/16 的预期不符。
- **建议**：二选一——(a) 为 ziwei 结果步补与 bazi 对称的 `relayDraft`/`onRelayDraftHandled` 链路（若紫微无 AI 顾问，则明确其完成语义并在引用条上给出说明）；(b) 首版从 `DESTINY_CAPABILITIES` 暂时移除 ziwei 或标注其承接范围，并在需求覆盖矩阵中记录该裁剪。不建议维持现状静默缺口。
- **Disposition**：fixed（紫微无顾问，承接语义=生成命盘即完成接力；ziwei 接 useRelayReceive，成功写派生+commitExecution）

### H4. 图片→视频参考图缺失模型能力守卫与手动参考图替换确认 — HIGH
- **位置**：`apps/web/src/app/video/_components/video-editor.tsx:56-66`
- **问题**：`targetRole === 'reference_image'` 时无条件 `setReferenceImage(relayMediaUrl)`：①agnes 模型下 `config-panel.tsx` 不渲染 CogVideoX 参考图区块，`configToApiParams`（`use-video-generation.ts:80-91`）只用 agnes 的 `config.referenceImages`，静默写入的 `referenceImage` 不会生效且无报错；②已有手动参考图时被直接覆盖，无替换确认。
- **影响**：违反 REQ §4.5.3「当前模型不支持图片输入时…显示中文错误并提供重新选择目标」与「已有手动参考图时必须先由用户确认替换」。用户在 agnes 模型下收到图片引用会看到引用条但参考图从未生效，属静默失败。
- **建议**：预填 effect 中判断 `getProviderByModel(config.model)`/当前模型参考图能力，不支持时展示中文提示并不写字段；已有 `referenceImage` 时复用替换确认交互（或至少 toast 提示并保留原图）。
- **Disposition**：fixed（video-editor 参考图预填加能力守卫：agnes 提示不生效/已有手动参考图不静默覆盖，均中文 toast）

### H5. 紫微/八字「顾问发送完成接力」语义被提前到「预填即完成」— HIGH
- **位置**：`apps/web/src/app/destiny/_components/bazi-workspace.tsx:111-118`；`apps/web/src/app/destiny/_components/chat/ai-copilot-conversation.tsx:259-264`
- **问题**：`onExternalDraftHandled` 在顾问输入框 `setInput` 之后立即触发，bazi 的 `handleRelayDraftHandled` 随即 `relay.consumeForExecution()` 清掉引用。REQ §4.6.4-5 明确要求「只有用户点击顾问『发送』且问题成功提交后才完成接力。仅生成命盘不算完成」。
- **影响**：用户还没发送（甚至没看到预填内容）引用就已完成清除；若用户随后放弃追问，引用与草稿均不可恢复（与 H1 叠加）。命理追问场景的「完成边界」比需求定义提前了一步。
- **建议**：把 `consumeForExecution` 的调用从 `onExternalDraftHandled` 挪到顾问 `sendQuestion` 成功回调（可在 `AICoPilotConversation` 增加 `onRelayExecuted` 之类的成功钩子，仅在本次发送内容源自 externalDraft 时触发）。
- **Disposition**：fixed（新增 onExternalDraftSent 钩子，仅在发送内容源自 externalDraft 且成功提交后 commitExecution；预填只 setInput）

### H6. 对比模式接力落点未落会话：发送会新建空对比会话而非「当前对比会话」— HIGH
- **位置**：`apps/web/src/components/chat/comparison/comparison-input.tsx:41-55`；`apps/web/src/stores/comparison-store.ts:527-530`（`startNewComparison` 置 `activeComparisonId: null`）
- **问题**：D4/M-3 约定的语义是「对比模式下落点为当前对比会话」，但「新建对话」按钮在对比模式下调 `startNewComparison()` 将 `activeComparisonId` 置 null。接力到达（`?relayId=`）后没有任何 effect 恢复或固定落点会话；若 `activeComparisonId` 为 null，`sendComparison` 会新建一个 ID 不同的空对比会话。
- **影响**：用户预期「在当前对比会话继续」实际落入全新空会话，且派生元数据写到新会话的历史项上。虽然数据不丢失，但与计划声明的落点语义不符，对比上下文（已有 turns）被割裂。
- **建议**：接力到达时若 `activeComparisonId` 为 null 且存在当前对比会话，则 `loadComparison(currentId)`；或在计划/文案中把对比落点改为「新对比会话」并同步 M-3 注释。改动小，优先前者。
- **Disposition**：fixed（comparison-input 到达时若 activeComparisonId 为 null 且存在对比会话则 loadComparison 固定落点）

### M1. `useRelayReceive` 的 URL 清理是无条件 `replaceState`，会误删同页其他查询参数 — MEDIUM
- **位置**：`apps/web/src/components/relay/use-relay-receive.ts:64-78`
- **问题**：水合完成后无论 URL 是否含 `relayId` 都执行 `window.history.replaceState({}, '', pathname)`；chat 页同时支持 `?historyId=`/`?comparisonId=`/`?new=true`，该 hook 与 `chat/page.tsx:297-408` 的初始化 effect 执行顺序若颠倒，会把这些参数在页面初始化 effect 读取前抹掉（当前依赖 React effect 顺序恰好 hook 在前、且 chat 初始化 effect 由 `isLoaded` 门闩，行为碰巧正确）。
- **建议**：只在 `relayId` 存在时用 `URL` API 定点删除该参数（`url.searchParams.delete('relayId')`），保留其余查询串；消除隐性的 effect 顺序耦合。
- **Disposition**：fixed（仅定点 searchParams.delete(relayId)，保留 historyId/comparisonId/new）

### M2. `sendMessage` 早退分支导致静默丢派生且引用已被清 — MEDIUM
- **位置**：`apps/web/src/stores/chat-store.ts:161-179`；`apps/web/src/app/chat/page.tsx:502-527`
- **问题**：`handleSend` 先 `consumeForExecution()` 再调 `sendMessage`，而 `sendMessage` 在空内容/`isLoading`/附件非豆包/附件未就绪四个分支直接 return，不清空 `relayDerivationRef.current`。失败后引用已清（H1），残留的 ref 又可能在下一次无关发送时被错误记入派生。
- **影响**：派生元数据错配（后一条无关消息被标「由某来源接力生成」）。
- **建议**：`sendMessage` 早退时由 page 层复位 `relayDerivationRef.current = undefined`，或把「取派生」下沉到 `sendMessage` 真正发起请求之后。
- **Disposition**：fixed（随 H1 两阶段一并消除；page 不再持有残留 ref，成功分支显式清 ref）

### M3. 图片「作为参考图」目标在图像页无承接 — MEDIUM
- **位置**：`apps/web/src/lib/relay/target-registry.ts:34`（`image → image_reference`）；`apps/web/src/app/image/page.tsx:86-97`
- **问题**：目标菜单对图片来源展示「作为参考图」（跳到图像页），但图像页预填 effect 只处理 `snapshotText`，`targetRole === 'reference_image'` 时 `relayDraftText` 为空、不预填任何字段，当前 Kolors/Agnes 也无参考图 UI。
- **影响**：用户走「图片→作为参考图→图像页」后，引用条显示但目标字段无任何承接，与 REQ §4.3.1「当前图像模型没有参考图能力时…不把图片伪装成模型参考图」的降级预期不符（应有明确提示或不出现在菜单）。
- **建议**：图像页对 `reference_image` 角色显示「当前模型不支持参考图」提示，或在 registry 中按目标侧能力把该项过滤（推荐在 `getAvailableTargets` 增加目标能力上下文参数）。
- **Disposition**：accepted gap（图像页无参考图 UI；已在收尾 feature.md/requirements-coverage 记录裁剪）

### M4. RelayMethodPicker 的 ready/needs_input 视觉分级可能构成隐性推荐 — MEDIUM
- **位置**：`apps/web/src/app/destiny/_components/relay-method-picker.tsx:57-68`
- **问题**：`ready` 术数用品牌蓝高亮、`needs_input` 用灰白，视觉上形成「推荐项」。REQ-011/§4.6.3 要求「视觉尺寸、按钮权重和排序层级一致」「不得出现推荐…文案」。
- **影响**：需求的字面要求（平级）与「显示 ready 状态」之间存在张力；当前实现用颜色深浅区分两级，严格验收时可被判违规。
- **建议**：三术数统一相同样式，把 ready/needs_input 降级为按钮旁的等权文字说明（如统一灰色小字「需补出生资料」），不用品牌色区分。
- **Disposition**：accepted gap（ready/needs_input 以文字呈现但保留颜色分级；严格平级待产品确认，已在收尾记录）

### M5. 对比模式输入框非空时不提供「填入输入框」显式操作 — MEDIUM
- **位置**：`apps/web/src/components/chat/comparison/comparison-input.tsx:48-55, 143-149`
- **问题**：到达时若 `input` 非空则不预填（正确），但 `ReferenceBar` 未传 `showFill/onFill`，用户没有「填入输入框」的显式入口；单聊侧有（`chat/page.tsx:1064-1071`）。
- **影响**：REQ-005/§4.2.3「已有草稿…提供显式『填入输入框』」在对比模式缺失。
- **建议**：对比侧 `ReferenceBar` 补 `showFill={Boolean(relayBundleText) && input.trim() !== relayBundleText}` 与 `onFill={() => setInput(relayBundleText)}`。
- **Disposition**：fixed（comparison-input ReferenceBar 补 showFill/onFill）

### L1. `useRelayLauncher.onSelect` 中 `adaptForTarget` 返回值被丢弃 — LOW
- **位置**：`apps/web/src/components/relay/use-relay-launcher.ts:100-102`
- **问题**：调用 `adaptForTarget(item, target)` 但不使用结果，仅留注释「结果在目标页由适配器按 bundle 重新生成」。目标页实际也并未再调适配器（各页直接读 `snapshotText/snapshotMediaUrl`），该调用是纯噪音。
- **建议**：删除该调用或改为断言/日志；避免读者误以为发起侧有适配逻辑。
- **Disposition**：fixed（删除 adaptForTarget 死调用与 import）

### L2. `require('./relay-store')` + 内联类型断言绕开类型安全 — LOW
- **位置**：`apps/web/src/stores/history-store.ts:169-175, 219-225, 283-289`
- **问题**：三处 `require` 返回 `any`，配合 `as Record<string, { id; items: Array<{ sourceId: string }> }>` 内联断言；`RelayBundle` 类型与真实结构漂移时编译期不报错。
- **建议**：把「按 sourceId 标失效」封装为 `relay-store` 导出的 `markSourcesInvalid(sourceIds: string[])` 函数并显式 `import type`，避免三处重复断言与 try/catch 复制。
- **Disposition**：fixed（relay-store 导出 markSourcesInvalidBySourceIds，history-store 三处改为调用它）

### L3. RelayMenu 桌面虚拟锚点强转 `as unknown as HTMLElement` — LOW
- **位置**：`apps/web/src/components/relay/relay-menu.tsx:152-166`
- **问题**：虚拟锚点对象只实现 `getBoundingClientRect`，强转为 `HTMLElement`；radix `PopoverAnchor virtualRef` 类型上允许，但断言跨度过大。
- **建议**：用 `VirtualElement` 风格的最小接口类型（`{ getBoundingClientRect: () => DOMRect }`）声明并传入，减少 `as unknown`。
- **Disposition**：fixed（虚拟锚点改用最小接口类型声明）

## 已核查且通过的特别核查点

- HIGH-2 修复属实：`chat-store.ts:161` 签名带 `derivation?: DerivationMetadata`，仅成功路径写入历史；失败/取消分支不碰 derivation（但引用清除问题见 H1）。
- REQ §4.6.4 确认：`ai-copilot-conversation.tsx:259-264` externalDraft effect 只 `setInput`（且输入非空时不覆盖），无 `sendQuestion` 调用；与 `queuedQuestion`（立即发送）通道严格隔离。
- 历史删除同步：`deleteItem/deleteItems/clearHistory` 三处均遍历 relay bundles 标 `markSourceInvalid`；`clearHistory` 的 `deletedIds` 取自**删除前** state 并按类型过滤，清空某类型（如 image）覆盖该类型全部 id，无遗漏。
- 快照协议：图像快照使用 `generatedDataUrls`（`blobToDataUrl` 的 DataURL），未用 objectURL，符合 REQ §4.3.3 禁临时地址。
- 移动端常显：message-item 操作栏 `max-sm:opacity-100`、preview-canvas 悬停层 `max-sm:opacity-100`、图像结果工具栏 `opacity-100` 基底；不依赖 hover 发现接力。
- 菜单/抽屉：RelayMenu 标题「用此继续」、移动抽屉 `max-h-[85vh]` + 安全区内联 padding、50px 项、Esc/方向键/回车/焦点返回齐备。
- 注册表：语音不出现在任何目标列表；三术数无推荐/排序字段；适配器纯函数无修饰词；16 条单测覆盖映射表与 readiness 三态。
- URL 协议：跳转仅携带 `?relayId=`，快照在 Dexie。

## Remaining risks

1. **behavior_verification 证据缺口**：status.md 自标 `behavior_verification: full`，但 `docs/reviews/` 下无本功能的 manual-test/verification 报告（T13 产物），Playwright 仅有 `home.spec.ts` 首页冒烟，与接力无关。17 个验收场景（尤其「不自动产生模型费用」「失败保留引用重试」「刷新恢复」）无落盘验证记录；H1/H2/H3 正是未被行为验证覆盖的缺口。
2. **hydration 竞态**：`useRelayReceive` 的 URL 清理 effect 与各页面 `?historyId=` 初始化 effect 存在顺序耦合（M1），目前碰巧正确，未来改动易回归。
3. **effect 依赖数组刻意收窄**：各目标页预填 effect 只依赖 `[relay.initialized, relay.bundle?.id]` 并配 eslint-disable，bundle 内快照变化不触发重填——当前数据流成立，但属易碎的隐性约定。
4. **派生元数据覆盖范围**：命理类历史项全程无派生记录（H2），需求覆盖矩阵自标「REQ-013 ✅ 覆盖」与实现不符，需在收尾前对齐口径（补实现或记 accepted gap）。
5. **对比模式接力发送失败**：comparison 各 run 失败后 `recordHistory(derivation)` 仍会把失败轮次写入历史并带派生，语义上「部分失败」是否算「执行成功」未定义，建议与 H1 一并明确。
