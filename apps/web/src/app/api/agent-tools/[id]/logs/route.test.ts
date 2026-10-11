/**
 * GET /api/agent-tools/[id]/logs 路由单元测试（工单 03 / spec §4.4）
 *
 * 验证目标：
 * 1. 鉴权防护：未登录返回 401
 * 2. 越权与存在性防护：访问不存在或他人工具返回 404
 * 3. 倒序分页查询：按时间倒序返回历史明细，字段包含 id, method, statusCode, durationMs, outcome, errorKind, createdAt
 * 4. 分页控制：limit 与 offset 参数正确传递，并返回 total 与 hasMore
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-agent-tools-logs-test!';
  return {
    userFindUnique: vi.fn(),
    toolFindUnique: vi.fn(),
    toolCallFindMany: vi.fn(),
    toolCallCount: vi.fn(),
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

function makeGetRequest(
  token?: string | null,
  search: string = ''
): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return new NextRequest(`http://localhost:3000/api/agent-tools/${TOOL_ID}/logs${search}`, {
    method: 'GET',
    headers,
  });
}

describe('GET /api/agent-tools/[id]/logs', () => {
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

  it('倒序分页查询返回单次审计明细列表，包含全部必要字段', async () => {
    const t1 = new Date('2026-10-10T12:00:00.000Z');
    const t2 = new Date('2026-10-10T11:00:00.000Z');

    mocks.toolCallCount.mockResolvedValueOnce(2);
    mocks.toolCallFindMany.mockResolvedValueOnce([
      {
        id: 'call_2',
        method: 'POST',
        statusCode: 200,
        durationMs: 120,
        outcome: 'success',
        errorKind: null,
        createdAt: t1,
        // 下面是敏感或不应返回的字段，校验其被过滤
        responseBytes: 1024,
        hostname: 'api.example.com',
      },
      {
        id: 'call_1',
        method: 'POST',
        statusCode: 504,
        durationMs: 5000,
        outcome: 'failed',
        errorKind: 'timeout',
        createdAt: t2,
        responseBytes: 0,
        hostname: 'api.example.com',
      },
    ]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token, '?limit=10&offset=0');
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.total).toBe(2);
    expect(json.data.hasMore).toBe(false);
    expect(json.data.logs).toHaveLength(2);
    expect(json.data.logs[0]).toEqual({
      id: 'call_2',
      method: 'POST',
      statusCode: 200,
      durationMs: 120,
      outcome: 'success',
      errorKind: null,
      createdAt: t1.toISOString(),
    });
    expect(json.data.logs[1]).toEqual({
      id: 'call_1',
      method: 'POST',
      statusCode: 504,
      durationMs: 5000,
      outcome: 'failed',
      errorKind: 'timeout',
      createdAt: t2.toISOString(),
    });
  });

  it('分页 limit 与 offset 参数正确生效，且当存在更多数据时 hasMore 为 true', async () => {
    mocks.toolCallCount.mockResolvedValueOnce(25);
    mocks.toolCallFindMany.mockResolvedValueOnce([
      {
        id: 'call_page1',
        method: 'GET',
        statusCode: 200,
        durationMs: 65,
        outcome: 'success',
        errorKind: null,
        createdAt: new Date(),
      },
    ]);

    const token = signAccessToken(CURRENT_USER_ID, 'user');
    const req = makeGetRequest(token, '?limit=10&offset=0');
    const res = await GET(req, { params: Promise.resolve({ id: TOOL_ID }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.total).toBe(25);
    expect(json.data.hasMore).toBe(true);

    // 验证调用 prisma 传参
    expect(mocks.toolCallFindMany).toHaveBeenCalledWith({
      where: {
        toolId: TOOL_ID,
        userId: CURRENT_USER_ID,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      skip: 0,
    });
  });
});
