# AI-Aggregation 生产部署手册

> 目标：让人或大模型按本文**从零部署**到可登录注册的生产环境，并清楚哪些服务必须、哪些可选。  
> 最近一次生产验证：`2026-07-24`，部署 `Cw1eQYiViG7CB9RtYYUk9a3jLQbF` 状态 Ready，注册/登录/me 均 200。

---

## 0. 先读这 30 秒

| 服务 | 平台 | 是否阻塞登录注册 |
|------|------|------------------|
| Web（Next.js） | **Vercel** | **是** |
| PostgreSQL | Prisma Postgres / Supabase / Neon | **是** |
| Redis | Upstash | 否（登录不依赖；队列/部分异步能力需要） |
| BullMQ Worker | Railway / Render | 否（奇门异步等需要） |
| RTASR 实时语音网关 | Cloudflare Workers | 否（仅实时语音） |

**登录注册最小闭环 = Vercel Web + 可用 `DATABASE_URL` + `AUTH_SECRET` + 已执行 Prisma migrate。**

当前生产参考：

- 项目：https://vercel.com/weixiaoyus-projects/ai-aggregation-web
- 生产域名：https://ai-aggregation-web.vercel.app
- 仓库：`wxy-hh/ai-aggregation`（GitHub）
- 团队/Hobby 账号可用

---

## 1. 架构与目录（部署视角）

```
ai-aggregation/                 # monorepo 根（pnpm workspace + turbo）
├── apps/web                    # Next.js 15 → 部署到 Vercel
├── apps/worker                 # BullMQ 常驻进程 → 不能上 Vercel
├── packages/db                 # Prisma schema / migrate
├── packages/{shared,providers,queue,...}
├── infra/worker-rtasr          # Cloudflare Worker（实时语音 WS 网关）
├── apps/web/vercel.json        # Root Directory=apps/web 时使用
├── vercel.json                 # Root Directory=仓库根时使用
└── DEPLOYMENT.md               # 本文
```

包名（filter）：

- Web：`@repo/web`
- Worker：`@repo/worker`
- DB：`@repo/db`
- RTASR：`@repo/worker-rtasr`

---

## 2. 前置条件

### 2.1 本地工具

- Node.js **22.x**
- pnpm **10.x**
- Git
- 可选：`vercel` CLI、`wrangler`（Cloudflare）

```bash
node -v   # v22.x
pnpm -v   # 10.x
```

### 2.2 账号与云资源

1. **GitHub**：代码仓库已推送
2. **Vercel**：已登录，能导入该仓库
3. **PostgreSQL**（必选其一）
   - Prisma Postgres（`db.prisma.io`）
   - Supabase（建议 Pooler 连接串）
   - Neon
4. **Upstash Redis**（推荐，队列/缓存）
5. **各 AI Key**（按功能可选，见第 5 节）
6. **Cloudflare**（仅实时语音需要）

### 2.3 关键认知（容易踩坑）

1. **`vercel.json` 不能存密钥**。环境变量只能放在 Vercel Project → Settings → Environment Variables。
2. **改环境变量后必须 Redeploy** 才会进运行时。
3. monorepo 下 Prisma 原生引擎容易丢，本仓库已修：
   - `packages/db/prisma/schema.prisma`：`binaryTargets = ["native", "rhel-openssl-3.0.x"]`
   - `apps/web/next.config.ts`：`serverExternalPackages` + `PrismaPlugin` + `outputFileTracingIncludes`
4. Hobby 计划函数默认超时约 **60s**；命理接口代码里设了 `maxDuration=300`，完整分析可能仍超时，必要时升 Pro。
5. 本机 CLI 访问 `*.vercel.app` 可能因 DNS 污染失败；**以浏览器访问为准**。

---

## 3. Vercel 项目配置（权威）

### 3.1 推荐：Root Directory = `apps/web`

在 Vercel → Project → Settings → General：

| 项 | 值 |
|----|-----|
| Framework | Next.js |
| Root Directory | `apps/web` |
| Node.js Version | **22.x** |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Build Command | `cd ../.. && pnpm turbo build --filter=@repo/web` |
| Output Directory | `.next` |
| Region | `hkg1`（与 `apps/web/vercel.json` 一致） |

`apps/web/vercel.json` 内容应类似：

```json
{
  "regions": ["hkg1"],
  "buildCommand": "cd ../.. && pnpm turbo build --filter=@repo/web",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "outputDirectory": ".next",
  "functions": {
    "app/api/destiny/**/*.ts": {
      "maxDuration": 300
    }
  }
}
```

### 3.2 备选：Root Directory = 仓库根

使用根目录 `vercel.json`：

```json
{
  "regions": ["hkg1"],
  "buildCommand": "pnpm turbo build --filter=@repo/web",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next"
}
```

**不要混用两套 Root Directory 理解**；以 Dashboard 实际 Root Directory 为准。

### 3.3 构建期 Prisma

根 `package.json` 已有：

