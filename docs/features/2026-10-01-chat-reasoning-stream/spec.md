# 聊天页真实思考流改造 · 设计方案

> 状态：六问拷问闭环，待实施
> 日期：2026-10-01
> 范围：/chat 单聊页（对比页仅做兼容，不展示思考流）

## 0. 决策记录（拷问裁决汇总）

| # | 问题 | 裁决 |
|---|------|------|
| 1 | 工具调用是否进本期 | **不进**。本期只做真实思考流；工具调用二期单独立项（契约与 UI 预留扩展位） |
| 2 | 讯飞模型无推理流怎么办 | **按模型能力分流**。`chat-models.ts` 增加 `supportsReasoning` 元数据；讯飞模型保留骨架屏，语义重定义为"首字节等待态"；豆包模型走完整思考流 |
| 3 | SSE 契约怎么扩 | **单加 `reasoning-delta` 事件**；推理/正文分界由前端推断（首个 text-delta 或流终止），不加显式分界事件 |
| 4 | 思考内容持久化 | **全量随消息持久化**。Message 增加扁平字段 `reasoningContent`、`reasoningDurationMs`，走 zustand persist 落 localStorage；`reasoningContent` 永不回传上游（加测试锁死） |
| 5 | 交互形态 | **四态状态机**（见 §5.1）：推理期展开、正文首字节到达即自动折叠、自动折叠只执行一次、手动操作优先；思考块在气泡内正文上方，纯文本弱化渲染 |
| 6 | 中断/失败语义 | A 通过："有留空删"扩展为 `content \|\| reasoningContent` 有任一即保留；B 通过：不新增超时看门狗；C 通过：推理缺失静默降级；**D1 通过：推理-only 截断算 partial，正常结算**（展示与计费同源） |

## 1. 背景与现状（代码实证）

- **假 loading**：`apps/web/src/components/chat/message-item.tsx:442`，`isThinking = !isUser && isStreaming && !message.content`，首个 text-delta 到达即消失，与模型零数据往来。
- **真实推理流正被丢弃**：`apps/web/src/app/api/chat/_lib/adapters/doubao.ts:121-125` 注释实测，`doubao-seed-evolving` 是推理模型，reasoning_tokens 在跑、在计费，但适配器只解析 `response.output_text.delta`，推理内容被丢弃。豆包 Responses API 的推理增量事件为 `response.reasoning_summary_text.delta`（见 `docs/豆包 api 文档.md:284`，SDK 类 `ResponseReasoningSummaryTextDeltaEvent`）。
- **契约封闭**：`packages/shared/src/chat-stream-contract.ts` 仅 `text-delta / done / warning / error` 四事件，类型化签名拒绝契约外事件；前端 `parseChatStreamEvent` 对未知事件返回 null 显式忽略。扩展必须走正门：联合类型 + parse 分支 + 双端测试。
- **超时配套已就绪**：`apps/web/src/app/api/chat/route.ts:17-19`，豆包推理模型首 token 延迟实测 13~60s，`maxDuration` 已放宽至 300s；SSE 心跳 15s（`sse.ts`）。

## 2. 范围

**In**：豆包（Doubao Evolving / Doubao Pro）真实思考流的打捞、传输、渲染、持久化、中断/失败语义全套。

**Out**：
- 工具调用（二期单独立项；届时契约加 `tool-call` 系列事件，思考块演进为时间线混排）。
- 对比页（comparison / focus-answer-pane）思考流展示——`onReasoning` 为可选回调，对比页不传即忽略，天然兼容不崩。
- 讯飞推理模型（Spark X1）接入。
- 存储配额治理：若未来 localStorage 撞配额，`reasoningContent` 是第一批可牺牲字段。

## 3. 数据流（端到端）

```
豆包 Responses API SSE
  response.reasoning_summary_text.delta  ──┐
  response.output_text.delta             ──┤
  response.done / completed / incomplete ──┘
        │  DoubaoAdapter 映射（adapters/doubao.ts）
        ▼
SSE 契约事件（@repo/shared chat-stream-contract.ts）
  reasoning-delta / text-delta / warning / error / done
        │  createSseResponse + withSseHeartbeat(15s)
        ▼
consumeChatResponse（lib/utils/chat-stream.ts）
  onReasoning（新增可选回调）/ onChunk / onWarning / onDone
        │  chat-store：rAF 合帧（reasoning 独立累加器，与正文同帧提交）
        ▼
Message.reasoningContent / reasoningDurationMs / content
        │  conversations-store zustand persist → localStorage
        ▼
MessageItem 四态渲染（§5.1）
```

