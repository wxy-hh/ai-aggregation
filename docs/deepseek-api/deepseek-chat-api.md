---
source: https://api-docs.deepseek.com/zh-cn/api/create-chat-completion
title: DeepSeek 对话补全（create-chat-completion）接入使用说明
fetched_at: 2026-07-10
status: 接入草稿
related_files:
  - packages/providers/src/deepseek.ts   # 本项目 DeepSeek 适配层（chat/chatStream 待实现）
  - packages/providers/src/types.ts      # AIProvider / ChatCompletionOptions / ChatCompletionResponse
official_sources:
  - https://api-docs.deepseek.com/zh-cn/api/create-chat-completion
  - https://api-docs.deepseek.com/zh-cn/guides/json_mode
  - https://api-docs.deepseek.com/zh-cn/guides/tool_calls
  - https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
  - https://api-docs.deepseek.com/zh-cn/quick_start/error_codes
  - https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit
note: 本文由官方文档抓取后按“接入”视角重组；参数、模型 ID 以官方文档为准。
---

# DeepSeek 对话补全接入使用说明

## 1. 概览

| 项 | 值 |
|----|----|
| 端点 | `POST /chat/completions` |
| 协议 | HTTPS，JSON 请求体 |
| 鉴权 | `Authorization: Bearer <API_KEY>` |
| Content-Type | `application/json` |
| 兼容 | 与 OpenAI Chat Completions 格式基本兼容（可直接用 OpenAI SDK 改 `base_url` 接入） |
| 流式 | SSE（`text/event-stream`），以 `data: [DONE]` 结束 |

### base_url 选择

- 标准接入：`https://api.deepseek.com` 或 `https://api.deepseek.com/v1`（两者等价，官方文档用前者；本项目现有适配层用 `…/v1`，与 OpenAI SDK 习惯一致，可保留）。
- Beta 特性（`prefix`、`reasoning_content` 输入等）：必须改用 `https://api.deepseek.com/beta`，否则相关参数不生效。

> 本项目 `packages/providers/src/deepseek.ts` 当前 `baseUrl = 'https://api.deepseek.com/v1'`。若后续要支持 `prefix` 续写，需要可配置地切换到 `/beta`。

## 2. 鉴权与环境变量

- 请求头：`Authorization: Bearer ${DEEPSEEK_API_KEY}`。
- 本项目环境变量：`DEEPSEEK_API_KEY`（见 `apps/web/.env.local`）。
- 适配层构造时已注入 `apiKey`：`new DeepSeekProvider(apiKey)`，实现时放入 `Authorization` 头即可，**不要写死在代码里**。

## 3. 模型与思考模式

当前文档 `model` 取值：

| model | 说明 |
|-------|------|
| `deepseek-v4-flash` | 轻量/快速模型 |
| `deepseek-v4-pro` | 高能力模型 |

> 历史模型 ID（`deepseek-chat`、`deepseek-reasoner`）若仍在用，请按官方迁移说明切换；以官方文档实时值为准。

思考模式由 `thinking` 对象控制：

```json
"thinking": { "type": "enabled" }
```

- `type`：`enabled`（默认）= 思考模式；`disabled` = 非思考模式。
- `reasoning_effort`：`high`（普通请求默认）/ `max`（复杂 Agent 类请求自动设置）。兼容值：`low`/`medium` 映射为 `high`，`xhigh` 映射为 `max`。
- 思考模式下，响应里会额外返回 `reasoning_content`（思维链），最终答案在 `content`。

## 4. 请求参数

### 4.1 必需参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型 ID（见上） |
| `messages` | array | 对话消息列表，长度 `>= 1` |

`messages[]` 元素按 `role` 区分，结构不同：

| role | 必填字段 | 可选字段 | 备注 |
|------|----------|----------|------|
| `system` | `content`(string) | `name` | 系统提示 |
| `user` | `content`(string) | `name` | 用户输入 |
| `assistant` | `content`(string, 可 null) | `name`、`prefix`(bool, Beta)、`reasoning_content`(string, Beta) | `prefix=true` 强制从该内容续写，需 `/beta` base_url |
| `tool` | `content`(string)、`tool_call_id`(string) | — | 工具结果回传 |

