import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import { signAccessToken, generateRefreshToken, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { getWechatAccessToken, getWechatUserInfo } from '@/lib/auth/oauth';
import { generateOAuthUsername } from '@/lib/auth/oauth-username';

const CLIENT_REDIRECT = '/home';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // 验证 state
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

    // code 换 access_token
    const tokenData = await getWechatAccessToken(code);

    // 获取用户信息
    const userInfo = await getWechatUserInfo(tokenData.access_token, tokenData.openid);

    const providerUserId = userInfo.unionid || userInfo.openid;

    // 查找或创建 OAuth 关联
    let oauthAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'wechat',
          providerUserId,
        },
      },
      include: { user: true },
    });

    let user = oauthAccount?.user;

    if (!oauthAccount) {
      // 创建新用户和 OAuth 关联
      const username = await generateOAuthUsername('wechat', userInfo.nickname);

      user = await prisma.user.create({
        data: {
          username,
          name: userInfo.nickname,
          avatar: userInfo.headimgurl,
          oauthAccounts: {
            create: {
              provider: 'wechat',
              providerUserId,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
            },
          },
        },
      });
    } else {
      // 更新 Token
      await prisma.oAuthAccount.update({
        where: { id: oauthAccount.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        },
      });
    }

    const accessToken = signAccessToken(user!.id);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      data: { userId: user!.id, token: refreshToken, expiresAt },
    });

    const redirectUrl = new URL(CLIENT_REDIRECT, req.nextUrl.origin);
    await setRefreshTokenCookie(refreshToken, expiresAt);

    return Response.redirect(redirectUrl);
  } catch (error) {
    logger.error('微信 OAuth 回调失败', error instanceof Error ? error : undefined);
    return Response.redirect(new URL('/login?error=oauth_failed', req.nextUrl.origin));
  }
}
