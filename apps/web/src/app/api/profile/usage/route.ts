import { NextResponse } from 'next/server';
import { getProfileUsageSummary, prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await requireAuth(request);

    const [summary, user, quotaAccount] = await Promise.all([
      getProfileUsageSummary(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
      prisma.quotaAccount.findUnique({
        where: { userId },
        select: {
          grantedUnits: true,
          availableUnits: true,
          reservedUnits: true,
          settledUnits: true,
        },
      }),
    ]);

    if (!quotaAccount && user?.role !== 'admin') {
      return NextResponse.json(
        { error: '额度账户不存在，请联系管理员初始化账户' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...summary,
      tokenRemaining: user?.role === 'admin' ? null : (quotaAccount?.availableUnits ?? null),
      quota: user?.role === 'admin' ? null : quotaAccount,
      taskUsage: {
        imageCount: summary.features.find((item) => item.feature === 'image')?.taskCount ?? 0,
        videoCount: summary.features.find((item) => item.feature === 'video')?.taskCount ?? 0,
      },
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
