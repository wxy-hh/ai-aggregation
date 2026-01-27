#!/bin/bash

echo "🔍 环境配置检查"
echo "================================"
echo ""

# 检查配置文件是否存在
echo "📁 检查配置文件..."
if [ ! -f "apps/web/.env.local" ]; then
  echo "❌ apps/web/.env.local 不存在"
  echo "   请运行: bash tooling/scripts/setup-env.sh"
  exit 1
fi
echo "✅ apps/web/.env.local 存在"

if [ ! -f "apps/worker/.env" ]; then
  echo "❌ apps/worker/.env 不存在"
  echo "   请运行: bash tooling/scripts/setup-env.sh"
  exit 1
fi
echo "✅ apps/worker/.env 存在"

echo ""
echo "🔑 检查必需的环境变量..."

# 加载环境变量
source apps/web/.env.local 2>/dev/null

# 检查 DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL 未配置"
  HAS_ERROR=1
else
  echo "✅ DATABASE_URL 已配置"
  # 检查是否是 Supabase 连接
  if [[ $DATABASE_URL == *"supabase"* ]]; then
    echo "   ℹ️  使用 Supabase 数据库"
  fi
fi

# 检查 REDIS_HOST
if [ -z "$REDIS_HOST" ]; then
  echo "❌ REDIS_HOST 未配置"
  HAS_ERROR=1
else
  echo "✅ REDIS_HOST 已配置: $REDIS_HOST"
fi

# 检查 REDIS_PASSWORD
if [ -z "$REDIS_PASSWORD" ]; then
  echo "⚠️  REDIS_PASSWORD 未配置（Upstash 需要密码）"
  HAS_WARNING=1
else
  echo "✅ REDIS_PASSWORD 已配置"
fi

# 检查 AUTH_SECRET
if [ -z "$AUTH_SECRET" ]; then
  echo "⚠️  AUTH_SECRET 未配置"
  HAS_WARNING=1
else
  echo "✅ AUTH_SECRET 已配置"
fi

echo ""
echo "🤖 检查 AI Provider 配置（可选）..."

if [ -z "$DASHSCOPE_API_KEY" ] && [ -z "$ZHIPU_API_KEY" ] && [ -z "$DEEPSEEK_API_KEY" ]; then
  echo "⚠️  未配置任何 AI Provider API Key"
  echo "   这不影响项目启动，但无法使用 AI 功能"
  echo "   可以稍后在 .env.local 中配置"
else
  [ ! -z "$DASHSCOPE_API_KEY" ] && echo "✅ DASHSCOPE_API_KEY 已配置"
  [ ! -z "$ZHIPU_API_KEY" ] && echo "✅ ZHIPU_API_KEY 已配置"
  [ ! -z "$DEEPSEEK_API_KEY" ] && echo "✅ DEEPSEEK_API_KEY 已配置"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -z "$HAS_ERROR" ]; then
  echo "❌ 配置检查失败"
  echo ""
  echo "请运行以下命令重新配置:"
  echo "  bash tooling/scripts/setup-env.sh"
  exit 1
elif [ ! -z "$HAS_WARNING" ]; then
  echo "⚠️  配置检查通过（有警告）"
  echo ""
  echo "可以继续，但建议检查警告项"
else
  echo "✅ 配置检查通过"
  echo ""
  echo "📋 下一步:"
  echo "  1. pnpm db:generate  # 生成 Prisma Client"
  echo "  2. pnpm db:migrate   # 初始化数据库"
  echo "  3. pnpm dev          # 启动开发服务"
fi

echo ""
