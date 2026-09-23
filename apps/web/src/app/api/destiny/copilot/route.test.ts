/**
 * route.test.ts —— POST /api/destiny/copilot 命理追问流式路由测试。
 *
 * 验证重点：
 * 1. 正常问答：SSE 流式返回 text-delta 和 done 帧，按 success 终态声明结算；
 * 2. 上游错误：推送 error 帧与 done 帧，按 failed 终态声明释放；
 * 3. 客户端中断：已产生输出文本时 cancel，管道兜底按 partial 终态声明结算。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';

const { mockUserRef, streamModelRef, quotaSessionMocks } = vi.hoisted(() => ({
  mockUserRef: {
    current: { id: 'test-user', role: 'user' },
  },
  streamModelRef: {
    chunks: [] as string[],
    error: null as string | null,
    delayMs: 0,
  },
  quotaSessionMocks: {
    reserve: vi.fn(),
    finalize: vi.fn(),
  },
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (
      req: Request,
      handler: (user: { id: string; role: string }, request: Request) => unknown
    ) => handler(mockUserRef.current, req)
  ),
}));

// 路由统一走 QuotaSession，mock 接缝本身
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionMocks.reserve },
}));

vi.mock('@repo/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    streamModel: vi.fn(() => {
      const chunks = [...streamModelRef.chunks];
      const error = streamModelRef.error;
      const delayMs = streamModelRef.delayMs;

      return (async function* () {
        for (const chunk of chunks) {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          yield { type: 'text-delta', text: chunk };
        }
        if (error) {
          yield { type: 'error', error };
          return;
        }
        yield {
          type: 'done',
          rawUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        };
      })();
    }),
  };
});

import { POST } from './route';

function createValidRequestBody(question = '我今年的事业发展如何？') {
  return {
    report: {
      profile: {
        name: '张三',
        genderLabel: '乾造（男）',
        birthText: '1990年5月10日 08:30',
        locationText: '北京市',
      },
      pillars: [
        { stem: '庚', branch: '午', label: '年柱', element: 'metal', tooltip: '祖上与早年' },
        { stem: '辛', branch: '巳', label: '月柱', element: 'metal', tooltip: '父母与提纲' },
        { stem: '甲', branch: '子', label: '日柱', element: 'wood', tooltip: '日元自身' },
        { stem: '戊', branch: '辰', label: '时柱', element: 'earth', tooltip: '子女与晚年' },
      ],
      tenGods: [
        { key: 'self', label: '比劫', value: 20, tooltip: '自我' },
        { key: 'expression', label: '食伤', value: 25, tooltip: '才华' },
        { key: 'wealth', label: '财星', value: 30, tooltip: '财富' },
        { key: 'order', label: '官杀', value: 15, tooltip: '事业' },
        { key: 'resource', label: '印枭', value: 10, tooltip: '学识' },
      ],
      elements: [
        { key: 'metal', label: '金', value: 35 },
        { key: 'wood', label: '木', value: 15 },
        { key: 'water', label: '水', value: 15 },
        { key: 'fire', label: '火', value: 20 },
        { key: 'earth', label: '土', value: 15 },
      ],
      modules: {
        career: {
          title: '事业分析',
          summary: '技术与管理',
        },
      },
    },
    question,
  };
}

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

describe('POST /api/destiny/copilot 路由测试', () => {
  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://ark.example.com';
    process.env.ARK_MODEL = 'doubao-model';

    mockUserRef.current = { id: 'test-user', role: 'user' };
    streamModelRef.chunks = [];
    streamModelRef.error = null;
    streamModelRef.delayMs = 0;

    quotaSessionMocks.reserve.mockReset();
    quotaSessionMocks.finalize.mockReset();

    quotaSessionMocks.reserve.mockImplementation(() =>
      createFakeQuotaSession({
        inputUnits: 500,
        outputLimit: 2048,
        finalize: quotaSessionMocks.finalize,
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常流式输出：推送 text-delta 与 done 帧，按 success 终态结算额度', async () => {
    streamModelRef.chunks = ['你的八字中', '日主甲木', '财星旺相。'];

    const response = await POST(
      new Request('http://localhost/api/destiny/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRequestBody()),
      })
    );

    expect(response.status).toBe(200);
    const events = await readSseEvents(response);

    // 验证事件流格式
    const textDeltaEvents = events.filter((e) => e.type === 'text-delta');
    const doneEvents = events.filter((e) => e.type === 'done');

    expect(textDeltaEvents).toHaveLength(3);
    expect(textDeltaEvents.map((e) => e.text)).toEqual(['你的八字中', '日主甲木', '财星旺相。']);
    expect(doneEvents).toHaveLength(1);

    // 验证额度预留与成功结算
    expect(quotaSessionMocks.reserve).toHaveBeenCalled();
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-copilot',
        endpoint: '/api/destiny/copilot',
        feature: 'destiny',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      })
    );
  });

  it('上游模型错误：推送 error 帧与 done 帧，按 failed 终态释放额度', async () => {
    streamModelRef.chunks = ['已接收到部分输入'];
    streamModelRef.error = '火山引擎上游连接异常';

    const response = await POST(
      new Request('http://localhost/api/destiny/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRequestBody()),
      })
    );

    expect(response.status).toBe(200);
    const events = await readSseEvents(response);

    const errorEvent = events.find((e) => e.type === 'error');
    const doneEvent = events.find((e) => e.type === 'done');

    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBe('火山引擎上游连接异常');
    expect(doneEvent).toBeDefined();

    // 错误卡收尾按 failed 释放
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-copilot',
        reason: '火山引擎上游连接异常',
      })
    );
  });

  it('客户端取消流：已有输出内容时，管道兜底按 partial 结算额度', async () => {
    streamModelRef.chunks = ['第一段命理解析', '第二段分析', '第三段长文'];
    streamModelRef.delayMs = 20;

    const response = await POST(
      new Request('http://localhost/api/destiny/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRequestBody()),
      })
    );

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    // 读取首个分块（保证已有 outputText 产出）
    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);

    // 模拟客户端主动断开连接 / 取消
    await reader!.cancel('client abort');

    // 等待管道异步结算完成
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 验证兜底按 partial 结算
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        action: 'destiny-copilot',
        outputText: expect.any(String),
      })
    );
  });
});
