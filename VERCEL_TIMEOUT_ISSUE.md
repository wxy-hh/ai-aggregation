# Vercel 超时问题诊断与解决方案

## 🔍 问题诊断

### 根本原因

豆包 API 接口（八字、紫微斗数、奇门遁甲）在 Vercel 上无法响应的**根本原因**是：

1. **代码设置的超时时间**：90 秒（90000ms）
2. **Vercel 免费版限制**：Serverless Functions 最大执行时间 **10 秒**
3. **结果**：请求在 10 秒后被 Vercel 强制终止，返回 504 Gateway Timeout

### 相关代码位置

```typescript
// apps/web/src/app/api/destiny/report/route.ts
const REPORT_TIMEOUT_MS = 90000; // 90 秒

// apps/web/src/app/api/destiny/qimen/analyze/route.ts
const REPORT_TIMEOUT_MS = 90000; // 90 秒

// apps/web/src/app/api/destiny/ziwei-report/route.ts
const REPORT_TIMEOUT_MS = 90000; // 90 秒
```

---

## ✅ 解决方案

### 方案 1：调整超时时间（推荐，免费）

将代码中的超时时间调整为 **8 秒**，留 2 秒缓冲给 Vercel：

```typescript
// 修改为 8 秒
const REPORT_TIMEOUT_MS = 8000;
```

**优点**：

- ✅ 免费
- ✅ 立即生效
- ✅ 适合大多数场景

**缺点**：

- ⚠️ 如果豆包 API 响应慢，可能会超时
- ⚠️ 需要优化 Prompt 以加快响应速度

---

### 方案 2：升级 Vercel Pro（付费）

升级到 Vercel Pro 计划，支持最长 **60 秒**执行时间。

**价格**：$20/月

**配置方法**：

1. 升级到 Vercel Pro
2. 在 `apps/web/vercel.json` 中添加：

```json
{
  "regions": ["hkg1"],
  "functions": {
    "app/api/destiny/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

3. 修改代码超时时间：

```typescript
const REPORT_TIMEOUT_MS = 55000; // 55 秒，留 5 秒缓冲
```

**优点**：

- ✅ 更长的执行时间
- ✅ 适合复杂计算

**缺点**：

- ❌ 需要付费

---

### 方案 3：使用 Edge Runtime（实验性）

将 API 路由改为 Edge Runtime，没有 10 秒限制。

**配置方法**：
在每个 API 路由文件顶部添加：

```typescript
export const runtime = 'edge';
```

**优点**：

- ✅ 免费
- ✅ 没有 10 秒限制
- ✅ 全球分布式执行

**缺点**：

- ⚠️ Edge Runtime 有一些限制（不支持某些 Node.js API）
- ⚠️ 需要测试兼容性

---

## 🚀 立即实施（方案 1）

### 步骤 1：修改超时时间

修改以下三个文件：

1. `apps/web/src/app/api/destiny/report/route.ts`
2. `apps/web/src/app/api/destiny/qimen/analyze/route.ts`
3. `apps/web/src/app/api/destiny/ziwei-report/route.ts`

将：

```typescript
const REPORT_TIMEOUT_MS = 90000;
```

改为：

```typescript
const REPORT_TIMEOUT_MS = 8000; // Vercel 免费版限制 10 秒，留 2 秒缓冲
```

### 步骤 2：优化 Prompt（可选）

如果 8 秒仍然超时，可以：

1. 简化 System Prompt
2. 减少输出字段
3. 使用更快的模型（如 `doubao-lite-4k`）

### 步骤 3：提交并部署

```bash
git add .
git commit -m "fix: 调整 API 超时时间以适配 Vercel 免费版限制"
git push origin master
```

Vercel 会自动重新部署。

---

## 📊 Vercel 计划对比

| 功能                | Hobby（免费） | Pro（$20/月） |
| ------------------- | ------------- | ------------- |
| Serverless 执行时间 | 10 秒         | 60 秒         |
| Edge 执行时间       | 无限制        | 无限制        |
| 带宽                | 100 GB/月     | 1 TB/月       |
| 构建时间            | 6 小时/月     | 24 小时/月    |

---

## 🔗 参考文档

- [Vercel Serverless Functions Limits](https://vercel.com/docs/functions/serverless-functions/runtimes#max-duration)
- [Vercel Edge Runtime](https://vercel.com/docs/functions/edge-functions)
- [Vercel Pricing](https://vercel.com/pricing)

---

## ⚡ 快速检查清单

- [ ] 确认当前 Vercel 计划（Hobby 还是 Pro）
- [ ] 修改三个 API 路由的超时时间为 8000ms
- [ ] 提交代码并推送到 GitHub
- [ ] 等待 Vercel 自动部署完成
- [ ] 测试线上接口是否正常

---

## 💡 后续优化建议

1. **监控响应时间**：使用 Vercel Analytics 监控 API 响应时间
2. **缓存策略**：对相同输入的结果进行缓存
3. **异步处理**：考虑使用队列（BullMQ）处理耗时任务
4. **分步返回**：使用流式响应（SSE）逐步返回结果
