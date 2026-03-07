# AI 润色性能优化记录

## 问题诊断

### 原始性能指标

- **响应时间**: 20-30 秒
- **Reasoning Tokens**: 占输出 tokens 的 90%+ (832/852)
- **用户体验**: 等待时间过长

### 根本原因

Doubao-Seed-2.0-Pro 模型自动启用了深度推理模式（reasoning），导致：

1. 模型花费大量时间进行内部思考
2. 生成大量推理 tokens（不可见，但消耗时间）
3. 响应时间显著增加

## 优化方案

### 1. 添加 API 参数限制（已实施）

```typescript
{
  model: arkModel,
  input: [...],
  // 性能优化参数
  max_output_tokens: 500,    // 限制输出长度，加快响应
  temperature: 0.7,          // 降低随机性，提高速度
  top_p: 0.9,
}
```

**效果预期**:

- 限制输出长度可以减少生成时间
- 降低 temperature 可以减少采样复杂度

### 2. 简化提示词（已实施）

**优化前**:

```
你是一位专业的中文简历优化顾问。

核心原则:
1. 保留原意，不造假，不夸大
2. 优先补足"动作-结果-指标"结构
3. 仅返回优化后的文本，不包含任何解释、说明或额外内容
...（共约 150 tokens）
```

**优化后**:

```
你是简历优化助手。直接输出优化后的文本，不要解释。

规则:
1. 保留原意，不夸大
2. 动词开头（主导/推动/优化/设计/实现）
...（共约 60 tokens）
```

**效果**:

- 减少 60% 的系统提示词长度
- 更直接的指令，减少模型思考时间
- 明确要求"不要解释"，避免额外输出

### 3. 简化用户提示词（已实施）

**优化前**:

```
请优化以下简历内容：

熟悉 vue 和 react

背景信息：
职位：前端工程师
行业：互联网
```

**优化后**:

```
优化：熟悉 vue 和 react
背景：前端工程师，互联网
```

**效果**:

- 减少冗余的礼貌用语
- 更紧凑的格式
- 减少输入 tokens

## 性能指标对比

### 优化前

- **响应时间**: 20-30 秒
- **Input Tokens**: ~200
- **Output Tokens**: ~850
- **Reasoning Tokens**: ~830 (98%)
- **用户体验**: ⭐⭐ (等待时间过长)

### 优化后（预期）

- **响应时间**: 8-15 秒 ⬇️ 50%
- **Input Tokens**: ~100 ⬇️ 50%
- **Output Tokens**: ~300-400 ⬇️ 50%
- **Reasoning Tokens**: ~100-200 ⬇️ 75%
- **用户体验**: ⭐⭐⭐⭐ (可接受)

## 其他优化建议（未实施）

### 1. 切换到更快的模型

```typescript
// 当前: doubao-seed-2-0-pro-260215 (深度推理模型)
// 可选: doubao-pro-32k (标准模型，更快)
const arkModel = process.env.ARK_MODEL || 'doubao-pro-32k';
```

**优缺点**:

- ✅ 响应时间可能降至 5-10 秒
- ❌ 优化质量可能略有下降
- ❌ 需要测试对比效果

### 2. 使用流式响应

```typescript
// 启用 stream 模式，边生成边显示
body: JSON.stringify({
  model: arkModel,
  input: [...],
  stream: true,  // 启用流式响应
})
```

**优缺点**:

- ✅ 用户感知的等待时间更短
- ✅ 更好的交互体验
- ❌ 需要重构前端和后端代码
- ❌ 实现复杂度较高

### 3. 添加缓存机制

```typescript
// 对相同的输入文本缓存结果
const cacheKey = `polish:${hash(text)}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;
```

**优缺点**:

- ✅ 重复内容响应时间 < 100ms
- ✅ 节省 API 调用成本
- ❌ 需要 Redis 或其他缓存服务
- ❌ 缓存失效策略需要设计

### 4. 预加载常见优化模板

```typescript
// 对常见的简历字段预生成优化建议
const templates = {
  'vue react': '精通 Vue.js 和 React 框架，具备丰富的前端开发经验',
  // ...
};
```

**优缺点**:

- ✅ 常见内容响应时间 < 100ms
- ❌ 不够个性化
- ❌ 维护成本高

## 测试验证

### 测试步骤

1. 清除浏览器缓存
2. 在简历编辑器中输入测试文本："熟悉 vue 和 react"
3. 点击 ✨ 润色按钮
4. 记录响应时间和 tokens 使用情况

### 测试用例

```typescript
// 短文本（10-20 字）
'熟悉 vue 和 react';

// 中等文本（50-100 字）
'负责公司前端架构设计和技术选型，带领团队完成多个核心项目的开发';

// 长文本（150-200 字）
'负责公司前端架构设计和技术选型，带领团队完成多个核心项目的开发。主导了用户中心、订单系统、数据看板等模块的重构，优化了页面加载速度和用户体验。';
```

### 成功标准

- ✅ 短文本响应时间 < 10 秒
- ✅ 中等文本响应时间 < 15 秒
- ✅ 长文本响应时间 < 20 秒
- ✅ Reasoning tokens 占比 < 50%
- ✅ 优化质量不下降

## 监控指标

### 关键指标

```typescript
// 在日志中记录
console.log('性能指标:', {
  responseTime: endTime - startTime,
  inputTokens: result.usage.input_tokens,
  outputTokens: result.usage.output_tokens,
  reasoningTokens: result.usage.output_tokens_details.reasoning_tokens,
  reasoningRatio: reasoningTokens / outputTokens,
});
```

### 告警阈值

- ⚠️ 响应时间 > 20 秒
- ⚠️ Reasoning tokens 占比 > 70%
- 🚨 响应时间 > 30 秒（触发超时）

## 总结

通过添加 API 参数限制和简化提示词，预期可以将响应时间从 20-30 秒降低到 8-15 秒，显著提升用户体验。

如果效果仍不理想，可以考虑：

1. 切换到更快的模型（doubao-pro-32k）
2. 实现流式响应
3. 添加缓存机制

---

**更新时间**: 2026-03-03  
**优化版本**: v1.0  
**负责人**: AI 团队
