# /chat Agent 工具调用 · 设计方案

> 一期范围：单轮工具调用（决策步 → 工具执行 → 总结步），内置图像生成 + 网页抓取两个工具。
> 盘问三轮收敛全部裁决，本文档为实施唯一权威依据。

## 0. 决策记录（盘问裁决汇总）

| # | 裁决项 | 结论 | 理由（压缩） |
|---|--------|------|--------------|
| D1 | 自主性等级 | **单轮工具调用起步**，架构按多轮预留 | 多步循环沿用一次 reserve + 一次 finalize（预估×步数系数），账本一对多结算不再是前置；二期按此实施 |
| D2 | 工具来源 | **内置平台工具**（图像生成 + 网页抓取） | webhook 的 SSRF 攻击面属于二期安全专项；MCP 进程模型与 web 平台部署形态未想清楚；平台已有 Kolors 能力可零外部依赖闭环 |
| D3 | 目标用户 | **平台正式功能** | 计费 / 合规 / 限流 / 审计全配套，非自用 demo |
| D4 | 模型策略 | **agent 模式强制切模型**（豆包 seed） | 默认模型讯飞 lite 不支持 tool use；模型切换挂在 agent 开关上天然成立；`ai` 包 ^6.0.50，tools 能力已具备（此项已核实关闭） |
| D5 | 过程可见性 | **过程可见**（SSE 事件 + 前端过程组件） | 长延迟无反馈体验不可接受；事件协议与 reasoning-delta 走同一契约扩展路径（已验证的先例） |
| D6 | 计费口径 | **按次一口价**：一次 reserve/finalize，预估 × 步数系数，feature=`chat-agent` 单列 | 账本零改动（预留只是冻结、finalize 按实际结算，多预留不多扣）；按步计费需账本支持一对多结算，二期再议；feature 单列可独立统计用量、为二期定价留数据 |
| D7 | 触发方式 | **输入区显式 agent 开关**（客户端传 `agent: true`） | 计费透明（用户知道会更贵）、普通聊天延迟不受影响、模型分流挂在开关上 |
| D8 | 测试接缝 | **HTTP 级单一主接缝** + web-fetch 安全纯函数一处下钻 | 见 §9 |
| D9 | 二期边界 | 多步自主循环 → 用户 webhook 工具 → 会话服务端化+长期记忆（独立立项）→ MCP | 见 §12 |
| D10 | 过程卡片折叠时序 | **复用 ThinkingBlock 先例**：`userOverride ?? defaultExpanded`；**有工具在跑就保持展开**，工具全部落定后才自动折叠一次，用户手动操作后不再被自动时序干预 | 决策步正文可先于工具事件到达（§5.1 修订），若仍以「正文到达」为折叠信号，卡片会在工具还没开始跑时就收起，用户失去「工具正在执行」的反馈。改以工具运行态为信号，代价与收益都落在前端单点 |
| D11 | agent 期间的模型选择器 | **置灰并收起已展开的列表**，生效模型只在输入坞局部提示，不篡改已显示的模型名 | agent 强制切模型（D4）是服务端静默覆盖；若不置灰，用户会以为自己选的仍是讯飞。只置灰触发器不够，必须同时收起已展开列表，否则列表项仍可点 |

## 1. 背景与现状（代码实证）

**现有消息流转**：前端 `chat-store.sendMessage` → `POST /api/chat`（全量消息数组，无状态服务端）→ `createChatHandler`（鉴权 → 限流 → 输入合规前置 → `QuotaSession.reserve` → 委派适配器 → SSE）→ `chat-store` 逐 chunk 更新 → `conversations-store` 持久化到 **localStorage**。

**对本期直接相关的代码事实**：

