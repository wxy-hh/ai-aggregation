import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'u_draft_test', role: 'user' },
    generateTextMock: vi.fn(),
    existingTools: [] as Array<{ callName: string }>,
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => {
    if (!mocks.currentUser) {
      const { AuthError } = await import('@/lib/auth/errors');
      throw new AuthError('未授权访问', 'UNAUTHORIZED');
    }
    return mocks.currentUser;
  }),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  AUTH_RATE_LIMITS: { agentToolsCrud: { key: 'test', limit: 10, windowSeconds: 60 } },
  enforceAuthRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    userWebhookTool: {
      findMany: vi.fn(async () => mocks.existingTools),
    },
  },
}));

vi.mock('ai', () => ({
  generateText: mocks.generateTextMock,
}));

vi.mock('@repo/providers', () => ({
  createProvider: () => () => ({}),
}));

import { POST } from './route';

describe('POST /api/agent-tools/draft (ADR-0015 / 工单 03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'u_draft_test', role: 'user' };
    mocks.existingTools = [];
  });

  it('未登录访问返回 401', async () => {
    mocks.currentUser = null as any;

    const req = new NextRequest('http://localhost:3030/api/agent-tools/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '查天气' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('输入空描述返回 400', async () => {
    const req = new NextRequest('http://localhost:3030/api/agent-tools/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('请输入工具功能描述');
  });

  it('正常调用生成结构化草稿，字段符合规范', async () => {
    mocks.generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({
        name: '快递追踪',
        callName: 'track_express',
        description: '输入快递单号查询最新轨迹',
        method: 'POST',
        url: 'https://api.express.example.com/track',
        params: [
          { name: 'tracking_num', type: 'string', required: true, description: '快递号' },
        ],
        headersGuide: '请填入开放平台凭证',
      }),
    });

    const req = new NextRequest('http://localhost:3030/api/agent-tools/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '帮我做一个查快递物流轨迹的工具' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.draft.name).toBe('快递追踪');
    expect(body.data.draft.callName).toBe('track_express');
    expect(body.data.draft.url).toBe('https://api.express.example.com/track');
    expect(body.data.draft.params.length).toBe(1);
    expect(body.data.draft.securityWarning).toBeUndefined();
  });

  it('安全守卫拦截：生成内网私有地址时自动置换为安全占位符并返回警告', async () => {
    mocks.generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({
        name: '路由器重启',
        callName: 'reboot_router',
        description: '内网路由器命令',
        method: 'POST',
        url: 'http://192.168.1.1:8080/admin',
        params: [],
      }),
    });

    const req = new NextRequest('http://localhost:3030/api/agent-tools/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '调用内网 192.168.1.1 重启' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.draft.url).toBe('https://api.example.com/api');
    expect(body.data.draft.securityWarning).toContain('私有地址');
  });

  it('重名冲突自愈：生成的 callName 存在冲突时自动追加数字后缀', async () => {
    mocks.existingTools = [{ callName: 'query_weather' }];

    mocks.generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({
        name: '天气查询',
        callName: 'query_weather',
        description: '查询天气',
        method: 'GET',
        url: 'https://api.weather.example.com/today',
        params: [],
      }),
    });

    const req = new NextRequest('http://localhost:3030/api/agent-tools/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '查天气' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.draft.callName).toBe('query_weather_2');
  });
});