```json
{
  "scripts": {
    "postinstall": "pnpm db:generate",
    "db:generate": "pnpm --filter @repo/db generate",
    "db:migrate": "pnpm --filter @repo/db migrate"
  }
}
```

`pnpm install` 会触发 `postinstall → prisma generate`。  
**生产迁移不要指望 Vercel 自动 migrate**，见第 4 节。

---

## 4. 数据库（登录注册硬依赖）

### 4.1 准备 `DATABASE_URL`

要求：

- PostgreSQL 16 兼容
- 生产可用公网连接（Serverless 出网）
- **禁止** `host:5432`、`localhost`、内网不可达主机
- 推荐带 `?sslmode=require`

示例：

```bash
# Prisma Postgres
DATABASE_URL="postgres://USER:PASSWORD@db.prisma.io:5432/postgres?sslmode=require"

# Supabase Pooler
DATABASE_URL="postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Neon
DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"
```

### 4.2 执行迁移（必须）

在**本机**对生产库执行（不要用本地 docker 的 URL）：

```bash
cd /path/to/ai-aggregation
export DATABASE_URL='postgres://...生产连接串...'

# 生成 client（本地）
pnpm db:generate

# 生产迁移：用 deploy，不要用 migrate dev
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma

# 确认
pnpm --filter @repo/db exec prisma migrate status --schema prisma/schema.prisma
# 期望：Database schema is up to date!
```

登录相关表包括但不限于：`users`、`refresh_tokens`、配额相关表等。  
若 migrate 因历史脏数据失败，先查 `users.username IS NULL` 等约束冲突再修数据。

### 4.3 可选 seed

```bash
pnpm db:seed
```

生产是否 seed 视需要；**登录注册不依赖 seed**。

---

## 5. Vercel 环境变量清单

在 Vercel → Project → Settings → Environment Variables 配置。  
建议至少勾选 **Production**；需要预览环境再勾 Preview。

> 密钥不要写进 Git。下列值为**占位符**。

### 5.1 登录注册最小集（必填）

| 变量 | 示例/说明 | 必填 |
|------|-----------|------|
| `DATABASE_URL` | 生产 PostgreSQL 连接串 | **是** |
| `AUTH_SECRET` | `openssl rand -hex 32` 生成，**勿用** `dev-secret` | **是** |
| `ANONYMOUS_DEVICE_SALT` | `openssl rand -hex 16`，匿名设备指纹盐 | **是** |
| `NEXTAUTH_URL` | `https://ai-aggregation-web.vercel.app` | 是 |
| `NEXT_PUBLIC_APP_URL` | 同上（客户端可见） | 是 |

生成密钥：

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 16   # ANONYMOUS_DEVICE_SALT
openssl rand -hex 24   # BILLING_RECONCILE_SECRET / RTASR_GATEWAY_SECRET
```

### 5.2 Redis / 队列（推荐）

| 变量 | 说明 |
|------|------|
| `REDIS_HOST` | Upstash host |
| `REDIS_PORT` | 通常 `6379` |
| `REDIS_PASSWORD` | Upstash password |
| `REDIS_TLS` | 需要 TLS 时设 `true` |
| `REDIS_URL` | 可选，`rediss://...` 优先于拆分字段 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 若接了 Upstash 集成会自动注入 |
| `REDIS_KV_*` | Vercel Upstash 集成自动注入时可保留 |

### 5.3 AI 与业务（按功能）

| 变量 | 用途 |
|------|------|
| `DASHSCOPE_API_KEY` | 通义对话/图像 |
| `ZHIPU_API_KEY` | 智谱对话/视频 |
| `DEEPSEEK_API_KEY` | DeepSeek 对话 |
| `DEEPSEEK_MODEL` | 命理等指定 DeepSeek 模型名（**不是** API Key） |
| `ARK_API_KEY` | 豆包/火山方舟（对话/简历/命理） |
| `ARK_BASE_URL` | 如 `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_MODEL` | 默认对话模型 |
| `ARK_DESTINY_MODEL` | 命理专用模型 |
| `SILICONFLOW_API_KEY` | 硅基流动 / Kolors / SenseVoice |
| `SILICONFLOW_API_URL` | 如 `https://api.siliconflow.cn/v1` |
| `SILICONFLOW_DEFAULT_MODEL` | 如 `FunAudioLLM/SenseVoiceSmall` |
| `XUNFEI_API_PASSWORD` | 讯飞 |
| `XUNFEI_APP_ID` | 讯飞 AppId |
| `XUNFEI_API_KEY` | 讯飞 API Key |
| `XUNFEI_API_SECRET` | 讯飞 Secret（实时语音等） |
| `AGNES_API_KEY` | Agnes 图像/视频 |
| `AGNES_INFERENCE_API_URL` | Agnes 推理地址 |
| `BILLING_RECONCILE_SECRET` | 计费对账内部接口 |
| `RTASR_GATEWAY_SECRET` | 实时语音网关与 Web 共享密钥 |
| `NEXT_PUBLIC_RTASR_GATEWAY_URL` | **`wss://`** 生产网关地址（见第 7 节） |

### 5.4 可选 / 未配也能登录

