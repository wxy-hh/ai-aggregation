import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import { signAccessToken, generateRefreshToken, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { getQQAccessToken, getQQOpenId, getQQUserInfo } from '@/lib/auth/oauth';
import { generateOAuthUsername } from '@/lib/auth/oauth-username';

const CLIENT_REDIRECT = '/home';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    const cookieState = req.cookies.get('oauth_state')?.value;
    if (!state || !cookieState || state !== cookieState) {
      return Response.redirect(new URL('/login?error=oauth_state_mismatch', req.nextUrl.origin));
    }

    if (!code) {
      return Response.redirect(new URL('/login?error=no_code', req.nextUrl.origin));
    }

    // state 和 code 验证通过，清除 oauth_state cookie
    const jar = await cookies();
    jar.set('oauth_state', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/oauth', maxAge: 0 });

    const tokenData = await getQQAccessToken(code);
    const openId = await getQQOpenId(tokenData.access_token);
    const userInfo = await getQQUserInfo(tokenData.access_token, openId);

    let oauthAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'qq',
          providerUserId: openId,
        },
      },
      include: { user: true },
    });

    let user = oauthAccount?.user;

    if (!oauthAccount) {
      const username = await generateOAuthUsername('qq', userInfo.nickname);

      user = await prisma.user.create({
        data: {
          username,
          name: userInfo.nickname,
          avatar: userInfo.figureurl_qq_2,
          oauthAccounts: {
            create: {
              provider: 'qq',
              providerUserId: openId,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt: new Date(Date.now() + Number(tokenData.expires_in) * 1000),
            },
          },
        },
      });
    } else {
      await prisma.oAuthAccount.update({
        where: { id: oauthAccount.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + Number(tokenData.expires_in) * 1000),
        },
      });
    }

    const accessToken = signAccessToken(user!.id, user!.role);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      data: { userId: user!.id, token: refreshToken, expiresAt },
    });

    const redirectUrl = new URL(CLIENT_REDIRECT, req.nextUrl.origin);
    await setRefreshTokenCookie(refreshToken, expiresAt);

    return Response.redirect(redirectUrl);
  } catch (error) {
    logger.error('QQ OAuth 回调失败', error instanceof Error ? error : undefined);
    return Response.redirect(new URL('/login?error=oauth_failed', req.nextUrl.origin));
  }
}
