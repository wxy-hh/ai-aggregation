import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('hashPassword', () => {
  it('应该生成 bcrypt 哈希', async () => {
    const hash = await hashPassword('my-secret-123');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('my-secret-123');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('每次哈希结果应不同（salt 随机）', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('正确密码应验证通过', async () => {
    const hash = await hashPassword('correct-password');
    const valid = await verifyPassword('correct-password', hash);
    expect(valid).toBe(true);
  });

  it('错误密码应验证失败', async () => {
    const hash = await hashPassword('correct-password');
    const valid = await verifyPassword('wrong-password', hash);
    expect(valid).toBe(false);
  });

  it('空密码不应通过验证', async () => {
    const hash = await hashPassword('some-password');
    const valid = await verifyPassword('', hash);
    expect(valid).toBe(false);
  });
});
