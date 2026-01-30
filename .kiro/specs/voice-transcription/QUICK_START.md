# 语音转录功能快速开始指南

## 🚀 快速开始

本指南将帮助你快速启动语音转录功能的开发。

## 📋 前置条件

- [x] Node.js >= 22.0.0
- [x] pnpm >= 10.0.0
- [x] PostgreSQL 数据库
- [x] 硅基流动 API Key: `sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh`

## 🎯 实现方案总结

### 核心决策

1. **不使用队列系统** - 直接同步调用硅基流动 API
   - 理由：API 是同步的，文件小（≤50MB），处理快（<30秒）
2. **临时文件存储** - 不使用 OSS
   - 理由：转录后立即删除，保护隐私，节省成本
3. **新建数据库模型** - VoiceTranscription
   - 理由：专用字段，便于管理和扩展
4. **Zustand + React Query** - 组合状态管理
   - 理由：UI 状态 + 服务器状态分离，符合最佳实践

### 技术栈

```
前端: React 19 + Next.js 15 + Zustand + React Query + Tailwind
后端: Next.js API Routes + Prisma + PostgreSQL
API:  硅基流动 (SiliconFlow)
```

## 📝 实施步骤

### Step 1: 环境配置（5 分钟）

```bash
# 1. 添加环境变量到 .env.local
cat >> apps/web/.env.local << EOF

# SiliconFlow API
SILICONFLOW_API_KEY=sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1
SILICONFLOW_DEFAULT_MODEL=FunAudioLLM/SenseVoiceSmall

# 文件上传配置
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=audio/mpeg,audio/wav,audio/aac
TEMP_UPLOAD_DIR=/tmp/voice-uploads
EOF

# 2. 更新 .env.example
cat >> apps/web/.env.example << EOF

# SiliconFlow API
SILICONFLOW_API_KEY="your-siliconflow-api-key"
SILICONFLOW_API_URL="https://api.siliconflow.cn/v1"
SILICONFLOW_DEFAULT_MODEL="FunAudioLLM/SenseVoiceSmall"
EOF
```

### Step 2: 数据库 Schema（10 分钟）

```bash
# 1. 编辑 packages/db/prisma/schema.prisma
# 添加以下内容：

model VoiceTranscription {
  id            String    @id @default(cuid())
  userId        String
  fileName      String
  fileSize      Int
  duration      Int?
  format        String
  model         String    @default("FunAudioLLM/SenseVoiceSmall")
  status        String    @default("pending")
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

# 在 User model 中添加：
model User {
  // ... 现有字段
  voiceTranscriptions VoiceTranscription[]
}

# 2. 生成和运行迁移
pnpm db:generate
pnpm db:migrate
```

### Step 3: Next.js 配置（5 分钟）

