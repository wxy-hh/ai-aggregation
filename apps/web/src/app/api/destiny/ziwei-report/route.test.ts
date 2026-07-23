import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallModelOptions, CallModelResult } from '@repo/shared';

// 通过 hoisted 引用控制每次测试的登录用户（admin 走 safeRecordAiUsage，非 admin 走预留/结算）
const { mockUserRef } = vi.hoisted(() => ({
  mockUserRef: { current: { id: 'test-admin', role: 'admin' } as { id: string; role: string } },
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (req: Request, handler: (user: { id: string; role: string }, request: Request) => unknown) =>
      handler(mockUserRef.current, req)
  ),
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage: vi.fn((value) => value),
  safeRecordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/billing/quota-service', () => ({
  reserveChatQuota: vi.fn(),
  settleAiQuota: vi.fn(async () => undefined),
  releaseAiQuota: vi.fn(async () => undefined),
}));

vi.mock('@/lib/billing/usage-measurement', () => ({
  createTokenMeasurement: vi.fn(() => ({ meterType: 'tokens', units: 1 })),
  estimateOutputTokens: vi.fn(() => 1),
}));

vi.mock('@/lib/billing/request-id', () => ({
  getBillingRequestId: vi.fn(() => 'req-test'),
}));

vi.mock('@repo/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared')>();
  return { ...actual, callModel: vi.fn() };
});

import { POST } from './route';
import { callModel } from '@repo/shared';
import {
  releaseAiQuota,
  reserveChatQuota,
  settleAiQuota,
} from '@/lib/billing/quota-service';
import { BillingError } from '@/lib/billing/billing-errors';

const callModelMock = vi.mocked(callModel);
const reserveChatQuotaMock = vi.mocked(reserveChatQuota);
const settleAiQuotaMock = vi.mocked(settleAiQuota);
const releaseAiQuotaMock = vi.mocked(releaseAiQuota);

// ─── 测试数据 ───

const GROUP_A_LABELS = ['父母宫', '福德宫', '田宅宫', '官禄宫', '命宫', '兄弟宫'];
const GROUP_B_LABELS = ['奴仆宫', '夫妻宫', '迁移宫', '子女宫', '财帛宫', '疾厄宫'];

const QUICK_PAYLOAD = {
  overviewModules: {
    personality: {
      title: '命宫武曲贪狼同守',
      summary: '性格坚毅果断，行动力突出。',
      advantages: ['行动力强'],
      suggestions: ['注意劳逸结合'],
    },
    career: {
      title: '官禄宫紫微七杀坐守',
      summary: '事业发展稳健，具领导潜质。',
      advantages: ['领导力强'],
      suggestions: ['多听取意见'],
    },
    wealth: {
      title: '财帛宫廉贞破军坐守',
      summary: '财运起伏较大，需要规划。',
      advantages: ['善于开拓'],
      suggestions: ['量入为出'],
    },
  },
  timeline: [
    {
      year: 2026,
      title: '稳中求进',
      summary: '整体运势平稳向上。',
      detail: { opportunities: ['贵人相助'], risks: ['冲动决策'], actions: ['稳扎稳打'] },
    },
  ],
  relations: {
    summary: '六亲缘分和睦。',
    opportunities: ['家庭支持'],
    risks: ['沟通不足'],
    actions: ['多陪伴家人'],
  },
};

const LOVE_MODULE = {
  title: '夫妻宫天府坐守',
  summary: '感情婚姻稳定和谐。',
  advantages: ['包容体贴'],
  suggestions: ['多沟通'],
};

const HEALTH_MODULE = {
  title: '疾厄宫廉贞破军能量',
  summary: '注意作息规律与情绪管理。',
  advantages: ['恢复力强'],
  suggestions: ['定期体检'],
};

function palaceItems(labels: string[]) {
  return labels.map((label) => ({
    key: `p-${label}`,
    label,
    summary: `${label}星曜组合解读`,
    suggestions: ['建议一', '建议二'],
  }));
}

// ─── 工具函数 ───

