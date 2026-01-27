#!/bin/bash

echo "🚀 初始化 AI 聚合平台项目（无 Docker 模式）..."

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "❌ 需要 Node.js 22.x 或更高版本"
  echo "当前版本: $(node -v)"
  exit 1
fi

echo "✅ Node.js 版本检查通过: $(node -v)"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ 未找到 pnpm，正在启用 corepack..."
  corepack enable
  if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm 安装失败，请手动执行: corepack enable"
    exit 1
  fi
fi

echo "✅ pnpm 检查通过: $(pnpm -v)"

# 安装依赖
echo "📦 安装依赖..."
pnpm install

if [ $? -ne 0 ]; then
  echo "❌ 依赖安装失败"
  exit 1
fi

echo "✅ 依赖安装完成"

# 创建环境变量文件
echo "📝 创建环境变量文件..."

if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.example apps/web/.env.local
  echo "✅ 已创建 apps/web/.env.local"
else
  echo "⚠️  apps/web/.env.local 已存在，跳过"
fi

if [ ! -f apps/worker/.env ]; then
  cp apps/worker/.env.example apps/worker/.env
  echo "✅ 已创建 apps/worker/.env"
else
  echo "⚠️  apps/worker/.env 已存在，跳过"
fi

echo ""
echo "✨ 初始化完成（无 Docker 模式）！"
echo ""
echo "⚠️  注意事项："
echo "由于未安装 Docker，你需要手动准备以下服务："
echo ""
echo "1. PostgreSQL 16.x"
echo "   - 创建数据库: ai_aggregation"
echo "   - 更新 DATABASE_URL 在 .env.local 和 .env 中"
echo ""
echo "2. Redis 7.x"
echo "   - 更新 REDIS_HOST 和 REDIS_PORT 在 .env 中"
echo ""
echo "3. 对象存储（可选）"
echo "   - 使用阿里云 OSS 或腾讯云 COS"
echo "   - 更新 S3_* 配置"
echo ""
echo "📋 下一步："
echo "1. 安装并启动 PostgreSQL 和 Redis（或使用云服务）"
echo "2. 编辑 apps/web/.env.local 和 apps/worker/.env"
echo "3. 运行 'pnpm db:generate' 生成 Prisma Client"
echo "4. 运行 'pnpm db:migrate' 初始化数据库"
echo "5. 运行 'pnpm dev' 启动开发服务"
echo ""
echo "💡 提示: 如果你想使用 Docker，请先安装 Docker Desktop"
echo "   然后运行 'bash tooling/scripts/init.sh'"
