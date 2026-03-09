# 豆包模型调用问题调试指南

## 问题描述

通过接口 `http://localhost:3030/api/chat` 调用时，参数 `model: "deepseek-v3.2"` 返回的模型还是豆包，但直接用 cURL 调用火山方舟 API 时模型是正确的。

## 调试步骤

### 1. 检查服务器日志

启动开发服务器后，在终端查看日志输出：

```bash
npm run dev
```

发送请求后，应该看到类似的日志：

```
Chat API 请求参数: { provider: 'doubao', model: 'deepseek-v3.2', messagesCount: 1 }
使用的模型名称: deepseek-v3.2
Doubao API 调用参数: { model: 'deepseek-v3.2', messagesCount: 1, url: '...' }
```

### 2. 使用测试脚本

运行测试脚本验证 API：

```bash
chmod +x test-doubao-api.sh
./test-doubao-api.sh
```

### 3. 检查前端请求

在浏览器开发者工具中：

1. 打开 Network 标签
2. 发送消息
3. 查找 `/api/chat` 请求
4. 检查 Request Payload：

```json
{
  "provider": "doubao",
  "model": "deepseek-v3.2",
  "messages": [...]
}
```

### 4. 验证环境变量

确认 `.env` 文件中的配置：

```env
ARK_API_KEY="your-actual-api-key"
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/coding/v3"
```

### 5. 直接测试火山方舟 API

使用你的 API Key 测试：

```bash
curl -X POST "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "deepseek-v3.2",
    "messages": [
      {
        "role": "user",
        "content": [{"type": "text", "text": "你是什么模型？"}]
      }
    ],
    "max_output_tokens": 50
  }'
```

## 可能的原因

### 原因 1: 模型名称未正确传递

**检查点：**

- 前端 `model` 状态是否正确更新
- API 请求中是否包含 `model` 参数
- 服务器日志中的 `modelName` 是什么

**解决方案：**
查看服务器日志中的 "使用的模型名称" 输出

### 原因 2: 火山方舟 API 的模型路由问题

**可能情况：**
火山方舟平台可能会将某些模型名称路由到默认模型

**验证方法：**
直接用 cURL 测试不同的模型名称，看返回的模型是否正确

### 原因 3: 模型响应中的自我介绍

**可能情况：**
某些模型可能被配置为统一回答"我是豆包"

**验证方法：**
尝试不同的问题，比如：

- "请用一句话介绍你自己"
- "你的模型版本是什么？"
- "你是基于什么技术开发的？"

### 原因 4: 缓存问题

**检查点：**

- 浏览器缓存
- 服务器端缓存
- API 响应缓存

**解决方案：**

```bash
# 清除浏览器缓存
# 重启开发服务器
npm run dev
```

## 代码验证

### 当前实现

```typescript
// apps/web/src/app/api/chat/route.ts

const modelName = model || getDefaultModel(provider);
console.log('使用的模型名称:', modelName);

// ...

const response = await fetch(`${arkBaseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${arkApiKey}`,
  },
  body: JSON.stringify({
    model: modelName, // 这里应该是正确的模型名称
    messages: doubaoMessages,
    stream: true,
    max_output_tokens: 2000,
    temperature: 0.7,
    top_p: 0.9,
  }),
});
```

### 验证点

1. `model` 参数是否从请求中正确提取
2. `modelName` 是否正确赋值
3. 发送给火山方舟 API 的请求体中 `model` 字段是否正确

## 下一步操作

1. **查看服务器日志**：确认 `modelName` 的值
2. **检查网络请求**：在浏览器开发者工具中查看实际发送的请求
3. **对比 cURL 请求**：确认我们的请求格式与你的 cURL 请求一致
4. **测试不同模型**：尝试所有 8 个模型，看是否都有同样的问题

## 临时调试代码

如果需要更详细的日志，可以在 API 路由中添加：

```typescript
// 在发送请求前
const requestBody = {
  model: modelName,
  messages: doubaoMessages,
  stream: true,
  max_output_tokens: 2000,
  temperature: 0.7,
  top_p: 0.9,
};

console.log('发送给火山方舟的完整请求:', JSON.stringify(requestBody, null, 2));

const response = await fetch(`${arkBaseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${arkApiKey}`,
  },
  body: JSON.stringify(requestBody),
});
```

## 联系支持

如果问题仍然存在，可能需要：

1. 检查火山方舟平台的模型配置
2. 确认你的 API Key 是否有权限访问所有模型
3. 查看火山方舟平台的文档，确认模型名称是否正确
4. 联系火山方舟技术支持

## 参考文档

- `DOUBAO_API_REFERENCE.md` - 豆包 API 完整参考
- `DOUBAO_INTEGRATION_FIX.md` - 集成修复说明
- `CHAT_MODEL_UPDATE.md` - 模型更新说明
