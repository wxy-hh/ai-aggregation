# 豆包（Doubao）API 调用参考

## 概述

本项目使用火山方舟（ARK）平台的豆包大模型 API，用于简历润色和诊断功能。

## 环境配置

### 环境变量

```env
# 火山方舟 API Key
ARK_API_KEY="your-api-key-here"

# CodingPlan 套餐专用 Base URL（重要：必须使用此 URL 才会消耗 CodingPlan 额度）
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/coding/v3"

# 模型名称
ARK_MODEL="doubao-seed-2.0-lite"
```

### 重要说明

- **Base URL 路径**：必须使用 `/api/coding/v3`，而不是 `/api/v3`
- **套餐类型**：CodingPlan 套餐专用，使用其他 URL 不会消耗 CodingPlan 额度
- **模型选择**（支持以下模型）：
  - `doubao-seed-2.0-lite`：轻量级模型，适合快速响应
  - `doubao-seed-2.0-pro`：专业级模型，适合复杂任务
  - `doubao-seed-2.0-code`：代码专用模型，适合代码生成和分析
  - `doubao-seed-code`：代码模型基础版
  - `minimax-m2.5`：MiniMax 模型
  - `glm-4.7`：智谱 GLM 模型
  - `deepseek-v3.2`：DeepSeek 模型
  - `kimi-k2.5`：Kimi 模型

## API 端点

### Chat Completions

```
POST https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions
```

## 请求格式

### 基础请求

```bash
curl -X POST "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "doubao-seed-2.0-lite",
    "messages": [
      {
        "role": "user",
        "content": [{"type": "text", "text": "你好"}]
      }
    ]
  }'
```

### 完整参数请求

```bash
curl -X POST "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "doubao-seed-2.0-lite",
    "messages": [
      {
        "role": "system",
        "content": [{"type": "text", "text": "你是一个专业助手"}]
      },
      {
        "role": "user",
        "content": [{"type": "text", "text": "请帮我优化这段文字"}]
      }
    ],
    "max_output_tokens": 2000,
    "temperature": 0.7,
    "top_p": 0.9,
    "reasoning": {
      "effort": "minimal"
    }
  }'
```

## 请求参数说明

### 必需参数

| 参数       | 类型   | 说明                                |
| ---------- | ------ | ----------------------------------- |
| `model`    | string | 模型名称，如 `doubao-seed-2.0-lite` |
| `messages` | array  | 对话消息数组                        |

### 可选参数

| 参数                | 类型    | 默认值 | 说明                                            |
| ------------------- | ------- | ------ | ----------------------------------------------- |
| `max_output_tokens` | integer | 1024   | 最大输出 token 数量                             |
| `temperature`       | float   | 0.7    | 温度参数，控制随机性（0-1）                     |
| `top_p`             | float   | 0.9    | 核采样参数（0-1）                               |
| `reasoning.effort`  | string  | -      | 推理强度：`minimal`（不思考）、`medium`、`high` |

### Messages 格式

```json
{
  "role": "system" | "user" | "assistant",
  "content": [
    {
      "type": "text",
      "text": "消息内容"
    }
  ]
}
```

## 响应格式

### 成功响应

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "AI 生成的回复内容"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 错误响应

```json
{
  "error": {
    "message": "错误描述",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

## 项目中的使用示例

### 1. AI 润色功能

**文件**：`apps/web/src/app/api/resume/polish/route.ts`

**用途**：优化简历文本，使其更专业、更有吸引力

**配置**：

- 超时时间：30 秒
- 最大输出：500 tokens
- 温度：0.7
- 无推理控制

**示例代码**：

```typescript
const response = await fetch(`${arkBaseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${arkApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: arkModel,
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: userPrompt }],
      },
    ],
    max_output_tokens: 500,
    temperature: 0.7,
    top_p: 0.9,
  }),
  signal: controller.signal,
});
```

### 2. AI 诊断功能

**文件**：`apps/web/src/app/api/resume/diagnose/route.ts`

**用途**：分析简历质量，提供评分和优化建议

**配置**：

- 超时时间：60 秒
- 最大输出：2000 tokens
- 温度：0.7
- 推理强度：minimal（禁用推理，直接输出）

**示例代码**：

```typescript
const response = await fetch(`${arkBaseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${arkApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: arkModel,
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: userPrompt }],
      },
    ],
    max_output_tokens: 2000,
    temperature: 0.7,
    top_p: 0.9,
    reasoning: {
      effort: 'minimal', // 禁用推理，直接输出结果
    },
  }),
  signal: controller.signal,
});
```

## 测试命令

### 1. 测试 API 连接

```bash
curl -X POST "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "doubao-seed-2.0-lite",
    "messages": [
      {
        "role": "user",
        "content": [{"type": "text", "text": "你是什么模型？"}]
      }
    ],
    "max_output_tokens": 50
  }'
