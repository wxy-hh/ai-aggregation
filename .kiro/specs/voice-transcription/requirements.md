# 语音转录功能需求文档

## 1. 功能概述

实现基于硅基流动 API 的音频文件上传和语音转录功能，支持用户上传音频文件并获取转录文本，同时提供历史记录管理。

## 2. 用户故事

### 2.1 音频上传与转录

**作为** 用户  
**我想要** 上传本地音频文件并获取转录文本  
**以便于** 快速将语音内容转换为可编辑的文字

**验收标准：**

- 用户可以通过拖拽或点击选择上传 MP3/WAV/AAC 格式的音频文件
- 文件大小限制在 50MB 以内
- 上传后自动调用硅基流动 API 进行转录
- 转录完成后显示文本结果
- 显示转录进度和状态（上传中、转录中、完成、失败）
- 转录失败时显示友好的错误提示

### 2.2 历史记录管理

**作为** 用户  
**我想要** 查看我的转录历史记录  
**以便于** 回顾和管理之前的转录内容

**验收标准：**

- 所有转录记录自动保存到数据库
- 在右侧边栏显示转录历史列表
- 每条记录显示：文件名、时长、转录时间、状态标签
- 支持点击历史记录查看详细转录文本
- 支持搜索历史记录
- 支持删除历史记录

### 2.3 转录结果操作

**作为** 用户  
**我想要** 对转录结果进行操作  
**以便于** 更好地使用转录内容

**验收标准：**

- 支持复制转录文本到剪贴板
- 支持导出为 TXT 文件
- 支持编辑转录文本（可选）
- 支持发送转录文本到 AI 对话

## 3. 技术需求

### 3.1 API 集成

- **服务商：** 硅基流动 (SiliconFlow)
- **API 端点：** `https://api.siliconflow.cn/v1/audio/transcriptions`
- **认证方式：** Bearer Token
- **API Key：** `sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh`
- **支持模型：**
  - `FunAudioLLM/SenseVoiceSmall` (默认)
  - `TeleAI/TeleSpeechASR`

### 3.2 文件处理

- **支持格式：** MP3, WAV, AAC
- **文件大小限制：** 最大 50MB
- **时长限制：** 最大 1 小时
- **存储方式：**
  - 临时存储：上传到服务器临时目录
  - 长期存储：可选上传到 OSS（未来扩展）

### 3.3 数据库设计

需要扩展现有的 `Task` 模型或创建新的 `VoiceTranscription` 模型：

```prisma
model VoiceTranscription {
  id            String    @id @default(cuid())
  userId        String
  fileName      String
  fileSize      Int
  duration      Int?      // 音频时长（秒）
  format        String    // mp3, wav, aac
  model         String    // 使用的模型
  status        String    @default("pending") // pending, processing, completed, failed
  transcription String?   @db.Text // 转录文本
  error         String?   @db.Text
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@map("voice_transcriptions")
}
```

### 3.4 API 路由设计

#### POST /api/voice/transcribe

上传音频文件并开始转录

**请求：**

- Content-Type: `multipart/form-data`
- Body:
  - `file`: 音频文件
  - `model`: 模型名称（可选，默认 `FunAudioLLM/SenseVoiceSmall`）

**响应：**

```json
{
  "id": "transcription_id",
  "status": "processing",
  "message": "转录任务已创建"
}
```

#### GET /api/voice/transcriptions

获取用户的转录历史列表

**查询参数：**

- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）
- `status`: 状态筛选（可选）

**响应：**

```json
{
  "data": [
    {
      "id": "transcription_id",
      "fileName": "audio.mp3",
      "fileSize": 1024000,
      "duration": 120,
      "status": "completed",
      "transcription": "转录文本...",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### GET /api/voice/transcriptions/:id

获取单个转录记录详情

**响应：**

```json
{
  "id": "transcription_id",
  "fileName": "audio.mp3",
  "fileSize": 1024000,
  "duration": 120,
  "format": "mp3",
  "model": "FunAudioLLM/SenseVoiceSmall",
  "status": "completed",
  "transcription": "转录文本...",
  "createdAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:02:00Z"
}
```

#### DELETE /api/voice/transcriptions/:id

删除转录记录

**响应：**

```json
{
  "success": true,
  "message": "转录记录已删除"
}
```

## 4. 实现方案

### 4.1 架构设计

```
前端 (React)
  ↓ 上传文件
Next.js API Route (/api/voice/transcribe)
  ↓ 保存文件到临时目录
  ↓ 创建数据库记录 (status: pending)
  ↓ 调用硅基流动 API
