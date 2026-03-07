# AI API 故障排查指南

## 问题：API 请求超时

### 症状

```
POST /api/resume/polish 408 in 10417ms
POST /api/resume/diagnose 200 in 10019ms
ARK API 超时，回退到规则引擎
```

### 已实施的解决方案

#### 1. 增加超时时间 ✅

- **修改前**：10 秒超时
- **修改后**：30 秒超时
- **原因**：AI 模型响应时间可能超过 10 秒，特别是在高负载时期

**修改位置**：

- `apps/web/src/app/api/resume/polish/route.ts` 第 63 行
- `apps/web/src/app/api/resume/diagnose/route.ts` 第 49 行

```typescript
// 修改前
const timeoutId = setTimeout(() => controller.abort(), 10000);

// 修改后
const timeoutId = setTimeout(() => controller.abort(), 30000);
```

### 其他可能的原因和解决方案

#### 2. 检查环境变量配置

确保 `.env.local` 文件配置正确：

```bash
# 检查文件是否存在
ls -la apps/web/.env.local

# 查看配置（注意不要泄露 API Key）
cat apps/web/.env.local | grep ARK
```

**必需的环境变量**：

```bash
ARK_API_KEY="your-actual-api-key"
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
ARK_MODEL="doubao-seed-2-0-pro-260215"
```

**验证步骤**：

1. 确认 `ARK_API_KEY` 不为空
2. 确认 API Key 格式正确（通常是 UUID 格式）
3. 确认 Base URL 可访问（可以用 curl 测试）

#### 3. 测试网络连接

```bash
# 测试是否能访问火山方舟 API
curl -I https://ark.cn-beijing.volces.com/api/v3

# 应该返回 HTTP 状态码（如 401 表示需要认证，这是正常的）
```

#### 4. 检查 API Key 有效性

登录火山方舟控制台验证：

1. API Key 是否过期
2. API Key 是否有足够的配额
3. 模型 ID 是否正确（`doubao-seed-2-0-pro-260215`）

#### 5. 检查请求频率

如果看到 429 错误（请求过于频繁）：

```
POST /api/resume/polish 429
```

**解决方案**：

- 前端已实现 500ms 防抖（AI 诊断）
- 考虑增加防抖时间到 1000ms
- 检查是否有多个标签页同时请求

#### 6. 查看详细错误日志

在开发环境中，API 会输出详细的错误信息：

```typescript
// 在 route.ts 中添加更多日志
console.log('ARK API 请求:', {
  url: `${arkBaseUrl}/responses`,
  model: arkModel,
  hasApiKey: !!arkApiKey,
});
```

#### 7. 使用规则引擎回退（已实现）

当 AI API 不可用时，系统会自动回退到规则引擎：

- **诊断 API**：使用基于规则的评分算法
- **润色 API**：返回 408 错误，前端显示重试按钮

### 测试 API 是否正常工作

#### 方法 1：使用浏览器开发者工具

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 在简历编辑器中触发 AI 功能
4. 查看请求详情：
   - 状态码应该是 200
   - 响应时间应该 < 30 秒
   - 响应体应该包含 AI 生成的内容

#### 方法 2：使用 curl 直接测试

```bash
# 测试润色 API
curl -X POST http://localhost:3000/api/resume/polish \
  -H "Content-Type: application/json" \
  -d '{
    "target": "personalInfo.title",
    "text": "前端工程师",
    "style": "professional",
    "language": "zh-CN"
  }'

# 测试诊断 API
curl -X POST http://localhost:3000/api/resume/diagnose \
  -H "Content-Type: application/json" \
  -d '{
    "resume": {
      "schemaVersion": "v1",
      "personalInfo": {
        "name": "张三",
        "title": "前端工程师"
      },
      "workExperiences": [],
      "educations": [],
      "projects": [],
      "skills": []
    }
  }'
```

### 预期行为

#### 成功响应（润色 API）

```json
{
  "optimizedText": "高级前端开发工程师",
  "highlights": [{ "start": 0, "end": 2, "type": "added" }]
}
```

#### 成功响应（诊断 API）

```json
{
  "score": 65,
  "dimensions": {
    "completeness": 60,
    "impact": 50,
    "keywordMatch": 70,
    "readability": 80
  },
  "suggestions": [
    {
      "id": "s1",
      "priority": "high",
      "title": "补充个人简介",
      "description": "添加一段简洁的个人简介",
      "targetPath": "personalInfo.summary"
    }
  ],
  "fallback": false
}
```

#### 超时响应（润色 API）

```json
{
  "error": "请求超时，请重试"
}
```

状态码：408

#### 回退响应（诊断 API）

```json
{
  "score": 65,
  "dimensions": { ... },
  "suggestions": [ ... ],
  "fallback": true  // 注意这个字段为 true
}
```

状态码：200（使用规则引擎）

### 性能优化建议

#### 1. 减少请求频率

- AI 诊断已实现 500ms 防抖
- 考虑增加到 1000ms 或 2000ms
- 仅在用户停止输入后才触发

#### 2. 缓存 AI 响应

```typescript
// 可以考虑添加简单的内存缓存
const cache = new Map<string, any>();

function getCacheKey(text: string, target: string): string {
  return `${target}:${text}`;
}

// 在调用 API 前检查缓存
const cacheKey = getCacheKey(text, target);
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}

// 调用 API 后存入缓存
cache.set(cacheKey, result);
```

#### 3. 使用流式响应（未来优化）

如果 ARK API 支持流式响应，可以实现：

- 逐字显示优化结果
- 更好的用户体验
- 减少感知延迟

### 监控和告警

#### 添加性能监控

```typescript
// 在 API 路由中添加
const startTime = Date.now();

// ... API 调用 ...

const duration = Date.now() - startTime;
console.log(`API 响应时间: ${duration}ms`);

// 如果响应时间过长，记录警告
if (duration > 20000) {
  console.warn(`API 响应缓慢: ${duration}ms`);
}
```

#### 添加错误统计

```typescript
// 可以使用简单的计数器
let errorCount = 0;
let successCount = 0;

// 在错误处理中
errorCount++;
console.error(`API 错误统计: ${errorCount} 次失败, ${successCount} 次成功`);
```

### 联系支持

如果问题持续存在，请联系：

1. **火山方舟技术支持**
   - 检查 API 配额和限流策略
   - 确认模型可用性
   - 获取详细的错误日志

2. **项目维护者**
   - 提供完整的错误日志
   - 说明复现步骤
   - 附上环境信息（Node 版本、操作系统等）

### 快速检查清单

- [ ] 环境变量配置正确（`.env.local` 存在且包含有效的 API Key）
- [ ] 网络可以访问火山方舟 API（`curl` 测试通过）
- [ ] API Key 有效且有足够配额
- [ ] 超时时间已增加到 30 秒
- [ ] 开发服务器已重启（使环境变量生效）
- [ ] 浏览器控制台没有其他错误
- [ ] 请求频率合理（没有过于频繁的请求）

### 临时解决方案

如果 AI API 持续不可用，系统会自动使用规则引擎：

- **诊断功能**：基于规则的评分仍然可用
- **润色功能**：用户会看到"请求超时"提示，可以手动重试

这确保了即使 AI 服务不可用，核心功能仍然可以正常使用。
