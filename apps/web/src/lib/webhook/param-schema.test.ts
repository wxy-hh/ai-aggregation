/**
 * Webhook 参数生成 Zod Schema 单测（spec §4.1 / §4.4 / §5 纯函数下钻）
 *
 * 验证目标：
 * - 空参数列表生成合法的空对象 Schema；
 * - string、number、boolean 类型映射准确；
 * - required 属性对字段必填与选填的影响（配合 .safeParse 验证）；
 * - description 属性透传至 Schema describe；
 * - 表驱动测试各类非法结构（非数组、非法对象、不支持类型、参数名重复/不合法等）fail-closed 抛错。
 */

import { describe, expect, it } from 'vitest';
import { zodSchema } from 'ai';
import { buildZodSchemaFromParams, type WebhookParamDefinition } from './param-schema';

describe('buildZodSchemaFromParams 纯函数生成器', () => {
  it('空参数列表生成合法空对象 Schema', () => {
    const schema = buildZodSchemaFromParams([]);
    const parseResult = schema.safeParse({});
    expect(parseResult.success).toBe(true);
    expect(parseResult.data).toEqual({});

    // 转换为 AI SDK JSON Schema 验证结构
    const jsonSchema = zodSchema(schema).jsonSchema as Record<string, unknown>;
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toEqual({});
  });

  it('支持 string、number、boolean 基础类型映射及必填与选填校验', () => {
    const params: WebhookParamDefinition[] = [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: '搜索关键词',
      },
      {
        name: 'page',
        type: 'number',
        required: false,
        description: '分页页码',
      },
      {
        name: 'includeArchived',
        type: 'boolean',
        required: false,
      },
    ];

    const schema = buildZodSchemaFromParams(params);

    // 验证必填字段缺失时校验失败
    const invalidResult = schema.safeParse({ page: 1 });
    expect(invalidResult.success).toBe(false);

    // 验证必填字段满足、可选字段缺省时校验成功
    const validMinimalResult = schema.safeParse({ query: '测试' });
    expect(validMinimalResult.success).toBe(true);
    expect(validMinimalResult.data).toEqual({ query: '测试' });

    // 验证全部字段类型正确时校验成功
    const validFullResult = schema.safeParse({
      query: '测试',
      page: 2,
      includeArchived: true,
    });
    expect(validFullResult.success).toBe(true);
    expect(validFullResult.data).toEqual({
      query: '测试',
      page: 2,
      includeArchived: true,
    });

    // 验证字段类型错误时校验失败
    expect(schema.safeParse({ query: 123 }).success).toBe(false);
    expect(schema.safeParse({ query: '测试', page: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ query: '测试', includeArchived: 'yes' }).success).toBe(false);

    // 验证生成的 JSON Schema 包含必填声明和字段描述
    const jsonSchema = zodSchema(schema).jsonSchema as {
      type: string;
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.required).toEqual(['query']);
    expect(jsonSchema.properties.query.type).toBe('string');
    expect(jsonSchema.properties.query.description).toBe('搜索关键词');
    expect(jsonSchema.properties.page.type).toBe('number');
    expect(jsonSchema.properties.page.description).toBe('分页页码');
    expect(jsonSchema.properties.includeArchived.type).toBe('boolean');
    expect(jsonSchema.properties.includeArchived.description).toBeUndefined();
  });

  // 表驱动测试：各类非法结构必须 fail-closed 抛错
  describe('非法结构 fail-closed 抛错（表驱动测试）', () => {
    interface ErrorTestCase {
      title: string;
      input: unknown;
      expectedErrorKeyword: string;
    }

    const testCases: ErrorTestCase[] = [
      {
        title: '输入非数组（null）',
        input: null,
        expectedErrorKeyword: '数组',
      },
      {
        title: '输入非数组（undefined）',
        input: undefined,
        expectedErrorKeyword: '数组',
      },
      {
        title: '输入非数组（纯字符串）',
        input: 'invalid',
        expectedErrorKeyword: '数组',
      },
      {
        title: '输入非数组（普通对象）',
        input: { name: 'test' },
        expectedErrorKeyword: '数组',
      },
      {
        title: '数组包含非对象元素（null）',
        input: [null],
        expectedErrorKeyword: '有效对象',
      },
      {
        title: '数组包含非对象元素（数字）',
        input: [123],
        expectedErrorKeyword: '有效对象',
      },
      {
        title: '缺失参数名 name',
        input: [{ type: 'string', required: true }],
        expectedErrorKeyword: '参数名必须为非空字符串',
      },
      {
        title: '参数名为空白字符',
        input: [{ name: '   ', type: 'string' }],
        expectedErrorKeyword: '参数名必须为非空字符串',
      },
      {
        title: '参数名包含非法特殊字符',
        input: [{ name: 'user name', type: 'string' }],
        expectedErrorKeyword: '格式不合法',
      },
      {
        title: '参数名包含中文字符',
        input: [{ name: '用户名', type: 'string' }],
        expectedErrorKeyword: '格式不合法',
      },
      {
        title: '参数名重复',
        input: [
          { name: 'query', type: 'string' },
          { name: 'query', type: 'number' },
        ],
        expectedErrorKeyword: '重复',
      },
      {
        title: '不支持的类型（如 array）',
        input: [{ name: 'items', type: 'array' }],
        expectedErrorKeyword: '不受支持',
      },
      {
        title: '不支持的类型（如 object）',
        input: [{ name: 'user', type: 'object' }],
        expectedErrorKeyword: '不受支持',
      },
      {
        title: 'required 属性非布尔值（字符串）',
        input: [{ name: 'id', type: 'string', required: 'true' }],
        expectedErrorKeyword: 'required',
      },
      {
        title: 'description 属性非字符串（数字）',
        input: [{ name: 'id', type: 'string', description: 12345 }],
        expectedErrorKeyword: 'description',
      },
    ];

    testCases.forEach(({ title, input, expectedErrorKeyword }) => {
      it(title, () => {
        expect(() => buildZodSchemaFromParams(input)).toThrow(expectedErrorKeyword);
      });
    });
  });
});
