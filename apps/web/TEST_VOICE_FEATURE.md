# 语音转录功能测试指南

## ✅ 已完成的实现

### 后端 API

- [x] POST /api/voice/transcribe - 上传并转录音频
- [x] GET /api/voice/transcriptions - 获取历史记录列表
- [x] GET /api/voice/transcriptions/:id - 获取单条记录
- [x] DELETE /api/voice/transcriptions/:id - 删除记录

### 数据库

- [x] VoiceTranscription 模型已添加
- [x] 数据库 schema 已生成

### 工具库

- [x] SiliconFlow API 客户端
- [x] 文件上传处理工具
- [x] 前端 API 客户端
- [x] React Query Hooks

### 前端组件

- [x] UploadAudio 组件已集成真实 API
- [x] 显示上传状态和转录结果

## 🧪 测试步骤

### 1. 启动开发服务器

```bash
# 确保数据库正在运行
# 如果使用 Docker:
# docker-compose up -d postgres

# 运行数据库迁移（如果还没运行）
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

### 2. 访问语音转写页面

打开浏览器访问: http://localhost:3000/voice

### 3. 测试上传功能

1. 点击"上传音频" Tab
2. 准备一个测试音频文件（MP3/WAV/AAC，< 50MB）
3. 拖拽文件到上传区域，或点击"选择文件"按钮
4. 等待上传和转录完成（可能需要 10-30 秒）
5. 查看转录结果

### 4. 测试历史记录（待实现）

右侧边栏的历史记录功能需要在下一步实现。

## 🔍 验证清单

### 环境配置

- [x] SILICONFLOW_API_KEY 已配置
- [x] 数据库连接正常
- [x] Next.js 配置已更新
- [x] form-data 依赖已安装

### API 端点

- [ ] POST /api/voice/transcribe 返回正确的响应
- [ ] GET /api/voice/transcriptions 返回历史记录
- [ ] GET /api/voice/transcriptions/:id 返回单条记录
- [ ] DELETE /api/voice/transcriptions/:id 删除成功

### 前端功能

- [ ] 文件上传 UI 正常工作
- [ ] 上传进度显示正确
- [ ] 转录结果显示正确
- [ ] 错误处理正常

## 🐛 已知问题

### 1. 用户认证

当前使用临时用户 ID (`temp-user-id`)，需要集成真实的用户认证系统。

**位置：**

- `apps/web/src/app/api/voice/transcribe/route.ts:32`
- `apps/web/src/app/api/voice/transcriptions/route.ts:14`
- `apps/web/src/app/api/voice/transcriptions/[id]/route.ts:10,28`

**修复方法：**

```typescript
// 从 session 获取用户 ID
import { getServerSession } from 'next-auth';
const session = await getServerSession();
const userId = session?.user?.id || 'temp-user-id';
```

### 2. 数据库迁移

如果数据库还没有运行迁移，需要执行：

```bash
pnpm db:migrate
```

### 3. 临时文件清理

临时文件目录 `/tmp/voice-uploads` 需要定期清理。

**解决方案：**

- 添加定时任务清理旧文件
- 或在每次上传后立即删除

## 📝 下一步实现

### Phase 2: 历史记录功能

- [ ] 更新 RecordingLibrary 组件使用真实数据
- [ ] 实现分页加载
- [ ] 实现搜索功能
- [ ] 实现删除功能
- [ ] 实现点击查看详情

### Phase 3: 用户体验优化

- [ ] 添加加载骨架屏
- [ ] 优化错误提示
- [ ] 添加重试机制
- [ ] 优化响应式设计

### Phase 4: 高级功能

- [ ] 复制到剪贴板
- [ ] 导出为 TXT
- [ ] 发送到 AI 对话
- [ ] 音频播放器

## 🆘 故障排除

### 问题：上传失败

**可能原因：**

1. API Key 无效或未配置
2. 文件格式不支持
3. 文件大小超过限制
4. 网络连接问题

**解决方法：**

1. 检查 `.env.local` 中的 `SILICONFLOW_API_KEY`
2. 确保文件是 MP3/WAV/AAC 格式
3. 确保文件 < 50MB
4. 检查网络连接和 API 状态

### 问题：数据库错误

**可能原因：**

1. 数据库未启动
2. 数据库迁移未运行
3. 连接字符串错误

**解决方法：**

1. 启动 PostgreSQL 数据库
2. 运行 `pnpm db:migrate`
3. 检查 `DATABASE_URL` 环境变量

### 问题：转录失败

**可能原因：**

1. SiliconFlow API 错误
2. 音频文件损坏
3. 网络超时

**解决方法：**

1. 查看服务器日志获取详细错误信息
2. 尝试使用其他音频文件
3. 增加请求超时时间

## 📊 测试数据

### 测试音频文件

可以使用以下方式获取测试音频：

1. 录制一段简短的语音（< 1 分钟）
2. 从网上下载免费的测试音频
3. 使用文本转语音工具生成测试音频

### 预期结果

- 上传成功后应该看到转录文本
- 转录文本应该与音频内容匹配
- 历史记录应该显示新的转录记录

## 📞 获取帮助

如果遇到问题：

1. 查看浏览器控制台的错误信息
2. 查看服务器终端的日志
3. 检查数据库中的记录
4. 参考设计文档和 API 文档

---

**测试愉快！** 🎉