### 4.2 常用可选参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `stream` | bool | false | `true` 走 SSE 流式 |
| `stream_options` | object | — | 仅 `stream=true` 有效；`include_usage: true` 时在最后一块前追加 usage 统计块 |
| `temperature` | number | 1 | 0–2；与 `top_p` 二选一调整 |
| `top_p` | number | 1 | 0–1；与 `temperature` 二选一调整 |
| `max_tokens` | int | 见定价文档 | 单次最大生成 token；输入+输出受模型上下文长度限制 |
| `stop` | string 或 string[] | — | 最多 16 个停止词 |
| `response_format` | object | `{"type":"text"}` | `{"type":"json_object"}` 启用 JSON 模式（必须同时在 system/user 里要求输出 JSON） |
| `frequency_penalty` | number | 0 | 重复惩罚 |
| `presence_penalty` | number | 0 | 话题惩罚 |
| `logprobs` | bool | false | 是否返回对数概率 |
| `top_logprobs` | int | — | 配合 `logprobs`，返回每位置 top N |

### 4.3 工具调用（function calling）

| 参数 | 类型 | 说明 |
|------|------|------|
| `tools` | array | 最多 128 个；每项 `{ "type": "function", "function": { name, description, parameters(JSON Schema) } }` |
| `tool_choice` | string/object | 控制是否/调用哪个工具 |

详见官方《Tool Calls 指南》与 JSON Schema 参考。`function.name` 允许 `a-z A-Z 0-9 _ -`，最长 64。

## 5. 非流式响应结构

`object: "chat.completion"`，关键字段：

```json
{
  "id": "930c60df-bf64-41c9-a88e-3ec75f81e00e",
  "choices": [{
    "finish_reason": "stop",
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?",
      "reasoning_content": "string",
      "tool_calls": [{
        "id": "string",
        "type": "function",
        "function": { "name": "string", "arguments": "string" }
      }]
    },
    "logprobs": { "content": [{ "token": "string", "logprob": 0, "bytes": [0], "top_logprobs": [] }] }
  }],
  "created": 1705651092,
  "model": "deepseek-v4-pro",
  "system_fingerprint": "string",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 10,
    "prompt_tokens": 16,
    "total_tokens": 26,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 0,
    "completion_tokens_details": { "reasoning_tokens": 0 }
  }
}
```

本项目 `ChatCompletionResponse`（`packages/providers/src/types.ts`）当前只暴露 `content` + `usage{promptTokens,completionTokens,totalTokens}`，接入时：

- `content` ← `choices[0].message.content`
- `usage.promptTokens` ← `usage.prompt_tokens`
- `usage.completionTokens` ← `usage.completion_tokens`
- `usage.totalTokens` ← `usage.total_tokens`

> 若后续要展示思维链或按缓存命中计费，需扩展 `ChatCompletionResponse`：可选加入 `reasoningContent`、`promptCacheHitTokens`、`promptCacheMissTokens`、`completionTokensDetails.reasoningTokens`、`finishReason`。这属于类型扩展，接入前单独评估影响面。

## 6. 流式响应（SSE）

- 触发：请求体 `stream: true`。
- 每帧格式：`data: <json>\n\n`，结束帧：`data: [DONE]\n\n`。
- `object: "chat.completion.chunk"`，增量在 `choices[0].delta`：

```json
data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"completion_tokens":9,"prompt_tokens":17,"total_tokens":26}}

data: [DONE]
```

接入要点：

- 首帧通常只带 `delta.role`，`content` 为空串。
- 中间帧累加 `delta.content`；思考模式下另有 `delta.reasoning_content`。
- `finish_reason` 仅在最后一帧内容块非 null。
- `stream_options.include_usage: true` 时，`[DONE]` 之前会多一帧带 `usage`（其 `choices` 为空数组）。
- 工具调用增量：`delta.tool_calls[]` 按 `index` 合并 `function.arguments` 字符串片段。
- 解析要按行缓冲：遇到 `data: [DONE]` 即结束；每个 `data:` 行去掉前缀后 `JSON.parse`，忽略空行/心跳。

`chatStream` 适配层建议对外 `yield` 文本增量（与 `AsyncIterable<string>` 契约一致），把 SSE 解析封装在 provider 内部。

## 7. 结构化输出（JSON 模式）

> 来源：https://api-docs.deepseek.com/zh-cn/guides/json_mode

用于让模型严格输出**合法 JSON 字符串**，便于后续逻辑解析。

### 7.1 启用方式

请求体设置 `response_format`：

```json
"response_format": { "type": "json_object" }
```

默认值：`{ "type": "text" }`（即不启用）。

### 7.2 强制约束（必须同时满足，否则容易失败）

1. **prompt 必须含 `json` 字样**：在 system 或 user 消息里明确要求输出 JSON，并**给出目标 JSON 结构样例**（few-shot），引导模型对齐字段。
2. **合理设置 `max_tokens`**：预留足够长度，防止 JSON 被中途截断（截断后 `finish_reason == "length"`，`JSON.parse` 会失败）。
3. **可能返回空 `content`**：官方明确 JSON Output 有概率返回空 content，需在客户端做兜底（重试、调整 prompt、降级）。

