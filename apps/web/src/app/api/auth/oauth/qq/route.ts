import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@repo/logger';
import { getQQAuthUrl, generateOAuthState } from '@/lib/auth/oauth';
import { ApiError } from '@/lib/api/responses';

const STATE_COOKIE = 'oauth_state';

export async function GET(req: NextRequest) {
  try {
    const state = generateOAuthState();
    const url = getQQAuthUrl(state);

    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/oauth',
      maxAge: 600,
    });

    return Response.redirect(new URL(url));
  } catch (error) {
    if (error instanceof Error && error.message === 'QQ OAuth 未配置') {
      return ApiError.serviceUnavailable();
    }
    logger.error('QQ OAuth 入口失败', error instanceof Error ? error : undefined);
    return ApiError.internalError('OAuth 请求失败');
  }
}
