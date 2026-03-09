#!/bin/bash

# 测试豆包 API 调用
# 使用方法: ./test-doubao-api.sh

echo "测试 1: deepseek-v3.2 模型"
curl -X POST "http://localhost:3030/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "doubao",
    "model": "deepseek-v3.2",
    "messages": [
      {
        "role": "user",
        "content": "你是什么模型？请简短回答。"
      }
    ]
  }'

echo -e "\n\n测试 2: doubao-seed-2.0-lite 模型"
curl -X POST "http://localhost:3030/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "doubao",
    "model": "doubao-seed-2.0-lite",
    "messages": [
      {
        "role": "user",
        "content": "你是什么模型？请简短回答。"
      }
    ]
  }'

echo -e "\n\n测试 3: glm-4.7 模型"
curl -X POST "http://localhost:3030/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "doubao",
    "model": "glm-4.7",
    "messages": [
      {
        "role": "user",
        "content": "你是什么模型？请简短回答。"
      }
    ]
  }'
