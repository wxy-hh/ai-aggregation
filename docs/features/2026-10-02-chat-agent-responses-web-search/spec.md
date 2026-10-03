# 四期①：agent 编排器迁移 Responses API + 内置 web_search（规格）

> 盘问裁决 → 本规格 → 工单 → 委派实施（delegate-antigravity）→ 两轴审查 → 真机验收 → 提交。
> 前置事实全部经真机 spike 验证（脚本留存 `.scratch/spike-ark-responses/`）。

## 0. 决策记录（盘问裁决汇总）

| 编号 | 决策点 | 裁决 |
|---|---|---|
| D-四期-1 | 迁移范围 | 只迁 agent 编排器；普通对话的 doubao.ts 手撸 /responses 路径不动 |
| D-四期-2 | 多步状态模式 | 请求内 previous_response_id 链式（纯 A，不做 store:false 自动降级）；跨请求仍全量重发；链失败走现有「编排失败→partial/failed→释放预留」语义 |
| D-四期-3 | 搜索呈现 | providerExecuted 事件复用现有 tool_call/tool_result 契约，卡片显示「联网搜索：{查询词}」；不显示结果正文（Ark 永不下发）；前端零改动 |
| D-四期-4 | 调用治理 | 服务端搜索不计入 AGENT_MAX_TOOL_CALLS_*；改用 max_tool_calls 请求参数按轮封顶（=3，对齐 AGENT_MAX_TOOL_CALLS_PER_ROUND） |
| D-四期-5 | 计费 | 计费代码零改动；finalize 按实际 usage 结算（链式让每步只计新增 input）；结算 metadata 增加 searchCalls 观测计数；搜索次费含在一口价内，上线后人工对账 |
| D-四期-6 | 回滚 | 直切不加开关，旧传输代码删干净；应急回滚 = git revert 本期 commit |
| D-四期-7 | 验收 | 三层清单（门禁 / 真机功能 / 计费观测）+ 事件序列防回归 + 搜索失败列入上线后观察项 |

### Spike 关键证据（2026-10-02 实测，doubao-seed-evolving）

1. 一期「Responses API 多轮 400」根因修正：SDK 默认 `store:true` 把历史项序列化为 `item_reference`，Ark 不支持该类型（报 `input ... <nil>`）。**不是 Responses API 不支持多轮**。一期文档与 agent-runner.ts 注释本期一并修正。
2. `store:false` 可绕过 400，但服务端工具结果不跨步（SDK 警告 + 拜登幻觉实锤）；`previous_response_id` 链式实测成功——追问只带 id、input 仅 339 tokens（全量重发 12K）、搜索结果完整保留。
3. 混用实测：同一调用内模型先自主 web_search（providerExecuted）再调自有函数工具，互不干扰。
4. 两个适配点：SDK 见到 openai.web_search 会自动加 OpenAI 专属 `include`（Ark 400，需 fetch shim 剥除）；工具序列化透传正常（`{"type":"web_search"}` 原样进请求体）。
5. 搜索结果正文不下发客户端（原始 SSE 只有 query）；reasoning summary 含模型对结果的消化，流式可见。
6. web_search 无 `.failed` 事件（knowledge_search/mcp/doubao_app 都有）——搜索失败路径无法主动构造，列观察项。
7. 待补验（落地前半小时）：previous_response_id 链式 + 回注 function_call_output 的组合路径。

## 1. Problem Statement

agent 模式只有 web_fetch（要用户粘 URL，低频）和 image_generate（有独立页面，对话内冗余）两个工具。用户张嘴就问「今天有什么新闻」「现在汇率多少」——没有联网搜索的 agent 答不了任何时效性问题，能力感知鸡肋。豆包官方的联网搜索等内置工具只在 Responses API 提供，而我们的编排器走 Chat Completions，用不上。

## 2. Solution

把 agent 编排器从 Chat Completions 迁到 Responses API（item_reference 根因已由 spike 定位并排除），以「请求内 previous_response_id 链式 + 增量发送」的方式跑多步循环，挂上豆包官方 web_search 内置工具。用户问时效性问题得到真实搜索驱动的回答，过程卡片显示搜索动作与查询词；自有工具（出图、web_fetch、用户 webhook）的执行管道、上限、审计、计费语义全部不变。

## 3. User Stories