### 7.3 示例（OpenAI SDK 风格，base_url 指向 DeepSeek）

```python
import json
from openai import OpenAI

client = OpenAI(api_key="<your api key>", base_url="https://api.deepseek.com")

system_prompt = """
The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.

EXAMPLE INPUT:
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{ "question": "Which is the highest mountain in the world?", "answer": "Mount Everest" }
"""

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Which is the longest river in the world? The Nile River."},
    ],
    response_format={"type": "json_object"},
)
print(json.loads(response.choices[0].message.content))
```

输出：

```json
{ "question": "Which is the longest river in the world?", "answer": "The Nile River" }
```

### 7.4 本项目接入要点

- `ChatCompletionOptions`（`packages/providers/src/types.ts`）当前**没有** `response_format` 字段；如需支持，需扩展选项并映射到请求体 `response_format`。
- 适配层 `chat()` 拿到 `content` 后若声明 JSON 模式，应在调用方做 `JSON.parse` + try/catch，并处理空 content 与 `length` 截断（重试或返回可识别错误）。
- prompt 拼装由调用方负责：务必在 system/user 里带 `json` 字样与结构样例，否则模型可能不输出合法 JSON。
- 流式 + JSON 模式不常见；如需，必须等完整 content 拼齐后再 `JSON.parse`，不能逐帧解析。

## 8. 工具调用（function calling）

> 来源：https://api-docs.deepseek.com/zh-cn/guides/tool_calls

让模型在需要时返回「调用某个 function 及参数」，由你的代码执行后把结果回传，模型再生成最终回答。**模型本身不执行函数。**

### 8.1 非思考模式流程

1. user 发问（如天气）。
2. model 返回 `message.tool_calls`（含 `id`、`function.name`、`function.arguments` 字符串）。
3. 你的代码执行对应 function，得到结果。
4. 回传 `{ "role": "tool", "tool_call_id": <id>, "content": <结果> }`。
5. model 生成自然语言回答。

`tools` 定义示例：

```json
[{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get weather of a location, the user should supply a location first.",
    "parameters": {
      "type": "object",
      "properties": { "location": { "type": "string" } },
      "required": ["location"]
    }
  }
}]
```

### 8.2 思考模式下的工具调用（V3.2+）

- 模型在最终回答前可多轮「思考 + 工具调用」。
- **关键约束**：进行了工具调用的轮次，后续所有请求必须**完整回传 `reasoning_content`**，否则 API 返回 400。
- 简单做法：每轮直接 `messages.append(response.choices[0].message)`（携带 content/reasoning_content/tool_calls 全字段）。

### 8.3 strict 模式（Beta）

强制 function 输出严格符合 JSON Schema：

- base_url 必须切到 `https://api.deepseek.com/beta`。
- 每个 `function` 设 `"strict": true`。
- object 类型：**所有属性都要列入 `required`，且 `additionalProperties: false`**。
- 支持：object / string / number / integer / boolean / array / enum / anyOf / `$ref`+`$def`。
- 不支持：`minLength`、`maxLength`、`minItems`、`maxItems`（用了会被服务端拒绝）。
- string 支持 `pattern`、`format`（email/hostname/ipv4/ipv6/uuid）。

### 8.4 本项目接入要点

- `types.ts` 的 `ChatMessage` 目前只有 `user|assistant|system`，缺 `tool` 角色；`ChatCompletionOptions` 没有 `tools`/`tool_choice`。接入 function calling 需扩展这两个类型。
- 流式 `tool_calls` 增量：按 `index` 合并 `function.arguments` 字符串片段，拼齐后再 `JSON.parse`。
- 适配层若只做文本对话可不实现；一旦支持，需处理「tool_calls → 执行 → 回传 → 再请求」的循环（通常由调用方编排，provider 只负责单次请求/流式）。

## 9. 推理模型与思维链（thinking）

> 来源：https://api-docs.deepseek.com/zh-cn/guides/thinking_mode

思考模式下模型先输出思维链再输出最终答案，思维链通过 `reasoning_content` 返回，与 `content` 同级。

### 9.1 开关与强度

| 项 | OpenAI 格式 | 默认 |
|----|-------------|------|
| 思考开关 | `extra_body: {"thinking": {"type": "enabled|disabled"}}` | enabled |
| 思考强度 | `reasoning_effort: "high|max"` | 普通请求 high；复杂 Agent 自动 max |