## 4. 接口约定

### 4.1 SSE 契约扩展（packages/shared/src/chat-stream-contract.ts）

```ts
/** 推理增量事件（非终止事件） */
export type ChatStreamReasoningDeltaEvent = { type: 'reasoning-delta'; text: string };

export type ChatStreamEvent =
  | ChatStreamTextDeltaEvent
  | ChatStreamReasoningDeltaEvent   // 新增
  | ChatStreamDoneEvent
  | ChatStreamWarningEvent
  | ChatStreamErrorEvent;
```

- `parseChatStreamEvent` 增加 `'reasoning-delta'` 分支，校验 `text` 为 string，非法帧返回 null（与现有四分支同款严格度）。
- 终止事件集合不变：仍只有 `done / error`。
- 编码侧 `encodeChatStreamEvent` 无需改动（同源 JSON 序列化）。

### 4.2 上游映射（adapters/doubao.ts）

| 豆包事件 | 契约事件 |
|---|---|
| `response.reasoning_summary_text.delta` | `reasoning-delta`（透传 `delta` 文本） |
| `response.output_text.delta` | `text-delta`（现状不变） |
| `response.done / completed / incomplete` | usage 归一化 + `done`/`warning`（现状不变） |

推理事件解析失败：记 warn 日志并跳过该帧，**不阻断**正文流（降级 C）。

### 4.3 Message 字段扩展（stores/chat-store.ts）

```ts
export interface Message {
  // ……现有字段不变
  reasoningContent?: string;    // 模型真实推理内容（仅 supportsReasoning 模型可能产生）
  reasoningDurationMs?: number; // 思考时长：首 reasoning-delta → 分界点冻结
}
```

### 4.4 模型目录元数据（lib/constants/chat-models.ts）

`ModelCatalogItem` 增加 `supportsReasoning?: boolean`：豆包两项为 `true`，讯飞三项缺省（false）。

> 实施备注（2026-10-01 code-review Spec 轴发现）：四态状态机纯数据驱动落地后，UI 与适配器均无读取该标记的必要（推理帧有则映射、无则自然退化，零特判）。该字段保留为模型能力元数据，供二期工具调用（`supportsTools` 同款）与模型目录展示使用；此处不再要求"均读此标记"。

### 4.5 上下文回传约束

`reasoningContent` **永不进入请求上下文**（豆包/DeepSeek 官方均要求推理内容不回传；白费 token 且部分接口报错）。现有适配器显式映射 `msg.content` + `attachments`，新字段天然排除；**加一条适配器测试锁死**：构造含 `reasoningContent` 的消息，断言请求体中不出现推理文本。

## 5. 前端渲染

### 5.1 状态机（字段组合驱动，无新增枚举）

| 状态 | 判定 | 渲染 |
|---|---|---|
| 等待首字节 | `isStreaming && !reasoningContent && !content` | 骨架屏（"首字节等待态"，两族模型共用） |
| 推理中 | `isStreaming && reasoningContent && !content` | 思考块**展开**，流式渲染，"思考中…"+ 秒数跳动 |
| 正文中 | `isStreaming && content` | 思考块**自动折叠**为"已思考 X 秒"，下方正文流式 |
| 已完成 | `!isStreaming` | 思考块保持折叠可展开，正文 markdown |

直跳路径：无推理时（讯飞模型 / 豆包本轮无推理输出）"等待首字节 → 正文中"，思考块整棵子树不渲染，零特判。

### 5.2 折叠规则

- 首个 text-delta 到达即自动折叠（豆包官方同款）；**自动折叠只执行一次**。
- 用户手动展开/收起后，该消息内不再自动干预（组件内 state 记录 override）。
- 完成后默认折叠；折叠态不持久化（刷新后回到默认折叠，与豆包官方一致）。

### 5.3 增量更新与计时

- `onReasoning` 复用 chat-store 现有 rAF 合帧机制：reasoning 独立累加器，与正文 flush 同帧提交，每帧最多一次 setState。
- 时长：首个 `reasoning-delta` 到达记录时间戳（store 内部变量，不持久化）；分界点（首 text-delta / done / error / abort）冻结差值写入 `reasoningDurationMs`。
- 推理中秒数按 1s interval 跳动，分界后定格。