1. **适配层**：`ChatProviderAdapter` 接口只有 `stream(ctx)` 一个方法；`generic.ts` 用 Vercel AI SDK `streamText`（`ai@^6.0.50`），tools / toolCall / maxSteps 为该版本核心能力，**无需引入新依赖**。
2. **SSE 契约已走正门**：`packages/shared/src/chat-stream-contract.ts` 定义 5 事件联合类型（text-delta / reasoning-delta / warning / error / done），类型化签名拒绝契约外事件，消费端对未知类型显式忽略（前向兼容）。上一期 reasoning-delta 扩展已验证此路径，本期 tool_call / tool_result 同款扩法。
3. **计费账本**：`@repo/db/quota-ledger` 为 reserve → finalize 配对结构；meterType 是 4 种白名单（tokens / audio_seconds / image_task / video_task），feature 是自由字符串。**预留只是冻结额度，finalize 按实际 measurement 结算**——这是 D6 按次计价成立的前提。
4. **模型现状**：`ProviderName = 'xunfei' | 'doubao'`，默认模型讯飞星火 lite（免费，不支持 tool use）；豆包 seed 系支持 function calling（**动手前必须实测**，见 §13）。
5. **合规设施**：输入侧 `detectChatSensitiveTopic` 前置拦截（handler 层）；输出侧 onFinish 内审计。工具结果注入模型上下文是**新增检查点**（见 §5.5）。
6. **存储现状**：聊天会话存 localStorage（服务端不存消息），`Message` 模型无 tool 角色。

**文档漂移记录**：AGENTS.md 宣称接入"通义千问 / 智谱 GLM / DeepSeek"，实际代码仅 xunfei / doubao。本 spec 以代码为准，文档纠偏另行处理。

## 2. 范围

**做**：

- 输入区 agent 模式开关（移动端优先，热区 ≥ 44px）
- `POST /api/chat` 支持 `agent: true`：服务端两段式编排（决策步 → 工具执行 → 总结步）
- 内置两个工具：**图像生成**（复用平台 Kolors 能力 + 现有对象存储路径）、**网页抓取**（URL 安全校验 + 正文提取）
- SSE 契约扩展 `tool_call` / `tool_result` 事件，前端过程可见组件
- 计费：feature=`chat-agent`，按步数预估预留、按实际结算
- 合规：新增"工具结果注入前"检查点
- 模型分流：agent 模式强制使用支持 function calling 的模型
- 过程记录持久化到消息（`Message.toolCalls`，随会话 localStorage 保存，刷新可回看）

**不做（一期）**：

- 多步自主循环（maxSteps > 1）
- 用户自定义工具（webhook / MCP）
- 工具失败自动重试 / 自动换工具
- 跨会话长期记忆、会话服务端化
- 工具并行执行（一期顺序执行，见 §7）

**匿名用户**：跟随现有 chat 策略——匿名自动登录用户可用，走同一配额与限流体系（与 anonymous-access-quota 一致）。

## 3. 用户故事

1. As a 平台用户，我能在输入区打开 agent 模式，以便让 AI 在回答前调用工具完成任务。
2. As a 平台用户，我打开 agent 模式时能清楚看到当前用的是哪个模型（豆包 seed 而非默认 lite），以便理解为什么这轮对话消耗更多额度。
3. As a 平台用户，我说"帮我画一张…"时 AI 自动调用图像生成工具，以便在不离开对话的情况下拿到图。
4. As a 平台用户，我想看到"正在调用图像生成工具"的实时过程提示，以便理解等待的原因。
5. As a 平台用户，我想在生成完成后看到工具调用记录（调了什么、参数摘要、结果摘要），以便事后核查 AI 做了什么。
6. As a 平台用户，我可以把这个月的某张图重新编辑后再生成，以便迭代结果。
7. As a 平台用户，我贴一个 URL 说"总结一下这篇文章"时 AI 抓取网页内容并总结，以便快速获取长文要点。
8. As a 平台用户，网页抓取失败时（链接失效、超时、被拦截）AI 会告诉我失败原因而不是沉默或编造，以便我决定下一步。
9. As a 平台用户，AI 没有调用任何工具就直接回答时，对话体验与普通聊天一致（降级无缝），以便我不感知底层差异。
10. As a 平台用户，我在工具执行中点击停止，已生成的部分会保留并标记中断，以便不丢失已有结果。
11. As a 平台用户，刷新页面后我能回看之前 agent 对话的工具调用记录，以便核对历史。
12. As a 平台用户，我在手机端使用 agent 功能时开关和过程组件都在拇指可达区域，以便单手操作。
13. As a 匿名用户，我可以直接使用 agent 功能，以便零门槛体验（额度受现有匿名配额约束）。
14. As a 平台用户，agent 对话在账单/用量记录里显示为独立类别（chat-agent），以便我理解为什么这轮比普通聊天贵。
15. As a 平台用户，我关闭 agent 开关后的普通对话不受影响（延迟、模型、计费照旧），以便按需使用。
16. As a 平台运营者，我能在用量统计里区分 chat 与 chat-agent 的调用量与 token 消耗，以便为二期定价积累数据。
17. As a 平台运营者，用户通过网页抓取工具无法触达内网地址（SSRF 防护生效），以便平台不被当作内网跳板。
18. As a 平台运营者，抓取到的网页内容在进入模型前经过敏感话题检查，以便合规风险不随工具扩大。
19. As a 平台维护者，agent 请求的全部计费、合规、限流都复用现有 handler 设施，以便不出现第二套横切逻辑。
20. As a 平台维护者，工具注册表是开放扩展的（新增工具只需注册 spec + execute），以便二期加工具不改动编排代码。