| 变量 | 说明 |
|------|------|
| `WECHAT_*` / `QQ_*` | OAuth 登录，本地也常未配 |
| `S3_*` / `OSS_*` | 对象存储；反馈附件等 |
| `ALLOWED_FILE_TYPES` / `MAX_FILE_SIZE` / `TEMP_UPLOAD_DIR` | 上传限制 |

### 5.5 批量粘贴方式

Vercel 支持「Add Environment Variable」→ **Import .env** 或把：

```bash
KEY=value
```

粘贴到 Key 输入框解析。  
**已存在同名变量会 `ENV_CONFLICT`**，需先编辑/删除再导入。

### 5.6 当前生产已验证存在的关键项（2026-07-24）

`DATABASE_URL`、`AUTH_SECRET`、`ANONYMOUS_DEVICE_SALT`、`NEXTAUTH_URL`、`NEXT_PUBLIC_APP_URL`、  
`ARK_*`、`DEEPSEEK_*`、`DASHSCOPE_API_KEY`、`ZHIPU_API_KEY`、`AGNES_*`、  
`SILICONFLOW_*`、`XUNFEI_*`、`REDIS_*` / Upstash 集成变量、  
`BILLING_RECONCILE_SECRET`、`RTASR_GATEWAY_SECRET` 等。

---

## 6. 部署 Web 到 Vercel

### 6.1 Dashboard（推荐）

1. Import Git Repository → `wxy-hh/ai-aggregation`
2. 按第 3 节配置 Root Directory / Build
3. 按第 5 节填环境变量
4. Deploy
5. 本机对生产库执行 **migrate deploy**（第 4 节）
6. 若 env 是部署后才改的 → **Redeploy** 最新 Production

### 6.2 CLI

```bash
npm i -g vercel
vercel login
# 在仓库根或 apps/web 链接项目后：
vercel --prod
```

### 6.3 Git 推送自动部署

- 默认 `master`/`main` → Production
- 若 `git push` 因网络失败，可用 GitHub API 推送，或 Dashboard Redeploy

### 6.4 Prisma monorepo 修复（已入库，勿回退）

出过的故障：`Prisma Client` / Query Engine 在 Vercel 上缺失 → 登录注册 500。

必须保留：

1. `packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}
```

2. `apps/web/next.config.ts` 中：
   - `serverExternalPackages: ['@prisma/client', 'prisma']`
   - `outputFileTracingIncludes` 包含 pnpm 下 `.prisma/client`
   - server webpack `PrismaPlugin`（`@prisma/nextjs-monorepo-workaround-plugin`）
   - 插件无类型时用 `@ts-expect-error`，避免构建失败

相关提交主题：

- `fix(web): 修复 Vercel 上 Prisma Query Engine 缺失导致登录注册失败`
- `fix(web): 修复 monorepo 下 Vercel 丢失 Prisma Query Engine`
- `fix(web): 为 Prisma monorepo 插件补充类型忽略`

---

## 7. 实时语音网关（Cloudflare Worker，可选）

代码：`infra/worker-rtasr`，Worker 名：`rtasr-gateway`。

### 7.1 登录与子域名

```bash
cd infra/worker-rtasr
pnpm exec wrangler login
pnpm exec wrangler whoami
```

首次账号可能需要注册 `workers.dev` 子域名（API 示例）：

```bash
# 账号 ID 以 wrangler whoami 为准
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/subdomain" \
  -H "Authorization: Bearer <OAUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"subdomain":"wxy-ai-agg"}'
```

当前已注册示例子域名：`wxy-ai-agg`。

### 7.2 Secrets 与部署

```bash
cd infra/worker-rtasr
pnpm exec wrangler secret put XUNFEI_APP_ID
pnpm exec wrangler secret put XUNFEI_API_KEY
pnpm exec wrangler secret put RTASR_GATEWAY_SECRET   # 与 Vercel 同值
# 生产计费回源
pnpm exec wrangler secret put BILLING_API_URL
# 或使用 wrangler.toml [vars] / dashboard 设置：
# BILLING_API_URL=https://ai-aggregation-web.vercel.app

pnpm deploy
# 得到 https://rtasr-gateway.<subdomain>.workers.dev
```

### 7.3 回写 Vercel

```bash
# 代码使用 WebSocket，必须是 wss://
NEXT_PUBLIC_RTASR_GATEWAY_URL=wss://rtasr-gateway.<subdomain>.workers.dev
```

改完 **Redeploy** Web。  
本地默认 `ws://localhost:8787`，不要原样上生产。

---

## 8. BullMQ Worker（可选，异步任务）

`apps/worker` **不能**部署到 Vercel。详见：`apps/worker/DEPLOY.md`。

摘要：

- 平台：Railway / Render / 任意常驻 Node
- Start：`pnpm --filter @repo/worker start`
- 与 Web **同一** `DATABASE_URL` + Redis
- 需要奇门异步时，Worker 心跳必须在线，否则 Web 可能 503

