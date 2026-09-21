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

// ─── helpers ──────────────────────────────────────────────
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

// ─── tests ────────────────────────────────────────────────
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
    const res = await handler(fakeRequest());

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

import { createQuotaStreamReporter, withQuotaStream } from './report-generation';

describe('withQuotaStream 结算管道', () => {
  const baseContext = {
    requestId: 'req-1',
    action: 'destiny-report' as const,
    endpoint: '/api/destiny/test',
  };

  it('正常完整流：触发 finalize(success)', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as any;
    const reporter = createQuotaStreamReporter();

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        reporter.appendOutputText('正文部分');
        reporter.setUsage({ total_tokens: 100 });
        reporter.markCompleted();
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const stream = withQuotaStream(source, { session, context: baseContext }, reporter);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toHaveLength(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        requestId: 'req-1',
        action: 'destiny-report',
        outputText: '正文部分',
        usage: { total_tokens: 100 },
      })
    );
  });

  it('有输出文本但流异常报错：触发 finalize(partial)', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as any;
    const reporter = createQuotaStreamReporter();

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        reporter.appendOutputText('已输出部分文本');
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error('上游网络中断'));
      },
    });

    const stream = withQuotaStream(source, { session, context: baseContext }, reporter);
    const reader = stream.getReader();

    await expect(async () => {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }).rejects.toThrow('上游网络中断');

    expect(session.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        requestId: 'req-1',
        outputText: '已输出部分文本',
        reason: '上游网络中断',
      })
    );
  });

  it('空流未产出文本即报错：触发 finalize(failed)', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as any;
    const reporter = createQuotaStreamReporter();

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('模型首包超时'));
      },
    });

    const stream = withQuotaStream(source, { session, context: baseContext }, reporter);
    const reader = stream.getReader();

    await expect(async () => {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }).rejects.toThrow('模型首包超时');

    expect(session.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        requestId: 'req-1',
        outputText: '',
        reason: '模型首包超时',
      })
    );
  });

  it('客户端主动 cancel：根据已积累文本正确结算', async () => {
    const session = { finalize: vi.fn().mockResolvedValue(undefined) } as any;
    const reporter = createQuotaStreamReporter();

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        reporter.appendOutputText('部分正文');
        controller.enqueue(new Uint8Array([1]));
      },
    });

    const stream = withQuotaStream(source, { session, context: baseContext }, reporter);
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel('用户主动离开');

    expect(session.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        requestId: 'req-1',
        outputText: '部分正文',
        reason: '用户主动离开',
      })
    );
  });

  it('延迟赋值 session holder：若未分配 session 则安全跳过 finalize', async () => {
    const holder = { current: null };
    const reporter = createQuotaStreamReporter();

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });

    const stream = withQuotaStream(source, { session: holder, context: baseContext }, reporter);
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  });
});
