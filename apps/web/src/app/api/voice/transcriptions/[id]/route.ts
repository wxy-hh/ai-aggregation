import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = await requireAuth(req);

    const transcription = await prisma.voiceTranscription.findFirst({
      where: {
        id,
        userId, // 确保用户只能访问自己的记录
      },
    });

    if (!transcription) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json(transcription);
  } catch (error) {
    console.error('Fetch transcription error:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = await requireAuth(req);

    // 先查询记录是否存在且属于当前用户
    const transcription = await prisma.voiceTranscription.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!transcription) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    // 删除记录
    await prisma.voiceTranscription.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete transcription error:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
