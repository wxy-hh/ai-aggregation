# /chat Agent 工具调用 · 两轴代码审查

> 基准点：`124ec34c`（`fix(chat): 补齐单聊停止按钮并消除切模式丢消息竞态`）
> 变更范围：**工作区 vs 基准**（本特性尚未产生任何提交，HEAD 仍等于基准点，因此审查对象是工作区 + 未跟踪新文件）
> 规模：16 个已修改文件 + 18 个新增文件（+572 / −149 行）
> 方法：`code-review` 技能的两轴并行子代理（Standards / Spec），两轴**不做合并、不做跨轴排序**
> 日期：2026-10-01

---

## Standards

（Standards 轴子代理报告，原文）

**硬性违规：未发现。** 新老注释均中文；UI 文案全中文；store 走直接路径导入；跨端只走 `@repo/*`；agent 按钮用伪元素补足 44px 命中区；`@repo/shared` 是包入口非内部 barrel。工具可查项（注释语言、格式、类型、lint）跳过。

**文档分叉（判断题）**

- `spec.md:239` 明写 agent-trace「默认折叠」，实现却是执行期默认展开（`agent-trace.tsx:71` `defaultExpanded = isStreaming && !hasContent`）。虽有 ThinkingBlock 先例（`message-item.tsx:620` 同款条件），但已与 spec 文本分叉，按 AGENTS.md「文档与代码不得长期分叉」应回写 spec。
- `agent-trace.test.tsx:4` 引用决定项「D10」，而 `spec.md` 决策表只有 D1–D9 → 悬空引用。

**基线 smell（判断题）**

- **Shotgun Surgery + Duplicated Code**：新增 `'chat-agent'` 一个值被迫改 5 个文件；同一字符串联合在 `quota-service.ts`(×2)、`quota-session.ts` 的 `ReserveFeature`、shared `AiUsageFeature` 各写一份。`ReserveFeature` 应从 `AiUsageFeature` 派生。
- **Duplicated Code / Data Clumps**：`{ kind:'image'; url:string }` 在 `chat-stream-contract.ts` 与 `registry.ts` 的 `ToolExecutionResult.attachment` 各写一遍，应收敛为一处。
- **Feature Envy**：`chat-handler.ts` 同时持有 `AGENT_STEP_OUTPUT_LIMIT * AGENT_STEP_FACTOR` 与 `outputLimit / AGENT_STEP_FACTOR`——同一「步数切分」公式的两半都落在 handler，应下沉到 agent-config。
- **Duplicated Code**：`chat-store.ts` 的 `onToolCall`/`onToolResult` 末尾「`updateMessages` → `activeConversationId` → `emit`」三行逐字重复，可抽 helper。
- **Speculative Generality**：`settings-store.ts` `onRehydrateStorage` 里 `setAgentMode(false)`，注释称防旧版本写入，但 `partialize` 从未持久化该字段，此场景不存在。
- 低置信：`agent-runner.ts:138` 两个独立 promise 顺序 `await`，AGENTS.md 要求独立异步用 `Promise.all()`。

**主动抑制**：`ChatStreamToolCall/Result`（传输态）与 `ToolCallRecord`（落库态）的字段重叠是 `spec §5.1`/`agent-tools.ts` 明文设计的双态，不报重复；`AGENT_STEP_FACTOR` 常量可配亦为 spec §5.4 明确要求。

---

## Spec

（Spec 轴子代理报告，原文）

### (a) 要求了但缺失 / 只做一半

1. **§9 覆盖矩阵缺两项**：原文「覆盖矩阵：事件序列契约…／工具失败路径／**用户中断（abort）**／**匿名用户路径**」。`chat-handler.agent.test.ts` 只有 2 个 describe、15 例，无 abort、无匿名用例。
2. **§9 下钻接缝缺两类用例**：原文「表驱动单元测试（内网 IP 段 / IPv6 / 主机名 / **重绑定用例** / **截断边界**）」。`url-guard.test.ts` 仅 6 组、无重绑定（`guardedLookup` 未导出、无覆盖）；`tool-policy.truncate` 无截断边界用例。工单 03 自称「含重绑定用例」与代码不符。
3. **§5.2「覆盖行为记入 finalize 的 metadata」** 只写了 `agent: true`；被覆盖的原 `provider/model`（前端传的 xunfei/lite）在 handler 内即被丢弃，未留痕。
4. **§5.4「用户中断时已产出部分按 partial」**：`agent-runner.ts:250` 仅以 `text` 判态，工具已产出（图片/网页摘要）但正文为空的中断走 `failed` 全退，与前端 `hasRetainableContent` 把 `toolCalls` 计入产出的口径相反。

