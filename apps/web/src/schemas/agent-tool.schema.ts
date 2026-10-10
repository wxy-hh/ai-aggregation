/**
 * Agent 自定义 Webhook 工具校验 Schema（spec §4.1 / §4.3）
 *
 * 规范：
 * - 全部错误提示使用清晰中文。
 * - callName 须匹配 ^[a-z][a-z0-9_-]{1,30}$（长度 2 到 31 字符）。
 * - url 必须 https 且过字面量黑名单 guard。
 * - params 参数声明数组格式规范。
 */

import { z } from 'zod';
import { validateWebhookUrl } from '@/lib/webhook/validation';
import { CALL_NAME_REGEX } from './agent-tool-constants';

/** Webhook 参数类型枚举 */
export const WebhookParamTypeEnum = z.enum(['string', 'number', 'boolean'], {
  errorMap: () => ({ message: '参数类型仅支持 string、number 或 boolean' }),
});

export type WebhookParamType = z.infer<typeof WebhookParamTypeEnum>;

/** 单个 Webhook 参数定义 Schema */
export const webhookParamItemSchema = z.object({
  name: z
    .string({ required_error: '参数名不能为空' })
    .trim()
    .min(1, '参数名不能为空')
    .max(64, '参数名长度不能超过 64 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '参数名仅支持英文字母、数字、下划线及连字符'),
  type: WebhookParamTypeEnum,
  required: z.boolean({ invalid_type_error: '必填标识必须为布尔值' }).default(false),
  description: z.string().max(500, '参数描述不能超过 500 个字符').optional().default(''),
});

export type WebhookParamItem = z.infer<typeof webhookParamItemSchema>;

/** 调用名正则：以小写字母开头，仅包含小写字母、数字、下划线或连字符，总长度 2 到 31 字符（单一真源在 ./agent-tool-constants，客户端安全） */
export { CALL_NAME_REGEX };

/** Webhook URL 字段校验规则 */
export const webhookUrlSchema = z
  .string({ required_error: '请输入 Webhook 网址' })
  .trim()
  .min(1, '请输入 Webhook 网址')
  .max(2048, '网址长度不能超过 2048 个字符')
  .superRefine((val, ctx) => {
    const result = validateWebhookUrl(val);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.reason,
      });
    }
  });

/** 创建 Webhook 工具基础字段定义（未添加 refine，支持 .partial() 派生校验） */
export const baseCreateAgentToolSchema = z.object({
  name: z
    .string({ required_error: '请输入工具名称' })
    .trim()
    .min(1, '请输入工具名称')
    .max(50, '工具名称不能超过 50 个字符'),
  callName: z
    .string({ required_error: '请输入调用名' })
    .trim()
    .regex(
      CALL_NAME_REGEX,
      '调用名必须以小写字母开头，仅包含小写字母、数字、下划线或连字符，长度在 2 到 31 个字符之间'
    ),
  description: z
    .string({ required_error: '请输入工具描述' })
    .trim()
    .min(1, '请输入工具描述')
    .max(1000, '工具描述不能超过 1000 个字符'),
  url: webhookUrlSchema,
  method: z.enum(['GET', 'POST'], {
    errorMap: () => ({ message: '请求方法仅支持 GET 或 POST' }),
  }).default('POST'),
  authHeaderName: z
    .string()
    .trim()
    .max(100, '鉴权头名称不能超过 100 个字符')
    .optional()
    .nullable(),
  authHeaderValue: z
    .string()
    .max(2000, '鉴权头取值不能超过 2000 个字符')
    .optional()
    .nullable(),
  params: z.array(webhookParamItemSchema).max(20, '最多配置 20 个参数').default([]),
  enabled: z.boolean().default(true),
});

/** 鉴权头成对逻辑校验守卫 */
function refineAuthPairing(
  val: { authHeaderValue?: string | null; authHeaderName?: string | null },
  ctx: z.RefinementCtx
) {
  if (
    val.authHeaderValue &&
    val.authHeaderValue.trim() !== '' &&
    (!val.authHeaderName || val.authHeaderName.trim() === '')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authHeaderName'],
      message: '设置鉴权头取值时必须同时提供鉴权头名称',
    });
  }
}

/** 创建 Webhook 工具请求 Schema（附带 .partial() 能力以供模板及局部场景校验） */
export const createAgentToolSchema = Object.assign(
  baseCreateAgentToolSchema.superRefine(refineAuthPairing),
  {
    partial: () => baseCreateAgentToolSchema.partial().superRefine(refineAuthPairing),
  }
);

export type CreateAgentToolInput = z.infer<typeof createAgentToolSchema>;

/** 更新 Webhook 工具请求 Schema */
export const updateAgentToolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入工具名称')
    .max(50, '工具名称不能超过 50 个字符')
    .optional(),
  callName: z
    .string()
    .trim()
    .regex(
      CALL_NAME_REGEX,
      '调用名必须以小写字母开头，仅包含小写字母、数字、下划线或连字符，长度在 2 到 31 个字符之间'
    )
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, '请输入工具描述')
    .max(1000, '工具描述不能超过 1000 个字符')
    .optional(),
  url: webhookUrlSchema.optional(),
  method: z.enum(['GET', 'POST'], {
    errorMap: () => ({ message: '请求方法仅支持 GET 或 POST' }),
  }).optional(),
  authHeaderName: z
    .string()
    .trim()
    .max(100, '鉴权头名称不能超过 100 个字符')
    .optional()
    .nullable(),
  /**
   * authHeaderValue 更新语义：
   * - undefined（缺省）：保持不变
   * - ""（显式空串）或 null：清除鉴权头密文
   * - 非空字符串：加密后更新密文
   */
  authHeaderValue: z
    .string()
    .max(2000, '鉴权头取值不能超过 2000 个字符')
    .optional()
    .nullable(),
  params: z.array(webhookParamItemSchema).max(20, '最多配置 20 个参数').optional(),
  enabled: z.boolean().optional(),
});

export type UpdateAgentToolInput = z.infer<typeof updateAgentToolSchema>;

/** 脱敏后的 Webhook 工具（API 响应契约，服务端序列化与前端 fetch 共用；永不含密文） */
export interface SanitizedAgentTool {
  id: string;
  userId: string;
  name: string;
  callName: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  authHeaderName: string | null;
  hasAuthHeaderValue: boolean;
  params: WebhookParamItem[];
  enabled: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}
