# 语音转录功能设计文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (React)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ UploadAudio  │  │ Transcript   │  │ Recording    │      │
│  │ Component    │  │ Display      │  │ Library      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │  Zustand Store │                        │
│                    │  + React Query │                        │
│                    └───────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │ HTTP/REST
┌────────────────────────────▼──────────────────────────────────┐
│                    API 层 (Next.js Routes)                     │
├─────────────────────────────────────────────────────────────┤
│  POST   /api/voice/transcribe                               │
│  GET    /api/voice/transcriptions                           │
│  GET    /api/voice/transcriptions/:id                       │
│  DELETE /api/voice/transcriptions/:id                       │
└────────────────────────────┬──────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌──────────────────┐  ┌──────────────┐
│   Prisma ORM  │  │  File System     │  │ SiliconFlow  │
│               │  │  (Temp Storage)  │  │  API         │
└───────┬───────┘  └──────────────────┘  └──────────────┘
        │
        ▼
┌───────────────┐
│  PostgreSQL   │
│   Database    │
└───────────────┘
```

### 1.2 数据流

#### 上传和转录流程

```
1. 用户选择文件
   ↓
2. 前端验证（类型、大小）
   ↓
3. FormData 上传到 /api/voice/transcribe
   ↓
4. 后端接收文件
   ↓
5. 保存到临时目录
   ↓
6. 创建数据库记录 (status: pending)
   ↓
7. 读取文件并调用 SiliconFlow API
   ↓
8. 等待 API 响应
   ↓
9. 更新数据库记录 (status: completed, transcription: text)
   ↓
10. 删除临时文件
   ↓
11. 返回结果给前端
   ↓
12. 前端更新 UI 和历史记录
```

## 2. 数据库设计

### 2.1 Schema 扩展

```prisma
// 在 schema.prisma 中添加

model VoiceTranscription {
  id            String    @id @default(cuid())
  userId        String
  fileName      String
  fileSize      Int       // 字节
  duration      Int?      // 秒
  format        String    // mp3, wav, aac
  model         String    @default("FunAudioLLM/SenseVoiceSmall")
  status        String    @default("pending") // pending, processing, completed, failed
  transcription String?   @db.Text
  error         String?   @db.Text
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@map("voice_transcriptions")
}

// 在 User model 中添加关系
model User {
  // ... 现有字段
  voiceTranscriptions VoiceTranscription[]
}
```

### 2.2 状态机

```
pending → processing → completed
                    ↘ failed
```

- **pending**: 记录已创建，等待处理
- **processing**: 正在调用 API 转录
- **completed**: 转录成功
- **failed**: 转录失败

## 3. API 设计

### 3.1 POST /api/voice/transcribe

#### 请求

```typescript
// Content-Type: multipart/form-data
{
  file: File,
  model?: 'FunAudioLLM/SenseVoiceSmall' | 'TeleAI/TeleSpeechASR'
}
```

#### 响应

```typescript
// 成功 (200)
{
  id: string;
  status: 'processing' | 'completed';
  transcription?: string;
  message: string;
}