```typescript
// apps/web/next.config.ts
export default {
  // ... 现有配置
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

### Step 4: 安装依赖（2 分钟）

```bash
# 在 apps/web 目录下
cd apps/web
pnpm add form-data
```

### Step 5: 创建类型定义（10 分钟）

```typescript
// apps/web/src/types/voice.ts
export interface VoiceTranscription {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  duration: number | null;
  format: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TranscribeRequest {
  file: File;
  model?: string;
}

export interface TranscribeResponse {
  id: string;
  status: string;
  transcription?: string;
  message: string;
}

export interface TranscriptionsResponse {
  data: VoiceTranscription[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

## 🏗️ 核心实现

### 1. SiliconFlow API 客户端（15 分钟）

```typescript
// apps/web/src/lib/siliconflow.ts
import FormData from 'form-data';
import fs from 'fs/promises';

const API_KEY = process.env.SILICONFLOW_API_KEY!;
const API_URL = process.env.SILICONFLOW_API_URL!;

export async function transcribeAudio(
  filePath: string,
  model: string = 'FunAudioLLM/SenseVoiceSmall'
): Promise<{ text: string }> {
  const formData = new FormData();
  const fileBuffer = await fs.readFile(filePath);

  formData.append('file', fileBuffer, {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg',
  });
  formData.append('model', model);

  const response = await fetch(`${API_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SiliconFlow API error: ${error}`);
  }

  return response.json();
}
```

### 2. 文件处理工具（15 分钟）

```typescript
// apps/web/src/lib/file-upload.ts
import fs from 'fs/promises';
import path from 'path';

const TEMP_DIR = process.env.TEMP_UPLOAD_DIR || '/tmp/voice-uploads';
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800');
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/aac'];

export async function saveUploadedFile(file: File): Promise<string> {
  // 验证文件类型
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('不支持的文件类型');
  }

  // 验证文件大小
  if (file.size > MAX_SIZE) {
    throw new Error('文件大小超过限制');
  }

  // 创建临时目录
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // 生成唯一文件名
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = path.join(TEMP_DIR, fileName);

  // 保存文件
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Failed to delete file:', error);
  }
}
```

### 3. API Route - 上传转录（30 分钟）

```typescript
// apps/web/src/app/api/voice/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';
import { transcribeAudio } from '@/lib/siliconflow';
import { saveUploadedFile, deleteFile } from '@/lib/file-upload';

export async function POST(req: NextRequest) {
  try {
    // 1. 解析表单数据
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const model = (formData.get('model') as string) || 'FunAudioLLM/SenseVoiceSmall';

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    // 2. 保存文件到临时目录
    const filePath = await saveUploadedFile(file);

    // 3. 创建数据库记录
    const transcription = await prisma.voiceTranscription.create({
      data: {
        userId: 'temp-user-id', // TODO: 从 session 获取
        fileName: file.name,
        fileSize: file.size,
        format: file.type.split('/')[1],
        model,
        status: 'processing',
      },
    });

    try {
      // 4. 调用 SiliconFlow API
      const result = await transcribeAudio(filePath, model);

      // 5. 更新数据库记录
      await prisma.voiceTranscription.update({
        where: { id: transcription.id },
        data: {
          status: 'completed',
          transcription: result.text,
          completedAt: new Date(),
        },
      });

      // 6. 删除临时文件
      await deleteFile(filePath);

      return NextResponse.json({
        id: transcription.id,
        status: 'completed',
        transcription: result.text,
        message: '转录成功',
      });
    } catch (error) {
      // 更新为失败状态
      await prisma.voiceTranscription.update({
        where: { id: transcription.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : '转录失败',
        },
      });

      // 删除临时文件
      await deleteFile(filePath);

      throw error;
    }
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json(
      { error: '转录失败', details: error instanceof Error ? error.message : '' },
      { status: 500 }
    );
  }
}
```

### 4. API Route - 获取历史（20 分钟）

```typescript
// apps/web/src/app/api/voice/transcriptions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');

    const where = {
      userId: 'temp-user-id', // TODO: 从 session 获取
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      prisma.voiceTranscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.voiceTranscription.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Fetch transcriptions error:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}
```

### 5. 前端集成（30 分钟）

```typescript
// apps/web/src/lib/api/voice.ts
export async function uploadVoiceFile(file: File, model?: string): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (model) formData.append('model', model);

  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('上传失败');
  }

  return response.json();
}

// apps/web/src/hooks/use-voice-transcriptions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadVoiceFile } from '@/lib/api/voice';

export function useUploadVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, model }: { file: File; model?: string }) => uploadVoiceFile(file, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
    },
  });
}

// apps/web/src/components/voice/upload-audio.tsx
// 更新组件使用 useUploadVoice hook
const uploadMutation = useUploadVoice();

const handleFileSelection = async (file: File) => {
  try {
    const result = await uploadMutation.mutateAsync({ file });
    console.log('转录成功:', result);
  } catch (error) {
    console.error('转录失败:', error);
  }
};
```

## ✅ 验证清单

### 环境配置

- [ ] API Key 已配置
- [ ] 数据库已迁移
- [ ] Next.js 配置已更新
- [ ] 依赖已安装

### 后端实现

- [ ] SiliconFlow 客户端可用
- [ ] 文件上传工具可用
- [ ] API Route 正常工作
- [ ] 数据库操作正常

### 前端实现

- [ ] 上传组件集成完成
- [ ] 状态管理正常
- [ ] UI 更新正常
- [ ] 错误处理完善

## 🧪 测试

```bash
# 1. 启动开发服务器
pnpm dev

# 2. 访问语音转写页面
open http://localhost:3000/voice

# 3. 测试上传功能
# - 点击"上传音频" Tab
# - 选择一个 MP3 文件（< 50MB）
# - 等待转录完成
# - 查看转录结果

# 4. 测试历史记录
# - 查看右侧历史列表
# - 点击历史记录查看详情
```

## 📚 下一步

1. **完善用户认证** - 集成真实的用户 session
2. **优化用户体验** - 添加加载状态、错误提示
3. **实现高级功能** - 复制、导出、发送到 AI
4. **性能优化** - 虚拟滚动、缓存策略
5. **测试覆盖** - 单元测试、集成测试

## 🆘 常见问题

### Q: API Key 无效？

A: 检查 `.env.local` 中的 `SILICONFLOW_API_KEY` 是否正确

### Q: 文件上传失败？

A: 检查文件大小是否超过 50MB，格式是否为 MP3/WAV/AAC

### Q: 数据库连接失败？

A: 检查 `DATABASE_URL` 是否正确配置

### Q: 转录失败？

A: 查看服务器日志，检查 SiliconFlow API 是否正常

## 📞 获取帮助

- 查看完整文档：[requirements.md](./requirements.md)、[design.md](./design.md)
- 查看任务列表：[tasks.md](./tasks.md)
- 查看方案总结：[SUMMARY.md](./SUMMARY.md)

---

**祝开发顺利！** 🎉
