import { describe, it, expect, beforeAll } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-jwt-tests-minimum-32-chars!!';
});

describe('signAccessToken / verifyAccessToken', () => {
  it('签发并验证有效的 access token', () => {
    const token = signAccessToken('user-123', 'user');
    const payload = verifyAccessToken(token);

    expect(payload.userId).toBe('user-123');
    expect(payload.role).toBe('user');
  });

  it('能验证不同的角色', () => {
    const token = signAccessToken('admin-001', 'admin');
    const payload = verifyAccessToken(token);

    expect(payload.userId).toBe('admin-001');
    expect(payload.role).toBe('admin');
  });
});

describe('verifyAccessToken', () => {
  it('对无效的 token 抛出异常', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow();
  });

  it('对伪造的 token 抛出异常', () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.fake.fake';
    expect(() => verifyAccessToken(fakeToken)).toThrow();
  });

  it('对空字符串抛出异常', () => {
    expect(() => verifyAccessToken('')).toThrow();
  });
});
