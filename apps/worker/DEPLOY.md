# apps/worker 部署说明

## 适用场景

`apps/worker` 是 BullMQ 常驻消费进程，不能部署到 Vercel。推荐单独部署到：

- Railway
- Render
- 其他支持常驻 Node.js 进程的容器平台

部署目标是持续运行下面这个启动命令：

```bash
pnpm --filter @repo/worker start
```

---

## 共享前提

无论部署到 Railway 还是 Render，都要满足下面几条：

1. `apps/web` 与 `apps/worker` 使用同一套 Redis
2. `apps/web` 与 `apps/worker` 使用同一套数据库
3. `apps/worker` 需要和 `apps/web` 一样拿到奇门分析所需的模型密钥
4. `apps/worker` 启动后会自动写入 Redis 心跳，Vercel 上的奇门异步入口会据此判断 Worker 是否在线

推荐优先使用：

```bash
REDIS_URL=rediss://default:password@host:6379
```

如果你的 Redis 平台不提供 URL，也可以退回：

```bash
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true
```

---

## Railway 部署

### 新建服务

1. 在 Railway 中选择当前 GitHub 仓库
2. 新建一个独立服务专门跑 `apps/worker`
3. 服务工作目录保持仓库根目录

### Build Command

```bash
pnpm install --frozen-lockfile && pnpm --filter @repo/worker build
```

### Start Command

```bash
pnpm --filter @repo/worker start
```

### Railway 必填环境变量

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dbname

REDIS_URL=rediss://default:password@host:6379
# 如果不用 REDIS_URL，则改配 REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_TLS

ARK_API_KEY=your-ark-api-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-lite-260215

DASHSCOPE_API_KEY=
ZHIPU_API_KEY=
DEEPSEEK_API_KEY=
SILICONFLOW_API_KEY=
```

### Railway 启动成功的日志特征

启动成功后，日志里至少应看到：

- `启动 Worker 服务...`
- `所有 Workers 已启动`

如果奇门模块已有人触发，还应能看到：

- `处理奇门基础盘面任务`
- `处理奇门分块任务`

---

## Render 部署

### 新建服务

1. 在 Render 中选择当前 GitHub 仓库
2. Service Type 选择 `Background Worker`
3. Root Directory 保持仓库根目录

### Build Command

```bash
pnpm install --frozen-lockfile && pnpm --filter @repo/worker build
```

### Start Command

```bash
pnpm --filter @repo/worker start
```

### Render 必填环境变量

与 Railway 相同，至少包括：

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=rediss://default:password@host:6379
ARK_API_KEY=your-ark-api-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-lite-260215
```

如果还有图像、语音、视频等异步任务，也要把对应 API Key 一并配上。

---

## 上线后检查

### 检查 1：Worker 是否真的在线

触发一次奇门遁甲分析：

- 如果 Vercel 直接返回 `503`，说明 `apps/worker` 没启动或没连上同一个 Redis
- 如果能正常返回 `analysisId`，说明 Worker 心跳存在

### 检查 2：Redis 是否同源

如果 Web 和 Worker 连的不是同一个 Redis，会出现：

- Vercel 侧能入队
- Worker 日志里没有任何奇门任务
- 前端长时间显示 `pending`

### 检查 3：区域是否合理

建议三者尽量靠近：

- Vercel：`hkg1`
- Redis：香港 / 新加坡附近
- Worker：香港 / 新加坡附近

---

## 最小推荐方案

如果你想先快速稳定上线，推荐这一组：

- `apps/web`：Vercel
- `apps/worker`：Railway
- `Redis`：Upstash Redis
- `PostgreSQL`：Supabase / Neon

这样最容易排查，也最符合你现在仓库的结构。
