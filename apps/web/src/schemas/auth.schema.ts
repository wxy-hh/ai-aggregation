import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z0-9_]+$/;

/** 注册请求 */
export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, '用户名至少 3 个字符')
    .max(30, '用户名最多 30 个字符')
    .regex(USERNAME_REGEX, '用户名只能包含英文字母、数字和下划线'),
  password: z.string().min(8, '密码至少 8 位字符'),
  name: z.string().trim().optional(),
});

/** 登录请求 */
export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

/** 忘记密码请求 */
export const forgotPasswordSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请输入用户名'),
});

/** 重置密码请求 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
  newPassword: z.string().min(8, '密码至少 8 位字符'),
});

/** 更新个人资料请求 */
export const updateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, '用户名至少 3 个字符')
    .max(30, '用户名最多 30 个字符')
    .regex(USERNAME_REGEX, '用户名只能包含英文字母、数字和下划线')
    .optional(),
  name: z.string().trim().max(50, '昵称最多 50 个字符').optional(),
  avatar: z.string().url('头像 URL 格式不正确').optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
