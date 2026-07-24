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
| `DEPLOYMENT.md` | 本文：生产部署权威说明 |
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

生产地址：https://ai-aggregation-web.vercel.app  
Vercel 项目：https://vercel.com/weixiaoyus-projects/ai-aggregation-web