兼容映射：`low`/`medium` → `high`，`xhigh` → `max`。

### 9.2 重要约束（坑点）

- **思考模式不支持 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty`**：设置了不报错但也不生效。适配层在思考模式下应丢弃/不发送这些参数。
- `reasoning_content` 与 `content` 分开返回；展示给用户时通常只渲染 `content`，`reasoning_content` 折叠或丢弃。

### 9.3 多轮上下文拼接规则

- **无工具调用**：两个 user 之间的 assistant `reasoning_content` 无需回传，传了也被忽略。
- **有工具调用**：必须回传 `reasoning_content`，否则 400。见第 8.2 节。

### 9.4 流式累加顺序

```python
for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        reasoning_content += chunk.choices[0].delta.reasoning_content
    else:
        content += chunk.choices[0].delta.content
```

先到达的是 `reasoning_content` 增量，之后才是 `content` 增量。适配层 `chatStream` 若只 `yield` 文本，需决定是否/如何区分两者（建议默认只 yield `content`，或扩展协议带通道标记）。

### 9.5 本项目接入要点

- 思考模式默认开启，调用方无需额外配置即用；但需注意第 9.2 的参数失效。
- 若要在 UI 展示思维链，`ChatCompletionResponse` 与流式协议都要扩展 `reasoningContent` 通道；评估影响面后再做。

## 10. finish_reason、错误码与限流

> 来源：https://api-docs.deepseek.com/zh-cn/quick_start/error_codes ｜ https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit

### 10.1 finish_reason

`finish_reason` 取值：`stop`（自然结束/命中 stop）、`length`（达到 `max_tokens` 或上下文上限，可能截断）、`content_filter`（触发过滤）、`tool_calls`（工具调用）、`insufficient_system_resource`（后端资源受限被打断）。

### 10.2 HTTP 错误码

非 2xx 时 body 含 `error.message`/`error.type`/`error.code`。官方错误码表：

| HTTP | 含义 | 原因 | 处理 |
|------|------|------|------|
| 400 | 格式错误 | 请求体格式错误（含思考模式工具调用未回传 `reasoning_content`） | 按错误信息修改请求体 |
| 401 | 认证失败 | API key 错误 | 检查 `DEEPSEEK_API_KEY` |
| 402 | 余额不足 | 账户余额耗尽 | 提示充值/降级模型 |
| 422 | 参数错误 | 请求体参数错误 | 按错误信息修改参数 |
| 429 | 速率上限 | TPM/RPM 或并发达到上限 | 退避重试、降并发 |
| 500 | 服务器故障 | 服务器内部故障 | 等待后重试 |
| 503 | 服务器繁忙 | 服务器负载过高 | 稍后重试 |

接入时统一封装为带状态码的异常，便于上层映射为本项目业务码。

### 10.3 并发限速

按**账号粒度**计（与 API Key 无关）：`deepseek-v4-pro` 并发 500，`deepseek-v4-flash` 并发 2500。一个请求从发出到响应完成记为一个并发；超过即 429。更高并发可走官方扩容工单（不额外收费）。

### 10.4 user_id 隔离（可选）

请求体加 `user_id`（OpenAI SDK 用 `extra_body={"user_id": ...}`）实现业务侧用户级隔离：

- 用途：内容安全隔离、KVCache 隔离、调度隔离。
- 取值：满足正则 `[a-zA-Z0-9\-_]+`，最长 512，**不要放用户隐私信息**。
- 普通账号所有 `user_id` 合并计并发；扩容账号在限制总并发的同时对每个 `user_id` 单独限速（v4-pro 500 / v4-flash 2500），超出该 `user_id` 的请求得 429。

### 10.5 请求保活机制

请求发出后等待响应期间，连接会持续收到保活内容：

- 非流式：持续返回**空行**。
- 流式：持续返回 SSE 注释 `: keep-alive`。

这些不影响 JSON body 解析；若自行解析 HTTP 响应需忽略空行/注释。**10 分钟仍未开始推理，服务端会关闭连接**（适配层需设置合理的 read timeout，并对长任务走流式避免被断）。

## 11. 最小可运行示例

### curl

```bash
curl https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [
      {"role": "system", "content": "你是中文助手"},
      {"role": "user", "content": "用一句话介绍你自己"}
    ]
  }'
