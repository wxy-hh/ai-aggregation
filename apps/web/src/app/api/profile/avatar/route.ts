import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  let userId: string;

  try {
    userId = await requireAuth(req);
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : String(authError);
    if (
      message === '缺少认证令牌' ||
      message.includes('jwt expired') ||
      message.includes('invalid signature') ||
      message.includes('jwt malformed')
    ) {
      return ApiError.unauthorized('请先登录');
    }
    return ApiError.unauthorized('请先登录');
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return ApiError.badRequest('请选择图片文件');
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return ApiError.badRequest('仅支持 PNG、JPEG、WebP、GIF 格式');
    }

    if (file.size > MAX_SIZE) {
      return ApiError.badRequest('图片大小不能超过 2MB');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const avatar = `data:${file.type};base64,${base64}`;

    // 直接写入数据库
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatar },
      select: { id: true, username: true, name: true, avatar: true, email: true },
    });

    return createSuccessResponse({ user }, '头像已更新');
  } catch (error) {
    console.error('[avatar] 头像上传失败:', error);
    return ApiError.internalError('头像上传失败');
  }
}
