#!/bin/bash

echo "🔧 环境变量配置助手"
echo "================================"
echo ""
echo "本脚本将帮助你配置 Supabase + Upstash"
echo ""

# 检查是否已有配置文件
if [ -f "apps/web/.env.local" ]; then
  echo "⚠️  检测到已存在的配置文件"
  read -p "是否覆盖现有配置？(y/N): " overwrite
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "❌ 已取消配置"
    exit 0
  fi
fi

echo ""
echo "📋 请准备好以下信息："
echo "1. Supabase 数据库连接字符串"
echo "2. Upstash Redis 连接信息"
echo ""
read -p "按回车键继续..."

# ==================== Supabase 配置 ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Supabase 数据库配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "请访问: https://supabase.com/"
echo "1. 创建项目"
echo "2. 进入 Settings > Database"
echo "3. 复制 Connection string (URI 模式)"
echo ""
read -p "请输入 Supabase 连接字符串: " DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo "❌ 数据库连接字符串不能为空"
  exit 1
fi

# ==================== Upstash 配置 ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔴 Upstash Redis 配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "请访问: https://console.upstash.com/"
echo "1. 创建 Redis 数据库"
echo "2. 复制连接信息"
echo ""
read -p "请输入 Redis Endpoint (如: xxx.upstash.io): " REDIS_HOST
read -p "请输入 Redis Port (默认 6379): " REDIS_PORT
read -p "请输入 Redis Password: " REDIS_PASSWORD

REDIS_PORT=${REDIS_PORT:-6379}

if [ -z "$REDIS_HOST" ] || [ -z "$REDIS_PASSWORD" ]; then
  echo "❌ Redis 配置不能为空"
  exit 1
fi

# ==================== 生成 AUTH_SECRET ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 生成鉴权密钥"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AUTH_SECRET=$(openssl rand -base64 32)
echo "✅ 已生成随机密钥"

# ==================== 创建配置文件 ====================
echo ""
echo "📝 创建配置文件..."

# Web 应用配置
cat > apps/web/.env.local << EOF
# ==================== 数据库配置 ====================
DATABASE_URL="${DATABASE_URL}"

# ==================== Redis 配置 ====================
REDIS_HOST="${REDIS_HOST}"
REDIS_PORT="${REDIS_PORT}"
REDIS_PASSWORD="${REDIS_PASSWORD}"

# ==================== 对象存储（暂时不用配置）====================
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# ==================== AI Providers（暂时可以留空）====================
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""

# ==================== 鉴权配置 ====================
AUTH_SECRET="${AUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3000"
EOF

echo "✅ 已创建 apps/web/.env.local"

# Worker 配置
cat > apps/worker/.env << EOF
# ==================== 数据库配置 ====================
DATABASE_URL="${DATABASE_URL}"

# ==================== Redis 配置 ====================
REDIS_HOST="${REDIS_HOST}"
REDIS_PORT="${REDIS_PORT}"
REDIS_PASSWORD="${REDIS_PASSWORD}"

# ==================== 对象存储（暂时不用配置）====================
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# ==================== AI Providers（暂时可以留空）====================
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""
EOF

echo "✅ 已创建 apps/worker/.env"

# ==================== 总结 ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 配置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 配置摘要："
echo "  数据库: ${DATABASE_URL:0:50}..."
echo "  Redis: ${REDIS_HOST}"
echo "  鉴权密钥: 已生成"
echo ""
echo "📋 下一步："
echo "  1. 运行 'pnpm db:generate' 生成 Prisma Client"
echo "  2. 运行 'pnpm db:migrate' 初始化数据库"
echo "  3. 运行 'pnpm db:seed' 填充种子数据（可选）"
echo "  4. 运行 'pnpm dev' 启动开发服务"
echo ""
echo "💡 提示："
echo "  - 如需配置 AI API Keys，请编辑 .env.local 文件"
echo "  - 详细文档: docs/SETUP_GUIDE.md"
echo ""
