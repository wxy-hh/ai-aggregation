---
name: deploy-prod
description: 部署生产（上线/发版）。当用户想把当前分支部署到生产环境、说「部署到生产」「上线」「发版」「发布到 chunfen.ink」或排查刚上线的生产问题时使用。生产环境为腾讯云 Docker 部署（https://www.chunfen.ink，DEPLOYMENT.md §14），本技能完成 推送→服务器拉代码→按需迁移→重建容器→验收→记录 全流程。注意：Vercel 部署（§3-§9）不适用本技能。
metadata:
  version: "1.0.0"
  date: "2026-10-15"
---

# deploy-prod — 当前分支部署生产

生产 = 腾讯云 Docker 部署（`https://www.chunfen.ink`，DEPLOYMENT.md §14）。权威细节、排障对照表、首次部署都不在本文，按需读 DEPLOYMENT.md §14.8（日常更新）与 §14.10（故障对照）；本文只固定操作顺序与每步的完成标准。

开始前确认 `infra/docker/server-info.md` 存在（服务器 SSH 密码的唯一来源，不入 git）；缺失则停下来问用户。

## 1. 预检与发布确认

收集并向用户汇报，**拿到继续确认前不动生产**：

- 当前分支与 `git status`（有未提交改动 → 先提醒提交，见 git-sync.sh）
- 相对已部署状态的差异：`git log origin/<分支>..HEAD --oneline`（首次可先 `git fetch`）
- 本次是否改了 `packages/db/prisma/schema.prisma`（→ 步骤 4 需迁移）
- 本次是否改了 `package.json` / `pnpm-lock.yaml`（→ 步骤 4 需装依赖）
- 本次代码是否新增/改名环境变量（对比 `.env.prod.example`；有 → 提醒用户先改服务器 `.env.prod`，**改前备份** `.env.prod.bak.$(date +%Y%m%d)`）
- 当前分支 ≠ `master` 时明确告知：服务器将切换检出到该分支

完成标准：发布摘要（分支、提交数、schema/依赖/env 是否变更）已输出，用户确认继续。

## 2. 推送当前分支到 Gitee

```bash
git push origin <当前分支>
```

完成标准：`git rev-parse HEAD` 与 `git ls-remote origin <分支>` 一致。

## 3. 服务器更新代码

SSH 密码从 `infra/docker/server-info.md` 运行时读取（按 §14.8 方式二的 sshpass 写法），不要复述到输出。

```bash
ssh ubuntu@124.223.40.33
cd ~/ai-aggregation
git fetch origin
git checkout <当前分支>
git reset --hard origin/<当前分支>
```

`git pull` 报 "local changes would be overwritten" → 按 DEPLOYMENT.md §14.8：优先 `git checkout -- <文件>` 丢弃本地修改，需要保留才 `stash`。

完成标准：服务器 `git rev-parse HEAD` 与本地 HEAD 一致。

## 4. 按需处理依赖与数据库（无变更则明确跳过）

```bash
# 依赖变更时：
pnpm install --frozen-lockfile

# schema 变更时（Prisma CLI 不读 .env.prod，必须显式 export，容器名替换为 localhost）：
export DATABASE_URL="$(grep '^DATABASE_URL' infra/docker/.env.prod | head -1 | cut -d'=' -f2- | tr -d '"' | sed 's/ai-aggregation-postgres/localhost/')"
pnpm db:generate
pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma
```

完成标准：执行的命令全部零退出，且 `prisma migrate status` 输出 `up to date`；只在对生产库做 `migrate deploy`，**不做** `migrate reset` / `db push`。

## 5. 重建镜像并重启容器

```bash
cd ~/ai-aggregation/infra/docker
docker compose -f docker-compose.prod.yml build web
# 若 apps/worker 或其依赖包有变更，同时 build worker（奇门异步依赖 worker 心跳）
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx web
```

完成标准：build 与 up 零退出，`docker ps` 显示 ai-nginx / ai-web / ai-aggregation-postgres / ai-aggregation-redis 全部 Up。

## 6. 验收

逐项执行，全绿才算发布成功：

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'  # 4 容器 Up，ai-web healthy
docker logs ai-web --tail 20                        # 无报错
```

再验证 HTTP：本机 curl 不通 ≠ 部署失败（DNS 污染），**以浏览器验证为准**。

- `https://www.chunfen.ink`、`/home`、`/login` → 200
- `http://` 访问 → 301 跳 HTTPS（Secure Cookie 依赖，见 §14.7 血泪教训）
- 注册 → 登录 → me 三个接口 200 且 `success: true`（脚本见 DEPLOYMENT.md §9.2，注意线上已注册的账号不能直接复用注册断言，用 `verify_<时间戳>` 新账号）

完成标准：以上全部通过；任何一项红 → 按 DEPLOYMENT.md §14.10 排障，修复后重新复验，未全绿不得声称发布成功。

## 7. 收尾记录

在 DEPLOYMENT.md §13「最近生产验证记录」表首行追加：日期、分支+提交、变更类型（schema/依赖/env 是否有变）、构建耗时、验收结果。然后向用户汇报发布摘要。

完成标准：记录行已写入，用户收到摘要。
