#!/usr/bin/env bash
# ============================================================
# AI-Aggregation 腾讯云一键部署（本地执行入口）
#
# 用法（在仓库根目录执行）:
#   bash infra/docker/deploy-prod.sh                # 智能增量部署（按变更构建 web/worker）
#   bash infra/docker/deploy-prod.sh --rebuild-all   # 无视变更全量重建 web+worker
#   bash infra/docker/deploy-prod.sh --skip-migrate  # 忽略 Prisma schema 变更，不跑迁移
#   bash infra/docker/deploy-prod.sh --no-push       # 跳过本地 push（服务器代码已最新时）
#   bash infra/docker/deploy-prod.sh --force-sync    # pull 遇本地运维改动冲突时自动 stash/reset
#   bash infra/docker/deploy-prod.sh --dry-run       # 只预检 + 打印执行计划，不改动线上
#
# 依赖：本机 sshpass + ssh + git；
#       服务器已有 ~/<user>/ai-aggregation git 仓库 + docker compose 项目。
# 服务器连接信息从 infra/docker/server-info.md 读取（该文件不入 git）。
#   ⚠️ 本脚本仅在服务器本地构建/启动，绝不覆盖服务器 infra/docker/.env.prod。
# ============================================================
set -euo pipefail

# ---------- 参数解析 ----------
REBUILD_ALL=0; SKIP_MIGRATE=0; NO_PUSH=0; DRY_RUN=0; FORCE_SYNC=0
for arg in "$@"; do
  case "$arg" in
    --rebuild-all)  REBUILD_ALL=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --no-push)      NO_PUSH=1 ;;
    --dry-run)      DRY_RUN=1 ;;
    --force-sync)   FORCE_SYNC=1 ;;
    *) echo "❌ 未知参数: $arg"; echo "   可用: --rebuild-all | --skip-migrate | --no-push | --force-sync | --dry-run"; exit 1 ;;
  esac
done

# ---------- 读取服务器连接信息 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFO="$SCRIPT_DIR/server-info.md"
[ -f "$INFO" ] || { echo "❌ 缺少 ${INFO}（生产服务器信息文件，不入 git）"; exit 1; }

field() { grep -m1 -F "$1" "$INFO" | awk -F'`' '{print $2}'; }
SSH_IP="$(field '服务器 IP')"
SSH_USER="$(field 'SSH 用户名')"
SSH_PASS="$(field 'SSH 密码')"
SSH_PORT="$(field 'SSH 端口')"; SSH_PORT="${SSH_PORT:-22}"
{ [ -n "$SSH_IP" ] && [ -n "$SSH_USER" ] && [ -n "$SSH_PASS" ]; } || {
  echo "❌ server-info.md 解析失败，请确认字段：服务器 IP / SSH 用户名 / SSH 密码"
  exit 1
}

DEST="$SSH_USER@$SSH_IP"
REMOTE_REPO="/home/$SSH_USER/ai-aggregation"
DOCKER_DIR="$REMOTE_REPO/infra/docker"
COMPOSE="docker compose -f $DOCKER_DIR/docker-compose.prod.yml"
GITEE_URL="https://gitee.com/bit-xiaoyu/ai-aggregation.git"

command -v sshpass >/dev/null || { echo "❌ 本机缺少 sshpass"; exit 1; }

sshx() {
  local attempt
  for attempt in 1 2 3; do
    if sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=20 -o ServerAliveInterval=30 -p "$SSH_PORT" "$DEST" "$@" 2>"${TMPDIR:-/tmp}/deploy_ssh_err.$$"; then
      return 0
    fi
    echo "      ⚠️ SSH 连接第 ${attempt} 次失败，2s 后重试…" >&2
    sleep 2
  done
  cat "${TMPDIR:-/tmp}/deploy_ssh_err.$$" >&2
  rm -f "${TMPDIR:-/tmp}/deploy_ssh_err.$$"
  return 1
}

echo "=============================================="
echo " AI-Aggregation 一键部署"
echo " 服务器: $SSH_IP   模式: $([ "$DRY_RUN" = 1 ] && printf 'DRY-RUN 预检' || printf '实际部署')"
echo "=============================================="

