# 豆包 API 区域访问问题诊断与解决方案

## 🔍 问题分析

### 症状

- ✅ 本地环境: 所有 AI 命理接口正常
- ❌ 线上环境 (Vercel): 所有 AI 命理接口失败
  - `/api/destiny/report` (八字)
  - `/api/destiny/ziwei-report` (紫微斗数)
  - `/api/destiny/qimen/analyze` (奇门遁甲)

### 根本原因

**豆包 API 域名限制**: `ark.cn-beijing.volces.com`

```typescript
const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
```

**问题**:

1. ❌ 域名包含 `.cn-beijing` - 明确指向中国北京区域
2. ❌ Vercel 默认部署在**美国**或**欧洲**节点
3. ❌ 豆包 API 可能**限制海外访问**或**海外访问延迟极高**

---

## 📊 Vercel 部署区域

### 当前部署位置

根据之前的部署日志:

```
Running build in Washington, D.C., USA (East) – iad1
```

**Vercel 默认区域**:

- 🌍 美国东部 (Washington, D.C.)
- 🌍 美国西部 (San Francisco)
- 🌍 欧洲 (Frankfurt, London)

**问题**: 这些区域访问中国的 API 服务会遇到:

- 网络延迟高 (200-500ms+)
- 可能被防火墙拦截
- 可能触发 API 的地域限制

---

## 🎯 解决方案

### 方案 1: 修改 Vercel 部署区域 (推荐)

将 Vercel 项目部署到**亚洲区域**,靠近豆包 API 服务器。

#### 步骤:

1. **在项目根目录创建 `vercel.json`** (或修改现有文件):

```json
{
  "regions": ["hkg1"],
  "buildCommand": "pnpm turbo build --filter=@repo/web",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next"
}
```

**可用的亚洲区域**:

- `hkg1` - 香港 (推荐,最接近中国大陆)
- `sin1` - 新加坡
- `icn1` - 首尔
- `nrt1` - 东京

2. **重新部署**:

```bash
git add vercel.json
git commit -m "fix: 配置 Vercel 部署到香港区域以访问豆包 API"
git push origin master
```

3. **验证部署区域**:
   - 查看 Vercel Dashboard 的部署日志
   - 应该看到 "Running build in Hong Kong"

---

### 方案 2: 使用 Vercel Edge Config (备选)

如果方案 1 不行,可以在 `apps/web/vercel.json` 中配置:

```json
{
  "regions": ["hkg1"],
  "buildCommand": "cd ../.. && pnpm turbo build --filter=@repo/web",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "outputDirectory": ".next"
}
```

---

### 方案 3: 使用代理服务 (复杂,不推荐)

如果无法更改部署区域,可以:

1. 部署一个中国区域的代理服务
2. 修改 API 调用,通过代理访问豆包 API

**缺点**:

- 增加复杂度
- 增加延迟
- 需要额外维护

---

## 🔧 实施步骤

### 立即执行

1. **修改根目录 `vercel.json`**:

```json
{
  "regions": ["hkg1"],
  "buildCommand": "pnpm turbo build --filter=@repo/web",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next"
}
```

2. **提交并推送**:

```bash
git add vercel.json
git commit -m "fix: 配置 Vercel 部署到香港区域以访问豆包 API"
git push origin master
```

3. **等待 Vercel 自动部署** (2-5 分钟)

4. **测试 API**:
   - 访问 https://ai-aggregation-web.vercel.app/destiny
   - 测试八字、紫微斗数、奇门遁甲功能

---

## 📋 验证清单

### 部署后检查

- [ ] Vercel 部署日志显示 "Hong Kong" 或 "hkg1"
- [ ] `/api/destiny/report` 返回正常
- [ ] `/api/destiny/ziwei-report` 返回正常
- [ ] `/api/destiny/qimen/analyze` 返回正常
- [ ] 响应时间 < 3 秒

### 如果仍然失败

1. **检查环境变量**:
   - Vercel Dashboard > Settings > Environment Variables
   - 确认 `ARK_API_KEY` 已配置
   - 确认 `ARK_BASE_URL` 已配置

2. **查看运行时日志**:
   - Vercel Dashboard > Logs
   - 查找豆包 API 的错误信息

3. **测试 API 可达性**:
   ```bash
   # 在 Vercel Function 中测试
   curl -X POST https://ark.cn-beijing.volces.com/api/v3/responses \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"doubao-seed-2-0-lite-260215","input":[{"role":"user","content":"测试"}]}'
   ```

---

## 🌐 Vercel 区域对比

| 区域     | 代码 | 到北京延迟 | 推荐度     |
| -------- | ---- | ---------- | ---------- |
| 香港     | hkg1 | ~30ms      | ⭐⭐⭐⭐⭐ |
| 新加坡   | sin1 | ~60ms      | ⭐⭐⭐⭐   |
| 首尔     | icn1 | ~50ms      | ⭐⭐⭐⭐   |
| 东京     | nrt1 | ~80ms      | ⭐⭐⭐     |
| 美国东部 | iad1 | ~200ms+    | ❌         |
| 欧洲     | fra1 | ~250ms+    | ❌         |

---

## 💡 其他优化建议

### 1. 增加超时时间

如果网络延迟高,可以增加 API 超时:

```typescript
// apps/web/src/app/api/destiny/qimen/analyze/route.ts
const REPORT_TIMEOUT_MS = 120000; // 从 90s 增加到 120s
```

### 2. 添加重试机制

```typescript
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 3. 监控 API 性能

在 Vercel Dashboard 中:

- Functions > 查看各个 API 的执行时间
- Logs > 查看错误日志

---

## 🔍 故障排查

### 问题 1: 部署后仍然失败

**可能原因**:

- 豆包 API 完全禁止海外访问
- API Key 有地域限制

**解决**:

1. 联系豆包客服确认 API 是否支持海外访问
2. 检查 API Key 是否有地域限制

### 问题 2: 部署到香港后变慢

**可能原因**:

- 用户在美国/欧洲访问香港服务器

**解决**:

- 使用 Vercel Edge Functions (自动选择最近节点)
- 或者接受这个权衡 (API 可用 > 页面加载速度)

### 问题 3: 其他功能受影响

**检查**:

- 聊天功能 (使用其他 AI 服务)
- 图像生成 (使用 SiliconFlow)
- 语音转写 (使用 SiliconFlow)

这些功能应该不受影响,因为它们使用不同的 API。

---

## 📝 总结

### 问题根源

- 豆包 API 域名: `ark.cn-beijing.volces.com`
- Vercel 默认部署在美国/欧洲
- 跨境访问中国 API 受限

### 解决方案

- ✅ 配置 Vercel 部署到香港 (`hkg1`)
- ✅ 修改 `vercel.json` 添加 `"regions": ["hkg1"]`
- ✅ 重新部署

### 预期结果

- ✅ 所有 AI 命理接口恢复正常
- ✅ API 响应时间 < 3 秒
- ✅ 用户体验改善

---

**最后更新**: 2026-04-15 16:00 (北京时间)