```bash
# 构建
pnpm install --frozen-lockfile && pnpm --filter @repo/worker build
# 启动
pnpm --filter @repo/worker start
```

---

## 9. 部署后验收（大模型请按序执行）

### 9.1 部署是否 Ready

浏览器打开 Vercel Deployments，确认最新 Production = **Ready**。

### 9.2 登录注册 API（权威验收）

在**能访问生产域名的环境**（优先浏览器 DevTools / Playwright 同源）执行：

```js
const base = 'https://ai-aggregation-web.vercel.app';
const username = 'verify_' + Date.now();
const password = 'Test123456!';

// 1) 注册
await fetch(base + '/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password, name: 'verify' }),
}).then(r => r.json());
// 期望 success: true, status 200

// 2) 登录
const login = await fetch(base + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
}).then(r => r.json());
// 期望 data.accessToken

// 3) me
await fetch(base + '/api/auth/me', {
  headers: { Authorization: 'Bearer ' + login.data.accessToken },
}).then(r => r.json());
// 期望 success: true
```

**通过标准：register/login/me 均为 HTTP 200 且 `success: true`。**

### 9.3 页面

- https://ai-aggregation-web.vercel.app/login 可打开
- 已登录会话访问 `/login` 可能跳到 `/home`（正常）

### 9.4 数据库

```bash
export DATABASE_URL='...生产...'
pnpm --filter @repo/db exec prisma migrate status --schema prisma/schema.prisma
# Database schema is up to date!
```

### 9.5 常见失败对照

| 现象 | 原因 | 处理 |
|------|------|------|
| 注册/登录 500，日志 Prisma engine / Query Engine | monorepo 引擎未打进产物 | 确认 binaryTargets + PrismaPlugin + Redeploy |
| 注册/登录 500，`host:5432` / P1001 | `DATABASE_URL` 无效 | 改成可达生产库并 Redeploy |
| 注册 500，列/表不存在 | 未 migrate | `prisma migrate deploy` |
| 改了 env 仍旧行为 | 未 Redeploy | Deployments → Redeploy |
| 本地 curl 连不上 vercel.app | DNS/网络污染 | 用浏览器验证 |
| 导入 env 报 ENV_CONFLICT | 变量已存在 | 搜索后编辑，勿重复 Add |
| `/api/chat` 一直转圈/无响应（登录正常） | Redis 不可达 + ioredis offline queue 无限排队 | 已修：短超时、关闭 offline queue、限流 2.5s 放行；确认 `REDIS_URL`/`REDIS_HOST` 为 Upstash 且 `REDIS_TLS=true` |
| 命理超时 | Hobby 60s / 长任务 | 升 Pro 或拆异步 + Worker |
| 实时语音连不上 | 未部署 Worker 或 URL 非 wss | 第 7 节 |
| `vercel deploy` 报 daemon.sock / error -102 | 本地 `.codegraph` 被打包 | 确保 `.vercelignore` 含 `.codegraph*` |

---

## 10. 给大模型的标准执行清单（Checklist）

复制下列清单逐步做；**未勾选完成前不要声称部署成功**。

```text
[ ] 1. 确认仓库最新代码含 Prisma monorepo 修复（binaryTargets + next.config PrismaPlugin）
[ ] 2. Vercel 项目 Root Directory / Install / Build / Node 22 按第 3 节配置
[ ] 3. 准备生产 DATABASE_URL（非 localhost，可公网，建议 sslmode=require）
[ ] 4. 本地对生产库执行：prisma migrate deploy，status 为 up to date
[ ] 5. Vercel 写入最小 env：DATABASE_URL, AUTH_SECRET, ANONYMOUS_DEVICE_SALT,
       NEXTAUTH_URL, NEXT_PUBLIC_APP_URL（生产域名）
[ ] 6. 按需写入 AI / Redis / 讯飞等变量（第 5 节）
[ ] 7. Trigger Production Deploy / Redeploy，等待 Ready
[ ] 8. 浏览器侧执行 register → login → me，全部 200
[ ] 9. （可选）部署 apps/worker 到 Railway/Render，共享 Redis/DB
[ ] 10.（可选）wrangler login → 注册 workers.dev → deploy rtasr-gateway
             → 设置 NEXT_PUBLIC_RTASR_GATEWAY_URL=wss://... → Redeploy Web
[ ] 11. 更新本文件「最近验证」日期与部署 ID（若有变更）
```

### 10.1 大模型禁止事项

- 不要把真实 API Key / `DATABASE_URL` 密码写进 Git 或文档正文
- 不要对生产库执行 `migrate reset` / 随意 `db push` 除非用户明确要求
- 不要在未确认 Cloudflare 登录时假装 RTASR 已上线
- 不要因为本机 curl 失败就断定 Vercel 挂了——先浏览器验证
- 不要修改 `AUTH_SECRET` 后期望旧 refresh token 仍可用（会话会失效）

---

## 11. 常用命令速查

