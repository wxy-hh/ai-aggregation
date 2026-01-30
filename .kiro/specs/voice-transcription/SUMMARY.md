# 语音转录功能实现方案总结

## 📋 方案概述

本方案设计了一个完整的音频文件上传和语音转录功能，基于硅基流动 (SiliconFlow) API，集成到现有的 AI 聚合平台中。

## 🎯 核心决策

### 1. 架构选择：直接 API 调用 vs 队列系统

**决策：直接 API 调用（Phase 1）**

**理由：**

- ✅ 硅基流动 API 是同步的，直接返回结果
- ✅ 文件大小限制在 50MB，处理时间可控（通常 < 30 秒）
- ✅ 实现简单，快速上线 MVP
- ✅ 减少系统复杂度，无需维护队列服务

**未来扩展：**

- 如果需要处理更大文件（> 50MB）
- 如果需要批量转录
- 如果需要异步处理和通知
- 可以在 Phase 2 引入 BullMQ 队列系统

### 2. 文件存储：临时存储 vs OSS

**决策：临时文件存储（Phase 1）**

**理由：**

- ✅ 硅基流动 API 需要文件对象，不支持 URL
- ✅ 转录完成后可以立即删除，节省存储空间
- ✅ 实现简单，无需配置 OSS
- ✅ 符合隐私保护原则（不保留原始音频）

**实现方式：**

```typescript
// 使用 Next.js 临时目录
const tempDir = '/tmp/voice-uploads';
const tempFilePath = path.join(tempDir, `${Date.now()}-${file.name}`);

// 转录完成后删除
fs.unlinkSync(tempFilePath);
```

**未来扩展：**

- 如果用户需要保留原始音频
- 如果需要音频回放功能
- 可以集成 OSS 存储（已有 `@repo/storage` 包）

### 3. 数据库设计：扩展 Task vs 新建 VoiceTranscription

**决策：新建 VoiceTranscription 模型**

**理由：**

- ✅ 语音转录有特定的字段需求（fileName, duration, format 等）
- ✅ 与通用 Task 模型分离，便于查询和管理
- ✅ 便于未来扩展（说话人识别、时间戳等）
- ✅ 符合单一职责原则

**Schema 设计：**

```prisma
model VoiceTranscription {
  id            String    @id @default(cuid())
  userId        String
  fileName      String
  fileSize      Int
  duration      Int?
  format        String
  model         String
  status        String
  transcription String?   @db.Text
  error         String?   @db.Text
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

### 4. 状态管理：Zustand + React Query

**决策：组合使用**

**理由：**

- ✅ Zustand 管理 UI 状态（上传进度、当前选中等）
- ✅ React Query 管理服务器状态（历史记录、转录结果）
- ✅ 自动缓存和重新验证
- ✅ 乐观更新和错误回滚
- ✅ 符合 Vercel React Best Practices

**实现方式：**

```typescript
// Zustand - UI 状态
const useVoiceStore = create<VoiceState>((set) => ({
  isUploading: false,
  uploadProgress: 0,
  currentTranscription: null,
  // ...
}));

// React Query - 服务器状态
const { data, isLoading } = useVoiceTranscriptions({
  page: 1,
  limit: 20,
});

const uploadMutation = useUploadVoice();
```

## 🏗️ 技术栈

### 前端

- **框架**: React 19 + Next.js 15
- **状态管理**: Zustand + React Query
- **样式**: Tailwind CSS
- **UI 组件**: Radix UI
- **表单**: React Hook Form
- **验证**: Zod

### 后端

- **框架**: Next.js API Routes
- **ORM**: Prisma
- **数据库**: PostgreSQL
- **文件处理**: Node.js fs/promises
- **HTTP 客户端**: fetch API

### 第三方服务

- **语音转录**: 硅基流动 API
  - 端点: `https://api.siliconflow.cn/v1/audio/transcriptions`
  - 模型: `FunAudioLLM/SenseVoiceSmall` (默认)

## 📊 数据流

```
用户上传文件
    ↓
前端验证（类型、大小）
    ↓
FormData 上传到 /api/voice/transcribe
    ↓
后端接收并保存到临时目录
    ↓
创建数据库记录 (status: pending)
    ↓
调用硅基流动 API
    ↓
等待 API 响应（同步）
    ↓
更新数据库 (status: completed, transcription: text)
    ↓
删除临时文件
    ↓
返回结果给前端
    ↓
前端显示转录文本 + 更新历史记录
```

## 🔐 安全设计

### 认证和授权

