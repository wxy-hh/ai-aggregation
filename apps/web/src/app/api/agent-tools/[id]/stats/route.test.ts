/**
 * GET /api/agent-tools/[id]/stats 路由单元测试（工单 03 / spec §4.4）
 *
 * 验证目标：
 * 1. 鉴权防护：未登录返回 401
 * 2. 越权与存在性防护：访问不存在或他人工具返回 404
 * 3. 除零保护：0 次调用时 successRate、avgDurationMs、lastCalledAt、lastErrorSummary 均为 null
 * 4. 100% 成功聚合：正确计算 totalCalls, successRate: 100, avgDurationMs, lastCalledAt
 * 5. 部分失败聚合：正确计算 successRate，并返回最近一次失败的中文错误摘要
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-agent-tools-stats-test!';
  return {
    userFindUnique: vi.fn(),
    toolFindUnique: vi.fn(),
    toolCallFindMany: vi.fn(),
    toolCallCount: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    userWebhookTool: {
      findUnique: mocks.toolFindUnique,
    },
    webhookToolCall: {
      findMany: mocks.toolCallFindMany,
      count: mocks.toolCallCount,
    },
  },
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  AUTH_RATE_LIMITS: {
    agentToolsCrud: { prefix: 'ratelimit:agent-tools', limit: 60, windowSeconds: 60 },
  },
  enforceAuthRateLimit: vi.fn().mockResolvedValue(null),
}));

import { GET } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

const CURRENT_USER_ID = 'usr_owner_1';
const OTHER_USER_ID = 'usr_other_2';
const TOOL_ID = 'tool_test_1';

function makeGetRequest(token?: string | null): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return new NextRequest(`http://localhost:3000/api/agent-tools/${TOOL_ID}/stats`, {
    method: 'GET',
    headers,
  });
}

describe('GET /api/agent-tools/[id]/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === CURRENT_USER_ID) {
        return {
          id: CURRENT_USER_ID,
          email: 'owner@example.com',
          role: 'USER',
          status: 'ACTIVE',
        };
      }
      return null;
    });

    mocks.toolFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === TOOL_ID) {
        return {
          id: TOOL_ID,
          userId: CURRENT_USER_ID,
          name: '测试工具',
          callName: 'test_tool',
        };
      }
      return null;
    });
  });

  it('未登录请求返回 401', async () => {
    const req = makeGetRequest();
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('请求不存在的工具返回 404', async () => {
    mocks.toolFindUnique.mockResolvedValueOnce(null);
    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: 'non_existent_tool' }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('工具不存在');
  });

  it('越权访问他人的工具返回 404', async () => {
    mocks.toolFindUnique.mockResolvedValueOnce({
      id: TOOL_ID,
      userId: OTHER_USER_ID,
      name: '他人工具',
    });
    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('工具不存在');
  });

  it('调用总数为 0 时，返回除零保护的空态统计数据', async () => {
    mocks.toolCallFindMany.mockResolvedValueOnce([]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      totalCalls: 0,
      successRate: null,
      avgDurationMs: null,
      lastCalledAt: null,
      lastErrorSummary: null,
    });
  });

  it('全部调用成功时，返回 100% 成功率与正确平均耗时', async () => {
    const now = new Date();
    mocks.toolCallFindMany.mockResolvedValueOnce([
      {
        id: 'call_2',
        outcome: 'success',
        durationMs: 200,
        statusCode: 200,
        errorKind: null,
        createdAt: now,
      },
      {
        id: 'call_1',
        outcome: 'success',
        durationMs: 100,
        statusCode: 200,
        errorKind: null,
        createdAt: new Date(now.getTime() - 1000),
      },
    ]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalCalls).toBe(2);
    expect(json.data.successRate).toBe(100);
    expect(json.data.avgDurationMs).toBe(150);
    expect(json.data.lastCalledAt).toBe(now.toISOString());
    expect(json.data.lastErrorSummary).toBeNull();
  });

  it('部分失败时，正确计算成功率并提取最近失败的中文原因摘要', async () => {
    const t1 = new Date('2026-10-10T10:00:00.000Z');
    const t2 = new Date('2026-10-10T10:05:00.000Z');
    const t3 = new Date('2026-10-10T10:10:00.000Z');

    mocks.toolCallFindMany.mockResolvedValueOnce([
      {
        id: 'call_3',
        outcome: 'failed',
        durationMs: 300,
        statusCode: 504,
        errorKind: 'timeout',
        createdAt: t3,
      },
      {
        id: 'call_2',
        outcome: 'success',
        durationMs: 150,
        statusCode: 200,
        errorKind: null,
        createdAt: t2,
      },
      {
        id: 'call_1',
        outcome: 'success',
        durationMs: 150,
        statusCode: 200,
        errorKind: null,
        createdAt: t1,
      },
    ]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalCalls).toBe(3);
    // 2 / 3 约等于 66.7%
    expect(json.data.successRate).toBeCloseTo(66.7, 1);
    expect(json.data.avgDurationMs).toBe(200);
    expect(json.data.lastCalledAt).toBe(t3.toISOString());
    expect(json.data.lastErrorSummary).toBe('连接超时');
  });

  it('失败原因为 http_error 且带 500 时，返回 HTTP 500 错误', async () => {
    const t = new Date('2026-10-10T12:00:00.000Z');
    mocks.toolCallFindMany.mockResolvedValueOnce([
      {
        id: 'call_1',
        outcome: 'failed',
        durationMs: 80,
        statusCode: 500,
        errorKind: 'http_error',
        createdAt: t,
      },
    ]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token);
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalCalls).toBe(1);
    expect(json.data.successRate).toBe(0);
    expect(json.data.lastErrorSummary).toBe('HTTP 500 错误');
  });
});