```

### Node / fetch（非流式）

```ts
const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: '你好' }],
  }),
});
if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
const data = await res.json();
const content = data.choices[0].message.content as string;
```

### Node / 流式（SSE 逐行解析）

```ts
const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: '你好' }],
    stream: true,
    stream_options: { include_usage: true },
  }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith('data:')) continue;
    const payload = s.slice(5).trim();
    if (payload === '[DONE]') return;
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
}
```

## 12. 本项目接入指引

目标文件：`packages/providers/src/deepseek.ts`（当前 `chat`/`chatStream` 抛 `Not implemented`）。实现契约见 `packages/providers/src/types.ts`：

```ts
interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
interface ChatCompletionOptions { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; stream?: boolean }
interface ChatCompletionResponse { content: string; usage?: { promptTokens; completionTokens; totalTokens } }
interface AIProvider { name; chat(opts): Promise<ChatCompletionResponse>; chatStream(opts): AsyncIterable<string> }
```

字段命名转换（本项目 camelCase ↔ DeepSeek snake_case）：

| 本项目 | DeepSeek |
|--------|----------|
| `maxTokens` | `max_tokens` |
| `usage.promptTokens` | `usage.prompt_tokens` |
| `usage.completionTokens` | `usage.completion_tokens` |
| `usage.totalTokens` | `usage.total_tokens` |

实现要点：

- `chat()`：`stream: false`，解析 JSON，映射到 `ChatCompletionResponse`；非 2xx 抛带状态码错误。
- `chatStream()`：`stream: true`，用 fetch + ReadableStream 按第 6 节解析，`yield` `delta.content`；`[DONE]` 结束。
- `messages` 直接透传（role/content 结构已对齐；`tool` 角色若需要后续再扩展 `ChatMessage` 联合类型）。
- `temperature`、`maxTokens` 仅在有值时放入 body（避免覆盖默认）。
- `baseUrl` 保留 `…/v1`；如需 beta 特性，再增加可选 `baseUrl` 构造参数或环境变量开关。

## 13. 注意事项与常见坑

- **JSON 模式**：详见第 7 节。启用 `response_format: {"type":"json_object"}` 必须同时在 system/user 消息里含 `json` 字样并给出结构样例；注意空 content 与 `length` 截断的兜底。
- **`length` 截断**：`finish_reason == "length"` 时内容可能被截断，需增大 `max_tokens` 或缩短上下文。
- **beta 特性**：`prefix`、`reasoning_content` 输入必须用 `https://api.deepseek.com/beta` 作为 base_url。
- **思考模式**：`reasoning_content` 与最终 `content` 分开；展示给用户时通常只渲染 `content`，`reasoning_content` 按需折叠。
- **上下文缓存计费**：`usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 区分命中与未命中，影响成本核算；若做用量统计请一并记录。
- **参数互斥建议**：`temperature` 与 `top_p` 不建议同时改。
- **工具调用拼接**：流式 `tool_calls[].function.arguments` 是字符串片段，需按 `index` 累积后再 `JSON.parse`。
- **不要把 `pnpm typecheck`/`pnpm lint` 当作接入验证**：本项目 `automated-tests: none`，接入后需用 dev server + 真实 API 做行为验证（见项目适配层）。

## 14. 接入清单（Checklist）

- [ ] 在 `deepseek.ts` 实现 `chat()` 非流式调用与错误映射
- [ ] 实现 `chatStream()` SSE 解析，正确处理 `[DONE]` 与 `include_usage`
- [ ] 完成 camelCase ↔ snake_case 字段映射（`maxTokens`、`usage.*`）
- [ ] `Authorization` 头从注入的 `apiKey` 读取，不硬编码
- [ ] 非 2xx 抛带状态码错误，便于上层映射业务码
- [ ] 决定是否需要扩展 `ChatCompletionResponse`（`reasoningContent`/缓存 token/`finishReason`）
- [ ] 若使用 `prefix`/思维链输入，确认 base_url 切换到 `/beta`
- [ ] 若启用 JSON 模式：`response_format` 映射 + prompt 含 `json` 字样与结构样例 + 空 content/`length` 截断兜底
- [ ] 若接入工具调用：扩展 `tool` 角色与 `tools`/`tool_choice` 选项；流式按 index 拼接 arguments；思考模式工具调用必须回传 `reasoning_content`，否则 400
- [ ] 思考模式下不发送 `temperature`/`top_p`/`presence_penalty`/`frequency_penalty`（官方明确不生效）
- [ ] 错误处理封装带状态码异常，覆盖 400/401/402/422/429/500/503
- [ ] 429 退避重试 + 控制并发不超过账号限制（v4-pro 500 / v4-flash 2500）
- [ ] 流式解析忽略 SSE `: keep-alive` 注释；非流式解析忽略空行保活；read timeout 大于长推理场景
- [ ] 用 dev server + 真实 Key 做行为验证（普通问答、流式、思考模式、工具调用、错误分支）
