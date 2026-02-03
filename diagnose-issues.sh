#!/bin/bash

echo "🔍 诊断项目启动问题..."
echo "================================"
echo ""

# 检查 Node 版本
echo "1️⃣ Node 版本检查:"
CURRENT_NODE=$(node --version)
REQUIRED_NODE="v22"
echo "   当前版本: $CURRENT_NODE"
echo "   要求版本: $REQUIRED_NODE.x.x"
if [[ $CURRENT_NODE == v22* ]]; then
    echo "   ✅ Node 版本正确"
else
    echo "   ❌ Node 版本不匹配 - 这可能是主要问题!"
fi
echo ""

# 检查 pnpm 版本
echo "2️⃣ pnpm 版本检查:"
echo "   当前版本: $(pnpm --version)"
echo ""

# 检查 workspace 包是否构建
echo "3️⃣ Workspace 包检查:"
PACKAGES=("shared" "providers" "storage" "logger" "queue")
for pkg in "${PACKAGES[@]}"; do
    if [ -d "packages/$pkg/dist" ] || [ -d "packages/$pkg/node_modules" ]; then
        echo "   ✅ @repo/$pkg"
    else
        echo "   ❌ @repo/$pkg - 可能未构建"
    fi
done
echo ""

# 检查依赖安装
echo "4️⃣ 依赖安装检查:"
if [ -d "node_modules" ]; then
    echo "   ✅ 根目录 node_modules 存在"
else
    echo "   ❌ 根目录 node_modules 不存在"
fi

if [ -d "apps/web/node_modules" ]; then
    echo "   ✅ apps/web/node_modules 存在"
else
    echo "   ❌ apps/web/node_modules 不存在"
fi
echo ""

# 检查环境变量
echo "5️⃣ 环境变量检查:"
if [ -f "apps/web/.env.local" ]; then
    echo "   ✅ .env.local 存在"
else
    echo "   ❌ .env.local 不存在"
fi
echo ""

# 检查缓存
echo "6️⃣ 缓存检查:"
if [ -d "apps/web/.next" ]; then
    echo "   ⚠️  Next.js 缓存存在 (.next)"
fi
if [ -d ".turbo" ]; then
    echo "   ⚠️  Turbo 缓存存在 (.turbo)"
fi
echo ""

echo "================================"
echo "📋 诊断完成"
echo ""
echo "💡 建议的修复步骤:"
echo "   1. 切换到 Node 22: nvm use 22"
echo "   2. 运行修复脚本: ./fix-startup-issues.sh"
echo "   3. 或手动执行:"
echo "      - pnpm install"
echo "      - pnpm --filter \"@repo/*\" build"
echo "      - pnpm --filter @repo/web dev"
