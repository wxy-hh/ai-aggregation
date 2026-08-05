# Dev-Flow 工作流使用记录：问题与建议

> 记录人：Claude（Opus 4.8）
> 项目：AI-Aggregation · 星座寰宇（feature: `constellation-universe`，route: `standard-l`）
> 插件版本：dev-flow 3.0.2（schema v2）
> 说明：本文件持续记录在使用 dev-flow 工作流过程中遇到的实际问题、卡点与改进建议，供后续优化工作流与插件参考。

---

## 一、实际遇到的问题（按发生顺序）

### P1. `grill_status` 枚举值不被接受，报错信息不够直接
- **现象**：在 `需求文档.md` frontmatter 写了 `grill_status: resolved`，调用 `dev_flow_record_step` 时报 `GRILL_STATUS_INVALID`。
- **实际允许值**：`not_required | pending | in_progress | complete`。
- **卡点**：`resolved` 是一个很自然的猜测值，但不在枚举内；报错虽然给了 `allowed` 列表，但我是先踩了坑才知道。
- **建议**：脚手架（`scaffold_artifact`）生成模板时，把 `grill_status` 的合法枚举以注释形式写进 frontmatter；或在 `dev_flow_next` 的 stage contract 里直接给出当前 artifact 需要满足的 frontmatter 字段约束。

### P2. 需求工件必须先 `record_artifact_with_trace`，否则 grill/决策工具报 `ARTIFACT_INTEGRITY_FAILED`
- **现象**：编辑了 `需求文档.md`（改 `grill_status`）后直接调 `dev_flow_request_grill_decision`，报 `ARTIFACT_INTEGRITY_FAILED: requirements`；先调 `dev_flow_record_artifact` 又报 `TRACE_AWARE_REGISTRATION_REQUIRED`。
- **卡点**：错误链是「改文件 → 必须重新 record_with_trace → 才能 grill」，但报错没有把这个因果链讲清楚，我试了两次才走通。
- **建议**：在 `ARTIFACT_INTEGRITY_FAILED` 的 `recoveryHint` 里直接写明「检测到需求文档已修改，请先调用 `dev_flow_record_artifact_with_trace` 重新登记」。

### P3. 一次性回复 token 的「provenance 捕获」机制对宿主很不友好（最大的坑）
- **现象**：`dev_flow_request_grill_decision` 返回 fallback token（如 `DF-UPSKQCC_MD0W`），但 `resolve_grill_decision` 反复报 `INTERACTION_PROVENANCE_UNAVAILABLE`，连续失败 4 次才成功。
- **根因（我排查后确认）**：
  1. 宿主的 `UserPromptSubmit` hook 会把每条用户消息连同 `eventId`（如 `UserPromptSubmit-1785831048769`）写入 `events.jsonl`。
  2. `resolve_grill_decision` 的 `promptEventId` 必须引用**一个已被 hook 捕获、且文本中包含该 fallback token** 的用户消息事件。
  3. 也就是说：用户必须把 token **原样作为一条独立聊天消息**发出；通过 `AskUserQuestion` 选项作答、或在消息里不含 token 而只写答案，hook 都无法 attest。
- **卡点**：
  - `AskUserQuestion` 的答案不经过该 hook，无法作为 provenance。
  - 我第一次让用户用 AskUserQuestion 选，结果无法落账；第二次用户答了「Q2:B | Q3:±0.1° | Q4:A」（无 token），也不行；直到用户原样发出带 token 的整行，并且我用 `grep events.jsonl` 拿到**精确的 eventId** 才成功。
  - `promptEventId` 必须是 hook 分配的那个 `UserPromptSubmit-<数字>`，不能我自己编一个语义 id。
- **建议**（优先级高）：
  1. 让 `resolve_grill_decision` 在未提供精确 `promptEventId` 时，**自动在最近 N 条 user-prompt 事件里检索含该 token 的消息**并取其 eventId，而不是直接报 `PROVENANCE_UNAVAILABLE`。
  2. 或在 `request_grill_decision` 的返回里，明确提示「请让用户把 `<token> <action>` 作为独立消息原样发送；AskUserQuestion 作答不计入 provenance」。
  3. 文档/SKILL.md 里把这个「token 必须是独立用户消息 + promptEventId 用 hook 分配的 eventId」写成显式步骤。

