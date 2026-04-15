#!/bin/bash

# 测试 Vercel 线上环境的豆包 API

echo "================================"
echo "测试 Vercel 豆包 API"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试八字 API
echo -e "${YELLOW}1. 测试八字 API...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://ai-aggregation-web.vercel.app/api/destiny/report \
  -H "Content-Type: application/json" \
  -d '{
    "birthInfo": {
      "year": 1990,
      "month": 1,
      "day": 1,
      "hour": 12,
      "minute": 0,
      "gender": "male"
    },
    "name": "测试",
    "location": "北京"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE"
echo "响应内容:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 八字 API 正常${NC}"
else
    echo -e "${RED}✗ 八字 API 失败${NC}"
fi
echo ""

# 测试奇门遁甲 API
echo -e "${YELLOW}2. 测试奇门遁甲 API...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://ai-aggregation-web.vercel.app/api/destiny/qimen/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "datetime": "2024-01-01 12:00",
      "location": "北京",
      "chartMethod": "time"
    },
    "question": {
      "category": "career",
      "description": "今年事业发展如何",
      "focus": "short_term",
      "outputStyle": "plain",
      "outputLength": "brief"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE"
echo "响应内容:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 奇门遁甲 API 正常${NC}"
else
    echo -e "${RED}✗ 奇门遁甲 API 失败${NC}"
fi
echo ""

# 测试紫微斗数 API
echo -e "${YELLOW}3. 测试紫微斗数 API...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://ai-aggregation-web.vercel.app/api/destiny/ziwei-report \
  -H "Content-Type: application/json" \
  -d '{
    "birthInfo": {
      "year": 1990,
      "month": 1,
      "day": 1,
      "hour": 12,
      "minute": 0,
      "gender": "male",
      "isLeapMonth": false
    },
    "name": "测试",
    "location": "北京"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE"
echo "响应内容:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 紫微斗数 API 正常${NC}"
else
    echo -e "${RED}✗ 紫微斗数 API 失败${NC}"
fi
echo ""

echo "================================"
echo "测试完成"
echo "================================"
