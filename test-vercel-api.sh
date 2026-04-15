#!/bin/bash

# 测试 Vercel 线上豆包 API 接口
# 用于诊断为什么线上接口返回"无法加载响应数据"

echo "=========================================="
echo "测试 Vercel 线上豆包 API 接口"
echo "=========================================="
echo ""

# 线上 API 地址
BASE_URL="https://ai-aggregation-web.vercel.app"

# 测试数据
TEST_DATA='{
  "name": "张三",
  "gender": "male",
  "birthDate": {
    "year": 1990,
    "month": 5,
    "day": 15
  },
  "birthTime": {
    "hour": "14",
    "minute": "30"
  },
  "location": {
    "name": "北京",
    "lat": 39.9042,
    "lon": 116.4074
  }
}'

echo "1️⃣  测试八字分析接口"
echo "URL: ${BASE_URL}/api/destiny/report"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}/api/destiny/report" \
  -H "Content-Type: application/json" \
  -d "$TEST_DATA")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE"
echo ""
echo "响应内容:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""
echo "=========================================="
echo ""

# 测试奇门遁甲接口
QIMEN_DATA='{
  "context": {
    "datetime": "2025-04-15 14:30",
    "location": "北京",
    "chartMethod": "time"
  },
  "question": {
    "category": "career",
    "description": "今年是否适合跳槽换工作",
    "focus": "short_term",
    "outputStyle": "plain",
    "outputLength": "brief"
  }
}'

echo "2️⃣  测试奇门遁甲接口"
echo "URL: ${BASE_URL}/api/destiny/qimen/analyze"
echo ""

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST \
  "${BASE_URL}/api/destiny/qimen/analyze" \
  -H "Content-Type: application/json" \
  -d "$QIMEN_DATA")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE2"
echo ""
echo "响应内容:"
echo "$BODY2" | jq '.' 2>/dev/null || echo "$BODY2"
echo ""
echo "=========================================="
echo ""

# 分析结果
echo "📊 诊断结果："
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 八字分析接口正常"
else
  echo "❌ 八字分析接口异常 (HTTP $HTTP_CODE)"
  
  # 检查是否是环境变量问题
  if echo "$BODY" | grep -q "Missing ARK_API_KEY"; then
    echo "   原因: 缺少 ARK_API_KEY 环境变量"
  elif echo "$BODY" | grep -q "429"; then
    echo "   原因: API 请求频率限制"
  elif echo "$BODY" | grep -q "502\|503\|504"; then
    echo "   原因: 豆包 API 服务不可用或超时"
  elif echo "$BODY" | grep -q "401\|403"; then
    echo "   原因: API Key 无效或无权限"
  fi
fi

echo ""

if [ "$HTTP_CODE2" = "200" ]; then
  echo "✅ 奇门遁甲接口正常"
else
  echo "❌ 奇门遁甲接口异常 (HTTP $HTTP_CODE2)"
  
  if echo "$BODY2" | grep -q "Missing ARK_API_KEY"; then
    echo "   原因: 缺少 ARK_API_KEY 环境变量"
  elif echo "$BODY2" | grep -q "429"; then
    echo "   原因: API 请求频率限制"
  elif echo "$BODY2" | grep -q "502\|503\|504"; then
    echo "   原因: 豆包 API 服务不可用或超时"
  elif echo "$BODY2" | grep -q "401\|403"; then
    echo "   原因: API Key 无效或无权限"
  fi
fi

echo ""
echo "=========================================="
