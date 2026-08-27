/**
 * 反馈附件上传 API
 * POST /api/feedback/[id]/attachments
 *
 * 存储策略通过 STORAGE_PROVIDER 环境变量控制（s3 或 local），由 createStorageProvider() 统一分发
 */
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { validateFile, ALLOWED_MIME_TYPES } from '@repo/shared';
import { createStorageProvider } from '@repo/storage';
import crypto from 'crypto';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

    const storage = createStorageProvider();

    const attachments = await Promise.all(
      files.map(async (file) => {
        const ext = file.name.split('.').pop() || 'png';
        const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const key = `feedback/${feedbackId}/${uniqueName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileUrl = await storage.upload(key, buffer, file.type);

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