# 执行本地命令（dry-run 时仅打印）
act() {
  if [ "$DRY_RUN" = "1" ]; then echo "      [将执行] $*"; return 0; fi
  "$@"
}
# 执行服务器命令（dry-run 时仅打印）
act_ssh() {
  if [ "$DRY_RUN" = "1" ]; then echo "      [将执行] ssh ... : $*"; return 0; fi
  sshx "$@"
}

# ---------- 1/6 本地代码检查 ----------
echo ""
echo "== 1/6 本地代码检查 =="
HEAD_MSG="$(git log -1 --oneline)"
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  if [ "${ALLOW_DIRTY:-0}" = "1" ]; then
    echo "⚠️  工作区有未提交改动，ALLOW_DIRTY=1 时仅部署已提交 HEAD（${HEAD_MSG}）"
  else
    echo "⚠️  本地有未提交改动，请先提交再部署（或将未提交部分丢弃后运行；也可以在本地提交）。可设 ALLOW_DIRTY=1 强制仅部署已提交 HEAD："
    echo "$DIRTY" | head -15
    exit 1
  fi
else
  echo "✓ 工作区干净，将部署: $HEAD_MSG"
fi

# ---------- 2/6 推送最新代码 ----------
echo ""
echo "== 2/6 推送代码到 Gitee =="
if [ "$NO_PUSH" = "1" ]; then
  echo "（--no-push，跳过推送）"
  IS_UP_TO_DATE=1
else
  if [ "$DRY_RUN" = "1" ]; then
    act "git push $GITEE_URL master"
  else
    git push "$GITEE_URL" master 2>&1 | tail -3
    echo "✓ 已推送"
  fi
fi

# ---------- 3/6 服务器拉取最新代码 ----------
echo ""
echo "== 3/6 服务器更新代码 =="
# fetch + diff 只读，任何模式下都执行，用于判定构建清单与是否需 pull
sshx "cd $REMOTE_REPO && git fetch origin --quiet" \
  || { echo "❌ git fetch 失败（网络或 SSH 凭据）"; exit 1; }
CHANGED="$(sshx "cd $REMOTE_REPO && git diff --name-only HEAD..origin/master" || true)"
if [ -n "$CHANGED" ]; then
  echo "本次待合入变更:"
  echo "$CHANGED" | sed 's/^/      /'
  if [ "$DRY_RUN" = "0" ]; then
    if [ "$FORCE_SYNC" = "1" ]; then
      sshx "cd $REMOTE_REPO && git stash push -u -m auto-deploy && git pull --ff-only origin master && git stash pop" \
        && echo "✓ 已拉取并恢复本地运维改动" \
        || { echo "❌ 拉取/恢复失败，请人工处理服务器 git 状态（git status）"; exit 1; }
    else
      sshx "cd $REMOTE_REPO && git pull --ff-only origin master" \
        && echo "✓ 已拉取到 $(sshx "cd $REMOTE_REPO && git log -1 --oneline")" \
        || { echo "❌ git pull 因服务器本地改动冲突中止。若这些改动无需保留可加 --force-sync；否则请人工处理。"; exit 1; }
    fi
  else
    echo "      [将执行] ssh ... : git pull --ff-only origin master"
  fi
else
  echo "ℹ️  服务器代码已是最新提交"
fi

# ---------- 4/6 Prisma 迁移（schema 变更时） ----------
echo ""
echo "== 4/6 数据库迁移 =="
NEED_MIGRATE=0
[ "$SKIP_MIGRATE" = "0" ] && { echo "$CHANGED" | grep -q 'packages/db/prisma' && NEED_MIGRATE=1 || true; }
if [ "$NEED_MIGRATE" = "1" ]; then
  echo "检测到 Prisma schema/迁移变更，执行 migrate deploy"
  act_ssh "cd $REMOTE_REPO && export DATABASE_URL=\"\$(grep '^DATABASE_URL' $DOCKER_DIR/.env.prod | head -1 | cut -d'=' -f2- | tr -d '\"' | sed 's/ai-aggregation-postgres/localhost/')\" && pnpm db:generate && pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma" \
    && echo "✓ 迁移完成" || { echo "❌ 迁移失败"; exit 1; }
