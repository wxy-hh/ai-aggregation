import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // TODO: 从 session 获取真实的 userId
    const userId = 'temp-user-id';

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
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}