## 4. 数据流（端到端）

```
前端：用户开 agent 开关 → 发送消息（body 带 agent: true）
  │
  ▼
POST /api/chat ── createChatHandler（现有设施原样走）
  │  1. 鉴权 / 限流 / 输入合规前置        ← 不动
  │  2. QuotaSession.reserve(feature='chat-agent', 预估×步数系数)
  │  3. 分流：agent=true → agent-runner（新）；否则 → 现有 adapter 路径（不动）
  ▼
agent-runner 两段式（maxSteps=1）
  │  决策步：streamText(model=豆包seed, tools=[内置注册表], messages)
  │    ├─ 未产生 toolCall → 文本直接作为回答（降级路径，仍一段完成）
  │    └─ 产生 toolCall →
  │         SSE 推 tool_call 事件（展示摘要）
  │         → tool-policy 执行（超时/截断/错误规范化；web-fetch 结果先过合规检查）
  │         → SSE 推 tool_result 事件（status + 摘要）
  │  总结步：streamText(messages + toolCall/toolResult 完整内容)
  │         → SSE 推 text-delta → done（usage = 两步汇总）
  ▼
onFinish → QuotaSession.finalize（现有不动）→ 输出合规审计（现有模式）
  │
  ▼
前端 consumeChatResponse：新事件进 agent-trace 组件；文本/终止语义沿用现有状态机
```

## 5. 接口约定

### 5.1 SSE 契约扩展（packages/shared/src/chat-stream-contract.ts）

联合类型新增分支（与 reasoning-delta 同款扩法，编码/解码/消费端三处同源）：

| 事件类型 | 主要字段 | 说明 |
|---|---|---|
| `tool_call` | `call: { id, name, argsSummary }` | 工具调用开始（展示摘要） |
| `tool_result` | `callId, name, status, summary, attachment?` | 工具执行结束（展示摘要） |
| `agent_note` | `type: 'agent_note', text: string` | 过程旁白，进过程卡片、不进正文、不入历史 |

```ts
// 类型 shape 定稿（盘问方案定稿，实施时以本段为准）
type ChatStreamToolCallEvent = {
  type: 'tool_call';
  call: { id: string; name: string; argsSummary: string };  // argsSummary 为截断展示摘要
};
type ChatStreamToolResultEvent = {
  type: 'tool_result';
  callId: string;
  name: string;
  status: 'success' | 'failed';
  summary: string;  // 截断展示摘要
};
type ChatStreamAgentNoteEvent = {
  type: 'agent_note';
  text: string;  // 过程旁白，进过程卡片、不进正文、不入历史
};
```

**关键决策：下发前端的是展示摘要（截断），完整 args / 完整工具结果只进模型上下文，不下发。** 理由：结果可能含大段网页正文，下发既费流量也泄内容；摘要足以支撑过程可见。

事件顺序约束（**2026-10-01 修订**）：`tool_call` / `tool_result` **成对且有序**（每个 call 的结果必在其 call 之后），且 **`tool_result` 必然先于总结步的首个 `text-delta`**；`done` 携带两步汇总的 usage，且必然是最后一个事件。