```bash
# 依赖与 Prisma
pnpm install
pnpm db:generate
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @repo/db exec prisma migrate status --schema prisma/schema.prisma

# 本地开发
pnpm dev                 # 智能启动 web + worker + rtasr
pnpm dev:web
pnpm dev:worker
pnpm dev:rtasr

# 构建
pnpm turbo build --filter=@repo/web

# Cloudflare RTASR
cd infra/worker-rtasr && pnpm exec wrangler whoami && pnpm deploy

# 密钥
openssl rand -hex 32
```

---

## 12. 相关文档

| 文档 | 内容 |
|------|------|
| `DEPLOYMENT.md` | 本文：生产部署权威说明（含 Vercel + Docker 自部署） |
| `apps/worker/DEPLOY.md` | BullMQ Worker 部署 |
| `docs/voice-realtime-setup.md` | 实时语音本地与生产 |
| `docs/quick-start-cloud.md` | 本地用免费云服务开发 |
| `apps/web/.env.example` | 环境变量模板 |
| `CLAUDE.md` | 项目结构与开发规范 |

---

## 13. 最近生产验证记录

| 日期 | 部署 | 结果 |
|------|------|------|
| 2026-07-24 | `dpl_DMvV6fJJWxeUpNzJnM46xTevZ8pb` Ready | **chat 修复**：xunfei/doubao SSE 200 且返回 `text-delta`；根因 Redis 挂起 |
| 2026-07-24 | `Cw1eQYiViG7CB9RtYYUk9a3jLQbF` Ready | register/login/me **200**；migrate **up to date**；生产库 Prisma Postgres |
| 2026-07-24 | 环境变量 | 登录最小集 + 主流 AI/Redis/讯飞均已配置；重复导入返回 ENV_CONFLICT |
| 2026-07-24 | Cloudflare | wrangler 已登录；workers.dev 子域名 `wxy-ai-agg` 已注册；RTASR 生产 URL 可按第 7 节继续 |
| 2026-08-22 | Docker 自部署（腾讯云 124.223.40.33） | **部署成功**：https://www.chunfen.ink 正常访问；修复 Dockerfile pnpm postinstall 冲突、Prisma 路径、容器网络、SSL 证书 |

Vercel 生产地址：https://ai-aggregation-web.vercel.app
Docker 生产地址：https://www.chunfen.ink  
Vercel 项目：https://vercel.com/weixiaoyus-projects/ai-aggregation-web
---

## 14. Docker 自部署（腾讯云 / 自建服务器）

> 适用于将项目部署到自有 Linux 服务器（腾讯云轻量、阿里云 ECS 等），使用 Docker Compose 运行全部服务。

### 14.1 架构概览

```
用户浏览器
    │
    ▼ HTTPS (443)
┌──────────────┐
│  Nginx       │  SSL 终止 + 反向代理
│  (ai-nginx)  │
└──────┬───────┘
       │ HTTP (3000)
┌──────▼───────┐
│  Web         │  Next.js standalone
│  (ai-web)    │
└──┬───────┬───┘
   │       │
   ▼       ▼
┌──────┐ ┌──────┐
│ PG   │ │Redis │
└──────┘ └──────┘
```

> 生产服务器信息已记录在 `infra/docker/server-info.md`（本地文件，不提交到仓库）。

### 14.2 服务器要求

| 项目 | 最低要求 | 推荐 |
|------|----------|------|
| 操作系统 | Ubuntu 22.04+ | Ubuntu 24.04 LTS |
| CPU | 2 核 | 4 核 |
| 内存 | 2 GB | 4 GB |
| 磁盘 | 20 GB | 40 GB+（Docker 镜像较大） |
| 网络 | 开放 80、443、22 端口 | — |

### 14.3 服务器初始化（首次）

#### 1）安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录生效，或执行 newgrp docker

# 验证
docker --version          # Docker version 24+
docker compose version    # Docker Compose v2+
```

#### 2）安装 Node.js（仅用于数据库迁移）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
sudo npm install -g pnpm@10
```

#### 3）停止系统自带 Nginx（如有）

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
```

### 14.4 上传代码到服务器

#### 方式 A：通过 Git 拉取（推荐）

```bash
ssh ubuntu@<服务器IP>
cd ~
git clone https://gitee.com/bit-xiaoyu/ai-aggregation.git
# 或
git clone https://github.com/wxy-hh/ai-aggregation.git
```

#### 方式 B：打包上传

```bash
# 本地打包（排除无关文件）
cd /path/to/ai-aggregation
tar -czf /tmp/ai-aggregation-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='.git' \
  --exclude='.codegraph' \
  .

# 上传到服务器
scp /tmp/ai-aggregation-deploy.tar.gz ubuntu@<服务器IP>:~/

# 服务器上解压
ssh ubuntu@<服务器IP>
cd ~
mkdir -p ai-aggregation && cd ai-aggregation
tar -xzf ~/ai-aggregation-deploy.tar.gz
```

### 14.5 配置环境变量

```bash
cd ~/ai-aggregation/infra/docker
cp .env.prod.example .env.prod
vim .env.prod
```

**必须修改的字段：**

```bash
# ---------- 数据库 ----------
DATABASE_URL="postgresql://postgres:postgres@ai-aggregation-postgres:5432/ai_aggregation"

