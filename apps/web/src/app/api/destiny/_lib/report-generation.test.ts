import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  createSseResponse: vi.fn(),
  billingErrorResponse: vi.fn(),
  NextResponseJson: vi.fn(),
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: mocks.withAuth,
}));

vi.mock('@/lib/utils/sse', () => ({
  createSseResponse: mocks.createSseResponse,
}));

vi.mock('@/lib/billing/billing-errors', () => ({
  BillingError: class BillingError extends Error {},
  billingErrorResponse: mocks.billingErrorResponse,
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: mocks.NextResponseJson,
  },
}));

import { createReportHandler, defaultMapError } from './report-generation';

// ─── 辅助测试函数 ──────────────────────────────────────────
function makeAdapter(overrides: Record<string, any> = {}) {
  return {
    requestSchema: {
      safeParse: vi.fn(),
    } as any,
    generate: vi.fn(),
    ...overrides,
  };
}

function fakeRequest(body: any = {}): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── 测试用例 ────────────────────────────────────────────
describe('createReportHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('校验失败时返回 400', async () => {
    const adapter = makeAdapter();
    adapter.requestSchema.safeParse.mockReturnValue({
      success: false,
      error: { errors: [{ path: ['name'], message: '必填' }] },
    });

    // withAuth 直接调用回调，模拟认证成功
    mocks.withAuth.mockImplementation(async (_req: any, fn: any) => {
      return fn({ id: 'u1', role: 'user' });
    });
    mocks.NextResponseJson.mockReturnValue(new Response(null, { status: 400 }));

    const handler = createReportHandler(adapter);
    await handler(fakeRequest());

    expect(mocks.NextResponseJson).toHaveBeenCalledWith(
      expect.objectContaining({
        error: '请求参数错误',
        details: expect.arrayContaining([
          expect.objectContaining({ path: 'name', message: '必填' }),
        ]),
      }),
      { status: 400 }
    );
  });

  it('校验通过时调用 adapter.generate 并返回 SSE 流', async () => {
    const stream = new ReadableStream();
    const adapter = makeAdapter();
    adapter.requestSchema.safeParse.mockReturnValue({ success: true, data: { name: '测试' } });
    adapter.generate.mockResolvedValue(stream);

    mocks.withAuth.mockImplementation(async (_req: any, fn: any) => {
      return fn({ id: 'u1', role: 'user' });
    });
    mocks.createSseResponse.mockReturnValue(new Response(stream));

    const handler = createReportHandler(adapter);
    await handler(fakeRequest({ name: '测试' }));

    expect(adapter.generate).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'u1', role: 'user' } }),
      { name: '测试' }
    );
    expect(mocks.createSseResponse).toHaveBeenCalledWith(stream);
  });

  it('BillingError 交给 billingErrorResponse 处理', async () => {
    const { BillingError } = await import('@/lib/billing/billing-errors');
    const adapter = makeAdapter();
    adapter.requestSchema.safeParse.mockReturnValue({ success: true, data: {} });
    adapter.generate.mockRejectedValue(new BillingError('QUOTA_INSUFFICIENT', '额度不足'));

    mocks.withAuth.mockImplementation(async (_req: any, fn: any) => {
      return fn({ id: 'u1', role: 'user' });
    });
    mocks.billingErrorResponse.mockReturnValue(new Response('billing error', { status: 402 }));

    const handler = createReportHandler(adapter);
    await handler(fakeRequest());

    expect(mocks.billingErrorResponse).toHaveBeenCalled();
  });

  it('普通错误时返回 500 和 mapError 文案', async () => {
    const adapter = makeAdapter({
      mapError: (err: unknown) => (err instanceof Error ? err.message : '未知错误'),
    });
    adapter.requestSchema.safeParse.mockReturnValue({ success: true, data: {} });
    adapter.generate.mockRejectedValue(new Error('模型超时'));

    mocks.withAuth.mockImplementation(async (_req: any, fn: any) => {
      return fn({ id: 'u1', role: 'user' });
    });
    mocks.NextResponseJson.mockReturnValue(new Response(null, { status: 500 }));

    const handler = createReportHandler(adapter);
    await handler(fakeRequest());

    expect(mocks.NextResponseJson).toHaveBeenCalledWith(
      { error: '模型超时' },
      { status: 500 }
    );
  });

  it('无 mapError 时使用默认错误文案', async () => {
    const adapter = makeAdapter();
    adapter.requestSchema.safeParse.mockReturnValue({ success: true, data: {} });
    adapter.generate.mockRejectedValue('纯字符串错误');

    mocks.withAuth.mockImplementation(async (_req: any, fn: any) => {
      return fn({ id: 'u1', role: 'user' });
    });
    mocks.NextResponseJson.mockReturnValue(new Response(null, { status: 500 }));

    const handler = createReportHandler(adapter);
    await handler(fakeRequest());

    expect(mocks.NextResponseJson).toHaveBeenCalledWith(
      { error: '测算失败，请稍后重试' },
      { status: 500 }
    );
  });
});

describe('defaultMapError', () => {
  it('Error 实例返回 message', () => {
    expect(defaultMapError(new Error('出错'))).toBe('出错');
  });

  it('非 Error 返回通用文案', () => {
    expect(defaultMapError('字符串')).toBe('测算失败，请稍后重试');
    expect(defaultMapError(null)).toBe('测算失败，请稍后重试');
    expect(defaultMapError(undefined)).toBe('测算失败，请稍后重试');
  });
});
