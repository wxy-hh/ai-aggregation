# 豆包模型集成修复说明

## 问题描述

豆包模型在智能对话页面没有响应，原因是豆包 API 使用了特殊的消息格式，与标准 OpenAI 格式不同。

## 问题原因

1. **消息格式不同**
   - 标准格式：`{ role: "user", content: "你好" }`
   - 豆包格式：`{ role: "user", content: [{ type: "text", text: "你好" }] }`

2. **流式响应格式不同**
   - 豆包返回 SSE (Server-Sent Events) 格式
   - 需要解析 `data:` 开头的行并提取内容

## 解决方案

### 1. 消息格式转换

在 `apps/web/src/app/api/chat/route.ts` 中添加消息格式转换函数：

```typescript
interface DoubaoMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{ type: 'text'; text: string }>;
}

function convertToDoubaoMessages(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): DoubaoMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: [{ type: 'text', text: msg.content }],
  }));
}
```

### 2. 直接调用豆包 API

不使用 Vercel AI SDK，而是直接调用豆包 API：

```typescript
if (provider === 'doubao') {
  const doubaoMessages = convertToDoubaoMessages(messages);

  const response = await fetch(`${arkBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arkApiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: doubaoMessages,
      stream: true,
      max_output_tokens: 2000,
      temperature: 0.7,
      top_p: 0.9,
    }),
  });
}
```

### 3. SSE 流式响应解析

将豆包的 SSE 格式转换为纯文本流：

```typescript
const stream = new ReadableStream({
  async start(controller) {
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

        if (trimmedLine.startsWith('data: ')) {
          const jsonStr = trimmedLine.slice(6);
          const data = JSON.parse(jsonStr);

          // 提取内容
          if (data.choices && data.choices[0]?.delta?.content) {
            const content = data.choices[0].delta.content;
            controller.enqueue(encoder.encode(content));
          }
        }
      }
    }

    controller.close();
  },
});
```

## 修改的文件

- `apps/web/src/app/api/chat/route.ts`
  - 添加 `DoubaoMessage` 接口
  - 添加 `convertToDoubaoMessages` 转换函数
  - 添加豆包专用的 API 调用逻辑
  - 添加 SSE 流式响应解析逻辑

## 环境变量要求

确保在 `.env` 文件中配置：

```env
ARK_API_KEY="your-ark-api-key"
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/coding/v3"
```

## 测试方法

1. 启动开发服务器
2. 进入智能对话页面
3. 选择豆包模型（任意一个）
4. 发送消息测试

## 支持的豆包模型

- doubao-seed-2.0-lite（轻量级）
- doubao-seed-2.0-pro（专业级）
- doubao-seed-2.0-code（代码专用）
- doubao-seed-code（代码基础版）
- minimax-m2.5
- glm-4.7
- deepseek-v3.2
- kimi-k2.5

## 注意事项

1. 豆包 API 使用的是火山方舟平台，不是标准的 OpenAI 兼容接口
2. 必须使用 `/api/coding/v3` 路径才能消耗 CodingPlan 额度
3. 消息格式必须转换为数组格式
4. SSE 响应需要逐行解析并提取内容

## 参考文档

- `DOUBAO_API_REFERENCE.md` - 豆包 API 完整参考文档
- `CHAT_MODEL_UPDATE.md` - 模型更新说明
