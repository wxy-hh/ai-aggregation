# 快速测试指南

## 问题修复

已修复上传音频后页面不显示结果界面的问题。

## 修复内容

### 1. 改进条件渲染逻辑

**之前**：需要 `showResult && selectedFile && transcriptionResult` 三个条件都满足
**现在**：只需要 `showResult && selectedFile` 两个条件

这样即使转录结果为空，也会显示结果界面（使用 mock 数据演示）。

### 2. 添加调试日志

在关键步骤添加了 `console.log`，方便调试：

- 开始上传文件
- 转录结果
- 设置 showResult 状态
- 渲染 TranscriptionResult 组件

### 3. 数据库可选

修改了 API 路由，使其在数据库不可用时也能正常工作：

- 检查 `DATABASE_URL` 是否配置
- 如果数据库不可用，跳过数据库操作
- 仍然调用 SiliconFlow API 进行转录

### 4. 添加测试按钮

在开发模式下添加了"测试：直接显示结果界面"按钮，可以快速测试结果界面的显示。

## 测试步骤

### 方法 1：使用测试按钮（推荐）

1. 启动开发服务器：

   ```bash
   cd apps/web
   pnpm dev
   ```

2. 访问 http://localhost:3000/voice

3. 点击"上传音频"标签

4. 点击"测试：直接显示结果界面"按钮

5. 应该立即看到双语对照结果界面

### 方法 2：上传真实音频文件

1. 启动开发服务器（同上）

2. 访问 http://localhost:3000/voice

3. 点击"上传音频"标签

4. 上传一个 MP3/WAV/AAC 文件

5. 等待转录完成（查看浏览器控制台的日志）

6. 转录完成后应该自动切换到结果界面

## 查看调试信息

打开浏览器开发者工具（F12），查看 Console 标签：

```
开始上传文件: test-audio.mp3
转录结果: { id: "...", status: "completed", transcription: "..." }
设置 showResult 为 true
渲染 TranscriptionResult 组件
```

## 如果仍然不显示

### 检查 1：确认状态更新

在浏览器控制台查看是否有以下日志：

- "开始上传文件"
- "转录结果"
- "设置 showResult 为 true"
- "渲染 TranscriptionResult 组件"

### 检查 2：查看错误信息

如果有错误，会在控制台显示：

- "Upload error: ..."
- 或者弹出 alert 提示

### 检查 3：确认 API 调用

在 Network 标签查看：

- 是否有 POST 请求到 `/api/voice/transcribe`
- 请求状态是否为 200
- 响应内容是否包含 `transcription` 字段

### 检查 4：环境变量

确认 `.env.local` 中配置了：

```
SILICONFLOW_API_KEY="sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh"
SILICONFLOW_API_URL="https://api.siliconflow.cn/v1"
SILICONFLOW_DEFAULT_MODEL="FunAudioLLM/SenseVoiceSmall"
```

## 预期结果

上传成功后，应该看到：

1. **文件信息卡片**
   - 文件名
   - 文件大小
   - 状态：转录中 → 完成

2. **结果界面自动切换**
   - 显示文件名和语言信息
   - 显示双语对照文本
   - 显示音频播放器
   - 显示 5 个对话片段（mock 数据）

3. **可交互功能**
   - 切换视图模式（仅原文、仅译文、双语对照）
   - 播放音频
   - 点击片段跳转
   - 复制译文

## 已知限制

1. **Mock 数据**：当前显示的片段、翻译、说话人都是预设的 mock 数据
2. **数据库**：如果没有配置数据库，转录记录不会保存
3. **音频播放**：使用上传的原始文件，时间戳可能不准确

## 下一步

如果测试成功，可以继续：

1. 配置数据库（如果需要保存历史记录）
2. 集成翻译 API
3. 集成说话人识别
4. 实现音频分段

## 问题反馈

如果遇到问题，请提供：

1. 浏览器控制台的完整日志
2. Network 标签中的 API 请求详情
3. 上传的文件信息（格式、大小）
4. 环境变量配置（隐藏敏感信息）