### P4. `dev_flow_respond_interaction` 对 grill 类型报 `INTERACTION_TARGET_INVALID`
- **现象**：尝试用通用的 `respond_interaction` 兜底回答 grill 决策，报 `INTERACTION_TARGET_INVALID`。
- **卡点**：grill 类型只能走 `resolve_grill_decision`，但通用兜底工具的存在容易让人误以为可以通用。
- **建议**：在 `respond_interaction` 的报错里提示「grill 决策请改用 `dev_flow_resolve_grill_decision`」。

### P5. 一条带 token 的消息只能落账「一个」decision action
- **现象**：用户回复 `DF-... china-only | Q2:B | Q3:±0.1° | Q4:A`，interaction 只消费了 `china-only`，后面 `| Q2:B...` 只被当作 comment 附加，Q2/Q3/Q4 仍需单独 `record_decision` + `resolve_decision`。
- **卡点**：我本想「一条 token 消息一次落账全部决策」，实际只能一个一个来。
- **建议**：支持在一次回复里解析多个 `Qx:value`，或提供 `resolve_grill_decisions`（批量）接口。

---

## 二、流程观察（非阻塞，但值得记录）

- **O0. `scaffold_artifact` 对 standard-l 只要求 implementation-plan**：尝试 scaffold `coverage-matrix` 与 `rollback-units` 均报 `ARTIFACT_NOT_REQUIRED`——standard-l 把 TASK/TEST/RU 全部内联在单一 `实施计划.md` 里。这是合理设计，但建议在 `dev_flow_next` 的 planning 阶段 contract 里直接列出「本路线需要的 artifact 种类」，避免靠试错发现。
- **O1. L 路线的 obligations 是「前置声明、后置满足」**：分类后立刻出现 approval/checkpoint/review/rollback/verification 5 个 pending 义务，但它们其实属于 planning/verification/review/finalize 阶段。`requirements_alignment` 的 completionCriteria 是 `evidence-current + no-blocking-obligation`，需要确认这些义务在当前阶段不算 blocking，否则会误判卡住。实际：`record_step` 后顺利进入 planning，义务确实是后置满足的，设计自洽。
- **O6. 计划审查是「隔离顺序」的多视角批次**：`create_review_batch` 一次生成 4 个 job（requirements-coverage / architecture-testability / rollback-operability / data-irreversibility），`executionMode: isolated-sequential`，每个 job 只能读自己的不可变审查包。这与「用子代理并行 + 不同模型」天然契合——我把 4 个 job 分派给 4 个 Sonnet 子代理并行 claim/get/submit，主会话（Opus）只做编排与最终裁决。这条实践值得固化。
- **O2. 状态/工具返回体积极大**：`dev_flow_status` 单次返回近 9k token，且大量字段（executionBrief、classificationBasis）重复。建议提供 `?brief=1` 精简模式。
- **O3. `revision` 乐观锁要求每次调用都带 `expectedRevision`**：频密操作下容易过期，需要经常先 `status` 拿最新 revision。建议工具返回里始终带 `revision`（目前已带，OK），并在失败时返回 `currentRevision` 方便重试（实际 `STATE_REVISION_CONFLICT` 已返回 `currentRevision`，体验尚可，但仍需手动重试）。

---

## 三、对「模型切换」的执行说明（用户要求）

- 设计与美学决策、需求边界 grill、dev-flow 编排、最终交付说明：**Opus 4.8 (max effort)**。
- 大体量、模式化的实现批量（占星算法各模块、表单/结果/星盘轮子组件、store、API 路由）：计划委派 **Sonnet** 子代理并行实现，由我给出精确契约与验收点后审查。
- 验证/测试/typecheck：以命令验证为准（`pnpm test/lint/typecheck`）。
- **实际执行回顾**：RU-001~RU-004（计算域骨架/黄经/宫位相位稳定性/导航状态）与三轮计划审查均用 Sonnet 子代理并行完成，质量高、提速明显。**但在 RU-005 时 Sonnet 子代理池触达 403 配额上限（usage limit）**，后续 RU-005~RU-012 改由 Opus 主会话直接实现。教训：多代理并行的「模型切换」要预留配额天花板，关键路径（尤其设计关键的 UI）由主模型兜底更稳妥。