// 错误 (400/500)
{
  error: string;
  details?: string;
}
```

#### 实现逻辑

```typescript
1. 验证用户认证
2. 解析 multipart/form-data
3. 验证文件类型和大小
4. 保存文件到临时目录
5. 创建数据库记录
6. 调用 SiliconFlow API
7. 更新数据库记录
8. 清理临时文件
9. 返回结果
```

### 3.2 GET /api/voice/transcriptions

#### 请求

```typescript
// Query Parameters
{
  page?: number;      // 默认 1
  limit?: number;     // 默认 20
  status?: string;    // 可选筛选
  search?: string;    // 搜索文件名
}
```

#### 响应

```typescript
{
  data: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    duration: number | null;
    format: string;
    status: string;
    transcription: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
}
```

### 3.3 GET /api/voice/transcriptions/:id

#### 响应

```typescript
{
  id: string;
  fileName: string;
  fileSize: number;
  duration: number | null;
  format: string;
  model: string;
  status: string;
  transcription: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

### 3.4 DELETE /api/voice/transcriptions/:id

#### 响应

```typescript
{
  success: boolean;
  message: string;
}
```

## 4. 前端设计

### 4.1 状态管理 (Zustand)

```typescript
// stores/voice-store.ts
interface VoiceState {
  // 当前转录
  currentTranscription: VoiceTranscription | null;

  // 历史记录
  transcriptions: VoiceTranscription[];
  pagination: Pagination;

  // UI 状态
  isUploading: boolean;
  uploadProgress: number;

  // Actions
  uploadFile: (file: File, model?: string) => Promise<void>;
  fetchTranscriptions: (params?: FetchParams) => Promise<void>;
  fetchTranscription: (id: string) => Promise<void>;
  deleteTranscription: (id: string) => Promise<void>;
  setCurrentTranscription: (transcription: VoiceTranscription | null) => void;
}
```

### 4.2 React Query 集成

```typescript
// hooks/use-voice-transcriptions.ts
export function useVoiceTranscriptions(params?: FetchParams) {
  return useQuery({
    queryKey: ['voice-transcriptions', params],
    queryFn: () => fetchTranscriptions(params),
    staleTime: 30000, // 30 秒
  });
}

export function useVoiceTranscription(id: string) {
  return useQuery({
    queryKey: ['voice-transcription', id],
    queryFn: () => fetchTranscription(id),
    enabled: !!id,
  });
}

export function useUploadVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { file: File; model?: string }) => uploadVoiceFile(data.file, data.model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
    },
  });
}
```

### 4.3 组件更新

#### UploadAudio 组件增强

```typescript
// 添加功能：
1. 集成上传 API 调用
2. 显示上传进度
3. 显示转录进度
4. 错误处理和重试
5. 成功后显示结果
```

#### RecordingLibrary 组件增强

```typescript
// 添加功能：
1. 从 API 获取真实数据
2. 分页加载
3. 搜索功能
4. 点击查看详情
5. 删除功能
6. 状态标签显示
```

#### 新增 TranscriptionDetail 组件

```typescript
// 功能：
1. 显示完整转录文本
2. 复制到剪贴板
3. 导出为 TXT
4. 发送到 AI 对话
5. 编辑功能（可选）
```

## 5. 错误处理

### 5.1 前端错误处理

```typescript
// 文件验证错误
- 文件类型不支持
- 文件大小超限
- 文件时长超限

// 网络错误
- 上传失败
- 请求超时
- 网络断开

// API 错误
- 401 未授权
- 403 禁止访问
- 429 请求过多
- 500 服务器错误
```

### 5.2 后端错误处理

```typescript
// 输入验证错误
- 缺少文件
- 文件类型无效
- 文件大小超限

// API 调用错误
- SiliconFlow API 错误
- API Key 无效
- 配额不足

// 系统错误
- 文件系统错误
- 数据库错误
- 内存不足
```

### 5.3 错误恢复策略

```typescript
1. 自动重试（最多 3 次）
2. 降级处理（使用备用模型）
3. 友好的错误提示
4. 错误日志记录
5. 用户反馈机制
```

## 6. 性能优化

### 6.1 前端优化

```typescript
1. 文件上传分片（大文件）
2. 虚拟滚动（历史记录列表）
3. 图片懒加载
4. React Query 缓存
5. 防抖和节流
```

### 6.2 后端优化

```typescript
1. 数据库索引优化
2. 分页查询
3. 临时文件及时清理
4. API 响应缓存
5. 并发控制
```

### 6.3 React Best Practices

根据 Vercel React Best Practices：

```typescript
// 1. Bundle Size Optimization
- 使用 dynamic import 加载音频播放器
- 避免 barrel imports

// 2. Re-render Optimization
- 使用 React.memo 包装列表项
- 使用 useCallback 稳定回调函数
- 使用 useMemo 缓存计算结果

// 3. Rendering Performance
- 提取静态 JSX
- 使用 content-visibility 优化长列表

// 4. Server-Side Performance
- 使用 React.cache() 缓存数据获取
- 并行获取数据
```

## 7. 安全设计

### 7.1 认证和授权

```typescript
1. 用户必须登录才能使用
2. API Key 存储在环境变量
3. 用户只能访问自己的记录
4. 实现 CSRF 保护
```

### 7.2 文件安全

```typescript
1. 严格的文件类型验证
2. 文件大小限制
3. 文件名清理（防止路径遍历）
4. 病毒扫描（可选）
5. 临时文件加密（可选）
```

### 7.3 API 安全

```typescript
1. Rate Limiting（限流）
2. 请求签名验证
3. HTTPS 强制
4. 敏感数据加密
```

## 8. 监控和日志

### 8.1 日志记录

```typescript
// 记录内容：
1. 文件上传事件
2. API 调用（成功/失败）
3. 错误和异常
4. 性能指标
5. 用户行为
```

### 8.2 监控指标

```typescript
1. 上传成功率
2. 转录成功率
3. API 响应时间
4. 错误率
5. 用户活跃度
```

## 9. 测试策略

### 9.1 单元测试

```typescript
// 前端
- 文件验证逻辑
- 状态管理
- 工具函数

// 后端
- API 路由处理
- 数据库操作
- 文件处理
```

### 9.2 集成测试

```typescript
1. 完整的上传转录流程
2. 历史记录 CRUD
3. 错误处理流程
```

### 9.3 E2E 测试

```typescript
1. 用户上传文件
2. 查看转录结果
3. 管理历史记录
4. 导出和分享
```

## 10. 部署配置

### 10.1 环境变量

```env
# .env.local
SILICONFLOW_API_KEY=sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1
SILICONFLOW_DEFAULT_MODEL=FunAudioLLM/SenseVoiceSmall

# 文件上传配置
MAX_FILE_SIZE=52428800  # 50MB
ALLOWED_FILE_TYPES=audio/mpeg,audio/wav,audio/aac
TEMP_UPLOAD_DIR=/tmp/voice-uploads

# 数据库
DATABASE_URL=postgresql://...
```

### 10.2 Next.js 配置

```typescript
// next.config.ts
export default {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};
```

## 11. 未来扩展

### 11.1 短期扩展

- 实时录音转录
- 多语言支持
- 说话人识别
- 时间戳标注

### 11.2 长期扩展

- 批量上传
- 视频转录
- 字幕生成
- AI 摘要
- 关键词提取
- 情感分析

## 12. 技术债务

### 12.1 已知限制

- 临时文件存储（需要定期清理）
- 同步 API 调用（可能阻塞）
- 无文件持久化（转录后删除）

### 12.2 改进计划

- 引入队列系统（BullMQ）
- 集成 OSS 存储
- 实现 WebSocket 实时更新
- 添加缓存层（Redis）

## 13. 参考文档

- [SiliconFlow API 文档](https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions)
- [Next.js File Upload](https://nextjs.org/docs/app/building-your-application/routing/route-handlers#request-body)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Vercel React Best Practices](.claude/skills/vercel-react-best-practices/SKILL.md)
