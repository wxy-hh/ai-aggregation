#!/bin/bash

# 豆包 API 测试脚本
# 测试有文件和无文件两种场景

ARK_API_KEY="3a04b704-6445-4f3e-a127-bcb711461706"

# 无文件时使用原始模型名称
MODEL_NO_FILE="doubao-seed-2.0-lite"

# 有文件时使用带日期的模型名称
MODEL_WITH_FILE="doubao-seed-2-0-lite-260215"

echo "=========================================="
echo "测试 1: 无文件 - chat/completions API (CodingPlan)"
echo "模型名称: $MODEL_NO_FILE"
echo "=========================================="
echo ""

curl -X POST https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL_NO_FILE"'",
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下你自己"
      }
    ],
    "stream": false
  }'

echo ""
echo ""
echo "=========================================="
echo "测试 2: 有文件 - responses API"
echo "模型名称: $MODEL_WITH_FILE"
echo "注意：需要先上传文件获取 file_id"
echo "=========================================="
echo ""

# 使用之前上传成功的 file_id
FILE_ID="file-20260309174408-fhwpv"

curl -X POST https://ark.cn-beijing.volces.com/api/v3/responses \
  -H "Authorization: Bearer 3a04b704-6445-4f3e-a127-bcb711461706" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_file",
            "file_id": "file-20260310084547-c5tpb"
          },
          {
            "type": "input_text",
            "text": "请分析这个文档的主要内容"
          }
        ]
      }
    ],
    "stream": false
  }'

echo ""
echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