### (b) diff 里有、spec 没要求

5. **§5.1 定稿 shape 被扩**：`tool_result` 只有 `{callId,name,status,summary}`，实现新增 `attachment` 字段并穿透前端。已有留痕（注释：产物附件非大段正文）。
6. **§5.3 `ToolCallRecord.status` 定稿 `'success'|'failed'`**，实现扩为含 `'running'`。已有留痕。
7. **§6.1 参数 `prompt`+`style`** → 实现为 `prompt`+`size`，不开放 style。已有留痕（image-generate 头注释）。
8. **§6.1 / D2「复用平台现有 service 层（Kolors）」** → 实际直连 Agnes 并顺带重构 `/api/image/agnes`（全仓已无 Kolors 代码）。
9. **§6.2 超时「整体 15s」** → 实现 12s（留痕）；**§6.2「响应体截断至 200KB」** → 实现为超限即整单失败（`res.destroy`），非截断。
10. **§8「默认折叠」** → 流式中无正文时默认展开（留痕）；**§8「材质玻璃体系」** → 改左线块（留痕）。另新增「头部/移动端模型选择器置灰并收起列表」（chat-workspace），§8 未要求。

### (c) 看起来实现了但实现是错的

11. **§5.1「事件顺序约束：tool_call / tool_result 必然先于首个 text-delta」被违反**：`agent-runner.ts:135-139` 在决策步流式过程中即 `emitText`；模型先输出「我查一下」再调工具时，text-delta 早于 tool_call/result。代码注释自认「决策步正文照常透传」；测试的决策步 fake 无 `textParts`，结构性测不到此序。
12. **§5.5 检查点 2 语义偏**：定稿是「命中则替换为合规话术文本（**不中断任务**）；image_generate 的 prompt 同样过检」；实现为抛 `ToolError` 让该工具直接失败。

### 覆盖度概览

契约双向扩展、两段式编排、feature 分列与 ×2 预留、三检查点接线、注册表开放扩展、前端过程卡片与 localStorage 回看、§11 十一条真机验收 —— 主线均已落地且正确。上述 12 条为与 spec 对不上的全部位置，其中 11、12 属实现缺陷，1–4 属未完成/口径不一致。

---

## 主代理复核（对上述两轴报告的关键项做独立验证）

两轴报告不合并，但其中若干条会直接决定「能不能提交」，故逐条回代码/数据库验证：

| 出处 | 结论 | 复核证据 |
|---|---|---|
| Spec #11 | **属实** | `agent-runner.ts:134-138` 决策步 `for await (const part of decision.fullStream) { if (part.type==='text-delta') emitText(part.text) }` 出现在 `await decision.toolCalls` **之前**。spec §5.1 原文：「事件顺序约束：`tool_call` / `tool_result` 必然先于首个 `text-delta`」。 |
| Spec #4 | **属实，且是退款口子** | `agent-runner.ts:250` `outcome: text ? 'partial' : 'failed'`。而 `quota-session.ts:225` `if (outcome === 'failed') { await this.release(...) }` —— `failed` 走 **release＝退款**，`partial` 走 settle＝按用量结算。即「工具已产出图片/正文摘要、但正文为空时被中断」→ 判定 failed → **全额退款**，而决策步消耗的真实上游 token 与已生成的图片都白拿。 |
| Spec #2 | **部分属实** | `url-guard.test.ts` 实为 **67 例 / 9 张 it.each 表 / 6 个 describe**（「67 例」的表述准确），但**确无重绑定用例**（全文 0 处「重绑定」）；重绑定防护实现在 `web-fetch.ts` 的自定义 `lookup`，`url-guard.ts` 只导出 `validateUrlLiteral` / `isBlockedIp`。**工单 03 的「（含重绑定用例）」是虚假勾选**，已在下文更正。 |
| Spec #1 | **属实** | `chat-handler.agent.test.ts` 13 例 / 2 describes，确认**无 abort、无匿名用户**用例。**我此前在工单 04 勾选的「…用户中断（abort）/匿名用户」同属虚勾**，已更正。 |
| Spec #12 | 属实但语义可争 | `chat-handler.agent.test.ts` 确有「工具结果命中合规 → 替换为安全话术」用例（web_fetch 侧符合 spec）；争议只在 image_generate 的 prompt 命中时选择「直接失败」而非「替换话术」——对图像生成而言失败更合理，建议改 spec 而非改码。 |
| Standards：D10 悬空引用 / spec §8「默认折叠」分叉 | 属实 | 确为文档与代码分叉，按 AGENTS.md「不得长期分叉」应回写 spec 或补记 D10。 |

