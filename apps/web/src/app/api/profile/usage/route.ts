import { NextResponse } from 'next/server';
import { getProfileUsageSummary } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await requireAuth(request);
    const summary = await getProfileUsageSummary(userId);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 认证相关错误统一返回 401
    const isAuthError =
      error instanceof Error &&
      (message === '缺少认证令牌' ||
        message.includes('jwt expired') ||
        message.includes('invalid signature') ||
        message.includes('jwt malformed') ||
        message.includes('AUTH_SECRET'));

    if (isAuthError) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    console.error('[profile/usage]', message, error);

    return NextResponse.json(
      { error: message || '获取资源消耗失败' },
      { status: 500 }
    );
  }
}
