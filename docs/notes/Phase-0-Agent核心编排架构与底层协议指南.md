# Phase 0 深度技术指南：Agent 核心编排架构与底层协议

> 本文档为 **AI 应用工程师（Agent 方向）** 的底层基石笔记，对应项目路线图 `docs/agent-engineering-roadmap.md` 之 Phase 0。
> 目的：讲透每一次多步工具调用（Tool Call）在底层通信协议、消息序列模型、防御性治理和完成态持久化中的具体运行机制，拒绝黑盒理解。

---

## 一、 Agent 运行全景架构图（ReAct 拓扑）

在大语言模型（LLM）的无状态文本补全机制上，Agent 的本质是一个**由宿主运行时（Node.js）驱动的外部受限状态机**。

```
                     ┌────────────────────────┐
                     │  人类用户 (Browser)     │
                     └──────────┬─────────────┘
                                │ 1. 发送 Prompt（如："查北京天气"）
                                ▼
         ┌─────────────────────────────────────────────────────┐
         │ 接入层 (apps/web/.../chat-handler.ts)               │
         │ - 余额预检：预算步数计算（最低 2 步，上限 5 步）           │
         │ - 输出限额：中间决策步（~2048 tok）/ 最终收尾步（8192 tok） │
         └──────────────────────┬──────────────────────────────┘
                                │ 2. 组装会话，启动编排器
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 编排器主循环 (agent-runner.ts)                                          │
│                                                                        │
│   for (round = 0; round < maxSteps - 1; round++)                       │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 决策步（Decision Step）:                                       │   │
│   │ 调用 streamText，强制设置 `stopWhen: stepCountIs(1)` 夺回控制权  │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│         ┌─────────────────────────┴────────────────────────┐           │
│         ▼                                                  ▼           │
│  【分支 A: 无工具调用】                             【分支 B: 模型发起 tool_calls】│
│  - 模型已输出最终回答                              - 提取工具名称、入参、callId │
│  - 直接 emitText，跳出循环                         - 思考文本推 agent_note 事件 │
│                                                            │           │
│                                                            ▼           │
│                    ┌──────────────────────────────────────────────┐    │
│                    │ 工具治理管道 (tool-pipeline.ts)              │    │
│                    │ 1. 入参序列化去重缓存 (Deduplication)         │    │
│                    │ 2. 派生 AbortSignal 超时控制 (Timeout)       │    │
│                    │ 3. 滑动连败熔断器 (连续 3 次失败切断)         │    │
│                    │ 4. 计时与执行耗时 (durationMs) 记录          │    │
│                    └──────────────────────┬───────────────────────┘    │
│                                           │ 3. 本地执行函数获取数据     │
│                                           ▼                            │
│                    ┌──────────────────────────────────────────────┐    │
│                    │ 工具结果回注 (appendToolResult)              │    │
│                    │ 组装 role: 'tool' 消息，回注当前会话序列      │    │
│                    └──────────────────────┬───────────────────────┘    │
│                                           │                            │
│                                           └───► 推进到下一轮决策循环... │
│                                                                        │
│   ▼ 循环结束（步数耗尽 / 熔断提前跳出）                                  │
│ ┌──────────────────────────────────────────────────────────────────┐   │
│ │ 强制收尾步 (Final Summary Step):                                  │   │
│ │ - 拔掉工具列表：tools: undefined                                 │   │
│ │ - 放宽输出限制至 8192 tokens                                      │   │
│ │ - 逼迫大模型根据前面所有上下文，输出面向人类的最终总结文本       │   │
│ └─────────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                                    ▼ 4. onFinish 生命周期
┌────────────────────────────────────────────────────────────────────────┐
│ 完成态落盘与结算 (chat-handler.ts)                                     │
│ - 写入 `agent_runs` 数据表（步数、耗时、实际 Token 花费、产出三态判定） │
│ - 最终扣减用户 Quota 额度                                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、 协议层骨架：工具回注（Tool Re-injection）的三大实体

大模型不具备执行外部代码的能力，所有工具执行全部发生在 **我们的 Node.js 服务端**。模型与服务端之间必须遵循严格的 JSON 交互规范。

### 1. 实体一：模型返回的工具调用请求（Assistant Tool Call）
当模型判断需要调用工具时，其生成的并不单纯是字符串，而是携带结构化对象：
```json
{
  "role": "assistant",
  "content": "正在为您查询北京天气...",
  "tool_calls": [
    {
      "id": "call_weather_9527",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"北京\"}"
      }
    }
  ]
}
```
* **注意**：`call_weather_9527` 是模型随机生成的全局唯一调用 ID。

### 2. 实体二：本地服务端返回的工具结果消息（Tool Message）
服务端在本地运行对应函数后，必须组装成一条角色为 `tool` 的专门消息：
```json
{
  "role": "tool",
  "tool_call_id": "call_weather_9527",
  "name": "get_weather",
  "content": "{\"temperature\":24,\"condition\":\"晴\",\"humidity\":\"45%\"}"
}
```
* **核心铁律**：
  1. `tool_call_id` 必须和上一步的 `tool_calls[0].id` **完全一致**。
  2. `content` 必须是字符串（通常为 JSON.stringify 后的数据）。

### 3. 实体三：进入下一轮决策时的消息序列状态（Messages Context）
在发起下一轮模型调用时，发给模型的数组中包含了这完整的上下文链条：
```typescript
const messages = [
  { role: "user", content: "查一下北京天气" },
  { 
    role: "assistant", 
    content: "正在为您查询北京天气...", 
    tool_calls: [{ id: "call_weather_9527", name: "get_weather", args: { city: "北京" } }] 
  },
  { 
    role: "tool", 
    tool_call_id: "call_weather_9527", 
    content: "{\"temperature\":24,\"condition\":\"晴\"}" 
  }
];
```
模型看到第三条消息的角色是 `tool` 且 ID 匹配，便知道“查询已有结果”，随后生成人话回答。

---

## 三、 四大关键防御性机制（面试必杀亮点）

### 1. 为什么显式设置 `stopWhen: stepCountIs(1)`？
* **痛点**：第三方 SDK（如 Vercel AI SDK 的 `streamText`）默认支持自动执行工具（`maxSteps: 5`）。但这种“黑盒自治”会导致服务端无法在每一步插入自定义的安全检查、耗时打点与流式自定义事件。
* **解法**：通过 `stopWhen: stepCountIs(1)` 强行在模型做出**单次**决策后将执行线程交还给我们的循环控制器。由我们完全掌控工具何时执行、如何去重、何时推送 SSE 事件。

### 2. 入参哈希去重缓存（Deduplication Cache）
* **痛点**：模型在复杂长任务中，容易陷入局部死循环，用相同的参数反复调用同一工具。
* **解法**：在 `tool-pipeline.ts` 中维护内存 `Map<string, CachedExecution>`。以 `toolName + 规范化序列化(args)` 作为 Key。一旦同一轮或跨轮重复调用，直接短路（Short-circuit）返回历史结果，并附带系统提示 `[系统提示] 该工具已使用相同参数执行过，直接复用既有结果`，保护外部 API 配额。

### 3. 滑动连败熔断（Circuit Breaker）
* **痛点**：当某个外部 API 彻底宕机（500）或参数严重不合法时，模型可能不断微调无意义的参数持续盲目重试，浪费用户的等待时间与 Token 成本。
* **解法**：维护 `consecutiveFailures` 连续失败计数器。只要有一次工具执行成功则重置为 0；若连续失败达 3 次（`AGENT_MAX_CONSECUTIVE_FAILURES = 3`），管道主动触发 `shouldHalt() = true`，编排器立刻跳出主循环，进入兜底收尾步向用户汇报已知进展。

### 4. 强制无工具收尾步（Force Summary Step without Tools）
* **痛点**：如果到了允许的最大步数（如第 5 步），模型仍然输出了 `tool_calls` 请求，系统直接终止会导致用户看到的界面一片空白或停留在一个没完成的工具卡片上。
* **解法**：在主循环之外设置独立的收尾调用：
  ```typescript
  streamText({
    model: providerInstance(model),
    system: summaryPayload.system,
    messages: summaryPayload.messages,
    // 强制不挂载 tools，剥夺模型继续调工具的能力！
    maxOutputTokens: 8192, // 扩容字数上限，保证最终报告不被截断
  });
  ```
  模型无工具可用，只能将累积的所有信息总结为人类可见的自然语言回复。

---

## 四、 核心代码文件索引字典

在项目中翻阅相关实现时，请锁定以下位置：

| 文件路径 | 核心职责 | 关键函数 / 变量 |
| :--- | :--- | :--- |
| `apps/web/src/app/api/chat/_lib/chat-handler.ts` | 接入层分流、余额预检、Token 预算计算、完成态落盘 | `resolveAgentStepBudget`, `stepOutputLimit`, `onFinish` |
| `apps/web/src/app/api/chat/_lib/agent/agent-runner.ts` | Agent 状态机主循环、决策与收尾分流、SSE 包装 | `streamText(stopWhen: stepCountIs(1))`, `projectDecisionStream`, `appendToolResult` |
| `apps/web/src/lib/agent/tool-pipeline.ts` | 工具治理深模块：去重、超时、熔断、计时、脱敏 | `createToolExecutionPipeline`, `executionCache`, `consecutiveFailures` |
| `apps/web/src/app/api/chat/_lib/agent/agent-config.ts` | 系统常数基线约束收敛 | `AGENT_MAX_STEPS (5)`, `AGENT_MAX_CONSECUTIVE_FAILURES (3)` |

---

## 五、 面试现场深度问答标准模板

### Q1: “你们的 Agent 是怎么控制死循环和异常重试成本的？”
> **答题话术**：  
> 我们在编排层和工具层设计了双层防御体系：  
> 1. 在编排层设置了**硬性三维预算**：最大步数封顶为 5 步、单请求时间硬顶为 240s、总工具调次上限 10 次；  
> 2. 在工具管道层设计了**入参确定性哈希去重**和**滑动连败熔断**。若模型重复调用相同参数，直接命中内存缓存短路返回；若外部接口持续异常导致连续失败达到 3 次，熔断器立即切断主循环，直接引导模型进入无工具收尾步，输出当前已知的最大化结果，杜绝无限死循环与额度穿透。

### Q2: “为什么完成态有 `agent_runs` 记录，你们还说系统缺少崩溃可恢复能力？”
> **答题话术**：  
> 因为现有的 `agent_runs` 本质上是一个**完成态账本（Audit Log）**，它是在整个请求流式结束触发 `onFinish` 时才一次性写入的。  
> 它的数据结构记录的是最终消费了多少 Token、耗时几秒、走了几步，而不是**运行期可恢复的状态机快照（State Snapshot）**。如果一个任务在第 4 步因为服务器重启或网关超时崩溃，`onFinish` 根本没有机会触发，内存里的所有中间工具结果和模型思考立刻丢失。这也是我们后续在 Phase 2 必须引入节点级 Checkpointer 和异步队列重构的核心驱动力。