- ✅ 用户必须登录才能使用
- ✅ API Key 存储在环境变量
- ✅ 用户只能访问自己的记录

### 文件安全

- ✅ 严格的文件类型验证（前端 + 后端）
- ✅ 文件大小限制（50MB）
- ✅ 文件名清理（防止路径遍历）
- ✅ 临时文件及时删除

### API 安全

- ✅ Rate Limiting（防止滥用）
- ✅ HTTPS 强制
- ✅ CSRF 保护

## 📈 性能优化

### 前端优化（遵循 Vercel React Best Practices）

```typescript
// 1. Bundle Size Optimization
const AudioPlayer = dynamic(() => import('./audio-player'), {
  loading: () => <Skeleton />,
});

// 2. Re-render Optimization
const TranscriptionItem = React.memo(({ item }) => {
  // ...
});

// 3. Rendering Performance
const staticJSX = <Header />; // 提取到组件外

// 4. Client-Side Data Fetching
const { data } = useVoiceTranscriptions({
  staleTime: 30000, // 30 秒缓存
});
```

### 后端优化

```typescript
// 1. 数据库索引
@@index([userId])
@@index([status])
@@index([createdAt])

// 2. 分页查询
const transcriptions = await prisma.voiceTranscription.findMany({
  take: limit,
  skip: (page - 1) * limit,
});

// 3. 并发控制
const MAX_CONCURRENT_UPLOADS = 3;
```

## 🧪 测试策略

### 单元测试

- API 客户端
- 文件处理工具
- 状态管理
- 工具函数

### 集成测试

- 完整上传转录流程
- 历史记录 CRUD
- 错误处理

### E2E 测试

- 用户上传文件
- 查看转录结果
- 管理历史记录

## 📦 依赖项

### 现有依赖（无需安装）

- ✅ Next.js 15
- ✅ React 19
- ✅ Prisma
- ✅ PostgreSQL
- ✅ Zustand
- ✅ React Query

### 需要添加的依赖

```json
{
  "dependencies": {
    "form-data": "^4.0.0" // 构建 multipart/form-data
  }
}
```

## 🚀 实施计划

### Phase 1: MVP（核心功能）- 约 20 小时

1. 数据库 schema 设计和迁移
2. 后端 API 实现（上传、转录、查询）
3. 前端状态管理
4. 组件集成和 UI 更新

### Phase 2: 用户体验优化 - 约 4 小时

1. 加载状态和骨架屏
2. 错误处理和重试
3. 空状态设计
4. 响应式优化

### Phase 3: 高级功能（可选）- 约 8 小时

1. 复制和导出
2. 发送到 AI 对话
3. 音频播放器
4. 文本编辑

### Phase 4: 优化和测试 - 约 18 小时

1. 性能优化
2. 安全加固
3. 测试覆盖
4. 文档编写

**总计**: 约 50 小时

## 🎯 成功指标

### 功能指标

- ✅ 支持 MP3/WAV/AAC 格式
- ✅ 文件大小 ≤ 50MB
- ✅ 转录准确率 > 95%（取决于 API）
- ✅ 历史记录完整保存

### 性能指标

- ✅ 文件上传时间 < 10 秒（50MB）
- ✅ API 响应时间 < 30 秒
- ✅ 历史记录加载 < 1 秒
- ✅ 页面首次加载 < 2 秒

### 用户体验指标

- ✅ 上传成功率 > 99%
- ✅ 转录成功率 > 95%
- ✅ 错误恢复率 > 90%
- ✅ 用户满意度 > 4.5/5

## 🔮 未来扩展

### 短期（3-6 个月）

- 实时录音转录
- 多语言支持
- 说话人识别
- 时间戳标注

### 长期（6-12 个月）

- 批量上传
- 视频转录
- 字幕生成
- AI 摘要和关键词提取
- 情感分析
- 协作编辑

## 📚 参考文档

- [需求文档](./requirements.md)
- [设计文档](./design.md)
- [任务列表](./tasks.md)
- [SiliconFlow API 文档](https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions)
- [Vercel React Best Practices](../../.claude/skills/vercel-react-best-practices/SKILL.md)

## ✅ 下一步行动

1. **审查和确认方案** - 与团队讨论技术选型
2. **环境准备** - 配置 API Key 和数据库
3. **开始实现 Phase 1** - 从数据库 schema 开始
4. **迭代开发** - 按照任务列表逐步实现
5. **测试和优化** - 确保质量和性能

---

**创建时间**: 2026-01-30  
**版本**: 1.0  
**状态**: 待审查