> 原约束写的是「`tool_call` / `tool_result` 必然先于**首个** `text-delta`」，该说法不成立：决策步正文是边流边下发的，模型先来一句「我查一下」再调工具时，`text-delta` 就会早于工具事件。
> 之所以不把决策步正文压到工具之后：**不调工具的普通问答是最常见路径**，缓冲正文会让它的首字延迟从 ~0 变成整段生成时长（T07 #5 专门验过这条路径「单段直答、无骨架屏长挂」）。为一条相对罕见路径的严格性牺牲最常见路径的流式观感，不划算。
> 因此改由前端承担顺序差异：过程卡片不再因「正文到达」就折叠，而要看工具是否还在跑 —— 见 §8 与决策 D10。

消费端对这两个新事件的解析沿用"未知类型显式忽略"的降级约定——旧版本前端收到新事件不炸。

### 5.2 请求体扩展（POST /api/chat）

```jsonc
{
  "messages": [ ... ],        // 现有，不动
  "model": "...",             // 现有；agent=true 时服务端强制覆盖（见 5.6）
  "provider": "doubao",       // 现有；agent=true 时强制 doubao
  "reservationId": "...",     // 现有，不动
  "agent": true               // 新增：可选，默认 false
}
```

`agent: true` 且 provider/model 与强制值冲突时：**服务端静默覆盖，不报错**（开关已在前端明确告知用户，请求侧再做硬校验是噪音；覆盖行为记入 finalize 的 metadata）。

### 5.3 工具注册表协议（@repo/shared zod schema）

```ts
// 注册表条目（服务端内部使用，前后端共享的是展示记录类型）
interface AgentToolSpec {
  name: string;                    // 唯一名，如 'image_generate' | 'web_fetch'
  description: string;             // 给模型看的工具说明（中文）
  parameters: JSONSchema;          // zod → JSON Schema，streamText tools 入参
  execute(args, ctx): Promise<ToolExecutionResult>;
}

// 执行结果（服务端内部）
interface ToolExecutionResult {
  ok: boolean;
  // 进模型上下文的完整内容（未截断）
  contentForModel: string;
  // 下发前端的事件摘要（已截断）
  summaryForDisplay: string;
  // 图像类工具的附件（进 Message.attachments，前端既有渲染通道）
  attachment?: { kind: 'image'; url: string };
}

// 持久化到 Message 的展示记录（前后端共享 zod）
interface ToolCallRecord {
  id: string; name: string;
  argsSummary: string;
  status: 'success' | 'failed';
  resultSummary: string;
}
```

### 5.4 计费口径（QuotaSession 账本零改动）

- reserve：`feature: 'chat-agent'`、`meterType: 'tokens'`（不变），预估输出 = 单步上限（2048）× 实际步数（一期固定 2；二期起 2–5、低余额自适应，步数↔token 换算唯一出处为 agent-config 的 resolveAgentStepBudget），**抽成常量可配**。
- finalize：两步 usage 汇总（input/output 各自相加），沿用现有三态（success/partial/failed）语义：决策步无输出即 failed 全退；工具失败但总结步有输出算 success（工具失败是业务结果不是系统失败）；用户中断时已产出部分按 partial。
- release：流未开始即失败的现有路径不变。
- 工具执行本身（图像生成/抓取）一期**不单独计费**——已含在 chat-agent 的一口价里；图像生成走平台既有能力的内部调用，不重复走 /api/image 的计费。

### 5.5 合规检查点（共三个）

1. 输入：最后一条 user 消息 —— **现有** handler 前置拦截，不动。
2. 工具结果注入模型前：web_fetch 提取正文先过 `detectChatSensitiveTopic`，命中则工具结果替换为合规话术文本（不中断任务，模型据话术向用户说明）；image_generate 的 prompt 命中合规时直接失败、不产出图片 —— **新增**。
3. 最终输出：onFinish 内审计 —— **现有**模式，不动。

### 5.6 模型分流策略