function modelResult(payload: unknown): CallModelResult {
  return {
    text: JSON.stringify(payload),
    usage: null,
    raw: { usage: { input_tokens: 1, output_tokens: 2 } },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRequest() {
  return new Request('http://localhost/api/destiny/ziwei-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '测试用户',
      gender: 'male',
      calendarType: 'solar',
      birthDate: { year: 1990, month: 6, day: 15 },
      birthTime: { hour: '10', minute: '30' },
      location: { name: '北京', lat: null, lon: null },
      provider: 'doubao',
    }),
  });
}

type SseEvent = Record<string, unknown> & { type: string; sectionKey?: string; payload?: unknown };

async function readSseEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as SseEvent);
}

function sectionKeys(events: SseEvent[]) {
  return events.filter((e) => e.type === 'section-final').map((e) => e.sectionKey);
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── 测试 ───

describe('POST /api/destiny/ziwei-report（并行化）', () => {
  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://ark.example.com/api/v3';
    mockUserRef.current = { id: 'test-admin', role: 'admin' };
    callModelMock.mockReset();
    reserveChatQuotaMock.mockReset();
    reserveChatQuotaMock.mockImplementation(
      async ({ requestId }: { requestId: string }) =>
        ({
          reservation: { id: `res-${requestId}` },
          inputUnits: 10,
          outputLimit: 3500,
        }) as never
    );
    settleAiQuotaMock.mockClear();
    releaseAiQuotaMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quick 与 full 两组三路 AI 调用并行发起，不互相等待', async () => {
    const calls: Record<string, ReturnType<typeof deferred<CallModelResult>>> = {};
    callModelMock.mockImplementation((opts: CallModelOptions) => {
      const name = opts.json?.schema?.name ?? 'unknown';
      const d = deferred<CallModelResult>();
      calls[name] = d;
      return d.promise;
    });

    const response = await POST(createRequest());
    // 刷新微任务，让流 start 内的三路调用全部发起
    await flushMicrotasks();

    // 关键断言：三路调用都已在未完成任何一路的情况下发起（并行而非串行）
    expect(Object.keys(calls).sort()).toEqual([
      'ziwei_health_group',
      'ziwei_love_group',
      'ziwei_quick',
    ]);

    // quick 阶段的 schema 不再包含 profileOverview（改为本地生成）
    const quickCall = callModelMock.mock.calls.find(
      ([opts]) => opts.json?.schema?.name === 'ziwei_quick'
    );
    const quickSchema = quickCall?.[0].json?.schema?.schema as {
      properties: Record<string, unknown>;
    };
    expect(quickSchema.properties).not.toHaveProperty('profileOverview');

    // B 组先完成、A 组后完成：合并后的宫位顺序仍必须是 canonical 顺序
    calls['ziwei_health_group'].resolve(
      modelResult({ palaceAnalysis: palaceItems(GROUP_B_LABELS), health: HEALTH_MODULE })
    );
    await flushMicrotasks();
    calls['ziwei_love_group'].resolve(
      modelResult({ palaceAnalysis: palaceItems(GROUP_A_LABELS), love: LOVE_MODULE })
    );
    calls['ziwei_quick'].resolve(modelResult(QUICK_PAYLOAD));

    const events = await readSseEvents(response);
    const keys = sectionKeys(events);

    // chartData 与本地生成的 profileOverview 最先到达
    expect(keys.slice(0, 2)).toEqual(['chartData', 'profileOverview']);

    const profileEvent = events.find((e) => e.sectionKey === 'profileOverview');
    expect(profileEvent?.payload).toMatchObject({ name: '测试用户', genderLabel: '乾造（男命）' });

    const palaceEvent = events.find((e) => e.sectionKey === 'palaceAnalysis');
    const palaces = palaceEvent?.payload as Array<{ label: string }>;
    expect(palaces).toHaveLength(12);
    expect(palaces.map((p) => p.label)).toEqual([...GROUP_A_LABELS, ...GROUP_B_LABELS]);

    expect(keys).toContain('love');
    expect(keys).toContain('health');
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('单组失败降级：palaceAnalysis 与 love 缺失，health 与 quick 区块不受影响', async () => {
    callModelMock.mockImplementation((opts: CallModelOptions) => {
      const name = opts.json?.schema?.name ?? '';
      if (name === 'ziwei_quick') return Promise.resolve(modelResult(QUICK_PAYLOAD));
      if (name === 'ziwei_love_group') return Promise.reject(new Error('upstream boom'));
      return Promise.resolve(
        modelResult({ palaceAnalysis: palaceItems(GROUP_B_LABELS), health: HEALTH_MODULE })
      );
    });

    const events = await readSseEvents(await POST(createRequest()));
    const keys = sectionKeys(events);

    expect(keys).not.toContain('palaceAnalysis');
    expect(keys).not.toContain('love');
    expect(keys).toContain('health');
    expect(keys).toContain('overviewModules');
    expect(keys).toContain('timeline');
    expect(keys).toContain('relations');
    // 降级不阻断报告完成，也不发送 error
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('quick 失败降级为空：full 两组区块不受影响，报告仍完成', async () => {
    callModelMock.mockImplementation((opts: CallModelOptions) => {
      const name = opts.json?.schema?.name ?? '';
      if (name === 'ziwei_quick') return Promise.reject(new Error('quick timeout'));
      if (name === 'ziwei_love_group') {
        return Promise.resolve(
          modelResult({ palaceAnalysis: palaceItems(GROUP_A_LABELS), love: LOVE_MODULE })
        );
      }
      return Promise.resolve(
        modelResult({ palaceAnalysis: palaceItems(GROUP_B_LABELS), health: HEALTH_MODULE })
      );
    });

    const events = await readSseEvents(await POST(createRequest()));
    const keys = sectionKeys(events);

    expect(keys).not.toContain('overviewModules');
    expect(keys).not.toContain('timeline');
    expect(keys).not.toContain('relations');
    expect(keys).toContain('palaceAnalysis');
    expect(keys).toContain('love');
    expect(keys).toContain('health');
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('非管理员：失败组的预留被释放，成功组正常结算', async () => {
    mockUserRef.current = { id: 'user-1', role: 'user' };
    callModelMock.mockImplementation((opts: CallModelOptions) => {
      const name = opts.json?.schema?.name ?? '';
      if (name === 'ziwei_quick') return Promise.resolve(modelResult(QUICK_PAYLOAD));
      if (name === 'ziwei_love_group') return Promise.reject(new Error('boom'));
      return Promise.resolve(
        modelResult({ palaceAnalysis: palaceItems(GROUP_B_LABELS), health: HEALTH_MODULE })
      );
    });

    const events = await readSseEvents(await POST(createRequest()));

    expect(reserveChatQuotaMock).toHaveBeenCalledTimes(3);
    // 失败组（full:a）的预留必须释放，不能悬挂
    expect(releaseAiQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'res-req-test:full:a' })
    );
    // quick 与 full:b 成功结算
    expect(settleAiQuotaMock).toHaveBeenCalledTimes(2);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
  });

  it('计费错误不降级：BillingError 上抛为 error 事件且不发送 complete', async () => {
    mockUserRef.current = { id: 'user-1', role: 'user' };
    reserveChatQuotaMock.mockImplementation(async ({ requestId }: { requestId: string }) => {
      if (requestId === 'req-test:quick') {
        throw new BillingError('QUOTA_INSUFFICIENT', '当前额度不足，无法开始本次请求');
      }
      return {
        reservation: { id: `res-${requestId}` },
        inputUnits: 10,
        outputLimit: 3500,
      } as never;
    });
    callModelMock.mockImplementation((opts: CallModelOptions) => {
      const name = opts.json?.schema?.name ?? '';
      if (name === 'ziwei_love_group') {
        return Promise.resolve(
          modelResult({ palaceAnalysis: palaceItems(GROUP_A_LABELS), love: LOVE_MODULE })
        );
      }
      return Promise.resolve(
        modelResult({ palaceAnalysis: palaceItems(GROUP_B_LABELS), health: HEALTH_MODULE })
      );
    });

    const events = await readSseEvents(await POST(createRequest()));

    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.some((e) => e.type === 'complete')).toBe(false);
  });
});
