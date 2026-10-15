import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z0-9_]+$/;

/** 选填字段的空值归一化：空字符串（含纯空白）视为未填写 */
function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional()
  );
}

/** 邮箱（统一小写存储与比对） */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('邮箱格式不正确')
  .max(254, '邮箱长度超出限制');

/** 6 位数字验证码 */
export const emailCodeSchema = z.string().trim().regex(/^\d{6}$/, '验证码为 6 位数字');

/** 注册请求；邮箱选填，填写则必须带邮箱验证码 */
export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, '用户名至少 3 个字符')
      .max(30, '用户名最多 30 个字符')
      .regex(USERNAME_REGEX, '用户名只能包含英文字母、数字和下划线'),
    password: z.string().min(8, '密码至少 8 位字符'),
    name: z.string().trim().optional(),
    email: optionalField(emailSchema),
    emailCode: optionalField(emailCodeSchema),
  })
  .superRefine((data, ctx) => {
    if (data.email && !data.emailCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emailCode'],
        message: '请填写邮箱验证码',
      });
    }
  });

/** 发送邮箱验证码请求（忘记密码不发验证码，走重置链接） */
export const sendEmailCodeSchema = z.object({
  purpose: z.enum(['register', 'bind'], { message: '验证码用途不合法' }),
  email: emailSchema,
});

/** 绑定/更换邮箱请求 */
export const bindEmailSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
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

/**
 * 忘记密码请求：支持用户名或邮箱（按是否含 @ 区分）。
 * `username` 为旧客户端字段，保留兼容。
 */
export const forgotPasswordSchema = z
  .object({
    account: z.string().trim().toLowerCase().min(1, '请输入用户名或邮箱').optional(),
    username: z.string().trim().toLowerCase().min(1, '请输入用户名或邮箱').optional(),
  })
  .refine((data) => Boolean(data.account || data.username), {
    message: '请输入用户名或邮箱',
    path: ['account'],
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
export type SendEmailCodeInput = z.infer<typeof sendEmailCodeSchema>;
export type BindEmailInput = z.infer<typeof bindEmailSchema>;

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