- `agent: true` → 服务端强制 `provider='doubao'`、`model='doubao-seed-evolving'`（T01 实测确认支持 function calling；与项目现有默认豆包模型一致，且 reasoning 消耗低于 pro 型号）。
- **传输层关键事实（T01 实测）**：agent-runner 走 **Vercel AI SDK `streamText` → ark Chat Completions 兼容接口**（`/chat/completions`），而现有 `DoubaoAdapter` 走 **Responses API**（`/responses`）。二者是**独立的传输路径**：agent-runner 不经过 `ChatProviderAdapter`、不复用 DoubaoAdapter 的 SSE 解析与结算逻辑，直接用 `createProvider('doubao')` + `streamText`。
- SDK 的 `fullStream` 除 `tool-call` 外还暴露 `reasoning-*` 事件（T01 实测），为二期透传 agent 推理过程预留了通道。
- 前端开关打开时即显示模型切换提示（用户故事 #2）。
- 讯飞 lite 路径完全不动。

## 6. 内置工具规格

### 6.1 图像生成（image_generate）

- 复用平台现有图像生成 service 层（Kolors）与对象存储路径（OSS/MinIO），**服务端内部直调，不走 HTTP 自调用**。
- 参数：`prompt`（必填）、`style`（可选，沿用现有风格枚举）。
- 结果：`attachment` 进总结步消息的 attachments（前端既有渲染通道，零新 UI）；`contentForModel` = 图片 URL + 生成参数。
- 失败（上游 429/5xx/超时）：按 §7 工具失败语义处理。

### 6.2 网页抓取（web_fetch）—— 安全红线，重点工程

**URL 校验（拒绝即工具失败，错误信息对用户可读）**：

- 协议白名单：仅 `http:` / `https:`。
- 内网地址拦截：IPv4 保留段（`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`、`0.0.0.0/8`）+ IPv6 等价段（`::1`、`fc00::/7`、`fe80::/10`）+ 主机名字面量（`localhost`、`*.local`、`*.internal` 等）。
- DNS 重绑定防护：**先解析后连接**，解析结果落在校验过的 IP 上连接（禁止重新解析漂移）。

**执行约束**：

- 超时：连接 5s / 整体 15s（常量可配）。
- 体积：响应体截断至 200KB，提取正文截断至 8K 字符进模型（常量可配）。
- 提取：去脚本/样式/HTML 标签，保留正文文本（轻量实现，不引重型解析依赖）。
- 结果必须过 §5.5 检查点 2 再注入。

## 7. 中断 / 失败 / 降级语义

| 场景 | 语义 |
|------|------|
| 模型决策步未返回 toolCall | **降级**：直接以决策步文本为回答，正常 done + finalize success。对用户无感知（故事 #9） |
| 模型返回多个 toolCall | 一期**顺序执行**（按返回顺序），逐对推送 tool_call/tool_result 事件；二期再议并行。**单轮数量上限 3、整请求时间预算 240s**（`AGENT_MAX_TOOL_CALLS_PER_ROUND` / `AGENT_RUN_TIME_BUDGET_MS`；二期起由「单轮」语义升级为「整请求」语义）：超限/超预算/已中断的调用不真跑，但仍推成对事件并给模型「未执行」结果（每个 tool_call 必须有对应 tool-result，否则总结步消息序列不完整）。上限存在的理由：一轮 N 个调用会产生 N 份真实上游成本（出图 40s/次），无上限会被诱导刷量并撞路由 300s maxDuration |
| 工具执行失败 | 错误规范化为模型可读的文本进总结步（如"网页抓取失败：连接超时"），**不中断任务**；status='failed' 如实推送与持久化 |
| 工具执行超时 | 由 tool-policy 按失败处理（同上） |
| 用户中途停止 | AbortSignal 贯穿：决策步/总结步走 SDK abort，工具执行中也可中止；已产出内容按 partial 结算，前端保留已收文本（沿用思考流改造的三态语义） |
| 决策步失败（无输出） | failed，全额释放（现有 release 路径） |
| 总结步失败但有决策步输出 | partial，按现有估算兜底结算 |
| web_fetch 命中 URL 黑名单 | 工具直接失败，错误信息 = "该地址不允许访问"，仍进总结步 |