硅基流动 API
  ↓ 返回转录结果
Next.js API Route
  ↓ 更新数据库记录 (status: completed)
  ↓ 返回结果给前端
前端
  ↓ 显示转录文本
  ↓ 更新历史记录列表
```

### 4.2 技术栈选择

**前端：**

- React 19 + Next.js 15
- Zustand (状态管理)
- React Query (数据获取和缓存)
- Tailwind CSS (样式)

**后端：**

- Next.js API Routes
- Prisma (ORM)
- PostgreSQL (数据库)
- FormData API (文件上传)

**第三方服务：**

- 硅基流动 API (语音转录)

### 4.3 是否需要队列？

**分析：**

- 音频转录是同步操作（硅基流动 API 直接返回结果）
- 文件大小限制在 50MB，处理时间可控
- 不需要复杂的任务调度

**结论：**
暂时不需要队列系统，直接在 API Route 中同步调用硅基流动 API。如果未来需要处理更大的文件或批量转录，可以考虑引入 BullMQ。

### 4.4 是否需要文件存储？

**分析：**

- 硅基流动 API 需要文件对象，不支持 URL
- 需要临时存储上传的文件
- 转录完成后可以删除临时文件
- 如果需要保留原始音频，可以上传到 OSS

**结论：**

- **短期方案：** 使用 Next.js 的临时文件存储（`/tmp` 目录）
- **长期方案：** 集成 OSS 存储原始音频文件（可选功能）

## 5. 非功能性需求

### 5.1 性能要求

- 文件上传速度：根据用户网络速度
- API 响应时间：< 30 秒（取决于音频时长）
- 历史记录加载：< 1 秒

### 5.2 安全要求

- API Key 存储在环境变量中
- 文件类型验证（前端 + 后端）
- 文件大小验证（前端 + 后端）
- 用户认证（需要登录才能使用）
- 防止恶意文件上传

### 5.3 用户体验

- 上传进度显示
- 转录进度显示
- 友好的错误提示
- 响应式设计
- 深色模式支持

## 6. 测试计划

### 6.1 单元测试

- 文件验证逻辑
- API 调用逻辑
- 数据库操作

### 6.2 集成测试

- 完整的上传转录流程
- 历史记录 CRUD 操作
- 错误处理

### 6.3 端到端测试

- 用户上传文件并查看结果
- 查看和管理历史记录
- 导出和复制功能

## 7. 里程碑

### Phase 1: 核心功能（MVP）

- [ ] 数据库 schema 设计和迁移
- [ ] API Route 实现（上传和转录）
- [ ] 前端上传组件集成
- [ ] 转录结果显示
- [ ] 基本错误处理

### Phase 2: 历史记录

- [ ] 历史记录 API 实现
- [ ] 历史记录列表组件
- [ ] 搜索和筛选功能
- [ ] 删除功能

### Phase 3: 增强功能

- [ ] 复制和导出功能
- [ ] 发送到 AI 对话
- [ ] 音频播放器
- [ ] 转录文本编辑

### Phase 4: 优化

- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 用户体验优化
- [ ] OSS 集成（可选）

## 8. 风险和挑战

### 8.1 技术风险

- **硅基流动 API 稳定性：** 依赖第三方服务，可能出现故障
  - **缓解措施：** 实现重试机制，提供友好的错误提示
- **文件上传大小限制：** Next.js 默认限制 4MB
  - **缓解措施：** 配置 `next.config.ts` 增加限制

- **临时文件清理：** 可能占用服务器空间
  - **缓解措施：** 实现定时清理机制

### 8.2 业务风险

- **API 成本：** 转录服务可能产生费用
  - **缓解措施：** 监控使用量，设置配额限制

- **用户隐私：** 音频文件可能包含敏感信息
  - **缓解措施：** 明确隐私政策，转录后删除原始文件

## 9. 依赖项

### 9.1 现有依赖

- ✅ Next.js 15
- ✅ React 19
- ✅ Prisma
- ✅ PostgreSQL
- ✅ Zustand
- ✅ React Query

### 9.2 需要添加的依赖

- `formidable` 或 `multer` - 文件上传处理（Next.js 15 可能需要）
- `form-data` - 构建 multipart/form-data 请求

## 10. 环境变量配置

需要在 `.env.local` 中添加：

```env
# SiliconFlow API
SILICONFLOW_API_KEY=sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1
```

## 11. 下一步行动

1. ✅ 创建需求文档（当前文档）
2. ⏭️ 创建设计文档（design.md）
3. ⏭️ 创建任务列表（tasks.md）
4. ⏭️ 开始实现 Phase 1