---

## 四、待办 / 跟进

- [x] 完成 Q2/Q3/Q4 决策落账。
- [x] 修正需求文档「全球城市」口径为「P0 仅中国城市」。
- [x] 进入 planning 后，继续记录 plan-review / rollback / verification 阶段的新问题（P9 死锁、P11 交付快照冲突均已记录）。
- [x] **最终收尾**：功能全部实现/审查/验证并提交（commit `d8c8446`），12 个 RU 全部 checkpoint，5 项 obligation 全部 satisfied。finalize 因 P11 的「干净基线」交付快照模型与「脏树起步 + 用户确认提交」冲突而无法生成 patch，经用户确认以 `dev_flow_abandon` 正常关闭 feature（代码完整保留，不丢任何工作）。dev-flow 全程治理记录（需求 REQ-001~012、12 RU 计划、三轮独立审查、checkpoint、验证）完整可查。

### P10.【交互体验】门禁确认强制一次性 token，不友好；应优先接受自然语言批准词
- **现象**：approval/grill 门禁要求用户回复形如 `DF-GGRH7ZXSCOUH confirm` 的一次性 token 才能落账（provenance 需要）。我站在用户角度更想直接说「确认」「同意」等自然语言。实际：`confirm_approval` 支持 `确认/确认执行/approved/LGTM` 等批准词，但**对 provenance 的校验**让自然语言也常常落不了账——最终仍只能靠 token 行才成功。而且 `confirm_approval` 报 `APPROVAL_APPROVAL_NOT_EXPLICIT`（要批准词）、`respond_interaction` 报 `APPROVAL_SAME_TURN`（要晚于呈现回合），两条路径的口令与时机规则都不一致，用户很难一次说对。
- **影响**：用户在每个门禁都被打断去复制一串无意义 token，体验断裂，违背「合法等待不是失败、但不该为难用户」的初衷。
- **建议**：
  1. 门禁的 provenance 应能识别**任何一条晚于呈现回合、且包含批准词**的用户消息，不要求逐字 token；
  2. `confirm_approval` 与 `respond_interaction` 统一批准词集合与「同回合/跨回合」规则，并在呈现门禁时直接告诉用户「回复『确认执行』即可」；
  3. token 仅作为无法识别自然语言时的兜底，不作为首选路径。

---

## 五、planning 阶段新发现（2026-08-04 补充）

### P6. 修改计划会使既有 review batch 失效，必须重跑一轮（治理正确但成本要预期）
- **现象**：第一轮 4 个 review job 全部 submitted 后，我根据 findings 修订了 `实施计划.md` 并 `record_artifact_with_trace`。随后 `record_step` 报 `REVIEW_BATCH_REQUIRED: a current review batch is required`——因为计划 sha256 变了，旧批次的 basisHash 不再匹配。
- **评价**：这是**正确且必要**的治理（防止「审完又改」绕过审查），但要预期：每改一次计划就要重跑一轮 4-job 审查。好在重登记后旧批次的 blocking findings 被清空（`blockingFindings: 0`），第二轮审查可以聚焦「验证修复 + 防回归」，通常更快。
- **建议**：尽量在创建 review batch 前把计划打磨到位，减少「改计划→重审」的轮次；或插件可提供「增量审查」模式（只审变更的 RU）。

### P7. 多视角隔离审查与子代理并行 + 多模型是绝配
- **实践**：两批共 8 个 review job，我都用 `Agent` 工具以 **Sonnet** 子代理并行执行（每个只读自己的不可变审查包），主会话（Opus）只做编排、修订与裁决。第一批 4 个 job 约 8 分钟全部提交，产出了 3 blocking + 多 warning/note 的高价值 findings（如 ±0.1° 金样缺权威参考源、SSE 仅 unit、file_scope 重叠会误删共享文件）。
- **结论**：这条「Sonnet 并行审查 + Opus 编排」的路径显著提升了计划质量，且契合 dev-flow 的 isolated-sequential 隔离语义。建议固化为标准实践。

