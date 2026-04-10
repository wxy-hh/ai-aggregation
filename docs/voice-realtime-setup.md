# 讯飞实时语音转写 - 开发指南

## 本地开发

### 启动服务

```bash
# Terminal 1: Worker 网关
cd infra/worker-rtasr && pnpm dev

# Terminal 2: Next.js
pnpm dev
```

访问 `http://localhost:3000/voice` 测试。

## 生产部署

### 1. 部署 Worker

```bash
cd infra/worker-rtasr
npx wrangler login
pnpm deploy
```

### 2. 配置环境变量

在 Vercel 中设置：

```
NEXT_PUBLIC_RTASR_GATEWAY_URL=https://your-worker.workers.dev
```

在 Cloudflare Worker 中设置：

```bash
XUNFEI_APP_ID=你的AppID
XUNFEI_API_KEY=你的APIKey
XUNFEI_PD=medical   # 可选
```

## 故障排查

- 检查 Worker 日志: `wrangler tail`
- 检查浏览器控制台
- 确认麦克风权限已授予
- 如果首句或尾句缺字，优先检查 Worker 是否已部署到最新版本
