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
  role: string;
}

/** 签发 Access Token（JWT），默认 15 分钟过期 */
export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role } satisfies AccessTokenPayload, getAuthSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}

/** 验证 Access Token，返回 userId 和 role；无效时抛出异常 */
export function verifyAccessToken(token: string): { userId: string; role: string } {
  const payload = jwt.verify(token, getAuthSecret()) as unknown as AccessTokenPayload;
  return { userId: payload.userId, role: payload.role };
}

/** 生成加密安全的 Refresh Token */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

const COOKIE_NAME = 'refresh_token';

/**
 * 标记当前 refresh_token 属于匿名用户还是真实用户。
 * httpOnly 防止 XSS 篡改；鉴权仍以 refresh_token + JWT 为准，
 * 此字段仅供 middleware 在 Edge 端区分身份类型。
 */
export const AUTH_KIND_COOKIE = 'auth_kind';
export type AuthKind = 'anonymous' | 'user';

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

/** 写入 auth_kind Cookie（区分匿名/真实身份，与 refresh_token 同步生命周期） */
export async function setAuthKindCookie(kind: AuthKind, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_KIND_COOKIE, kind, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** 清除 auth_kind Cookie */
export async function clearAuthKindCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_KIND_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export { COOKIE_NAME, ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES };
