#!/bin/bash
# ============================================
# AI-Aggregation 腾讯云服务器一键部署脚本
# 在 VNC 终端中执行：bash /tmp/server-setup.sh
# ============================================
set -euo pipefail
DEPLOY_DIR="/opt/ai-aggregation"
echo "===== AI-Aggregation 腾讯云部署 ====="

# --- 1. 安装 Docker ---
echo "[1/6] 检查 Docker..."
if ! command -v docker &>/dev/null; then
  echo "  安装 Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker ubuntu 2>/dev/null || true
  echo "  Docker 安装完成"
else
  echo "  Docker 已安装: $(docker --version)"
fi
sudo systemctl enable docker && sudo systemctl start docker

# --- 2. 安装 Docker Compose ---
echo "[2/6] 检查 Docker Compose..."
if ! docker compose version &>/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi
echo "  $(docker compose version)"

# --- 3. 安装 Node.js + pnpm（用于 Prisma migrate）---
echo "[3/6] 检查 Node.js..."
if ! command -v node &>/dev/null || [[ ! $(node -v) == v22* ]]; then
  echo "  安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "  Node: $(node -v), npm: $(npm -v)"
if ! command -v pnpm &>/dev/null; then
  sudo npm install -g pnpm@10
fi
echo "  pnpm: $(pnpm -v)"

# --- 4. 解压项目 ---
echo "[4/6] 解压项目..."
sudo mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
if [ -f /tmp/ai-aggregation-deploy.tar.gz ]; then
  sudo tar -xzf /tmp/ai-aggregation-deploy.tar.gz
  echo "  解压完成"
else
  echo "  ❌ 未找到 /tmp/ai-aggregation-deploy.tar.gz"
  echo "  请先上传部署包: scp /path/to/ai-aggregation-deploy.tar.gz ubuntu@$(curl -s ifconfig.me):/tmp/"
  exit 1
fi

# --- 5. 数据库迁移 ---
echo "[5/6] 执行数据库迁移..."
if [ -f "$DEPLOY_DIR/infra/docker/.env.prod" ]; then
  source "$DEPLOY_DIR/infra/docker/.env.prod"
  if [ -n "${DATABASE_URL:-}" ]; then
    cd "$DEPLOY_DIR"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    pnpm db:generate
    pnpm --filter @repo/db exec prisma migrate deploy --schema prisma/schema.prisma
    echo "  数据库迁移完成"
  else
    echo "  ⚠️ DATABASE_URL 为空，跳过迁移"
  fi
else
  echo "  ⚠️ .env.prod 不存在，跳过迁移"
fi

# --- 6. 构建并启动 ---
echo "[6/6] 构建 Docker 镜像..."
cd "$DEPLOY_DIR/infra/docker"
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "===== 部署完成 ====="
docker compose -f docker-compose.prod.yml ps
echo ""
echo "访问: http://$(curl -s ifconfig.me)"
echo "域名: https://www.chunfen.ink（需完成 DNS 解析 + SSL 证书）"
