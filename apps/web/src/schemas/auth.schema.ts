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

/** 超管创建用户 */
export const adminCreateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, '用户名至少 3 个字符')
    .max(30, '用户名最多 30 个字符')
    .regex(USERNAME_REGEX, '用户名只能包含英文字母、数字和下划线'),
  password: z.string().min(8, '密码至少 8 位字符'),
  name: z.string().trim().max(50, '昵称最多 50 个字符').optional(),
});

/** 超管更新用户 */
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().max(50, '昵称最多 50 个字符').optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  tokens: z.number().int().min(0, 'Token 额度不能为负数').optional(),
});

/** 管理端用户列表查询参数 */
export const adminUsersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
