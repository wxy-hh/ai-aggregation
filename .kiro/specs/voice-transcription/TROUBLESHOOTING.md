# 转录失败问题排查

## 问题现象

上传文件后显示"转录失败"提示。

## 可能的原因

### 1. API Key 未配置或无效

**检查**：

```bash
cat apps/web/.env.local | grep SILICONFLOW_API_KEY
```

**应该看到**：

```
SILICONFLOW_API_KEY="sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh"
```

**解决**：
如果没有或不正确，更新 `.env.local` 文件。

### 2. 临时目录权限问题

**检查**：

```bash
ls -la /tmp/voice-uploads
```

**解决**：

```bash
mkdir -p /tmp/voice-uploads
chmod 755 /tmp/voice-uploads
```

### 3. SiliconFlow API 调用失败

**可能原因**：

- API Key 无效或过期
- 网络连接问题
- API 服务不可用
- 文件格式不支持

### 4. 文件格式问题

**支持的格式**：

- MP3 (audio/mpeg)
- WAV (audio/wav)
- AAC (audio/aac)

**最大文件大小**：50MB

## 快速测试方法

### 方法 1：使用测试按钮（推荐）

这个方法不需要真实的 API 调用，直接显示 UI：

1. 访问 http://localhost:3000/voice
2. 点击"上传音频"标签
3. 点击"测试：直接显示结果界面"按钮
4. 应该立即看到结果界面

**如果这个方法有效**：说明 UI 正常，问题在于 API 调用。

**如果这个方法无效**：说明 UI 有问题，需要检查前端代码。

### 方法 2：检查浏览器控制台

1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 上传文件
4. 查看错误信息

**常见错误**：

#### 错误 1：SILICONFLOW_API_KEY is not configured

```
解决：在 .env.local 中配置 API Key
```

#### 错误 2：Failed to save file

```
解决：检查临时目录权限
mkdir -p /tmp/voice-uploads
chmod 755 /tmp/voice-uploads
```

#### 错误 3：SiliconFlow API error (401)

```
解决：API Key 无效，检查是否正确配置
```

#### 错误 4：SiliconFlow API error (400)

```
解决：文件格式不支持或文件损坏
```

### 方法 3：检查 Network 标签

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 上传文件
4. 找到 `/api/voice/transcribe` 请求
5. 查看请求和响应

**检查项**：

- 请求状态码（应该是 200）
- 请求 Payload（应该包含文件）
- 响应内容（应该包含 transcription 字段）

## 临时解决方案

如果 API 调用一直失败，可以先使用测试按钮来验证 UI 功能：

### 1. 修改代码跳过 API 调用

在 `apps/web/src/components/voice/upload-audio.tsx` 中，找到 `handleFileSelection` 函数，临时注释掉 API 调用：

```typescript
const handleFileSelection = async (file: File) => {
  // ... 验证代码 ...

  setSelectedFile(file);
  setTranscriptionResult(null);
  setShowResult(false);
  onFileSelect?.(file);

  // 创建音频 URL 用于播放
  const url = URL.createObjectURL(file);
  setAudioUrl(url);

  console.log('开始上传文件:', file.name);

  // 临时跳过 API 调用，直接显示结果
  setTranscriptionResult('这是一个测试转录结果');
  setShowResult(true);
  return;

  // 原来的 API 调用代码（临时注释）
  /*
  try {
    const result = await uploadMutation.mutateAsync({ file });
    // ...
  } catch (error) {
    // ...
  }
  */
};
```

这样可以先验证 UI 是否正常工作。

### 2. 使用 Mock API

创建一个 mock API 响应：

```typescript
// 在 handleFileSelection 中
const mockResult = {
  id: 'mock-id',
  status: 'completed',
  transcription: '这是一个模拟的转录结果，用于测试 UI 功能。',
  message: '转录成功（Mock）',
};

setTranscriptionResult(mockResult.transcription);
setShowResult(true);
```

## 详细调试步骤

### 1. 启用详细日志

在 `apps/web/src/app/api/voice/transcribe/route.ts` 中添加更多日志：

```typescript
export async function POST(req: NextRequest) {
  console.log('=== 开始处理转录请求 ===');

  try {
    const formData = await req.formData();
    console.log('FormData 解析成功');

    const file = formData.get('file') as File;
    console.log('文件信息:', {
      name: file?.name,
      size: file?.size,
      type: file?.type,
    });

    // ... 其他代码 ...

    console.log('开始调用 SiliconFlow API');
    const result = await transcribeAudio(tempFilePath, model);
    console.log('SiliconFlow API 调用成功:', result);

    // ... 其他代码 ...
  } catch (error) {
    console.error('=== 转录请求失败 ===');
    console.error('错误类型:', error?.constructor?.name);
    console.error('错误信息:', error instanceof Error ? error.message : error);
    console.error('错误堆栈:', error instanceof Error ? error.stack : '');
    // ... 其他代码 ...
  }
}
```

### 2. 测试 SiliconFlow API

创建一个独立的测试脚本：

```bash
# 创建测试文件
cat > test-api.sh << 'EOF'
#!/bin/bash

API_KEY="sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh"
API_URL="https://api.siliconflow.cn/v1/audio/transcriptions"
MODEL="FunAudioLLM/SenseVoiceSmall"

# 使用一个小的测试音频文件
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@/path/to/test.mp3" \
  -F "model=$MODEL"
EOF

chmod +x test-api.sh
./test-api.sh
```

### 3. 检查环境变量

```bash
# 在开发服务器运行时
cd apps/web
node -e "console.log(process.env.SILICONFLOW_API_KEY)"
```

## 常见问题 FAQ

### Q1: 为什么测试按钮可以工作，但上传文件失败？

**A**: 说明 UI 正常，问题在于 API 调用。检查：

1. API Key 是否配置
2. 网络连接是否正常
3. SiliconFlow API 是否可用

### Q2: 如何验证 API Key 是否有效？

**A**: 使用 curl 测试：

```bash
curl -X GET "https://api.siliconflow.cn/v1/models" \
  -H "Authorization: Bearer sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh"
```

如果返回模型列表，说明 API Key 有效。

### Q3: 文件上传后一直显示"转录中"？

**A**: 可能是：

1. API 调用超时（大文件需要更长时间）
2. 服务器无响应
3. 网络问题

检查 Network 标签中的请求状态。

### Q4: 如何跳过数据库配置？

**A**: 已经实现了数据库可选功能。如果 `DATABASE_URL` 未配置，API 会跳过数据库操作，但仍然调用转录 API。

### Q5: 支持哪些音频格式？

**A**:

- MP3 (推荐)
- WAV
- AAC

最大文件大小：50MB

## 下一步

如果以上方法都无法解决问题，请提供：

1. 浏览器控制台的完整错误日志
2. Network 标签中 `/api/voice/transcribe` 请求的详细信息
3. 服务器端日志（如果有）
4. 上传的文件信息（格式、大小）
5. 环境变量配置（隐藏敏感信息）

## 联系支持

如果问题持续存在，可以：

1. 检查 SiliconFlow API 文档：https://docs.siliconflow.cn/
2. 查看 SiliconFlow API 状态页面
3. 联系 SiliconFlow 技术支持

---

**最后更新**: 2026-01-30