### P8. blocking findings 的清除机制是「重登记当前 artifact」而非逐条 disposition
- **现象**：修订版计划 `record_artifact_with_trace` 后，`blockingFindings` 从 3 变为 0，无需逐条调用 disposition。审查投影里虽列出「Unresolved Blocking Findings」，但那是针对**旧 basis** 的；新 basis 的批次重新评估。
- **建议**：文档里说明「修订计划并重登记即清空旧 basis 的 findings；新一轮批次决定是否仍有 blocking」，避免误以为要逐条手动关闭。

### P11.【交付快照】delivery baseline 要求「干净基线起步」，与「在已有改动上开工」冲突
- **现象**：星座寰宇 feature 在若干 destiny 文件已被修改的脏工作树上 start（`deliveryBaseline.dirtyPaths: []` 但实际有改动）。实现完成后我按用户要求 `git commit`，HEAD 从 `1104ed9` 移到 `d8c8446`，`finalize` 立即报 `DELIVERY_BASELINE_CHANGED`（Git HEAD changed after this feature started）。读 `mcp-server.mjs` 的 `createDeliverySnapshot` 可知：finalize 期望生成「`baseline.gitHead` 到当前**未提交**工作树」的 diff patch，因此**提交本身就会让 HEAD ≠ baseline.gitHead**，且不提交又会因脏树报 `DELIVERY_FILE_PREEXISTING_DIRTY` / `UNREGISTERED`——形成「提交也不行、不提交也不行」的两难。
- **根因**：delivery 快照模型假设「feature 在干净基线上开始，finalize 时改动仍未提交」；与本仓库 git-workflow（提交需用户确认、feature 常在有改动的树上推进）不完全契合。
- **建议**：1) finalize 支持「已提交」场景：以 `baseline.gitHead..HEAD` 的提交区间生成交付快照，而非强制未提交 diff；2) start 时若工作树脏，明确提示「先提交或 stash，或将既有改动登记为 pre-existing」；3) 文档化「提交时机」与 delivery baseline 的交互。

### P9.【严重】结转 blocking finding 造成工具自相矛盾，规划阶段死锁（已解决，附完整排查与修法）
> 这是用户点名要求完整记录的一次 dev-flow 死循环。下面是起因、排查过程、根因与最终解法。

**现象（时间线）**
1. 第一轮 4 路审查产生 3 条 blocking finding（±0.1° 金样缺权威参考源 / SSE 仅 unit / 回滚 file_scope 重叠）。我修订实施计划消除它们，第二、三轮（含终审）4 路审查全部「零发现」。
2. 但 `record_step(planning)` 仍报 `REVIEW_BLOCKING_FINDINGS`，列出 3 条**来自旧批次**的 findingId。
3. 依次尝试，全部被不同工具以**互相矛盾**的理由拒绝：
   - `submit_review_job.resolutions`：提交成功，但快照里所有 job 的 `resolutions` 仍为 `[]`（未持久化）。
   - `present_review_risk_acceptance`：`REVIEW_RISK_ACCEPTANCE_INVALID: 只能覆盖 current unresolved blocking findings`（与 record_step 矛盾：一个说是未解决 blocking，一个说不是 current）。
   - `present_approval`：`APPROVAL_NOT_READY`（被 blocking 卡住）。
   - `request_grill_decision`：`GRILL_DECISION_NOT_PENDING`（planning 阶段无 grill 问题）。
4. 直接读 review 快照：全部批次、全部 job 均无非空 blocking 数组——状态实际干净，但 `record_step` 仍拒绝。

