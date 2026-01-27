#!/bin/bash

echo "🚀 初始化 AI 聚合平台项目..."

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "❌ 需要 Node.js 22.x 或更高版本"
  exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ 未找到 pnpm，请先安装: corepack enable"
  exit 1
fi

# 检查 Docker
if ! command -v docker &> /dev/null; then
  echo "❌ 未找到 Docker，请先安装 Docker Desktop"
  exit 1
fi

echo "✅ 环境检查通过"

# 安装依赖
echo "📦 安装依赖..."
pnpm install

# 启动基础设施
echo "🐳 启动 Docker 服务..."
cd infra/docker
docker compose up -d
cd ../..

# 等待服务就绪
echo "⏳ 等待服务启动..."
sleep 10

# 初始化数据库
echo "🗄️  初始化数据库..."
pnpm db:generate
pnpm db:migrate

# 创建环境变量文件
echo "📝 创建环境变量文件..."
if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.example apps/web/.env.local
  echo "✅ 已创建 apps/web/.env.local"
fi

if [ ! -f apps/worker/.env ]; then
  cp apps/worker/.env.example apps/worker/.env
  echo "✅ 已创建 apps/worker/.env"
fi

echo ""
echo "✨ 初始化完成！"
echo ""
echo "下一步："
echo "1. 编辑 apps/web/.env.local 和 apps/worker/.env，填入 API Keys"
echo "2. 运行 'pnpm dev' 启动开发服务"
echo "3. 访问 http://localhost:3000"
