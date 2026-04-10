# 讯飞实时语音转写功能 - 完整指南

## ✅ 已完成的工作

### 1. Cloudflare Worker 网关

- ✅ WebSocket 服务器实现
- ✅ 讯飞 API 签名生成（HmacSHA1 + Base64）
- ✅ 音频流双向转发
- ✅ 错误处理和日志
- ✅ 本地开发环境配置

### 2. 环境变量配置

- ✅ Worker 环境变量（`.dev.vars`）
- ✅ Next.js 环境变量（`.env.local`）
- ✅ 讯飞 API 密钥配置

### 3. 前端集成

- ✅ `use-rtasr-realtime` Hook（已存在，无需修改）
- ✅ 语音转写页面 UI（已存在）
- ✅ WebSocket 客户端逻辑（已存在）

---

## 🚀 快速开始

### 本地开发

#### 方式 1：一键启动（推荐）⭐

在项目根目录运行：

```bash
pnpm dev
```

这会同时启动 Next.js 和 Worker 网关。

#### 方式 2：分别启动

如果需要单独调试：

```bash
# Terminal 1: Worker 网关
pnpm --filter @repo/worker-rtasr dev

# Terminal 2: Next.js
pnpm --filter @repo/web dev
```

#### 3. 测试功能

访问 `http://localhost:3000/voice`，切换到"实时录音"标签，点击"开始录音"。

---

## 📋 测试清单

### Worker 网关测试

1. **健康检查**

   ```bash
   curl http://localhost:8787/health
   # 预期输出: {"status":"ok","service":"rtasr-gateway"}
   ```

2. **WebSocket 连接测试**
   - 打开 `infra/worker-rtasr/test-websocket.html`
   - 点击"连接"按钮
   - 查看日志是否显示"WebSocket 连接成功"

### 前端集成测试

1. 访问 `http://localhost:3000/voice`
2. 切换到"实时录音"标签
3. 点击"开始录音"按钮
4. 允许浏览器访问麦克风
5. 开始说话，观察实时转写结果

---

## 🔧 故障排查

### Worker 无法启动

**问题**: `wrangler: command not found`

**解决**:

```bash
cd infra/worker-rtasr
pnpm install
```

### WebSocket 连接失败

**问题**: 前端显示"WebSocket 连接失败"

**检查**:

1. Worker 是否正在运行（`http://localhost:8787/health`）
2. 浏览器控制台是否有错误信息
3. 环境变量 `NEXT_PUBLIC_RTASR_GATEWAY_URL` 是否正确

### 无识别结果

**问题**: 录音正常但没有识别结果

**检查**:

1. 麦克风权限是否已授予
2. Worker 日志是否有错误（`wrangler tail`）
3. 讯飞 API 密钥是否正确
4. 音频格式是否正确（PCM 16kHz 16bit）

### 签名错误

**问题**: Worker 日志显示"签名错误"或"35030"错误码

**解决**:

1. 检查 `.dev.vars` 中的 API 密钥是否正确
2. 确认 AppID、APIKey 都已配置
3. 检查系统时间是否正确（签名包含时间戳）

---

## 📦 生产部署

### 1. 部署 Cloudflare Worker

```bash
cd infra/worker-rtasr

# 登录 Cloudflare
npx wrangler login

# 部署
pnpm deploy
```

部署成功后会得到一个 URL，例如：

```
https://rtasr-gateway.your-subdomain.workers.dev
```

### 2. 配置 Cloudflare 环境变量

在 Cloudflare Dashboard 中：

1. 进入 Workers & Pages
2. 选择你的 Worker
3. 进入 Settings → Variables
4. 添加以下环境变量：
   - `XUNFEI_APP_ID`: 你的 AppID
   - `XUNFEI_API_KEY`: 你的 APIKey
   - `XUNFEI_PD`: 可选领域参数，例如 `medical`

### 3. 部署 Next.js 到 Vercel

在 Vercel Dashboard 中配置环境变量：

```bash
NEXT_PUBLIC_RTASR_GATEWAY_URL=https://rtasr-gateway.your-subdomain.workers.dev
```

然后部署：

```bash
vercel deploy --prod
```

---

## 📊 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器                                                      │
│  - MediaRecorder API (录音)                                 │
│  - AudioWorklet (PCM 处理)                                  │
│  - WebSocket 客户端                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ WebSocket
                          │ PCM 音频流 (16kHz, 16bit)
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (网关)                                   │
│  - WebSocket 服务器                                         │
│  - 讯飞 API 签名生成                                        │
│  - 音频流转发                                               │
│  - 结果解析和转发                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ WebSocket (带签名)
                          │ PCM 音频流
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  讯飞实时语音转写 API                                        │
│  wss://rtasr.xfyun.cn/v1/ws                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 安全注意事项

1. **API 密钥保护**
   - ✅ 密钥存储在 Worker 中，不暴露给前端
   - ✅ `.dev.vars` 已加入 `.gitignore`
   - ⚠️ 生产环境使用 Cloudflare Dashboard 配置

2. **CORS 配置**
   - Worker 已配置 CORS 允许所有来源
   - 生产环境建议限制为特定域名

3. **并发控制**
   - 讯飞 API 有并发路数限制
   - 建议在 Worker 中添加连接数限制

---

## 📝 API 协议

### 客户端 → Worker

**控制消息（JSON）**:

```json
{ "type": "start", "pd": "可选的领域参数" }
{ "type": "end" }
{ "type": "ping" }
```

**音频数据（二进制）**:

- 格式: PCM (16kHz, 16bit, 单声道)
- 建议: 每 40ms 发送 1280 字节

### Worker → 客户端

**状态消息**:

```json
{
  "type": "status",
  "status": "connected" | "started" | "stopped"
}
```

**识别结果**:

```json
{
  "type": "result",
  "segId": 0,
  "isEnd": false,
  "text": "识别的文本内容"
}
```

**错误消息**:

```json
{
  "type": "error",
  "message": "错误描述"
}
```

---

## 🎯 下一步优化建议

1. **音频压缩**
   - 当前使用 PCM 格式，带宽消耗大
   - 可升级为 Opus 格式，节省 50% 带宽

2. **说话人分离**
   - 启用讯飞的说话人分离功能
   - 区分不同说话人的内容

3. **用量监控**
   - 在 Worker 中添加用量统计
   - 记录转写时长和成本

4. **错误重试**
   - 添加自动重连机制
   - 网络中断后自动恢复

5. **历史记录**
   - 将实时转写结果保存到数据库
   - 支持历史记录查询和导出

---

## 📚 相关文档

- [讯飞实时语音转写文档](https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Web Audio API 文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

## ✨ 总结

实时语音转写功能已完全实现并可以使用：

1. ✅ Cloudflare Worker 网关已创建并运行
2. ✅ 讯飞 API 集成完成
3. ✅ 前端 UI 和 Hook 已就绪
4. ✅ 本地开发环境配置完成
5. ✅ 生产部署方案已明确

**立即开始使用**：

```bash
# Terminal 1
cd infra/worker-rtasr && pnpm dev

# Terminal 2
pnpm dev

# 访问 http://localhost:3000/voice
```
