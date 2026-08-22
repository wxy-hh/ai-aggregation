#!/usr/bin/env bash
set -euo pipefail

# ============================================
# AI-Aggregation 腾讯云一键部署脚本
# 用法：bash deploy.sh <服务器IP> [用户名]
# 例如：bash deploy.sh 1.2.3.4 ubuntu
# ============================================

SERVER_IP="${1:?用法: bash deploy.sh <服务器IP> [用户名]}"
USER="${2:-ubuntu}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_DIR="/home/${USER}/ai-aggregation"

echo "=== AI-Aggregation 腾讯云部署 ==="
echo "服务器: ${USER}@${SERVER_IP}"
echo "项目根: ${PROJECT_ROOT}"
echo ""

# ---------- 1. 打包项目（排除无关文件） ----------
echo "[1/5] 打包项目..."
TARBALL="/tmp/ai-aggregation-deploy.tar.gz"
cd "$PROJECT_ROOT"
tar -czf "$TARBALL" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='.git' \
  --exclude='.codegraph' \
  --exclude='*.tar.gz' \
  .
echo "    打包完成: $(du -h "$TARBALL" | cut -f1)"

# ---------- 2. 上传到服务器 ----------
echo "[2/5] 上传到服务器..."
ssh -o StrictHostKeyChecking=no "${USER}@${SERVER_IP}" "mkdir -p ${REMOTE_DIR}"
scp -o StrictHostKeyChecking=no "$TARBALL" "${USER}@${SERVER_IP}:${REMOTE_DIR}/"

# ---------- 3. 解压并安装依赖 ----------
echo "[3/5] 解压并安装依赖..."
ssh -o StrictHostKeyChecking=no "${USER}@${SERVER_IP}" << 'REMOTE_SCRIPT'
set -euo pipefail
cd ~/ai-aggregation

# 解压
tar -xzf ai-aggregation-deploy.tar.gz
rm -f ai-aggregation-deploy.tar.gz

# 安装 Docker（如果没装）
if ! command -v docker &>/dev/null; then
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
  echo "Docker 安装完成，请重新登录以使用 docker 命令，或执行 newgrp docker"
fi

# 安装 Docker Compose 插件（如果没装）
if ! docker compose version &>/dev/null 2>&1; then
  echo "安装 Docker Compose 插件..."
  sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# 安装 Node.js 22（如果没装，用于本地执行 prisma migrate）
if ! command -v node &>/dev/null || [[ $(node -v) != v22* ]]; then
  echo "安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 安装 pnpm
if ! command -v pnpm &>/dev/null; then
  echo "安装 pnpm..."
  corepack enable
  corepack prepare pnpm@10.0.0 --activate
fi

echo "基础环境就绪"
REMOTE_SCRIPT

# ---------- 4. 配置环境变量 ----------
echo "[4/5] 配置环境变量..."
ENV_FILE="infra/docker/.env.prod"
if [ -f "$PROJECT_ROOT/$ENV_FILE" ]; then
  scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/$ENV_FILE" "${USER}@${SERVER_IP}:~/ai-aggregation/infra/docker/.env.prod"
else
  echo "    ⚠️  未找到 $ENV_FILE，请手动复制 .env.prod.example 为 .env.prod 并填入真实值"
  echo "    scp $PROJECT_ROOT/infra/docker/.env.prod.example ${USER}@${SERVER_IP}:~/ai-aggregation/infra/docker/.env.prod"
fi

# ---------- 5. 构建并启动 ----------
echo "[5/5] 构建并启动服务..."
ssh -o StrictHostKeyChecking=no "${USER}@${SERVER_IP}" << 'REMOTE_SCRIPT'
set -euo pipefail
cd ~/ai-aggregation/infra/docker

# 检查 .env.prod 是否存在
if [ ! -f .env.prod ]; then
  echo "❌ 缺少 .env.prod，请先配置环境变量"
  echo "   cp .env.prod.example .env.prod && vim .env.prod"
  exit 1
fi

# 构建并启动
echo "构建 Docker 镜像..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "启动服务..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== 部署完成 ==="
docker compose -f docker-compose.prod.yml ps
REMOTE_SCRIPT

echo ""
echo "=== 部署完成 ==="
echo "Web: http://${SERVER_IP}"
echo "如需 HTTPS，请执行证书申请（见文档第 8 节）"
