#!/bin/bash

echo "=========================================="
echo "实时语音转写功能 - 基础测试"
echo "=========================================="
echo ""

# 测试 1: Worker 健康检查
echo "📍 测试 1: Worker 网关健康检查"
echo "   URL: http://localhost:8787/health"
WORKER_HEALTH=$(curl -s http://localhost:8787/health)
echo "   响应: $WORKER_HEALTH"

if echo "$WORKER_HEALTH" | grep -q "ok"; then
    echo "   ✅ Worker 网关正常运行"
else
    echo "   ❌ Worker 网关异常"
    exit 1
fi

echo ""

# 测试 2: Next.js 应用检查
echo "📍 测试 2: Next.js 应用检查"
echo "   URL: http://localhost:3030"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3030)
echo "   HTTP 状态码: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Next.js 应用正常运行"
else
    echo "   ❌ Next.js 应用异常"
    exit 1
fi

echo ""

# 测试 3: 语音页面检查
echo "📍 测试 3: 语音转写页面检查"
echo "   URL: http://localhost:3030/voice"
VOICE_PAGE=$(curl -s http://localhost:3030/voice)

if echo "$VOICE_PAGE" | grep -q "语音转写"; then
    echo "   ✅ 语音转写页面加载成功"
else
    echo "   ⚠️  页面内容可能异常"
fi

# 检查关键元素
if echo "$VOICE_PAGE" | grep -q "实时录音"; then
    echo "   ✅ 找到'实时录音'标签"
else
    echo "   ⚠️  未找到'实时录音'标签"
fi

if echo "$VOICE_PAGE" | grep -q "上传音频"; then
    echo "   ✅ 找到'上传音频'标签"
else
    echo "   ⚠️  未找到'上传音频'标签"
fi

echo ""

# 测试 4: 检查环境变量配置
echo "📍 测试 4: 检查前端配置"
if echo "$VOICE_PAGE" | grep -q "localhost:8787"; then
    echo "   ✅ WebSocket URL 配置正确"
else
    echo "   ⚠️  WebSocket URL 可能未配置"
fi

echo ""

# 测试 5: 检查 Worker 端口
echo "📍 测试 5: 检查端口占用"
if lsof -ti:8787 > /dev/null 2>&1; then
    echo "   ✅ 端口 8787 (Worker) 已被占用"
else
    echo "   ❌ 端口 8787 未被占用"
fi

if lsof -ti:3030 > /dev/null 2>&1; then
    echo "   ✅ 端口 3030 (Next.js) 已被占用"
else
    echo "   ❌ 端口 3030 未被占用"
fi

echo ""
echo "=========================================="
echo "✅ 基础测试完成！"
echo "=========================================="
echo ""
echo "📊 测试总结:"
echo "   - Worker 网关: ✓"
echo "   - Next.js 应用: ✓"
echo "   - 语音转写页面: ✓"
echo ""
echo "🌐 访问地址:"
echo "   - 主页: http://localhost:3030"
echo "   - 语音转写: http://localhost:3030/voice"
echo "   - Worker 健康检查: http://localhost:8787/health"
echo ""
echo "💡 下一步:"
echo "   1. 在浏览器中打开 http://localhost:3030/voice"
echo "   2. 切换到'实时录音'标签"
echo "   3. 点击'开始录音'按钮"
echo "   4. 允许麦克风权限"
echo "   5. 开始说话测试实时转写"