1. 作为普通用户，我问「今天有什么新闻」，agent 自主联网搜索并给出带真实时效性的回答，而不是说「我的知识截止到 xx」。
2. 作为普通用户，我问「现在人民币对美元汇率多少」，得到真实查询结果而非模型臆造数字。
3. 作为用户，我在等待时能看见过程卡片显示「联网搜索：{查询词}」，知道 agent 正在为我查资料、查的是什么。
4. 作为用户，我说「搜一下今天的科技新闻，然后生成一张相关配图」，搜索与出图都触发，且最终回答准确引用搜索结果（链式保留，不幻觉）。
5. 作为用户，我说「查一下天气再用我的工具发到群里」，搜索与我的 webhook 工具混用正常。
6. 作为用户，我使用纯出图、纯对话、纯 webhook 调用时，体验与迁移前完全一致（无回归）。
7. 作为用户，模型一轮内疯狂调工具时，调用总数被服务端封顶（max_tool_calls=3），我能更快拿到收尾回答。
8. 作为运营，我在结算记录里能看到 searchCalls 计数，能评估搜索功能的真实使用频率。
9. 作为运营，链式模式下多步请求的 input token 不再逐步重付，成本曲线更平。
10. 作为运营，额度预留/释放/partial 计费语义在迁移后不变，链路失败不多扣用户钱。
11. 作为开发者，迁移是直切的：代码里只有一套传输层，没有双路径分支。
12. 作为开发者，出生产事故时回滚动作明确：revert 本期 commit。
13. 作为审查者，一期「Responses API 报 400」的错误根因记录被修正为 item_reference 真实根因，后续不再误导。
14. 作为未来的开发者，知识库搜索/MCP/豆包应用调用的接入通道（Responses API）已就位，路线图后续项可直接复用本次适配层。

## 4. Implementation Decisions

### 4.1 传输层切换（runAgent 内）

- `aiProvider.chat(model)` → `aiProvider(model)`（Responses API）。
- 不设 `store`（默认 true）——链式模式下 runner 只发增量消息（无 item id），不会产生 item_reference；首轮全量历史来自 DB（无 id，全量项），同样安全。
- `providerOptions.openai.maxToolCalls = AGENT_MAX_TOOL_CALLS_PER_ROUND`（D-四期-4）。

### 4.2 include shim 落点

SDK 见到 `openai.web_search` 工具会自动加 `include: ["web_search_call.action.sources"]`（OpenAI 专属值，Ark 400）。在 `packages/providers` 的 doubao provider 工厂里挂自定义 fetch：出站请求若为 /responses 且 body 含 include 则剥除（带中文注释说明根因）。这是 doubao 适配的一部分，不是通用机制。

### 4.3 多步循环改造（runner 核心）

- 维护 `previousResponseId`：首步无；后续每步从上一步响应取 id（SDK `result.response` 上的 id）传入。
- 增量发送：追踪「已发送消息数」，每步只发新增项（自有工具的 function_call_output）；不再每步全量重发。
- 终止与收尾语义不变：无自有工具调用的决策步 → 文本即最终回答；达上限/超时/熔断 → 收尾步（收尾步同样走链式）。
- 事件契约、usage 逐轮累加、截断 warning、`hasOutput` 三态判定、onFinish 结算全部沿用。
- finishReason 映射补全：Responses 路径出现过 `other`/`stop`/`incomplete(length)`——`other` 按正常完成处理，`length` 沿用截断 warning。

### 4.4 providerExecuted 工具处理

- web_search 不进 ToolRegistry（注册表只管「我们执行」的工具）；runner 构建 ToolSet 时额外并入 `provider.tools.webSearch({})`。
- SDK 吐出的 providerExecuted tool-call/tool-result 部分直接映射为过程卡片事件（不执行、不入去重缓存、不计 AGENT_MAX_TOOL_CALLS_*、计数进 searchCalls）。
- 步骤路由判定改为按「自有工具调用」（`toolCalls.filter(c => !c.providerExecuted)`）：providerExecuted-only 的步且产出文本 = 最终回答。
- 卡片显示名「联网搜索」，argsSummary 用 result 事件 action.query（spike 已验证该字段存在）。

### 4.5 web_fetch 描述修订

与 web_search 划清职责防误选：web_search = 获取实时信息/新闻/事实（无 URL 时）；web_fetch = 用户给出具体 URL 时深读全文。改描述文案，零逻辑改动。

### 4.6 计费与审计

- 计费代码零改动（D-四期-5）。searchCalls 计数器挂 runner（providerExecuted web_search 的 tool-result 计数），onFinish metadata 与 webhookCalls 并列输出。

### 4.7 文档修正

- `agent-runner.ts` 头注释的「Responses API 回传 messages 报 400」修正为 item_reference 真实根因 + 本期解法。
- `docs/handoff/2026-10-01-chat-agent-tools-phase1-to-phase2.md` 对应段落加修订注记（不改写历史，加批注）。

