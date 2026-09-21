/**
 * compatibility-report/route.test.ts —— 八字合盘标准报告工厂与流式计费集成测试
 *
 * 锁定的外部契约：
 * - 参数校验：缺少姓名、未勾选知情同意（consentConfirmed=false）返回 400；
 * - 完整流式生命周期：按序推送 validating ➔ charting ➔ chartFacts ➔ analyzing ➔ view ➔ finalizing ➔ complete；
 * - 计费管道：正常完成时自动结算为 success；
 * - 异常容错与保护：流中断但有文本时 partial 结算，零文本报错时整额释放预留并推送 error 事件。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reserveMock = vi.fn();
const finalizeMock = vi.fn();
const releaseMock = vi.fn();

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (req: Request, handler: (user: { id: string; role: string }, request: Request) => unknown) =>
      handler({ id: 'test-user-123', role: 'user' }, req)
  ),
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: {
    reserve: vi.fn((...args: unknown[]) => reserveMock(...args)),
  },
}));

vi.mock('@repo/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared')>();
  return {
    ...actual,
    resolveModelConfig: vi.fn().mockReturnValue({
      provider: 'doubao',
      model: 'doubao-pro-4k',
    }),
    streamModel: vi.fn(),
  };
});

import { streamModel } from '@repo/shared';
import { POST } from './route';

const streamModelMock = vi.mocked(streamModel);

const VALID_REQUEST_BODY = {
  self: {
    name: '小明',
    gender: 'male' as const,
    calendarType: 'solar' as const,
    birthDate: { year: 1995, month: 10, day: 8 },
    birthTime: { hour: '14', minute: '30' },
    location: { name: '上海', lat: 31.23, lon: 121.47 },
  },
  partner: {
    name: '小红',
    gender: 'female' as const,
    calendarType: 'solar' as const,
    birthDate: { year: 1996, month: 5, day: 20 },
    birthTime: { hour: '08', minute: '15' },
    location: { name: '北京', lat: 39.9, lon: 116.4 },
  },
  relationType: 'romance' as const,
  focusTags: ['默契度', '沟通'],
  provider: 'doubao' as const,
  consentConfirmed: true as const,
};

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

describe('POST /api/destiny/compatibility-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveMock.mockResolvedValue({
      outputLimit: 8000,
      finalize: finalizeMock,
      release: releaseMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('参数校验拦截：未勾选知情同意（consentConfirmed=false）返回 400', async () => {
    const req = new Request('http://localhost/api/destiny/compatibility-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_REQUEST_BODY, consentConfirmed: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; details: Array<{ message: string }> };
    expect(data.error).toBe('请求参数错误');
    expect(data.details[0]?.message).toContain('请确认已获得对方同意');
  });

  it('参数校验拦截：缺少本人称呼返回 400', async () => {
    const req = new Request('http://localhost/api/destiny/compatibility-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...VALID_REQUEST_BODY,
        self: { ...VALID_REQUEST_BODY.self, name: '' },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; details: Array<{ message: string }> };
    expect(data.error).toBe('请求参数错误');
    expect(data.details[0]?.message).toContain('我的称呼不能为空');
  });

  it('完整流式协议：按序推送各状态与分区，最终推送 complete 并完成 success 结算', async () => {
    const mockModelOutput = {
      oneLiner: '相得益彰，水木清华。',
      needs: {
        self: [{ text: '需要精神共鸣' }],
        partner: [{ text: '需要行动落实' }],
      },
      attractions: [{ title: '性格互补', detail: '彼此欣赏对方的专注。' }],
      frictions: [{ trigger: '作息差异', reaction: '情绪沉默', action: '坦诚表达' }],
      dimensions: [{ key: 'tacit', label: '默契', value: 88 }],
      rhythm: [{ when: '近期', tone: 'warm', advice: '多安排共处时光' }],
      weeklyActions: [{ id: 'w1', text: '共同散步一次' }],
      disclaimers: ['以上测算仅供参考'],
    };

    streamModelMock.mockReturnValue(
      (async function* () {
        yield { type: 'text-delta', text: JSON.stringify(mockModelOutput) };
        yield { type: 'done', rawUsage: { prompt_tokens: 120, completion_tokens: 350 } };
      })() as ReturnType<typeof streamModel>
    );

    const req = new Request('http://localhost/api/destiny/compatibility-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_REQUEST_BODY),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const events = await readSseEvents(res);

    // 校验事件时序
    expect(events[0]).toMatchObject({ type: 'status', status: 'validating' });
    expect(events[1]).toMatchObject({ type: 'status', status: 'charting' });
    expect(events[2]).toMatchObject({ type: 'section-final', sectionKey: 'chartFacts' });
    expect(events[3]).toMatchObject({ type: 'status', status: 'analyzing' });
    expect(events[4]).toMatchObject({ type: 'section-final', sectionKey: 'view' });
    expect(events[5]).toMatchObject({ type: 'status', status: 'finalizing' });
    expect(events[6]).toMatchObject({
      type: 'complete',
      report: expect.objectContaining({
        relationType: 'romance',
        partnerDisplayName: '小红',
      }),
    });

    // 校验配额结算为 success
    expect(finalizeMock).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-compatibility-report',
        endpoint: '/api/destiny/compatibility-report',
        usage: { prompt_tokens: 120, completion_tokens: 350 },
      })
    );
  });

  it('模型完全失败未产生任何文本：流内推送 error 事件，全额释放预留额度', async () => {
    streamModelMock.mockReturnValue(
      (async function* () {
        yield { type: 'error', error: '上游模型调用超时' };
      })() as ReturnType<typeof streamModel>
    );

    const req = new Request('http://localhost/api/destiny/compatibility-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_REQUEST_BODY),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);

    // 包含错误事件
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeTruthy();

    // 零文本输出：必须判定为 failed 并释放预留额度
    expect(finalizeMock).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-compatibility-report',
      })
    );
  });

  it('模型中途异常但已吐出部分文本：流内推送 error 事件，按 partial 结算已产生部分', async () => {
    streamModelMock.mockReturnValue(
      (async function* () {
        yield { type: 'text-delta', text: '{"oneLiner":"一部分内容' };
        yield { type: 'error', error: '模型连接异常中断' };
      })() as ReturnType<typeof streamModel>
    );

    const req = new Request('http://localhost/api/destiny/compatibility-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_REQUEST_BODY),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);

    expect(events.some((e) => e.type === 'error')).toBe(true);

    // 已有部分输出：触发 partial 结算（保护平台成本）
    expect(finalizeMock).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        action: 'destiny-compatibility-report',
        outputText: '{"oneLiner":"一部分内容',
      })
    );
  });
});

