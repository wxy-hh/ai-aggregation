import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cookies } from 'next/headers';

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET 环境变量未配置，无法签发安全令牌');
  }
  return secret;
}

const ACCESS_TOKEN_EXPIRES = Number(process.env.AUTH_ACCESS_TOKEN_EXPIRES) || 900;
const REFRESH_TOKEN_EXPIRES = Number(process.env.AUTH_REFRESH_TOKEN_EXPIRES) || 2592000;

interface AccessTokenPayload {
  userId: string;
}

/** 签发 Access Token（JWT），默认 15 分钟过期 */
export function signAccessToken(userId: string): string {
  return jwt.sign({ userId } satisfies AccessTokenPayload, getAuthSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}

/** 验证 Access Token，返回 userId；无效时抛出异常 */
export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, getAuthSecret()) as unknown as AccessTokenPayload;
  return { userId: payload.userId };
}

/** 生成加密安全的 Refresh Token */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

const COOKIE_NAME = 'refresh_token';

/** 设置 Refresh Token 到 httpOnly Cookie */
export async function setRefreshTokenCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** 清除 Refresh Token Cookie */
export async function clearRefreshTokenCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** 从 Cookie 中读取 Refresh Token */
export async function getRefreshTokenFromCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value;
}

export { COOKIE_NAME, ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES };
