/**
 * MCP 工具参数 Schema 校验（工单 01 / ADR-0064 §4、§6）
 *
 * 为什么不把 JSON Schema 转成 Zod：
 * - MCP 现行工具输入使用 JSON Schema 2020-12，允许 `oneOf`/`anyOf`/`allOf`、
 *   条件与 `$ref`/`$defs`；转 Zod 会丢约束或误拒协议合法工具；
 * - 因此保留 JSON Schema 为契约，用标准校验器（Ajv 2020-12）做服务端校验。
 *
 * 安全边界：
 * - 只做同步 compile/validate：不提供 `loadSchema`、不使用 `compileAsync`，
 *   远程 `$ref` 与 `$async` 一律拒绝，绝不自动抓取外部引用；
 * - Schema 深度、字节数、编译与校验预算受硬上限约束。
 */

import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { MCP_MAX_TOOL_DESCRIPTION_CHARS } from './contracts';

/** 工具描述最大字符数（真源在 contracts，此处保留既有导出名以兼容引用） */
export const MCP_MAX_DESCRIPTION_CHARS = MCP_MAX_TOOL_DESCRIPTION_CHARS;

/** Schema 最大嵌套深度 */
export const MCP_MAX_SCHEMA_DEPTH = 16;

/** Schema 最大字节数（32KB） */
export const MCP_MAX_SCHEMA_BYTES = 32 * 1024;

/** 单次校验预算（毫秒） */
export const MCP_SCHEMA_VALIDATE_BUDGET_MS = 100;

/** 编译预算（毫秒） */
export const MCP_SCHEMA_COMPILE_BUDGET_MS = 500;

/** Schema 校验失败：文案面向用户与模型，不泄漏内部细节 */
export class McpSchemaError extends Error {
  readonly code: 'MCP_SCHEMA_REJECTED';

  constructor(message: string) {
    super(message);
    this.name = 'McpSchemaError';
    this.code = 'MCP_SCHEMA_REJECTED';
  }
}

/** 校验结果：失败时给出可读中文原因，帮助模型修正参数 */
export type McpSchemaValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/** 2020-12 专用 Ajv 实例：禁用远程引用与异步模式 */
function createAjv(): Ajv2020 {
  return new Ajv2020({
    strict: false,
    // 不提供 loadSchema：远程 $ref 一律编译失败，不产生任何网络请求
    loadSchema: undefined,
    validateSchema: false,
    allErrors: true,
  });
}

/** 计算 Schema 嵌套深度（防止深层嵌套消耗编译与校验预算） */
function measureDepth(schema: unknown, depth = 1): number {
  if (depth > MCP_MAX_SCHEMA_DEPTH + 4) return depth;
  if (typeof schema !== 'object' || schema === null) return depth;
  let max = depth;
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        max = Math.max(max, measureDepth(item, depth + 1));
      }
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      max = Math.max(max, measureDepth(value, depth + 1));
    }
  }
  return max;
}

/** 扫描 Schema 中是否出现被禁用的关键字或远程引用 */
function findForbiddenKeyword(schema: unknown, path = '$'): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const record = schema as Record<string, unknown>;

  for (const key of ['$async', '$data'] as const) {
    if (key in record) return key;
  }
  if (typeof record.$ref === 'string' && !record.$ref.startsWith('#')) {
    return '$ref';
  }

  for (const [key, value] of Object.entries(record)) {
    const childPath = `${path}.${key}`;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findForbiddenKeyword(item, childPath);
        if (found) return found;
      }
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      const found = findForbiddenKeyword(value, childPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 编译 MCP 工具入参 Schema。
 *
 * @param schema JSON Schema 2020-12 对象
 * @returns Ajv 校验函数
 * @throws McpSchemaError 命中禁用关键字、超限或编译失败
 */
export function compileMcpToolSchema(schema: unknown): ValidateFunction {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new McpSchemaError('工具参数 Schema 格式不正确');
  }

  const bytes = Buffer.byteLength(JSON.stringify(schema), 'utf8');
  if (bytes > MCP_MAX_SCHEMA_BYTES) {
    throw new McpSchemaError('工具参数 Schema 过大，已拒绝使用');
  }

  const depth = measureDepth(schema);
  if (depth > MCP_MAX_SCHEMA_DEPTH) {
    throw new McpSchemaError('工具参数 Schema 深度超限，已拒绝使用');
  }

  const forbidden = findForbiddenKeyword(schema);
  if (forbidden) {
    if (forbidden === '$ref') {
      throw new McpSchemaError('工具参数 Schema 含远程引用，该工具不受支持');
    }
    throw new McpSchemaError(`工具参数 Schema 含不支持的关键字（${forbidden}）`);
  }

  const ajv = createAjv();
  const startedAt = Date.now();
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw new McpSchemaError(
      `工具参数 Schema 编译失败：${error instanceof Error ? error.message : '未知原因'}`
    );
  }
  if (Date.now() - startedAt > MCP_SCHEMA_COMPILE_BUDGET_MS) {
    throw new McpSchemaError('工具参数 Schema 编译超出预算，已拒绝使用');
  }

  return validate;
}

/**
 * 校验模型给出的工具入参。
 *
 * @param schema JSON Schema 2020-12 对象
 * @param args 模型给出的原始参数
 */
export function validateMcpToolArguments(
  schema: unknown,
  args: unknown
): McpSchemaValidationResult {
  let validate: ValidateFunction;
  try {
    validate = compileMcpToolSchema(schema);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '工具参数 Schema 不可用',
    };
  }

  const startedAt = Date.now();
  const valid = validate(args);
  if (Date.now() - startedAt > MCP_SCHEMA_VALIDATE_BUDGET_MS) {
    return { ok: false, reason: '工具参数校验超出预算，请简化参数后重试' };
  }

  if (valid) return { ok: true, value: args };

  const first = validate.errors?.[0];
  const path = first?.instancePath ? `${first.instancePath} ` : '';
  return {
    ok: false,
    reason: `参数校验失败（${path}${first?.message ?? '不符合要求'}）`,
  };
}
