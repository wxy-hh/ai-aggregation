import { describe, it, expect, beforeAll } from 'vitest';
import { signAccessToken, verifyAccessToken, generateRefreshToken } from '../jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-unit-tests';
});

describe('signAccessToken', () => {
  it('应该生成有效的 JWT', () => {
    const token = signAccessToken('user-123', 'user');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    // JWT 格式: header.payload.signature
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('verifyAccessToken', () => {
  it('应能解码有效 Token 并返回 userId 和 role', () => {
    const token = signAccessToken('user-456', 'admin');
    const { userId, role } = verifyAccessToken(token);
    expect(userId).toBe('user-456');
    expect(role).toBe('admin');
  });

  it('篡改的 Token 应抛出异常', () => {
    const token = signAccessToken('user-789', 'user');
    const tampered = token.slice(0, -3) + 'xxx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('完全无效的字符串应抛出异常', () => {
    expect(() => verifyAccessToken('not-a-valid-token')).toThrow();
  });

  it('空字符串应抛出异常', () => {
    expect(() => verifyAccessToken('')).toThrow();
  });
});

describe('generateRefreshToken', () => {
  it('应生成 96 字符的十六进制字符串', () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(96); // 48 bytes → 96 hex
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('每次生成应不同', () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).not.toBe(t2);
  });
});
