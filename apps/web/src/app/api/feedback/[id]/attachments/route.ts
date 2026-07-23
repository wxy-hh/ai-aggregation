/**
 * 反馈附件上传 API
 * POST /api/feedback/[id]/attachments
 *
 * 存储策略（通过 STORAGE_PROVIDER 环境变量控制）：
 * - local（默认）: 本地文件系统，存储到 public/feedback-attachments/，零依赖
 * - s3: S3 兼容存储（阿里云 OSS / AWS S3 / Cloudflare R2 等）
 */
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { validateFile, ALLOWED_MIME_TYPES } from '@repo/shared';
import { createStorageProvider } from '@repo/storage';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** 本地存储目录 */
const LOCAL_DIR = path.join(process.cwd(), 'public', 'feedback-attachments');

/**
 * 上传到本地文件系统
 */
async function uploadToLocal(file: File): Promise<string> {
  if (!existsSync(LOCAL_DIR)) {
    mkdirSync(LOCAL_DIR, { recursive: true });
  }
  const ext = file.name.split('.').pop() || 'png';
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(path.join(LOCAL_DIR, uniqueName), buffer);
  // 本地文件由 Next.js public/ 目录直接提供
  return `/feedback-attachments/${uniqueName}`;
}

/**
 * 上传到 S3 兼容存储
 */
async function uploadToS3(file: File, feedbackId: string): Promise<string> {
  const storage = createStorageProvider();
  const ext = file.name.split('.').pop() || 'png';
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const key = `feedback/${feedbackId}/${uniqueName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  return storage.upload(key, buffer, file.type);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id: feedbackId } = await params;

    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { userId: true },
    });

    if (!feedback) return ApiError.notFound('反馈不存在');
    if (feedback.userId !== userId) return ApiError.forbidden('无权操作此反馈');

    const existingCount = await prisma.feedbackAttachment.count({
      where: { feedbackId },
    });

    if (existingCount >= MAX_ATTACHMENTS) {
      return ApiError.badRequest('附件数量已达上限（5 张）');
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) return ApiError.badRequest('请选择要上传的图片');

    const remaining = MAX_ATTACHMENTS - existingCount;
    if (files.length > remaining) {
      return ApiError.badRequest(`最多还能上传 ${remaining} 张图片`);
    }

    for (const file of files) {
      const result = validateFile(file, {
        allowedMimeTypes: ALLOWED_MIME_TYPES.IMAGES,
        maxSize: MAX_FILE_SIZE,
        validateFileName: true,
        generateSafeName: true,
      });
      if (!result.valid) {
        return ApiError.badRequest(result.error || '文件验证失败');
      }
    }

    const isS3 = process.env.STORAGE_PROVIDER === 's3';

    const attachments = await Promise.all(
      files.map(async (file) => {
        const fileUrl = isS3
          ? await uploadToS3(file, feedbackId)
          : await uploadToLocal(file);

        return prisma.feedbackAttachment.create({
          data: { feedbackId, fileName: file.name, fileSize: file.size, fileType: file.type, fileUrl },
        });
      })
    );

    return createSuccessResponse({ attachments }, '上传成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return ApiError.unauthorized(error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('图片上传失败:', message);
    return ApiError.internalError(`图片上传失败: ${message}`);
  }
}
