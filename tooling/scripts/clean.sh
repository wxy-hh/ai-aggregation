#!/bin/bash

echo "🧹 清理项目..."

# 清理 node_modules
echo "删除 node_modules..."
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# 清理构建产物
echo "删除构建产物..."
find . -name "dist" -type d -prune -exec rm -rf '{}' +
find . -name ".next" -type d -prune -exec rm -rf '{}' +
find . -name ".turbo" -type d -prune -exec rm -rf '{}' +

# 清理 Prisma 生成文件
echo "删除 Prisma 生成文件..."
rm -rf packages/db/node_modules/.prisma

echo "✅ 清理完成"