```

### 2. 测试润色功能

```bash
curl -X POST "http://localhost:3000/api/resume/polish" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "负责开发项目",
    "context": "workExperience"
  }'
```

### 3. 测试诊断功能

```bash
curl -X POST "http://localhost:3000/api/resume/diagnose" \
  -H "Content-Type: application/json" \
  -d '{
    "resume": {
      "personalInfo": {
        "name": "张三",
        "title": "前端工程师",
        "summary": "熟悉 React、Vue 等前端框架"
      },
      "workExperiences": [
        {
          "company": "某科技公司",
          "position": "前端开发",
          "startDate": "2022-01",
          "endDate": "2024-01",
          "description": "负责开发公司官网"
        }
      ],
      "educations": [],
      "skills": []
    }
  }'
```

## 错误处理

### 常见错误码

| HTTP 状态码 | 错误类型              | 说明               | 处理方式                   |
| ----------- | --------------------- | ------------------ | -------------------------- |
| 401         | Unauthorized          | API Key 无效或过期 | 检查环境变量 `ARK_API_KEY` |
| 429         | Too Many Requests     | 请求频率过高       | 实现重试机制或降低请求频率 |
| 500         | Internal Server Error | 服务器内部错误     | 使用回退机制               |
| 504         | Gateway Timeout       | 请求超时           | 增加超时时间或使用回退机制 |

### 项目中的错误处理策略

#### 润色功能

- ❌ 无回退机制
- API 失败直接返回错误给用户
- 建议：考虑添加简单的文本格式化作为回退

#### 诊断功能

- ✅ 有完整的回退机制
- API 失败时使用规则引擎评分
- 回退触发条件：
  - API Key 未配置
  - API 请求失败（非 429 错误）
  - 请求超时（60 秒）
  - 响应格式解析失败

## 性能优化建议

### 1. 超时控制

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeoutId);
}
```

### 2. 并发控制

- 润色功能：单次请求，无需并发控制
- 诊断功能：使用 `Promise.all` 并发执行独立计算任务

### 3. 缓存策略

建议实现：

- 相同输入的结果缓存（Redis）
- 缓存过期时间：24 小时
- 缓存键：`hash(prompt + model + temperature)`

## 成本优化

### Token 使用估算

| 功能 | 平均输入 Tokens | 平均输出 Tokens | 单次成本估算 |
| ---- | --------------- | --------------- | ------------ |
| 润色 | 50-200          | 100-500         | 低           |
| 诊断 | 500-2000        | 500-2000        | 中           |

### 优化建议

1. **使用 lite 模型**：对于简单任务，使用 `doubao-seed-2.0-lite` 而非 `pro`
2. **限制输出长度**：设置合理的 `max_output_tokens`
3. **禁用推理**：对于不需要复杂推理的任务，设置 `reasoning.effort: "minimal"`
4. **实现缓存**：避免重复请求相同内容
5. **批量处理**：将多个小请求合并为一个大请求

## 安全注意事项

### 1. API Key 保护

- ✅ 使用环境变量存储
- ✅ 不要提交到 Git 仓库
- ✅ 定期轮换 API Key

### 2. 敏感信息过滤

诊断功能已实现隐私保护：

```typescript
function sanitizeResume(resume: any, privacy?: { allowContactFields?: boolean }) {
  const sanitized = { ...resume };

  if (!privacy?.allowContactFields && sanitized.personalInfo) {
    const { email, phone, ...rest } = sanitized.personalInfo;
    sanitized.personalInfo = rest;
  }

  return sanitized;
}
```

### 3. 输入验证

- ✅ 使用 Zod schema 验证请求参数
- ✅ 限制输入长度
- ✅ 过滤恶意内容

## 监控和日志

### 建议添加的监控指标

1. **API 调用统计**
   - 成功率
   - 平均响应时间
   - 错误率（按错误类型分类）

2. **成本监控**
   - 每日 Token 消耗
   - 每个功能的成本占比

3. **性能监控**
   - P50、P95、P99 响应时间
   - 超时率
   - 回退机制触发率

### 日志示例

```typescript
console.log('🔍 ARK API 请求', {
  model: arkModel,
  inputTokens: estimateTokens(prompt),
  timestamp: new Date().toISOString(),
});

console.log('✅ ARK API 响应', {
  outputTokens: result.usage?.completion_tokens,
  duration: Date.now() - startTime,
  fallback: false,
});
```

## 参考链接

- [火山方舟官方文档](https://www.volcengine.com/docs/82379)
- [豆包模型介绍](https://www.volcengine.com/docs/82379/1099475)
- [API 定价](https://www.volcengine.com/docs/82379/1099522)

## 更新日志

- **2024-03-09**：创建文档，记录当前 API 使用情况
