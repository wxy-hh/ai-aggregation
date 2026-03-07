# POST /api/resume/diagnose

简历诊断与评分 API，使用 Doubao-Seed-2.0-Pro (火山方舟 ARK) 进行智能诊断。

## 功能概述

- 对完整简历进行综合评分（0-100 分）
- 提供四个维度的详细评分：完整度、量化成果、关键词匹配、可读性
- 生成最多 5 条高优先级优化建议
- 支持可选的岗位描述匹配
- 隐私保护：默认不发送联系方式到 AI 服务
- 智能回退：AI 服务不可用时自动使用规则引擎

## 请求格式

```typescript
POST /api/resume/diagnose
Content-Type: application/json

{
  "resume": {
    "schemaVersion": "v1",
    "templateId": "default",
    "personalInfo": {
      "name": "张三",
      "title": "高级前端工程师",
      "email": "zhangsan@example.com",
      "phone": "13800138000",
      "summary": "5年前端开发经验..."
    },
    "workExperiences": [...],
    "educations": [...],
    "projects": [...],
    "skills": [...]
  },
  "jobDescription": "可选：目标岗位描述",
  "privacy": {
    "allowContactFields": false  // 可选，默认 false
  }
}
```

## 响应格式

### 成功响应 (200 OK)

```json
{
  "score": 82,
  "dimensions": {
    "completeness": 80,
    "impact": 75,
    "keywordMatch": 85,
    "readability": 88
  },
  "suggestions": [
    {
      "id": "s1",
      "priority": "high",
      "title": "补充量化成果",
      "description": "在最近一段工作经历中增加具体的数据指标",
      "targetPath": "workExperiences[0].description"
    }
  ],
  "fallback": false
}
```

### 错误响应

#### 400 Bad Request - 参数错误

```json
{
  "error": "缺少必需参数: resume"
}
```

#### 429 Too Many Requests - 频率限制

```json
{
  "error": "请求过于频繁，请稍后再试"
}
```

#### 500 Internal Server Error - 服务器错误

```json
{
  "error": "服务器内部错误"
}
```

## 评分维度说明

### 1. completeness（完整度）- 权重 30%

评估简历的完整性：

- 必填字段是否填写（姓名、职位）
- 是否包含个人简介
- 工作经历数量和完整性
- 教育背景是否填写
- 技能列表是否完善

### 2. impact（量化成果）- 权重 30%

评估工作成果的量化程度：

- 是否包含具体数据（百分比、数量等）
- 描述是否充分（长度、细节）
- 是否体现业务价值

### 3. keywordMatch（关键词匹配）- 权重 20%

评估专业术语和关键词的覆盖度：

- 专业技能关键词
- 行业术语
- 动作动词（负责、开发、设计等）

### 4. readability（可读性）- 权重 20%

评估排版和表达质量：

- 工作经历数量是否合理（不过多不过少）
- 个人简介长度是否适中
- 整体结构是否清晰

## 建议优先级

- `high`：高优先级，对简历质量影响较大
- `medium`：中优先级，建议优化
- `low`：低优先级，可选优化

## 隐私保护

### 默认行为（allowContactFields: false）

默认情况下，API 不会将以下敏感信息发送到 AI 服务：

- `personalInfo.email`
- `personalInfo.phone`

### 允许发送联系方式（allowContactFields: true）

如果用户明确允许，可以发送完整的简历信息：

```json
{
  "resume": {...},
  "privacy": {
    "allowContactFields": true
  }
}
```

## 回退机制

当 AI 服务不可用时（未配置 API Key、超时、错误等），API 会自动回退到规则引擎评分：

```json
{
  "score": 75,
  "dimensions": {...},
  "suggestions": [...],
  "fallback": true  // 标识使用了回退机制
}
```

规则引擎基于以下规则计算评分：

1. **完整度**：检查必填字段、数组长度
2. **量化成果**：正则匹配数字、百分比、单位
3. **关键词匹配**：检测常见动作动词和专业术语
4. **可读性**：评估描述长度、结构合理性

## 环境变量配置

```bash
# 火山方舟 API Key（必需）
ARK_API_KEY=your-api-key

# ARK API 基础 URL（可选，默认值如下）
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# ARK 模型名称（可选，默认值如下）
ARK_MODEL=doubao-seed-2-0-pro-260215
```

## 超时与重试

- **超时时间**：10 秒
- **重试策略**：超时或失败时自动回退到规则引擎，不进行重试
- **频率限制**：由 ARK API 控制，返回 429 状态码

## 使用示例

### 基础诊断

```typescript
const response = await fetch('/api/resume/diagnose', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    resume: myResumeData,
  }),
});

const result = await response.json();
console.log('评分:', result.score);
console.log('建议:', result.suggestions);
```

### 带岗位描述的诊断

```typescript
const response = await fetch('/api/resume/diagnose', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    resume: myResumeData,
    jobDescription: '招聘高级前端工程师，要求精通 React...',
  }),
});
```

### 允许发送联系方式

```typescript
const response = await fetch('/api/resume/diagnose', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    resume: myResumeData,
    privacy: {
      allowContactFields: true,
    },
  }),
});
```

## 注意事项

1. **建议数量限制**：最多返回 5 条建议，按优先级排序
2. **敏感信息**：默认不发送联系方式，需用户明确授权
3. **回退机制**：AI 服务不可用时自动使用规则引擎，保证服务可用性
4. **targetPath 格式**：建议中的 `targetPath` 使用点号和数组索引表示路径，如 `workExperiences[0].description`
5. **JSON 格式**：AI 响应可能包含在 markdown 代码块中，API 会自动提取

## 相关文档

- [需求文档 - 需求 6: AI 诊断助手面板](../../../../../../.kiro/specs/resume-editor-glassmorphism/requirements.md#需求-6-ai-诊断助手面板)
- [设计文档 - 7.2 POST /api/resume/diagnose](../../../../../../.kiro/specs/resume-editor-glassmorphism/design.md#72-post-apiresumediagnose)
- [火山方舟 ARK API 文档](https://www.volcengine.com/docs/82379/1399008)