### 4.8 落地前补验（半小时）

previous_response_id 链式 + 回注 function_call_output 的组合路径打一次真机（spike 只分别验过两条独立路径）。脚本沿用 `.scratch/spike-ark-responses/` 模式，验完归档同目录。

## 5. Testing Decisions

好测试标准不变：只测外部可观察行为（事件序列/落库内容/HTTP 状态），不测内部实现。

- **主接缝不变**：streamText mock 层（chat-handler.agent.test.ts / chat-handler.agent-webhook.test.ts 的既有模式）。runner 重构后这两个文件是回归网，必须全绿。
- **新增单测**：providerExecuted 事件映射（成对、显示名、query 摘要、不计入上限）；增量发送与 id 链追踪（第二步起 input 只含新增项 + previousResponseId 正确传递）；finishReason `other` 映射；searchCalls 计数。
- **传输层真实性不建 mock 假装覆盖**：由 spike 脚本（留存）+ 真机验收承担，与一期二期口径一致。
- **真机验收清单（D-四期-7 定稿）**：
  - 门禁：全量 typecheck/lint/test 绿。
  - 功能：①纯搜索问答（答案有时效性、无幻觉）；②搜索+出图混用（收尾准确引用搜索结果=链式生效的直接证据）；③纯出图/纯对话/webhook 调用回归；④诱导多轮调用确认 max_tool_calls 服务端封顶与 skip 语义不打架；⑤自有工具调用时事件序列严格成对无重复（防 agent_tool_call 通用事件干扰）。
  - 计费观测：searchCalls 计数正确；AIUsageRecord input 不再逐步爆炸。
  - 观察项（不阻塞交付）：web_search 无 failed 事件，搜索失败路径上线后观察。

先例索引：chat-handler.agent.test.ts（主接缝）、chat-handler.agent-webhook.test.ts（三期）、`.scratch/spike-ark-responses/`（真机探测先例）。

## 6. Out of Scope

- 普通对话（非 agent）路径迁移——doubao.ts 手撸 /responses 已稳定，不动（D-四期-1）
- knowledge_search（要旗舰版知识库）、MCP、豆包应用调用（doubao_app_call）——Responses API 通道就位后的路线图后续项
- 搜索中间态卡片（in_progress/searching）与工具参数流式早显——排期允许时的可选增强，不做进本期验收
- 搜索失败路径的主动构造与测试（无法构造，列观察项）
- 输入放大系数、搜索次费对账管道——跑量一个月后凭 AIUsageRecord + ark 账单评估
- 跨请求的服务端状态链（跨用户请求复用 previous_response_id）——请求内链式已够，跨请求耦合服务端状态收益不抵复杂度
- 四期②（飞书/企微群机器人模板 + bodyTemplate 受限扩展）——独立规格，① 落地后再盘

## 7. Further Notes

- **部署清单**：确认生产 ARK_API_KEY 的联网搜索服务已开通（本地 key spike 实测可用）；上线后人工盯一眼 ark 账单里联网搜索计费项是否启用、单价多少（控制台操作）。
- **回滚**：git revert 本期 commit 即整体回退（D-四期-6）。
- **备案**：doubao_app_call 的搜索事件带 queries/results/summary 正文下发（官方文档明示）——未来若要「搜索结果与引用源对用户可见」，豆包助手 API 是备选路线。
- **委派执行约定**：沿用三期纪律——delegate-antigravity 执行、简报 ≤5KB 拆批、父代理逐批 diff+测试亲验、handoff 自述不作数。
- spike 脚本与原始日志存 `.scratch/spike-ark-responses/`（不进仓库）。

## 8. 验收结果（2026-10-03 实施收官）

### 门禁（全绿，父代理逐批亲验）

- `pnpm typecheck`：9 任务全绿；`pnpm lint`：8 任务全绿；`pnpm --filter web test`：134 文件 1266 用例全绿。
- 回归网原样未动：`chat-handler.agent.test.ts`（38）+ `chat-handler.agent-webhook.test.ts`（8）= 46 用例全绿（mock 无 response.id，走全量回退路径，与迁移前行为逐字节一致）。
- 新增 `agent-runner.test.ts`（runner 级新接缝，同一 `vi.mock('ai')` 策略）11 用例全绿：链式增量发送、收尾步链式且无 maxToolCalls、finishReason `other`/`length` 映射、无 id 全量回退、providerExecuted 事件成对映射、providerExecuted-only 路由为最终回答、不计自有工具上限、searchCalls 只数 web_search、query 缺失兜底、providerExecuted-only 无文本时引导语续跑；`agent-trace.test.tsx` 补 web_search 中文显示名用例。
- include shim 离线验证：stub 全局 fetch 捕获真实出站 `/responses` 请求体，确认无 `include` 字段且 tools 透传 `[{"type":"web_search"}]`（脚本已归档 `.scratch/spike-ark-responses/`）。

