import { z } from 'zod';

/** 注册请求 */
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码至少 8 位字符'),
  name: z.string().trim().optional(),
});

/** 登录请求 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确'),
  password: z
    .string()
    .min(1, '请输入密码'),
});

/** 忘记密码请求 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确'),
});

/** 重置密码请求 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
  newPassword: z.string().min(8, '密码至少 8 位字符'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
