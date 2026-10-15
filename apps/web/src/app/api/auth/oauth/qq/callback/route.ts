import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshTokenCookie,
  setAuthKindCookie,
  REFRESH_TOKEN_EXPIRES,
} from '@/lib/auth/jwt';
import { getQQAccessToken, getQQOpenId, getQQUserInfo } from '@/lib/auth/oauth';
import { generateOAuthUsername } from '@/lib/auth/oauth-username';
import { REGISTERED_FREE_TOKENS } from '@/lib/constants/quota';
import { buildRedirectUrl } from '@/lib/auth/origin';

const CLIENT_REDIRECT = '/home';

/**
 * 构造跨窗口通信 HTML 响应：
 * - PC 弹窗：检测到 window.opener 时通过 postMessage 通信并自动关闭小窗；
 * - 移动端 / 兜底：无 window.opener 时直接重定向至目标页面。
 */
function renderAuthResultHtml({
  req,
  success,
  errorCode,
  redirectPath = CLIENT_REDIRECT,
}: {
  req: NextRequest;
  success: boolean;
  errorCode?: string;
  redirectPath?: string;
}): Response {
  const payload = success
    ? JSON.stringify({ type: 'QQ_AUTH_SUCCESS' })
    : JSON.stringify({ type: 'QQ_AUTH_ERROR', code: errorCode || 'oauth_failed' });

  const targetPath = success
    ? redirectPath
    : `/login?error=${encodeURIComponent(errorCode || 'oauth_failed')}`;
  const fallbackUrl = buildRedirectUrl(req, targetPath);

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QQ 授权处理中</title>
  </head>
  <body>
    <script>
      (function() {
        var payload = ${payload};
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage(payload, window.location.origin);
            window.close();
            return;
          } catch (e) {}
        }
        window.location.replace(${JSON.stringify(fallbackUrl)});
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/** 清除 state cookie */
async function clearOAuthStateCookie(): Promise<void> {
  const jar = await cookies();
  jar.set('oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/oauth',
    maxAge: 0,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    const cookieState = req.cookies.get('oauth_state')?.value;
    if (!state || !cookieState || state !== cookieState) {
      await clearOAuthStateCookie();
      return renderAuthResultHtml({ req, success: false, errorCode: 'oauth_state_mismatch' });
    }

    if (!code) {
      await clearOAuthStateCookie();
      return renderAuthResultHtml({ req, success: false, errorCode: 'no_code' });
    }

    // state 和 code 验证通过，清除 oauth_state cookie
    await clearOAuthStateCookie();

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

    // 已绑定账号被停用时拒绝签发会话（与账密登录行为对齐）
    if (user && user.status === 'disabled') {
      return renderAuthResultHtml({ req, success: false, errorCode: 'account_disabled' });
    }

    if (!oauthAccount) {
      const username = await generateOAuthUsername('qq', userInfo.nickname);
      const rawAvatar =
        userInfo.figureurl_qq_2 ||
        userInfo.figureurl_qq_1 ||
        userInfo.figureurl_2 ||
        userInfo.figureurl_1 ||
        null;
      const avatar = rawAvatar ? rawAvatar.replace(/^http:\/\//, 'https://') : null;

      user = await prisma.user.create({
        data: {
          username,
          name: userInfo.nickname,
          avatar,
          tokens: REGISTERED_FREE_TOKENS,
          quotaAccount: {
            create: {
              grantedUnits: REGISTERED_FREE_TOKENS,
              availableUnits: REGISTERED_FREE_TOKENS,
            },
          },
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
      // 库中只存摘要，明文仅存在于 httpOnly cookie
      data: { userId: user!.id, token: hashRefreshToken(refreshToken), expiresAt },
    });

    await setRefreshTokenCookie(refreshToken, expiresAt);
    await setAuthKindCookie('user', expiresAt);

    return renderAuthResultHtml({ req, success: true, redirectPath: CLIENT_REDIRECT });
  } catch (error) {
    logger.error('QQ OAuth 回调失败', error instanceof Error ? error : undefined);
    return renderAuthResultHtml({ req, success: false, errorCode: 'oauth_failed' });
  }
}
