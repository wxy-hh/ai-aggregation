#!/bin/bash

# 测试 SiliconFlow API
API_KEY="sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh"
API_URL="https://api.siliconflow.cn/v1/audio/transcriptions"
MODEL="FunAudioLLM/SenseVoiceSmall"

# 检查是否有测试文件
TEST_FILE="/tmp/voice-uploads/1769764319736-____-2510291614.mp3"

if [ ! -f "$TEST_FILE" ]; then
    echo "错误：测试文件不存在: $TEST_FILE"
    echo "请先上传一个文件，或者修改 TEST_FILE 变量指向一个存在的音频文件"
    exit 1
fi

echo "测试 SiliconFlow 语音转文本 API"
echo "================================"
echo "API URL: $API_URL"
echo "Model: $MODEL"
echo "File: $TEST_FILE"
echo ""
echo "发送请求..."
echo ""

curl --request POST \
  --url "$API_URL" \
  --header "Authorization: Bearer $API_KEY" \
  --header "Content-Type: multipart/form-data" \
  --form "file=@$TEST_FILE" \
  --form "model=$MODEL" \
  --verbose

echo ""
echo ""
echo "测试完成"