else
  echo "（无 schema 变更，跳过）"
fi

# ---------- 5/6 构建并重启受影响服务 ----------
echo ""
echo "== 5/6 构建并重启服务 =="
NEED_WEB=0; NEED_WORKER=0; NEED_NGINX=0
if [ "$REBUILD_ALL" = "1" ]; then
  NEED_WEB=1; NEED_WORKER=1
else
  echo "$CHANGED" | grep -qE '^(apps/web|packages/shared|packages/providers|packages/queue|packages/redis|packages/storage|packages/logger|packages/db)' && NEED_WEB=1 || true
  echo "$CHANGED" | grep -qE '^(apps/worker|packages/shared|packages/providers|packages/queue|packages/redis|packages/storage|packages/logger|packages/db)' && NEED_WORKER=1 || true
  echo "$CHANGED" | grep -q 'infra/docker/nginx.conf' && NEED_NGINX=1 || true
fi

BUILD_LIST=""; UP_LIST=""
[ "$NEED_WEB" = "1" ] && { BUILD_LIST="$BUILD_LIST web"; UP_LIST="$UP_LIST nginx web"; }
[ "$NEED_WORKER" = "1" ] && { BUILD_LIST="$BUILD_LIST worker"; UP_LIST="$UP_LIST worker"; }

if [ -n "$BUILD_LIST" ] || [ "$REBUILD_ALL" = "1" ]; then
  echo "将构建并重建:${BUILD_LIST:- web worker}"
  act_ssh "cd $DOCKER_DIR && $COMPOSE build$BUILD_LIST" \
    || { echo "❌ 镜像构建失败，请登录服务器查看日志: docker compose -f $DOCKER_DIR/docker-compose.prod.yml logs"; exit 1; }
  act_ssh "cd $DOCKER_DIR && $COMPOSE up -d --force-recreate$UP_LIST" \
    || { echo "❌ 容器启动失败"; exit 1; }
  [ "$DRY_RUN" = "0" ] && echo "✓ 容器已重建"
fi
# nginx.conf 变更独立处理（配置文件是挂载卷，改代码后需 reload）
if [ "$NEED_NGINX" = "1" ]; then
  act_ssh "cd $DOCKER_DIR && docker restart ai-nginx" || echo "⚠️  nginx 重启失败"
  [ "$DRY_RUN" = "0" ] && echo "✓ nginx 已重启（加载新配置）"
fi
if [ -z "$BUILD_LIST" ] && [ "$REBUILD_ALL" = "0" ] && [ "$NEED_NGINX" = "0" ]; then
  echo "ℹ️  本次变更不涉及 web/worker/nginx 代码，无需重建容器"
fi

# ---------- 6/6 健康检查 ----------
echo ""
echo "== 6/6 健康检查 =="
if [ "$DRY_RUN" = "1" ]; then
  echo "      [将执行] docker ps / worker 心跳核查 / curl 站点 200"
  echo ""
  echo "===== DRY-RUN 结束：未对线上做任何改动 ====="
  exit 0
fi
sleep 8
echo "--- 容器状态 ---"
sshx "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'ai-(nginx|web|worker)|NAMES'" || true

echo "--- Worker 心跳 ---"
HB="$(sshx "docker exec ai-aggregation-redis redis-cli EXISTS worker:heartbeat:apps-worker" || true)"
if [ "$HB" = "1" ]; then echo "✓ worker 心跳在线"; else echo "✗ worker 心跳缺失"; fi

echo "--- 站点可达性 ---"
sshx "curl -sk -o /dev/null -w '  本地 http  -> %{http_code}\\n' http://localhost" || true
sshx "curl -sk -o /dev/null -w '  域名 https -> %{http_code}\\n' https://www.chunfen.ink || true"

echo ""
echo "===== 部署完成 ====="
check=0
[ "$HB" = "1" ] || check=1
sshx "docker ps --filter name=ai-web --format '{{.Names}}' | grep -q ai-web && docker ps --filter name=ai-worker --format '{{.Names}}' | grep -q ai-worker" || check=1
if [ "$check" = "0" ]; then echo "✅ 全部就绪"; else echo "⚠️  存在异常，请按上方输出排查"; fi
exit "$check"