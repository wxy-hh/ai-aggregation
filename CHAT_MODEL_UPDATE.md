# 智能对话模型更新说明

## 更新内容

本次更新对智能对话页面的模型配置进行了调整，保留讯飞星火模型，移除其他模型，并新增豆包（火山方舟）系列模型支持。

## 支持的模型

### 1. 讯飞星火（xunfei）

- Spark Lite (免费)
- Spark Max
- Spark 4.0 Ultra

### 2. 豆包（doubao）

- Doubao Lite (轻量级) - `doubao-seed-2.0-lite`
- Doubao Pro (专业级) - `doubao-seed-2.0-pro`
- Doubao Code (代码专用) - `doubao-seed-2.0-code`
- Doubao Code 基础版 - `doubao-seed-code`
- MiniMax M2.5 - `minimax-m2.5`
- GLM 4.7 - `glm-4.7`
- DeepSeek V3.2 - `deepseek-v3.2`
- Kimi K2.5 - `kimi-k2.5`

## 修改的文件

### 前端文件

1. `apps/web/src/app/chat/page.tsx`
   - 更新 MODELS 配置，移除 zhipu、deepseek、dashscope
   - 新增 doubao 配置及其 8 个模型

2. `apps/web/src/stores/chat-store.ts`
   - 更新 ProviderName 类型：`'xunfei' | 'doubao'`

### 后端文件

3. `packages/providers/src/factory.ts`
   - 更新 ProviderName 类型定义
   - 更新 providerConfigs，移除旧的 provider 配置
   - 新增 doubao 配置：
     - baseURL: `https://ark.cn-beijing.volces.com/api/coding/v3`
     - envKey: `ARK_API_KEY`
   - 更新 getDefaultModel 函数

4. `apps/web/src/app/api/chat/route.ts`
   - 更新注释，明确豆包使用 Vercel AI SDK

### 配置文件

5. `apps/web/.env.example`
   - 移除不再使用的 API Key 配置
   - 保留讯飞星火和豆包的配置
   - 添加注释说明

## 环境变量配置

需要在 `.env` 文件中配置以下环境变量：

```env
# 讯飞星火
XUNFEI_API_PASSWORD="your-xunfei-api-password"

# 豆包（火山方舟）
ARK_API_KEY="your-ark-api-key"
ARK_BASE_URL="https://ark.cn-beijing.volces.com/api/coding/v3"
ARK_MODEL="doubao-seed-2.0-lite"
```

## API 调用说明

### 豆包 API 调用

豆包使用火山方舟平台的 OpenAI 兼容接口，通过 Vercel AI SDK 进行调用。

**重要配置：**

- Base URL 必须使用 `/api/coding/v3` 路径（CodingPlan 套餐专用）
- 使用标准的 OpenAI 兼容格式
- 支持流式响应

详细的 API 调用参考请查看 `DOUBAO_API_REFERENCE.md` 文档。

## 使用方式

1. 在智能对话页面，点击模型选择器
2. 选择"讯飞星火"或"豆包"
3. 选择具体的模型版本
4. 开始对话

## 注意事项

1. 确保已正确配置环境变量
2. 豆包 API 需要使用 CodingPlan 套餐的专用 URL
3. 不同模型有不同的特点和适用场景：
   - Lite 模型：适合快速响应的简单任务
   - Pro 模型：适合复杂的推理任务
   - Code 模型：专门优化代码生成和分析
   - 其他模型：各有特色，可根据需求选择

## 后续优化建议

1. 添加模型切换的持久化存储
2. 为不同模型添加使用说明和推荐场景
3. 实现模型性能监控和成本统计
4. 添加模型响应质量评估功能
