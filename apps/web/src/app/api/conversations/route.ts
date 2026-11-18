import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';

const MAX_IDS = 100;
const MAX_ID_LENGTH = 128;

function normalizeIds(raw: string | null): { ids: string[]; error?: string } {
  if (!raw) return { ids: [] };
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length > MAX_IDS) {
    return { ids: [], error: `单次删除数量不能超过 ${MAX_IDS} 个会话` };
  }
  if (values.some((value) => value.length > MAX_ID_LENGTH || /[\u0000-\u001f]/.test(value))) {
    return { ids: [], error: '会话 ID 格式不合法' };
  }

  return { ids: [...new Set(values)] };
}

/**
 * DELETE /api/conversations?ids=a,b
 * 按 userId 过滤删除记忆会话；不存在或已删除的 ID 也返回成功（幂等）。
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { ids, error } = normalizeIds(searchParams.get('ids'));

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const result = await prisma.chatSession.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 }
      );
    }
    console.error('删除记忆会话失败:', error);
    return NextResponse.json({ error: '删除记忆会话失败' }, { status: 500 });
  }
}