**复核结论**：两轴共 20 条发现，其中 **4 条是我需要在下单前处理的硬事实**（Spec #11 实现违规、Spec #4 退款口子、Spec #1/#2 的验收与工单虚勾）。其余为判断题、文档漂移或已留痕的有意偏离。

---

## 两轴小结

- **Standards 轴**：6 条发现（0 硬性违规 / 6 判断题），最重的是 **`'chat-agent'` 这个新值引发的 Shotgun Surgery ＋ 同一字符串联合四处重复定义**（`ReserveFeature` 未从 `AiUsageFeature` 派生）。
- **Spec 轴**：12 条发现，最重的是 **§5.1 事件顺序约束被违反**（决策步正文早于 tool_call/tool_result 下发），紧随其后的是 **§5.4 中断判态只看正文不看工具产出，导致「已出图但无正文」的中断走 failed 全额退款**。

（按技能约定，不跨轴选唯一「最严重项」。）

---

## T08 处置（审查后）

用户裁决：**修 Spec #4 + 补齐 Spec #1/#2 测试缺口，Spec #11 另立工单。** 执行结果：

| 发现 | 处置 | 落点 |
|---|---|---|
| Spec #4 退款口子 | **已修** | `agent-runner.ts` 新增 `toolProducedOutput` 与 `hasOutput()`；完成态与中断态均改以「有产出」判定；终态事件（`done`/`error`）同步对齐。回归用例 2 条（含**撤销修复即失败**的验证：`expected 'failed' to be 'partial'`、`['tool_call','tool_result','error']` vs `[...,'done']`） |
| Spec #1 abort / 匿名缺用例 | **已补** | `chat-handler.agent.test.ts` 13 → **17 例**：新增「中断·无产出→failed」「中断·已交付产物→partial」「工具成功但无正文→success+done」「匿名用户→chat-agent 计费」 |
| Spec #2 重绑定 / 截断边界缺覆盖 | **已补** | 把重绑定判定从 `web-fetch.ts` 的私有 `guardedLookup` 中抽出为 `url-guard.ts` 的纯函数 `guardResolvedAddresses`（含「公网+内网混入必须整体拒绝」等 9 个表驱动用例）；新建 `tool-policy.test.ts` 覆盖 `truncate` 边界（`==` 不截断 / `+1` 截断）、`summarizeArgs`、`normalizeToolError`、超时与附件透传 |
| Spec #11 事件顺序 | **另立工单** | `.scratch/chat-agent-tools/issues/09-sse-event-ordering.md`，含两条路线与「路线 A 会牺牲最常见路径的流式观感」的权衡，待产品裁决 |
| Spec #3 / #5–#10 / #12 | **不修，记录在案** | 多为已留痕的有意偏离或文档漂移；#12（image_generate 命中合规时直接失败而非替换话术）判断为对图像生成更合理，建议后续改 spec 而非改码 |
| Standards 6 条 | **不修，记录在案** | 全部为判断题，无硬性违规；`ReserveFeature` 从 `AiUsageFeature` 派生这条值得单独开工 |

**修复后的全量门禁**：`pnpm typecheck` 9/9；`pnpm test` 5/5 turbo 任务，`apps/web` **120 文件 / 1053 例**（较修复前 +1 文件 / +46 例）；`pnpm lint` 8/8 任务 **0 error**（2 个 warning 属既有、与本次改动无关）。

