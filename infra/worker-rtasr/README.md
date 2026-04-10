# 讯飞实时语音转写 WebSocket 网关

Cloudflare Worker 实现的 WebSocket 代理服务，用于连接浏览器和讯飞实时语音转写 API。

## 功能

- ✅ WebSocket 服务器（接收浏览器连接）
- ✅ 讯飞 API 签名生成（RTASR `signa` 协议）
- ✅ 双向音频流转发
- ✅ 实时识别结果推送
- ✅ 错误处理和日志记录
- ✅ 上游握手前音频缓冲，减少首句丢失
- ✅ 结束帧发送，减少尾句丢失

## 本地开发

### 1. 安装依赖

```bash
cd infra/worker-rtasr
pnpm install
```

### 2. 配置环境变量

创建 `.dev.vars` 文件（已在 `.gitignore` 中）：

```bash
XUNFEI_APP_ID=你的AppID
XUNFEI_API_KEY=你的APIKey
XUNFEI_PD=medical   # 可选
```

### 3. 启动开发服务器

```bash
pnpm dev
```

服务将运行在 `http://localhost:8787`

### 4. 测试连接

使用 WebSocket 客户端连接：

```javascript
const ws = new WebSocket('ws://localhost:8787');

ws.onopen = () => {
  // 启动转写会话
  ws.send(JSON.stringify({ type: 'start' }));

  // 发送音频数据（PCM 格式）
  ws.send(audioBuffer);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('识别结果:', data);
};
```

## 生产部署

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 配置生产环境变量

在 Cloudflare Dashboard 中设置：

- Workers & Pages → 你的 Worker → Settings → Variables
- 添加以下环境变量：
  - `XUNFEI_APP_ID`
  - `XUNFEI_API_KEY`
  - `XUNFEI_PD`（可选）

### 3. 部署

```bash
pnpm deploy
```

部署后会得到一个 URL，例如：`https://rtasr-gateway.your-subdomain.workers.dev`

### 4. 更新 Next.js 环境变量

在 `apps/web/.env.local` 中添加：

```bash
NEXT_PUBLIC_RTASR_GATEWAY_URL=https://rtasr-gateway.your-subdomain.workers.dev
```

## API 协议

### 客户端 → 网关

**控制消息（JSON 格式）**：

```typescript
// 启动转写
{ type: 'start', pd?: string }

// 结束转写
{ type: 'end' }

// 心跳
{ type: 'ping' }
```

**音频数据（二进制格式）**：

- 格式：PCM (16kHz, 16bit, 单声道)
- 建议：每 40ms 发送 1280 字节

### 网关 → 客户端

**状态消息**：

```typescript
{
  type: 'status',
  status: 'connected' | 'started' | 'stopped'
}
```

**识别结果**：

```typescript
{
  type: 'result',
  segId: number,
  isEnd: boolean,
  text: string,
  raw: any
}
```

**错误消息**：

```typescript
{
  type: 'error',
  message: string,
  raw?: any
}
```

## 架构说明

```
浏览器 (use-rtasr-realtime Hook)
    ↓ WebSocket
Cloudflare Worker (本服务)
    ↓ WebSocket (带讯飞签名)
讯飞实时转写 API
```

## 注意事项

1. **API 密钥安全**：不要将 `.dev.vars` 提交到 Git
2. **并发限制**：讯飞 API 有并发路数限制，注意控制
3. **超时处理**：长时间无数据时上游可能自动断开，前端要做好重连提示
4. **成本控制**：按时长计费，建议添加录音时长限制

## 故障排查

### 连接失败

- 检查环境变量是否正确配置
- 检查讯飞 API 密钥是否有效
- 查看 Worker 日志：`wrangler tail`

### 识别结果为空

- 确认音频格式正确（PCM 16kHz 16bit）
- 检查音频数据是否正常发送
- 查看讯飞返回的原始数据

### 签名错误

- 确认 AppID、APIKey 正确
- 检查时间戳格式是否正确
- 查看 `appid/ts/signa` 生成逻辑是否与现有网关一致

## 相关文档

- [讯飞实时语音转写文档](https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
