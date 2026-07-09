import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';

/**
 * 将认证错误统一转换为转写列表 API 的错误响应格式。
 */
function handleAuthError(error: AuthError) {
  return NextResponse.json(
    { error: error.message },
    { status: error.code === 'FORBIDDEN' ? 403 : 401 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const userId = await requireAuth(req);

    // 构建查询条件
    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.fileName = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // 并行查询数据和总数
    const [data, total] = await Promise.all([
      prisma.voiceTranscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          duration: true,
          format: true,
          status: true,
          transcription: true,
          createdAt: true,
          completedAt: true,
        },
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
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}
