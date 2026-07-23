import { describe, it, expect } from 'vitest';
import { AuthError } from './errors';

describe('AuthError', () => {
  it('创建未授权错误', () => {
    const error = new AuthError('缺少认证令牌', 'UNAUTHORIZED');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuthError');
    expect(error.message).toBe('缺少认证令牌');
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('创建禁止访问错误', () => {
    const error = new AuthError('账号已被停用', 'FORBIDDEN');
    expect(error.name).toBe('AuthError');
    expect(error.message).toBe('账号已被停用');
    expect(error.code).toBe('FORBIDDEN');
  });

  it('instanceof 检查正确', () => {
    const error = new AuthError('test', 'UNAUTHORIZED');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof AuthError).toBe(true);
  });
});
