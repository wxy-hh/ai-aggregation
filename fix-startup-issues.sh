#!/bin/bash

echo "🔧 修复项目启动问题..."

# 1. 切换到正确的 Node 版本
echo "📌 步骤 1: 检查 Node 版本"
echo "当前 Node 版本: $(node --version)"
echo "项目要求版本: Node 22"
echo ""
echo "请运行以下命令切换到 Node 22:"
echo "  nvm use 22"
echo "  或者: nvm install 22 && nvm use 22"
echo ""
read -p "已切换到 Node 22? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 请先切换 Node 版本后再继续"
    exit 1
fi

# 2. 清理所有缓存和依赖
echo "🧹 步骤 2: 清理缓存和依赖..."
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf apps/*/.next
rm -rf apps/*/.turbo
rm -rf .turbo
rm -rf pnpm-lock.yaml

echo "✅ 缓存清理完成"

# 3. 重新安装依赖
echo "📦 步骤 3: 重新安装依赖..."
pnpm install

# 4. 构建 workspace 包
echo "🔨 步骤 4: 构建 workspace 包..."
pnpm --filter "@repo/*" build

# 5. 类型检查
echo "🔍 步骤 5: 运行类型检查..."
pnpm --filter @repo/web typecheck

echo ""
echo "✅ 修复完成！现在可以尝试启动项目:"
echo "   pnpm --filter @repo/web dev"
