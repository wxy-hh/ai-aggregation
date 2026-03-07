# 火山方舟 CodingPlan 套餐配置说明

## 重要提示

使用 CodingPlan 套餐时，必须使用专用的 Base URL，否则会产生额外费用而不消耗套餐额度。

## 正确配置

### 环境变量配置（.env 文件）

```bash
# 火山方舟 API 密钥
ARK_API_KEY="your-ark-api-key"

# CodingPlan 套餐专用 Base URL（重要！）
ARK_BASE_URL="https://ark-code.cn-beijing.volces.com/api/coding/v3"

# 推荐使用的模型
ARK_MODEL="doubao-seed-2.0-lite"
```

## Base URL 对比

| 用途               | Base URL                                               | 说明                                   |
| ------------------ | ------------------------------------------------------ | -------------------------------------- |
| ❌ 按量付费        | `https://ark.cn-beijing.volces.com/api/v3`             | 会产生额外费用，不消耗 CodingPlan 额度 |
| ✅ CodingPlan 套餐 | `https://ark-code.cn-beijing.volces.com/api/coding/v3` | 消耗 CodingPlan 套餐额度               |

**关键区别：**

1. 域名：`ark-code` 而不是 `ark`
2. 路径：`/api/coding/v3` 而不是 `/api/v3`

## 支持的模型

CodingPlan 套餐支持以下模型：

- ✅ `doubao-seed-2.0-code`（编程专用）
- ✅ `doubao-seed-2.0-pro`（高质量）
- ✅ `doubao-seed-2.0-lite`（轻量快速，推荐）
- ✅ 其他模型（minimax、glm、deepseek、kimi 等）

## 当前项目配置

### 诊断 API (`/api/resume/diagnose`)

- 模型：`doubao-seed-2.0-lite`
- Base URL：`https://ark-code.cn-beijing.volces.com/api/coding/v3`

### 润色 API (`/api/resume/polish`)

- 模型：`doubao-seed-2.0-lite`
- Base URL：`https://ark-code.cn-beijing.volces.com/api/coding/v3`

## 验证配置

启动项目后，检查日志中的 API 调用地址，确保使用的是 `ark-code` 域名和 `/api/coding/v3` 路径：

```
✅ 正确：https://ark-code.cn-beijing.volces.com/api/coding/v3/chat/completions
❌ 错误：https://ark.cn-beijing.volces.com/api/v3/chat/completions
❌ 错误：https://ark-code.cn-beijing.volces.com/api/v3/chat/completions
```

## 参考文档

- [CodingPlan 快速开始](https://www.volcengine.com/docs/82379/1928261)
- [火山方舟模型列表](https://console.volcengine.com/ark/region:ark+cn-beijing/model)
