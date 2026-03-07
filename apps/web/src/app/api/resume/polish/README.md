# 简历润色 API

## 概述

`POST /api/resume/polish` 是一个基于 Doubao-Seed-2.0-Pro (火山方舟 ARK) 的简历文本智能优化接口。

## 环境变量配置

在使用此 API 前，需要在 `.env.local` 中配置以下环境变量：

```bash
ARK_API_KEY="your-ark-api-key"
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
ARK_MODEL="doubao-seed-2-0-pro-260215"
```

## 请求格式

### 端点

```
POST /api/resume/polish
```

### 请求头

```
Content-Type: application/json
```

### 请求体参数

| 参数                         | 类型    | 必填 | 说明                                  |
| ---------------------------- | ------- | ---- | ------------------------------------- |
| `target`                     | string  | 是   | 优化目标字段（如 `work.description`） |
| `text`                       | string  | 是   | 待优化的原始文本                      |
| `context`                    | object  | 否   | 上下文信息                            |
| `context.position`           | string  | 否   | 职位名称                              |
| `context.industry`           | string  | 否   | 行业领域                              |
| `context.company`            | string  | 否   | 公司名称                              |
| `style`                      | string  | 否   | 语言风格，默认 `professional`         |
| `language`                   | string  | 否   | 输出语言，默认 `zh-CN`                |
| `privacy`                    | object  | 否   | 隐私设置                              |
| `privacy.allowContactFields` | boolean | 否   | 是否允许发送联系方式，默认 `false`    |

### 请求示例

```json
{
  "target": "work.description",
  "text": "负责前端开发",
  "context": {
    "position": "高级前端工程师",
    "industry": "SaaS",
    "company": "XX科技"
  },
  "style": "professional",
  "language": "zh-CN"
}
```

## 响应格式

### 成功响应 (200)

```json
{
  "optimizedText": "主导前端架构设计与核心模块开发，推动页面性能优化提升 40%",
  "highlights": ["补充量化成果", "强化业务价值表达"]
}
```

### 错误响应

#### 400 - 参数错误

```json
{
  "error": "缺少必需参数: target"
}
```

#### 408 - 请求超时

```json
{
  "error": "请求超时，请重试"
}
```

#### 429 - 请求频率限制

```json
{
  "error": "请求过于频繁，请稍后再试"
}
```

#### 500 - 服务器错误

```json
{
  "error": "AI 服务暂时不可用"
}
```

## 优化策略

API 会根据以下原则优化简历文本：

1. **保留原意**：不造假，不夸大
2. **补足结构**：优先补足"动作-结果-指标"结构
3. **量化成果**：添加具体的数据和指标
4. **强化表达**：使用专业的动作动词
5. **业务价值**：突出业务影响和价值贡献
6. **长度控制**：输出长度不超过原文的 1.8 倍

## 使用示例

### JavaScript/TypeScript

```typescript
async function polishResumeText(text: string, context?: any) {
  const response = await fetch('/api/resume/polish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: 'work.description',
      text,
      context,
      style: 'professional',
      language: 'zh-CN',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}

// 使用示例
try {
  const result = await polishResumeText('负责前端开发', {
    position: '高级前端工程师',
    industry: 'SaaS',
  });

  console.log('优化后:', result.optimizedText);
  console.log('优化亮点:', result.highlights);
} catch (error) {
  console.error('优化失败:', error.message);
}
```

### cURL

```bash
curl -X POST http://localhost:3000/api/resume/polish \
  -H "Content-Type: application/json" \
  -d '{
    "target": "work.description",
    "text": "负责前端开发",
    "context": {
      "position": "高级前端工程师",
      "industry": "SaaS"
    },
    "style": "professional",
    "language": "zh-CN"
  }'
```

## 性能特性

- **超时控制**：10 秒超时保护
- **错误处理**：完善的错误处理和用户友好的错误提示
- **日志记录**：关键错误会记录到服务端日志（已脱敏）

## 安全性

- API Key 仅通过环境变量读取，不会暴露到客户端
- 默认不发送联系方式等敏感信息到 AI 服务
- 错误日志已脱敏，不记录完整的个人信息

## 相关文档

- [需求文档](/.kiro/specs/resume-editor-glassmorphism/requirements.md) - 需求 3: AI 智能润色功能
- [设计文档](/.kiro/specs/resume-editor-glassmorphism/design.md) - 第 7 节: API 设计
- [火山方舟文档](https://www.volcengine.com/docs/82379/1399008) - Doubao 模型使用说明