# ---------- Redis ----------
REDIS_HOST="ai-aggregation-redis"
REDIS_PORT="6379"
REDIS_PASSWORD=""

# ---------- 应用地址（改为你的域名）----------
NEXTAUTH_URL="https://www.your-domain.com"
NEXT_PUBLIC_APP_URL="https://www.your-domain.com"

# ---------- 安全密钥（务必修改默认值）----------
AUTH_SECRET="$(openssl rand -hex 32)"
ANONYMOUS_DEVICE_SALT="$(openssl rand -hex 16)"

# ---------- AI 服务商 Key（按需填写）----------
# 豆包（命理分析主力）
ARK_API_KEY="你的火山方舟 Key"
ARK_MODEL="doubao-seed-2-0-lite-260428"
ARK_DESTINY_MODEL="doubao-seed-2-1-pro-260628"

# DeepSeek（命理备选，Key 存在 DEEPSEEK_MODEL 变量中）
DEEPSEEK_MODEL="sk-xxxxxxxx"

# 讯飞（语音转写）
XUNFEI_API_KEY="你的讯飞 Key"
XUNFEI_API_SECRET="你的讯飞 Secret"
XUNFEI_APP_ID="你的讯飞 App ID"
XUNFEI_API_PASSWORD="你的讯飞密码"

# 硅基流动（语音模型）
SILICONFLOW_API_KEY="你的硅基流动 Key"
```

> **注意**：数据库和 Redis 的地址使用 Docker 容器名（`ai-aggregation-postgres`、`ai-aggregation-redis`），不是 `127.0.0.1`。容器间通过 Docker 网络通信。

### 14.6 首次部署

```bash
cd ~/ai-aggregation/infra/docker

# 1. 启动基础设施（PostgreSQL + Redis）
docker compose up -d postgres redis

# 2. 等待数据库就绪（约 10 秒）
sleep 10

# 3. 执行数据库迁移
cd ~/ai-aggregation
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma

# 4. 回到 docker 目录构建并启动
cd infra/docker

# 构建镜像（首次约 10-15 分钟，后续有缓存会快很多）
docker compose -f docker-compose.prod.yml build

# 启动全部服务
docker compose -f docker-compose.prod.yml up -d
```

### 14.7 配置 SSL 证书（HTTPS）

#### 1）申请证书

```bash
# 安装 certbot
sudo apt-get update && sudo apt-get install -y certbot

# 先停止占用 80 端口的服务
docker stop ai-nginx

# 申请证书（替换为你的域名）
sudo certbot certonly --standalone \
  -d www.your-domain.com \
  --non-interactive \
  --agree-tos \
  --email admin@your-domain.com

# 证书文件位置
# /etc/letsencrypt/live/www.your-domain.com/fullchain.pem
# /etc/letsencrypt/live/www.your-domain.com/privkey.pem
```

#### 2）将证书复制到 Docker 可访问的位置

```bash
cd ~/ai-aggregation/infra/docker

# 创建目录并复制证书
sudo mkdir -p certbot/conf/live/www.your-domain.com
sudo cp /etc/letsencrypt/archive/www.your-domain.com/cert1.pem \
  certbot/conf/live/www.your-domain.com/cert.pem
sudo cp /etc/letsencrypt/archive/www.your-domain.com/chain1.pem \
  certbot/conf/live/www.your-domain.com/chain.pem
sudo cp /etc/letsencrypt/archive/www.your-domain.com/fullchain1.pem \
  certbot/conf/live/www.your-domain.com/fullchain.pem
sudo cp /etc/letsencrypt/archive/www.your-domain.com/privkey1.pem \
  certbot/conf/live/www.your-domain.com/privkey.pem

# 修正权限
sudo chown -R ubuntu:ubuntu certbot/
```

#### 3）修改 nginx.conf 启用 SSL

编辑 `infra/docker/nginx.conf`，找到以下注释并取消注释：

```nginx
# 替换 server_name
server_name www.your-domain.com;

# 取消 SSL 配置注释
listen 443 ssl http2;
ssl_certificate     /etc/letsencrypt/live/www.your-domain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/www.your-domain.com/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;

# 启用 HTTP → HTTPS 跳转（取消注释整个 server 块）
server {
    listen 80;
    server_name www.your-domain.com;
    return 301 https://$host$request_uri;
}
```

同时将所有 `proxy_pass http://web:3000` 替换为 `proxy_pass http://ai-web:3000`。

#### 4）重启 Nginx

```bash
docker start ai-nginx
```

#### 5）设置证书自动续签

```bash
# 测试续签
sudo certbot renew --dry-run

# certbot 已自动创建 systemd timer，通常无需额外配置
# 如需手动添加 cron：
# echo "0 3 * * * certbot renew --quiet && docker restart ai-nginx" | sudo crontab -
```

### 14.8 日常更新部署

本地改完代码后，有两种方式部署到服务器。**推荐方式一**。

---