### 5.4 视觉规范

思考块位于气泡内、正文上方：灰字、小一号、左侧竖线标识；推理内容纯文本 `whitespace-pre-wrap` 渲染（不跑 markdown，省流式重渲染预算）；正文继续走 `StreamingContent` / `MarkdownContent`。视觉细节遵守 `DESIGN.md`。

## 6. 中断 / 超时 / 失败语义

| 场景 | 行为 |
|---|---|
| 推理中用户停止 | 已流出推理保留 + `stopped` 标记 + 时长定格（"有留空删"判定扩展为 `content \|\| reasoningContent` 有任一即保留） |
| 推理-only 流断（异常/平台超时） | 同上保留；**计费 outcome 算 partial，正常结算（D1）**——展示与计费同源：用户拿到了真实产出即付费 |
| 超时看门狗 | **不新增**。推理期 reasoning-delta 持续到达，流不空闲；首 token 延迟已有 `maxDuration=300` 配套；唯一"超时"= 用户手动停止 + 平台超时截断（现有 partial/failed 兜底） |
| 上游无推理事件 / 解析失败 | 静默降级为无推理路径（正文照流），warn 日志，绝不阻断对话 |
| 重试 | 维持现状：流截断抛"回答流被中断，请重试"（chat-stream.ts:163），由用户重发；不引入自动重试 |

D1 落地细节：豆包适配器 `onFinish` 的 outcome 判定从 `text ? … : …` 扩展为 `(text || reasoning) ? … : …`；`outputText` 仍只传正文（合规审计对象是面向用户的回答，推理不进审计文本）。豆包 `response.incomplete` 自带 usage（含 reasoning_tokens），按真实 usage 结算；usage 缺失的估算兜底场景下推理长度不计，属已知可接受近似。

## 7. 默认表现（无思考 / 无工具）

- **讯飞三模型**：骨架屏 → 正文流式 → 完成，全程无思考块。
- **豆包模型本轮无推理输出**（简单问题）：同上，自然退化。
- **工具调用**：UI 无入口、契约无事件、无伪造占位；二期立项时契约加 `tool-call` 系列事件，思考块演进为按调用时序混排的时间线。

## 8. 改动面清单

| 文件 | 改动 |
|---|---|
| `packages/shared/src/chat-stream-contract.ts` | 加 `ChatStreamReasoningDeltaEvent`、联合类型、parse 分支 |
| `apps/web/src/app/api/chat/_lib/adapters/doubao.ts` | 映射 `response.reasoning_summary_text.delta`；累计 reasoning 文本；outcome 判定扩展；降级 warn |
| `apps/web/src/lib/utils/chat-stream.ts` | `consumeChatResponse` / `streamChatResponse` 增加可选 `onReasoning` 回调 |
| `apps/web/src/stores/chat-store.ts` | Message 两字段；onReasoning 接 rAF 合帧；时长计时与冻结；有留空删扩展 |
| `apps/web/src/lib/constants/chat-models.ts` | `supportsReasoning` 元数据 |
| `apps/web/src/components/chat/message-item.tsx` | 四态渲染 + 思考块组件（折叠/展开/计时） |
| 测试 | 契约 parse/encode 用例；豆包适配器推理映射与"reasoningContent 不回传"锁定用例；chat-store 中断保留/时长冻结用例 |

## 9. 验收清单

- [ ] 豆包模型提问：思考块展开流式渲染真实推理内容，与官方 App 对拍内容一致
- [ ] 正文开始流出瞬间思考块自动折叠为"已思考 X 秒"，可手动展开，手动操作后不再自动干预
- [ ] 讯飞模型：无思考块，骨架屏在首字节到达即消失
- [ ] 推理中点停止：推理保留 + stopped + 时长定格；刷新后推理内容仍在（折叠态）
- [ ] 推理-only 流断：消息保留、计费按 partial 结算（billing 记录 outcome=partial）
- [ ] 多轮对话请求体中不出现历史 `reasoningContent`（测试锁死）
- [ ] 对比页双跑不崩、不展示思考块
- [ ] `parseChatStreamEvent` 对非法 reasoning-delta 帧返回 null，不终止流
