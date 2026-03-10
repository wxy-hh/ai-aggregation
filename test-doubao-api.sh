
ARK_API_KEY="3a04b704-6445-4f3e-a127-bcb711461706"

#模型名称对应的模型 id
Doubao-Seed-2.0-pro:doubao-seed-2-0-pro-260215
Doubao-Seed-2.0-lite:doubao-seed-2-0-lite-260215

#图片理解--本地图片上传（Base64编码）
# Curl示例
BASE64_IMAGE=$(base64 < demo.png) && curl https://ark.cn-beijing.volces.com/api/v3/responses \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $ARK_API_KEY" \
   -d @- <<EOF
   {
    "model": "doubao-seed-1-6-251015",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_image",
            "image_url": "data:image/png;base64,$BASE64_IMAGE"
          },
          {
            "type": "input_text",
            "text": "Which model series supports image input?"
          }
        ]
      }
    ]
  }
EOF

#上传文件
# 1. 上传PDF文件获取File ID
curl https://ark.cn-beijing.volces.com/api/v3/files \
-H "Authorization: Bearer $ARK_API_KEY" \
-F 'purpose=user_data' \
-F 'file=@/Users/doc/demo.pdf'
#文件上传的返回格式
{
  "object": "list",
  "data": [
    {
      "id": "file-abc123",
      "object": "file",
      "bytes": 1024,
      "created_at": 1677610602,
      "filename": "example.pdf",
      "purpose": "user_data"
    }
  ],
  "first_id": "file-abc123",
  "has_more": false,
  "last_id": "file-xyz789"
}

# 2. 在Responses API中引用File ID(data.id)
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-1-6-251015",
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
                    "text": "按段落给出文档中的文字内容，以JSON格式输出，包括段落类型（type）、文字内容（content）信息。"
                }
            ]
        }
    ]
}'
#视频URL传入
# Curl示例
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-1-6-251015",
    "input": [
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                    "fps":1
                }
            ]
        }
    ]
}'