## 8. 前端展示

- **开关**：chat-input 区 agent 开关（移动端拇指可达、热区 ≥44px）；打开时显示模型提示（切至豆包 seed，额度消耗更高）。
- **过程组件** `agent-trace`：消息内的折叠卡片，展示 toolCall/toolResult 列表（名称 + 参数摘要 + 状态 + 结果摘要）。
  **折叠时序（决策 D10）**：复用 ThinkingBlock 的 `userOverride ?? defaultExpanded` 先例 —— **只要有工具在执行中就保持展开**（即便决策步正文已经到达，见 §5.1 修订），待工具全部落定后才自动折叠一次；用户手动操作后不再被自动时序干预。
  视觉采用与 ThinkingBlock 同级的**左线块**，非玻璃卡片（DESIGN.md 口径：玻璃三级用于容器级，**内容区不实心玻璃**；本卡片位于 AI 气泡的实色白面之上，玻璃没有可折射的底）。
- **数据通道**：`consumeChatResponse` 新增两个事件的处理，累积进 streaming 消息的 `toolCalls`；完成时随消息持久化（localStorage 会话）。
- **消息模型**：`Message` 增 `toolCalls?: ToolCallRecord[]`；`role` 不加 'tool'（工具结果只在服务端进模型上下文，前端消息流仍是 user/assistant 二元结构）。
- 折叠卡片与思考块（ThinkingBlock）视觉同级、不互相干扰。

## 9. 测试决策

**好测试的标准**：只断言外部可观察行为——HTTP 响应、SSE 事件序列与顺序、QuotaSession 收到的参数、合规函数的调用时机；**不断言编排器内部状态、不 mock 断言流式实现细节**。

**主接缝（唯一）：HTTP 级 handler 测试**，扩展 `chat-handler.test.ts` 模式：

- 测试替身：provider 侧 fake（模拟 streamText 产 toolCall / 不产 toolCall / 中途抛错三种行为）；工具执行器走 fake registry（不触真实 Kolors / 网络）。
- 覆盖矩阵：事件序列契约（tool_call → tool_result → text-delta* → done）／计费参数（feature、两步 usage 汇总、partial 语义）／合规三个检查点触发时机／降级路径／工具失败路径／用户中断（abort）／匿名用户路径。
- 先例：现有 `chat-handler.test.ts`（handler 级）、`sse.test.ts`（流级）、上一期 913 用例全绿的全量门槛。

**下钻接缝（一处）：web_fetch URL 校验与截断纯函数**，表驱动单元测试（内网 IP 段 / IPv6 / 主机名 / 重绑定用例 / 截断边界）。先例：`chat-safety.test.ts` 的纯函数表驱动风格。

**不建 runner 单测层**：两段式编排行为全部由 HTTP 级覆盖，避免双 seam 漂移（D8）。

## 10. 改动面清单

| # | 位置 | 动作 | 内容 |
|---|------|------|------|
| 1 | `api/chat/_lib/chat-handler.ts` + `route.ts` | 改 | 请求体解析 `agent?: boolean`；reserve 预估对 agent 乘步数系数；agent 分支分流到 agent-runner；模型/ provider 强制覆盖 |
| 2 | `packages/shared/src/chat-stream-contract.ts` | 改 | 联合类型加 tool_call / tool_result；parse/encode 同步；消费端"未知类型忽略"约定天然兼容 |
| 3 | `api/chat/_lib/agent/agent-runner.ts` | 新 | 两段式编排：streamText(tools, maxSteps=1) → toolCall 检测 → 顺序执行 → 总结步；usage 汇总；abort 贯穿 |
| 4 | `api/chat/_lib/agent/tools/registry.ts` | 新 | 工具注册表：注册/查找/zod 参数校验；内容分级（模型全文 vs 展示摘要） |
| 5 | `api/chat/_lib/agent/tools/image-generate.ts` | 新 | 复用现有图像 service 层 + 存储路径，产 attachment |
| 6 | `api/chat/_lib/agent/tools/web-fetch.ts` | 新 | URL 校验 + 先解析后连接 + 超时/截断 + 正文提取 |
| 7 | `api/chat/_lib/agent/tool-policy.ts` | 新 | 执行超时、体积截断、错误规范化（模型可读文本） |
| 8 | `packages/shared/src/agent-tools.ts` | 新 | `ToolCallRecord` zod schema（前后端共享） |
| 9 | `stores/chat-store.ts` | 改 | `Message.toolCalls?: ToolCallRecord[]`；sendMessage 透传 agent 标志；新事件合帧进 streaming 消息 |
| 10 | `components/chat/agent-trace.tsx` | 新 | 过程可见折叠卡片 |
| 11 | `components/chat/chat-input.tsx` | 改 | agent 开关 + 模型提示 |
| 12 | `lib/utils/chat-stream.ts`（consumeChatResponse） | 改 | 两个新事件的 handler 派发 |

