#!/bin/bash

# 讯飞实时语音转写网关 - 本地开发启动脚本

echo "🚀 启动讯飞实时语音转写 WebSocket 网关..."
echo ""
echo "📍 服务地址: ws://localhost:8787"
echo "📍 健康检查: http://localhost:8787/health"
echo ""
echo "⚠️  确保 .dev.vars 文件已配置讯飞 API 密钥"
echo ""

pnpm dev
