/**
 * Webhook 参数定义到 Zod Schema 生成器（spec §4.1 / §4.4）
 *
 * 职责：
 * - 纯函数：将用户登记的 Webhook 参数定义列表（[{name, type, required, description}]）
 *   确定性生成为 Zod Object Schema；
 * - 字段映射：
 *   - type 支持 'string' | 'number' | 'boolean'，分别映射为 z.string()、z.number()、z.boolean()；
 *   - required === false 时追加 .optional()；
 *   - description 存在且为非空字符串时追加 .describe()；
 * - 安全与健壮性：非法结构 fail-closed 抛出错误，杜绝脏数据进入模型工具定义通道。
 */

import { z } from 'zod';

/** 单个 Webhook 参数定义契约 */
export interface WebhookParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
}

/** 参数名命名格式正则：以英文字母开头或字母数字下划线连字符组成，仅限 1-64 字符 */
const PARAM_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * 将用户配置的 Webhook 参数定义列表确定性转换为 Zod 对象校验 Schema。
 *
 * @param params 用户在数据库或前端登记的参数定义数组
 * @returns ZodObject Schema
 * @throws 当输入非数组、参数名非法或重复、类型不受支持时抛出 Error
 */
export function buildZodSchemaFromParams(
  params: unknown
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!Array.isArray(params)) {
    throw new Error('Webhook 参数定义必须为数组结构');
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  const seenNames = new Set<string>();

  for (const item of params) {
    if (!item || typeof item !== 'object') {
      throw new Error('Webhook 单个参数定义必须为有效对象');
    }

    const { name, type, required, description } = item as Partial<WebhookParamDefinition>;

    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('参数名必须为非空字符串');
    }

    const trimmedName = name.trim();
    if (!PARAM_NAME_REGEX.test(trimmedName)) {
      throw new Error(`参数名「${trimmedName}」格式不合法，仅支持英文字母、数字、下划线及连字符且长度不超过 64`);
    }

    if (seenNames.has(trimmedName)) {
      throw new Error(`参数名「${trimmedName}」重复`);
    }
    seenNames.add(trimmedName);

    if (required !== undefined && typeof required !== 'boolean') {
      throw new Error(`参数「${trimmedName}」的 required 属性必须为布尔值`);
    }

    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`参数「${trimmedName}」的 description 属性必须为字符串`);
    }

    let fieldSchema: z.ZodTypeAny;
    switch (type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      default:
        throw new Error(`参数「${trimmedName}」的类型「${String(type)}」不受支持，仅允许 string、number 或 boolean`);
    }

    // description 存在时进入 describe
    if (description && description.trim()) {
      fieldSchema = fieldSchema.describe(description.trim());
    }

    // required 为 false 或缺省时标记为可选
    if (!required) {
      fieldSchema = fieldSchema.optional();
    }

    shape[trimmedName] = fieldSchema;
  }

  return z.object(shape);
}
