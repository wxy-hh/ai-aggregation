#!/bin/bash

# 豆包文件清理脚本
# 使用方法: ./cleanup_doubao_files.sh

# 从环境变量读取 API Key
API_KEY="${ARK_API_KEY:-}"

if [ -z "$API_KEY" ]; then
    echo "❌ 错误: 请设置 ARK_API_KEY 环境变量"
    echo "使用方法: export ARK_API_KEY='your-api-key'"
    exit 1
fi
BASE_URL="https://ark.cn-beijing.volces.com/api/v3"

echo "正在获取文件列表..."

# 获取文件列表
response=$(curl -s "${BASE_URL}/files" \
  -H "Authorization: Bearer ${API_KEY}")

# 检查是否有文件
if echo "$response" | grep -q '"id":'; then
    echo "找到以下文件:"
    echo "$response" | grep -o '"id": "[^"]*"' | cut -d'"' -f4
    
    # 提取所有文件 ID 并删除
    echo ""
    echo "开始删除文件..."
    
    echo "$response" | grep -o '"id": "[^"]*"' | cut -d'"' -f4 | while read -r file_id; do
        echo "删除文件: $file_id"
        delete_response=$(curl -s -X DELETE "${BASE_URL}/files/${file_id}" \
          -H "Authorization: Bearer ${API_KEY}")
        
        if echo "$delete_response" | grep -q '"deleted": true'; then
            echo "  ✓ 删除成功"
        else
            echo "  ✗ 删除失败: $delete_response"
        fi
    done
    
    echo ""
    echo "清理完成!"
else
    echo "没有找到文件或列表为空"
    echo "API 响应: $response"
fi
