import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema';

describe('loginSchema', () => {
  it('接受有效的登录输入', () => {
    const result = loginSchema.safeParse({ username: 'testuser', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('字段前后空格应被清除且转为小写', () => {
    const result = loginSchema.safeParse({ username: '  TestUser  ', password: 'password123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('testuser');
    }
  });

  it('拒绝空用户名', () => {
    const result = loginSchema.safeParse({ username: '', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('拒绝纯空格用户名', () => {
    const result = loginSchema.safeParse({ username: '   ', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('拒绝空密码', () => {
    const result = loginSchema.safeParse({ username: 'testuser', password: '' });
    expect(result.success).toBe(false);
  });

  it('拒绝缺少字段', () => {
    const result = loginSchema.safeParse({ username: 'testuser' });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('接受有效的注册输入', () => {
    const result = registerSchema.safeParse({ username: 'newuser', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('用户名转为小写并清除空格', () => {
    const result = registerSchema.safeParse({ username: '  NewUser  ', password: 'password123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('newuser');
    }
  });

  it('拒绝过短的用户名', () => {
    const result = registerSchema.safeParse({ username: 'ab', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('拒绝过长的用户名', () => {
    const result = registerSchema.safeParse({ username: 'a'.repeat(31), password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('拒绝包含特殊符号的用户名', () => {
    const result = registerSchema.safeParse({ username: 'user name!', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('拒绝过短的密码', () => {
    const result = registerSchema.safeParse({ username: 'newuser', password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('可选昵称', () => {
    const result = registerSchema.safeParse({ username: 'newuser', password: 'password123', name: '我的昵称' });
    expect(result.success).toBe(true);
  });
});

describe('forgotPasswordSchema', () => {
  it('接受有效的用户名', () => {
    const result = forgotPasswordSchema.safeParse({ username: 'testuser' });
    expect(result.success).toBe(true);
  });

  it('拒绝空用户名', () => {
    const result = forgotPasswordSchema.safeParse({ username: '' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('接受有效的重置密码输入', () => {
    const result = resetPasswordSchema.safeParse({ token: 'valid-token', newPassword: 'newpassword123' });
    expect(result.success).toBe(true);
  });

  it('拒绝空 token', () => {
    const result = resetPasswordSchema.safeParse({ token: '', newPassword: 'newpassword123' });
    expect(result.success).toBe(false);
  });

  it('拒绝过短的新密码', () => {
    const result = resetPasswordSchema.safeParse({ token: 'valid-token', newPassword: '1234567' });
    expect(result.success).toBe(false);
  });
});
