import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('对同一明文密码能正确验证', async () => {
    const hash = await hashPassword('my-password');
    const result = await verifyPassword('my-password', hash);
    expect(result).toBe(true);
  });

  it('拒绝错误密码', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('每次生成的哈希值不同（随机 salt）', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });

  it('验证空字符串密码', async () => {
    const hash = await hashPassword('');
    const result = await verifyPassword('', hash);
    expect(result).toBe(true);
  });
});