#### 方式一：服务器直接 Git 拉取（推荐）

适用于服务器已配置 Git 远程仓库的场景，操作最简单。

**步骤 1：本地提交并推送代码**

```bash
# 在本地项目根目录
git add .
git commit -m "feat: 你改了什么"
git push origin master
```

**步骤 2：SSH 登录服务器**

```bash
ssh ubuntu@124.223.40.33
# 输入密码：woaini2244.
```

**步骤 3：拉取最新代码**

```bash
cd ~/ai-aggregation
git pull origin master
```

> **常见问题：git pull 报错 "Your local changes would be overwritten"**
>
> 如果服务器上有未提交的本地修改（如 Dockerfile），拉取会失败：
> ```
> error: Your local changes to the following files would be overwritten by merge:
>         apps/web/Dockerfile
>         apps/worker/Dockerfile
> ```
>
> **解决方案**（推荐丢弃本地修改，用仓库版本）：
> ```bash
> # 丢弃指定文件的本地修改
> git checkout -- apps/web/Dockerfile apps/worker/Dockerfile
>
> # 重新拉取
> git pull origin master
> ```
>
> **如果本地修改需要保留**：
> ```bash
> git stash
> git pull origin master
> git stash pop
> ```

**步骤 4：处理依赖和数据库变更（按需执行）**

```bash
# 如果 package.json 新增了依赖包，执行：
pnpm install --frozen-lockfile

# 如果修改了 Prisma schema（数据库表结构），执行：
pnpm db:generate
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma
```

> 没改依赖和数据库就跳过这一步。

**步骤 5：重新构建镜像并重启容器**

```bash
cd ~/ai-aggregation/infra/docker

# 构建新镜像（有缓存约 2-3 分钟，无缓存约 10-15 分钟）
docker compose -f docker-compose.prod.yml build web

# 强制重建容器，确保新代码生效
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx web
```

**步骤 6：验证部署**

```bash
# 检查容器状态（4 个容器都应为 Up）
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 查看 Web 日志确认无报错
docker logs ai-web --tail 20

# 浏览器访问 https://www.chunfen.ink 确认功能正常
```

**一行命令版（熟练后可用）：**

```bash
cd ~/ai-aggregation && git pull origin master && cd infra/docker && docker compose -f docker-compose.prod.yml build web && docker compose -f docker-compose.prod.yml up -d --force-recreate nginx web
```

---

#### 方式二：本地打包上传（不用 Git）

适用于服务器不方便联网拉代码、或想精确控制上传内容的场景。

**步骤 1：本地打包代码**

```bash
# 在本地项目根目录执行
tar -czf /tmp/ai-agg-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='.git' \
  --exclude='.codegraph' \
  .
```

**步骤 2：上传到服务器**

```bash
sshpass -p 'woaini2244.' scp -P 22 \
  /tmp/ai-agg-deploy.tar.gz \
  ubuntu@124.223.40.33:~/ai-aggregation/
```

**步骤 3：SSH 到服务器解压**

```bash
sshpass -p 'woaini2244.' ssh ubuntu@124.223.40.33
cd ~/ai-aggregation
tar -xzf ai-agg-deploy.tar.gz
rm ai-agg-deploy.tar.gz
```

**步骤 4：处理依赖和数据库变更（按需执行）**

```bash
# 如果 package.json 新增了依赖包，执行：
pnpm install --frozen-lockfile

# 如果修改了 Prisma schema（数据库表结构），执行：
pnpm db:generate
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma
```

**步骤 5：重新构建镜像并重启容器**

```bash
cd ~/ai-aggregation/infra/docker

# 构建新镜像
docker compose -f docker-compose.prod.yml build web

# 强制重建容器
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx web
```

**步骤 6：验证部署**

```bash
# 检查容器状态
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 查看 Web 日志
docker logs ai-web --tail 20

# 浏览器访问 https://www.chunfen.ink 确认功能正常
```

---

#### 两种方式对比

| | 方式一：Git Pull（推荐） | 方式二：本地打包上传 |
|--|--|--|
| 操作步骤 | 6 步 | 6 步 |
| 本地操作 | git push（1 条命令） | tar 打包 + scp 上传（2 条命令） |
| 服务器操作 | git pull（1 条命令） | scp 接收 + tar 解压（2 条命令） |
| 速度 | 最快，增量拉取 | 需要全量打包和传输 |
| 依赖条件 | 服务器有 git 权限 | 不需要，只要有 sshpass |
| 适合场景 | 日常开发迭代 | 服务器无外网 git 访问权限 |

> **提示**：`--force-recreate` 确保新的环境变量和镜像生效。如果不修改 `.env.prod` 且只是重启，可以用 `docker compose -f docker-compose.prod.yml restart nginx web` 代替。

### 14.9 常用运维命令