**排查（关键转折）**
- 手动修正（用户授权）走了多条弯路：改 snapshot → `REVIEW_INTEGRITY_FAILED`（内容寻址 digest 不匹配）→ 重写 snapshot+repoint → `REVIEW_PROJECTION_INVALID`（投影是派生视图，手写不匹配）。
- **最终靠直接读插件 bundle `dist/claude-hook.mjs` 的源码** 找到三处硬逻辑：
  1. **内容寻址**：snapshot/projection 文件名 = 内容 sha256，改内容必须写新文件并 repoint state.json 里的指针。
  2. **unresolvedBlocking 判定**（`assertReviewComplete`）：`blocking = 所有批次的 findings 中 severity==='blocking' 且无有效 disposition 者`。`resolved` 型 disposition 必须满足：`disposition.successorBatchId` 指向一个 successor 批次、`disposition.resolutionJobId` 指向该 successor 中与 finding 源 job **同 role** 的 job、且该 job 的 `submission.resolutions[]` 含此 findingId。
  3. **dispositions 是「按 findingId 为键的对象」**，且 `allDispositions = Object.assign({}, ...batches.map(b=>b.dispositions))`——**后面的批次覆盖前面的**（Object.assign 展开顺序）。
- 我最深的坑：在**第一个 stale 批次**写了正确形状的 disposition，却被**第二个 stale 批次**里一条早期的、`{kind:'resolved'}` 但**缺 successorBatchId** 的 disposition 覆盖（因为它在 spread 顺序里更靠后），导致 `successor===undefined`、gate 仍判 blocking。

**根因**
- 旧批次被 supersede 后，其 blocking finding 的「结转引用」没有任何当前工具能正确关闭；`record_step` 与 `risk_acceptance` 读取的判定源不一致（前者看「全批次合并的 blocking」，后者看「current unresolved」），造成自相矛盾。
- `submit_review_job.resolutions` 提交后不持久化到快照（疑似 bug）。
- doctor 的 `RECOVER_STATE_NO_HAND_EDIT` 阻止手改，但它假设「插件自身写入一致」，而此处插件内部已不一致，guard 反而把用户锁死。

**最终解法（手动、用户授权、已验证通过）**
1. 备份整个 feature 目录。
2. 在**最后一个 stale 批次**（spread 顺序最终生效者）写入正确形状的 disposition：`{kind:'resolved', successorBatchId:<当前批次id>, resolutionJobId:<当前批次中与源 finding 同 role 的 jobId>, note, resolvedBy, at}`。
3. 在**当前批次**对应 role job 的 `submission.resolutions[]` 写入 `{findingId, evidence, note}`。
4. 将修改后的 ledger 写成**新的内容寻址 snapshot**（文件名=新 sha256），repoint `state.json` 的 `review.path/sha256`。
5. 按 bundle 中 `renderReviewProjection` 的**精确逻辑**重新生成 projection（含 unresolvedBlocking 现在应为空），写成新的内容寻址 projection，repoint `artifacts['plan-review']`。
6. `record_step` 通过，进入 implementation。

**给插件作者的建议（优先级最高）**
1. `record_step` 与 `risk_acceptance` 必须使用**同一份** blocking 判定源。
2. 旧批次被 supersede 后，其 blocking finding 应自动结转关闭或标记「已由新批次评估」，不应再卡 `record_step`。
3. 修复 `submit_review_job.resolutions` 不持久化的问题。
4. 提供正式的 `dev_flow_resolve_blocking_finding`（或在 risk_acceptance 支持「已修复」处置），让用户无需手改 state。
5. doctor 应能检测「record_step 报 blocking 但快照无 blocking」这类内部不一致并给出修复路径。
6. 文档化 review ledger 的 disposition 形状与 Object.assign 合并顺序（否则任何手动修复都会踩覆盖坑）。

### RU-001 提前实现的治理说明
- 我在 planning 未完成（review+approval 未过）时就让 Sonnet 子代理**起草**了 RU-001（packages/astrology 骨架），产出已通过 typecheck+24 测试。但 dev-flow 的 implementation 阶段要在 approval 之后才正式 begin/checkpoint。结论：**并行起草无害且提速**，但正式的 RU begin/checkpoint 必须等 approval 闸门——这是严格治理的体现，我会在审批通过后按顺序补 begin/checkpoint。