## 11. 验收清单

功能验收（测试覆盖项见 §9，此处为端到端行为）：

- [ ] agent 开：发"画一张…" → 事件序列为 tool_call → tool_result(success) → 文本回答 → done；消息含图片附件与工具调用记录
- [ ] agent 开：贴 URL 说"总结" → 抓取成功，回答含正文要点；过程卡片记录调用
- [ ] agent 开：贴内网 URL（http://192.168.x.x / http://127.0.0.1）→ 工具 failed，回答说明"该地址不允许访问"
- [ ] agent 开：贴失效链接 → 工具 failed（超时/404），回答解释失败原因，非沉默非编造
- [ ] agent 开：问普通问题（模型未调工具）→ 单段直接回答，无工具事件，体验同普通聊天
- [ ] agent 关：一切行为与现状一致（回归）
- [ ] 停止：工具执行中点停止 → 已收内容保留、标记中断、partial 结算
- [ ] 刷新后：agent 消息的工具调用记录可回看
- [ ] 用量记录：ai_usage_records 中 feature='chat-agent'，与 chat 分列
- [ ] 匿名用户：agent 可用，配额约束生效
- [ ] 移动端：开关与过程卡片在拇指区、热区达标

浏览器联调（参考上一期 manual-test-checklist 格式另行产出）。

## 12. 二期及后续（架构预留点，本期不实施）

1. **多步自主循环**：**二期已完成（2026-10-02）**，规格与验收见 docs/features/2026-10-02-chat-agent-multi-step/spec.md。`maxSteps` 1 → 5（4 轮决策+1 收尾）；沿用一次 reserve + 一次 finalize（按实际步数预留，低余额自适应降级），账本一对多结算未做也不需要。
2. **用户自定义 webhook 工具**：依赖 SSRF 防护专项（域名白名单、响应限制、超时、审计）。
3. **会话服务端化 + 跨会话长期记忆**：绑定立项（记忆要可靠必须先有服务端会话存储），与 agent 解耦，独立排期。
4. **MCP 接入**：等 webhook 安全模型跑通后，MCP 作为"受信工具注册表"的特例引入。

## 13. 动手前验证项（阻塞开工）

1. **豆包 seed function calling 实测** —— ✅ **已完成（2026-10-01，GO）**。实测结论：
   - ark **Chat Completions** 路径（`/chat/completions`）与 **Responses** 路径（`/responses`）均支持 function calling；非流式与流式双通。
   - `doubao-seed-evolving` 与 `doubao-seed-2-0-pro-260215` 均返回 `finish_reason: tool_calls`，参数为合法 JSON 且符合 schema；无工具对照组纯文本回答。
   - **选定 agent 模型：`doubao-seed-evolving`**（现有默认豆包模型，reasoning 消耗低于 pro）。
   - Vercel AI SDK `streamText` + `tool()`（6.x：`inputSchema` + 无 `execute` 时停在 tool-call 阶段）验证通过，`result.toolCalls[].input` 已解析为对象。
   - 计费要点：豆包 seed 为推理模型，tool-call 步的 `output_tokens` 含 `reasoning_tokens`；预留预估（×2 系数）需按实测水位校准。
2. ~~ai 包版本 ≥ 3.x~~ —— 已确认 `ai@6.0.78`、`@ai-sdk/openai@3.0.26`，关闭。
