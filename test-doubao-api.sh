
#!/bin/bash

# ============================================
# 豆包 API 调用示例
# 官方文档: https://www.volcengine.com/docs/82379/1569618
# ============================================

# 从环境变量读取 API Key
ARK_API_KEY="${ARK_API_KEY:-}"

if [ -z "$ARK_API_KEY" ]; then
    echo "❌ 错误: 请设置 ARK_API_KEY 环境变量"
    echo "使用方法: export ARK_API_KEY='your-api-key'"
    exit 1
fi

# ============================================
# 模型列表
# ============================================
# Doubao-Seed-2.0-pro: doubao-seed-2-0-pro-260215 (推荐用于复杂任务)
# Doubao-Seed-2.0-lite: doubao-seed-2-0-lite-260215 (推荐用于快速响应)

# ============================================
# 基础对话示例
# ============================================
# 参数说明:
# - model: 模型ID (必填)
# - input: 输入内容，可以是字符串或消息数组 (必填)
# - stream: 是否流式返回，true/false (可选，默认false)
# - temperature: 温度参数，控制随机性，范围0.0-1.0 (可选，默认0.8)
#   * 较低值(如0.2): 更确定、保守的输出
#   * 较高值(如0.9): 更有创意、多样的输出
# - top_p: 核采样参数，范围0.0-1.0 (可选，默认0.9)
#   * 控制从概率最高的词中选择，建议不与temperature同时调整
# - max_output_tokens: 最大生成token数 (可选)
# - presence_penalty: 存在惩罚，范围-2.0到2.0 (可选)
# - frequency_penalty: 频率惩罚，范围-2.0到2.0 (可选)
# - stop: 停止词列表 (可选)

curl https://ark.cn-beijing.volces.com/api/v3/responses \
  -H "Authorization: Bearer ${ARK_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
      "model": "doubao-seed-2-0-lite-260215",
      "input": "你好，请介绍一下自己",
      "stream": true,
      "temperature": 0.8,
      "top_p": 0.9,
      "max_output_tokens": 2000
  }'

# ============================================
# 多轮对话示例
# ============================================
# 使用消息数组格式进行多轮对话
# role可选值: system(系统提示), user(用户), assistant(助手)

curl https://ark.cn-beijing.volces.com/api/v3/responses \
  -H "Authorization: Bearer ${ARK_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
      "model": "doubao-seed-2-0-pro-260215",
      "input": [
          {
              "role": "system",
              "content": "你是一个专业的编程助手"
          },
          {
              "role": "user",
              "content": "如何用Python读取文件？"
          }
      ],
      "temperature": 0.7,
      "max_output_tokens": 1500
  }'

# ============================================
# 图片理解 - Base64编码方式
# ============================================
# 支持的图片格式: PNG, JPEG, WebP等
# content数组可以混合文本和图片

curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer ${ARK_API_KEY}" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "data:image/png;base64,{base64编码字符串}"
                },
                {
                    "type": "input_text",
                    "text": "请描述这张图片的内容"
                }
            ]
        }
    ],
    "temperature": 0.5
}'

# ============================================
# 文件上传与处理
# ============================================

# 步骤1: 上传文件获取File ID
# 支持的文件类型: PDF, Word, Excel, TXT等
# purpose参数: user_data (用户数据)

curl https://ark.cn-beijing.volces.com/api/v3/files \
-H "Authorization: Bearer ${ARK_API_KEY}" \
-F 'purpose=user_data' \
-F 'file=@/Users/doc/demo.pdf'

# 文件上传成功后的返回格式:
# {
#   "object": "list",
#   "data": [
#     {
#       "id": "file-abc123",           # 文件ID，用于后续引用
#       "object": "file",
#       "bytes": 1024,                  # 文件大小(字节)
#       "created_at": 1677610602,       # 创建时间戳
#       "filename": "example.pdf",      # 原始文件名
#       "purpose": "user_data"          # 用途标识
#     }
#   ],
#   "first_id": "file-abc123",
#   "has_more": false,
#   "last_id": "file-xyz789"
# }

# 步骤2: 在对话中引用已上传的文件
# 使用返回的data[0].id作为file_id

curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer ${ARK_API_KEY}" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-pro-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "file_id": "file-20251018****"
                },
                {
                    "type": "input_text",
                    "text": "请总结这份文档的主要内容"
                }
            ]
        }
    ],
    "temperature": 0.3,
    "max_output_tokens": 3000
}'
# ============================================
# 视频理解
# ============================================
# 通过URL传入视频进行分析
# fps参数: 视频采样帧率，控制分析精度

curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer ${ARK_API_KEY}" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-pro-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                    "fps": 1
                },
                {
                    "type": "input_text",
                    "text": "请描述视频中的主要内容和场景"
                }
            ]
        }
    ],
    "temperature": 0.6,
    "max_output_tokens": 2000
}'

# ============================================
# JSON结构化输出
# ============================================
# 使用text.format参数控制输出格式
# type可选值: json_object, json_schema

curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer ${ARK_API_KEY}" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-pro-260215",
    "input": [
        {
            "role": "system",
            "content": "你是一个数据分析助手，需要以JSON格式返回结果"
        },
        {
            "role": "user",
            "content": "分析2024年第一季度销售数据"
        }
    ],
    "text": {
        "format": {
            "type": "json_object"
        }
    },
    "temperature": 0.3
}'

# ============================================
# 常用参数组合建议
# ============================================

# 1. 创意写作场景
# temperature: 0.8-0.9
# top_p: 0.9-0.95
# max_output_tokens: 2000-4000

# 2. 代码生成场景
# temperature: 0.2-0.4
# top_p: 0.9
# max_output_tokens: 2000

# 3. 数据分析场景
# temperature: 0.1-0.3
# top_p: 0.9
# max_output_tokens: 1500
# text.format: json_object

# 4. 客服对话场景
# temperature: 0.5-0.7
# top_p: 0.9
# max_output_tokens: 1000

# ============================================
# 注意事项
# ============================================
# 1. temperature和top_p建议只调整其中一个
# 2. stream=true时会以SSE格式流式返回结果
# 3. 文件上传有大小限制，具体见官方文档
# 4. API调用有QPS限制，需要时可申请提升
# 5. 保护好API Key，不要泄露到公开代码库