### 双轴代码审查与修复（2026-10-03，reviewer 子代理 ×2）

修复（实缺陷，两轴交叉确认）：
1. **链 id 只置不重置**：次轮响应缺 id 时沿用旧 id 链式发新工具结果，call_id 不在被引链上必被上游拒 → 改为缺 id 即断链（`responseId ?? null`），回退全量发送。
2. **providerExecuted-only 且无文本的步被误判为最终回答**：§4.4 要求「且产出文本」才算最终回答。典型触发 = 搜索被 maxToolCalls 按轮截断（验收项④的场景）。修为：仅当本轮确有 providerExecuted 活动时才注入引导语续跑一轮；「空决策（无工具/无文本/无搜索）」维持一期既有语义不变（由回归用例「工具成功交付产物但总结步无正文」锁定）。

顺手清债：include shim 从「删整个 include 字段」收窄为「只剥 `web_search_call.action.sources` 值」；链式载荷组装收敛为 `resolveStepPayload()` 单一出口。

裁决不修（记录在案）：查询词落在 tool_result 摘要行（卡片显示「联网搜索」+ 次行「查询词：xxx」）而非 §4.4 字面的 argsSummary——契约内最优（query 只在 result 时刻可得，argsSummary 在 call 时刻只能为空；分行呈现在移动端不截断），此处对 §4.4 文案做实现侧修订；`web_search` 字面量散落各处（契约名，可接受）；xunfei 复用 runAgent 的 Responses 耦合（上游 `AGENT_PROVIDER` 硬锁 doubao，非现实路径）。

### 真机功能验收（2026-10-03，ego-browser 真实浏览器，五条全过）

**验收中又抓到一个真缺陷并已修复——多轮对话 400 回归（missing `input.type`）**：场景②首轮即失败。根因：SDK 生成的 message 输入项不带 `type` 字段（OpenAI 宽松接受），Ark 对缺 type 的 **assistant 历史项**直接 400（user 项可豁免，故场景①单轮幸免）。定位走过弯路：离线 stub 捕获的请求体与真网放行结果一度矛盾（stub 流静默吞错造成假阳性），最终以「真机落盘请求体 + curl 重放 + 逐字段二分」定界——补 `type` 或删 assistant 项即通。修复：`doubaoFetch` shim 增加第二职责，给「有 role 无 type」的 input 项补 `type:"message"`（`packages/providers/src/factory.ts`）；回归测试 `packages/providers/src/__tests__/factory.test.ts` 3 用例（补 type / 剥 include / chat completions 透传不动）全绿，真网复验多轮+web_search 请求 200 接受。

五条清单逐项：

1. **纯搜索** ✓ ——「今天有什么新闻」返回真实当日新闻（2026-10-03 国庆假期、G7 释储、油价 102.74 美元等训练数据不可能有的时效信息）；过程卡片 2 张「联网搜索」，次行查询词正确；结算 `metadata.searchCalls=2` 与卡片数一致。
2. **混用** ✓ —— 搜索（查询词正确）→ 旁白引用真实头条 → 图像生成首次失败自动重试成功 → 图片附件交付，收尾准确引用搜索结果（previous_response_id 链式生效的直接证据）。
3. **老三样回归** ✓ —— 纯对话无工具卡片直接回答；纯出图触发 image_generate 成功出图；webhook（临时实名用户 + test_echo 回声工具）声明加载（「已加载 1 个我的工具」）、模型正确选取派发、失败结果回注后得体降级、重试成功回声一致；验收后测试工具与用户身份已还原。
4. **max_tool_calls=3 封顶** ✓ —— 诱导同轮搜 4 话题，实际恰好 3 次搜索被服务端封顶，不出错、最终覆盖全 4 话题完整回答；`metadata.searchCalls=3`。
5. **事件成对无重复** ✓ —— 各场景过程卡片严格「调用→结果」成对无重复（混用展开视图：搜索→旁白→出图失败→旁白→出图重试成功，严格交替）。

验收环境插曲（非本期回归）：匿名账号额度中途耗尽（场景①单轮消耗 14,278 单位），DB 充值后续验；图像/回声上游各有一次偶发抖动，重试均成功。
