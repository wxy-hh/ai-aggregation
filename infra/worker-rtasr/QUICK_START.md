# 讯飞实时语音转写 - 快速开始

## 🎯 功能说明

实时将语音转换为文字，支持中英文和 202 种方言混合识别。

## 🚀 本地开发（2 步启动）

### 1. 启动 Worker 网关

```bash
cd infra/worker-rtasr
pnpm dev
```

✅ 看到 `Ready on http://localhost:8787` 表示成功

### 2. 启动 Next.js

```bash
# 新终端，在项目根目录
pnpm dev
```

✅ 访问 `http://localhost:3000/voice` 开始使用

## 📦 生产部署（3 步完成）

### 1. 部署 Worker

```bash
cd infra/worker-rtasr
npx wrangler login
pnpm deploy
```

### 2. 配置 Cloudflare 环境变量

在 Dashboard 添加：

- `XUNFEI_APP_ID`
- `XUNFEI_API_KEY`
- `XUNFEI_PD`（可选）

### 3. 配置 Vercel

添加环境变量：

```
NEXT_PUBLIC_RTASR_GATEWAY_URL=https://your-worker.workers.dev
```

## 🔧 故障排查

**问题**: Worker 无法启动  
**解决**: `cd infra/worker-rtasr && pnpm install`

**问题**: 无识别结果  
**解决**: 检查麦克风权限和 API 密钥

## 📚 完整文档

查看项目根目录的 `VOICE_REALTIME_GUIDE.md`