```bash
# 查看服务状态
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 查看日志（实时跟踪）
docker logs -f ai-web      # Web 应用日志
docker logs -f ai-nginx    # Nginx 访问/错误日志

# 进入容器调试
docker exec -it ai-web sh
docker exec -it ai-nginx sh

# 重启单个服务
docker restart ai-web

# 停止全部服务
cd ~/ai-aggregation/infra/docker
docker compose -f docker-compose.prod.yml down

# 启动全部服务
docker compose -f docker-compose.prod.yml up -d

# 查看磁盘使用
docker system df
```

### 14.10 常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| Nginx 502 Bad Gateway | Web 容器未启动或崩溃 | `docker logs ai-web` 查看报错 |
| Nginx 报 `host not found in upstream` | 容器名不对或未在同一网络 | 确认 `proxy_pass` 用 `ai-web`，且容器在 `docker_ai-net` |
| Web 容器 `ECONNREFUSED 127.0.0.1:6379` | `.env.prod` 中 REDIS_HOST 用了 `127.0.0.1` | 改为 `ai-aggregation-redis`，然后 `--force-recreate` |
| Web 容器 `ECONNREFUSED 127.0.0.1:5432` | `.env.prod` 中 DATABASE_URL 用了 `127.0.0.1` | 改为 `ai-aggregation-postgres`，然后 `--force-recreate` |
| Docker build 报 `postinstall` 错误 | 根 `package.json` 有 `postinstall` 脚本 | 删除该脚本：`python3 -c "import json; ..."` 或在 Dockerfile 加 `--ignore-scripts` |
| Docker build 报 `.prisma` not found | pnpm 模块结构导致 Prisma 文件不在预期路径 | Dockerfile 中用 `COPY --from=base /app/node_modules ./node_modules` 复制整个目录 |
| HTTPS 证书报错 | 证书文件未挂载到容器 | 将 `/etc/letsencrypt/archive/` 下的文件复制到 `infra/docker/certbot/conf/` |
| 端口 80 被占用 | 系统自带 nginx 未停止 | `sudo systemctl stop nginx && sudo systemctl disable nginx` |
| 容器 unhealthy 但服务正常 | Next.js standalone 监听方式导致 wget 检查失败 | 可忽略，实际服务通过 nginx 代理正常工作 |
| `git pull` 后构建失败 | 本地 Dockerfile 修改未同步 | 确认 `apps/web/Dockerfile` 和 `apps/worker/Dockerfile` 内容正确 |

### 14.11 数据库管理

```bash
# 查看迁移状态
pnpm --filter @repo/db exec prisma migrate status --schema prisma/schema.prisma

# 连接数据库（直接操作）
docker exec -it ai-aggregation-postgres psql -U postgres -d ai_aggregation

# 常用 psql 命令
\dt              # 列出所有表
\du              # 列出所有用户
SELECT count(*) FROM users;   # 查询用户数
```

### 14.12 备份与恢复

```bash
# 备份数据库
docker exec ai-aggregation-postgres pg_dump -U postgres ai_aggregation > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260822.sql | docker exec -i ai-aggregation-postgres psql -U postgres -ai_aggregation
```

### 14.13 部署验证清单

```text
[ ] 1. docker ps 显示 4 个容器运行中：ai-nginx, ai-web, ai-aggregation-postgres, ai-aggregation-redis
[ ] 2. curl -s -o /dev/null -w '%{http_code}' http://localhost → 301（跳转 HTTPS）
[ ] 3. curl -s -o /dev/null -w '%{http_code}' https://你的域名 → 200
[ ] 4. 浏览器访问 https://你的域名/home → 页面正常加载
[ ] 5. 注册 → 登录 → 查看个人中心 → 全部正常
[ ] 6. AI 对话功能正常（豆包/DeepSeek）
[ ] 7. docker logs ai-web 无报错
[ ] 8. SSL 证书有效（浏览器地址栏显示锁图标）
```

### 14.14 环境变量说明

| 变量 | 用途 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | ✅ |
| `REDIS_HOST` | Redis 地址 | ✅ |
| `REDIS_PORT` | Redis 端口 | ✅ |
| `AUTH_SECRET` | NextAuth 加密密钥 | ✅ |
| `ANONYMOUS_DEVICE_SALT` | 匿名用户设备指纹盐 | ✅ |
| `NEXTAUTH_URL` | NextAuth 回调地址 | ✅ |
| `NEXT_PUBLIC_APP_URL` | 前端可见的应用地址 | ✅ |
| `ARK_API_KEY` | 火山方舟 API Key（豆包） | 命理分析需要 |
| `DEEPSEEK_MODEL` | DeepSeek API Key（存错变量名） | 命理分析备选 |
| `ZHIPU_API_KEY` | 智谱 API Key | 视频生成需要 |
| `XUNFEI_API_KEY` / `SECRET` | 讯飞 API | 语音转写需要 |
| `SILICONFLOW_API_KEY` | 硅基流动 API Key | 语音模型需要 |
| `AGNES_API_KEY` | Agnes 图像 API | 图像生成需要 |

> **注意**：`DEEPSEEK_API_KEY` 在代码中未使用。DeepSeek 的 Key 实际存储在 `DEEPSEEK_MODEL` 变量中（`packages/shared/src/destiny-model-client.ts`）。
