/**
 * Agent Webhook 工具 Schema 单测
 *
 * 验证目标：
 * - 必填字段与长度限制
 * - callName 正则与字符规则
 * - url https-only 与安全防护
 * - params 参数定义合法性
 * - 更新 Schema 语义
 */

import { describe, expect, it } from 'vitest';
import { createAgentToolSchema, updateAgentToolSchema } from './agent-tool.schema';

describe('createAgentToolSchema', () => {
  const validPayload = {
    name: '查询订单',
    callName: 'query_order',
    description: '通过订单号查询用户的历史订单详情',
    url: 'https://api.example.com/webhooks/orders',
    method: 'POST' as const,
    authHeaderName: 'Authorization',
    authHeaderValue: 'Bearer secret-token',
    params: [
      {
        name: 'order_id',
        type: 'string' as const,
        required: true,
        description: '订单编号',
      },
    ],
    enabled: true,
  };

  it('合法入参顺利通过校验', () => {
    const parsed = createAgentToolSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.callName).toBe('query_order');
      expect(parsed.data.method).toBe('POST');
    }
  });

  it('callName 规则严格符合 ^[a-z][a-z0-9_-]{1,30}$', () => {
    const validCallNames = [
      'ab',
      'query_order',
      'get-order-1',
      'tool_a_b_c',
      'a' + '0'.repeat(30), // 31 字符
    ];

    for (const callName of validCallNames) {
      const res = createAgentToolSchema.safeParse({ ...validPayload, callName });
      expect(res.success).toBe(true);
    }

    const invalidCallNames = [
      'a', // 长度不足 2
      '1tool', // 数字开头
      '_tool', // 下划线开头
      '-tool', // 连字符开头
      'Tool', // 包含大写字母
      'tool name', // 包含空格
      'tool@name', // 特殊字符
      'a' + '0'.repeat(31), // 32 字符（超出 31）
      '中文工具', // 中文
    ];

    for (const callName of invalidCallNames) {
      const res = createAgentToolSchema.safeParse({ ...validPayload, callName });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.callName).toBeDefined();
      }
    }
  });

  it('url 拒绝非 https 或内网地址', () => {
    const invalidUrls = [
      'http://api.example.com/order',
      'https://127.0.0.1/order',
      'https://localhost:8080/order',
      'https://169.254.169.254/meta',
      'not-a-url',
    ];

    for (const url of invalidUrls) {
      const res = createAgentToolSchema.safeParse({ ...validPayload, url });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.url).toBeDefined();
      }
    }
  });

  it('params 参数名与类型校验', () => {
    // 非法类型
    const invalidType = createAgentToolSchema.safeParse({
      ...validPayload,
      params: [{ name: 'param1', type: 'object' }],
    });
    expect(invalidType.success).toBe(false);

    // 参数名包含非法字符
    const invalidName = createAgentToolSchema.safeParse({
      ...validPayload,
      params: [{ name: 'param 1', type: 'string' }],
    });
    expect(invalidName.success).toBe(false);
  });

  it('鉴权头取值与名称必须配对：有值无名被拒绝', () => {
    const res = createAgentToolSchema.safeParse({
      ...validPayload,
      authHeaderName: undefined,
      authHeaderValue: 'Bearer secret-token',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.authHeaderName).toBeDefined();
    }

    // 有名无值（不配置凭证）与名值齐全均放行
    expect(
      createAgentToolSchema.safeParse({
        ...validPayload,
        authHeaderName: undefined,
        authHeaderValue: undefined,
      }).success
    ).toBe(true);
    expect(createAgentToolSchema.safeParse(validPayload).success).toBe(true);
  });
});

describe('updateAgentToolSchema', () => {
  it('支持部分字段更新', () => {
    const res = updateAgentToolSchema.safeParse({
      name: '修改后的名称',
      enabled: false,
    });
    expect(res.success).toBe(true);
  });

  it('支持显式清空凭证（空字符串）', () => {
    const res = updateAgentToolSchema.safeParse({
      authHeaderValue: '',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.authHeaderValue).toBe('');
    }
  });
});

describe('requiresApproval 审批字段（AGENT-HITL-ACTION / ADR-0041）', () => {
  const base = {
    name: '发送通知',
    callName: 'send_notice',
    description: '向外部系统发送通知',
    url: 'https://api.example.com/webhooks/notice',
    params: [],
  };

  it('1. POST 且未指定审批字段时默认为 true (TC09-1)', () => {
    const parsed = createAgentToolSchema.parse({ ...base, method: 'POST' });
    expect(parsed.requiresApproval).toBe(true);
  });

  it('2. GET 且未指定审批字段时默认为 false (TC09-2)', () => {
    const parsed = createAgentToolSchema.parse({ ...base, method: 'GET' });
    expect(parsed.requiresApproval).toBe(false);
  });

  it('3. POST 显式指定 false 时保留 false (TC09-3)', () => {
    const parsed = createAgentToolSchema.parse({ ...base, method: 'POST', requiresApproval: false });
    expect(parsed.requiresApproval).toBe(false);
  });

  it('4. GET 显式指定 true 时保留 true (TC09-4)', () => {
    const parsed = createAgentToolSchema.parse({ ...base, method: 'GET', requiresApproval: true });
    expect(parsed.requiresApproval).toBe(true);
  });

  it('5. 未传 method 时按 method 默认值 POST 推导为 true (TC09-1)', () => {
    const parsed = createAgentToolSchema.parse(base);
    expect(parsed.method).toBe('POST');
    expect(parsed.requiresApproval).toBe(true);
  });

  it('6. 更新 Schema 接受审批字段，缺省时保持不变 (TC09-3)', () => {
    expect(updateAgentToolSchema.parse({ requiresApproval: false }).requiresApproval).toBe(false);
    expect(updateAgentToolSchema.parse({ name: '改名' }).requiresApproval).toBeUndefined();
  });
});
