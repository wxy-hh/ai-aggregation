import { describe, it, expect } from 'vitest';
import { assertCanUpdateUsername, assertCanDeleteAccount } from './anonymous-policy';
import { AuthError } from './errors';
import type { UserContext } from './get-current-user';

function makeUser(partial: Partial<UserContext> = {}): UserContext {
  return {
    id: 'user-1',
    role: 'user',
    isAnonymous: false,
    status: 'active',
    ...partial,
  };
}

describe('assertCanUpdateUsername', () => {
  it('允许真实用户修改用户名', () => {
    expect(() => assertCanUpdateUsername(makeUser(), 'newname')).not.toThrow();
  });

  it('允许匿名用户不传 username 时更新其他字段', () => {
    expect(() => assertCanUpdateUsername(makeUser({ isAnonymous: true }))).not.toThrow();
  });

  it('禁止匿名用户修改用户名', () => {
    expect(() => assertCanUpdateUsername(makeUser({ isAnonymous: true }), 'newname')).toThrow(AuthError);
    expect(() => assertCanUpdateUsername(makeUser({ isAnonymous: true }), 'newname')).toThrow(
      '匿名用户不允许修改用户名'
    );
  });
});

describe('assertCanDeleteAccount', () => {
  it('允许真实用户自助注销', () => {
    expect(() => assertCanDeleteAccount(makeUser())).not.toThrow();
  });

  it('禁止匿名用户自助注销', () => {
    expect(() => assertCanDeleteAccount(makeUser({ isAnonymous: true }))).toThrow(AuthError);
    expect(() => assertCanDeleteAccount(makeUser({ isAnonymous: true }))).toThrow(
      '匿名用户不支持自助注销，请登录后使用'
    );
  });
});
