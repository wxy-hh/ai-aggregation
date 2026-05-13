import { NextResponse } from 'next/server';
import { getProfileUsageSummary, prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await requireAuth(request);

    const [summary, user] = await Promise.all([
      getProfileUsageSummary(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { tokens: true, role: true },
      }),
    ]);

    return NextResponse.json({
      ...summary,
      tokenRemaining: user?.role === 'admin' ? null : (user?.tokens ?? 0),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('jwt')) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取资源消耗失败' },
      { status: 500 }
    );
  }
}
