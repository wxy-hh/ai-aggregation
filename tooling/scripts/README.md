# 工具脚本

## init.sh

初始化项目，包括：
- 检查环境依赖
- 安装 npm 包
- 启动 Docker 服务
- 初始化数据库
- 创建环境变量文件

```bash
bash tooling/scripts/init.sh
```

## clean.sh

清理项目，删除所有 node_modules、构建产物等。

```bash
bash tooling/scripts/clean.sh
```

## dev.mjs

本地开发启动脚本，包括：
- 加载 `apps/web/.env.local` 作为 Web 与 Worker 共享环境
- 输出关键环境状态（仅显示 `SET/UNSET`，不打印真实密钥）
- 检查本机 `Redis` 是否可用
- 若检测到本地 `redis-server`，则尝试后台启动
- 若检测到 Homebrew 已安装 `redis`，则尝试 `brew services start redis`
- 若本机安装了 Docker，则可回退执行 `docker compose up -d redis`
- 启动前清理旧的 `turbo dev` / `worker tsx` 进程，避免多套进程抢任务
- 启动 `@repo/web` 与 `@repo/worker` 的开发进程

```bash
pnpm dev
```

推荐只使用根目录 `pnpm dev` 启动本地联调，不要并行手工执行 `pnpm dev:web` 与 `pnpm dev:worker`。

## qimen-check.mjs

奇门链路本地自检脚本：
- 先请求 `/api/destiny/qimen/analyze/start`
- 再轮询 `/api/destiny/qimen/analyze/sections/baseResult`
- 若失败，直接输出状态与错误信息

```bash
pnpm qimen:check
```

## 基础设施命令

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

适合团队协作、联调和更贴近生产的本地环境。

## 使用前

确保脚本有执行权限：

```bash
chmod +x tooling/scripts/*.sh
```
