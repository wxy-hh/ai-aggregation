/**
 * route.test.ts —— POST /api/destiny/astrology/copilot（星语问答真实化路由）
 *
 * 锁定的外部行为（04 工单）：
 * - 敏感话题（医疗/财务/法律）由服务端确定性规则前置拦截：只推一个正常回答帧（kind='blocked'），
 *   不过 LLM、不预留也不结算额度；
 * - 次数不设每报告上限：能问几次只由账号额度决定（额度不足走 402 计费口径）；
 * - 正常问题：SSE 流式推送正文增量，终帧携带完整回答与白名单收敛后的引用；额度预留 → 成功结算
 *   （usage 归一化），失败释放 / 部分结算，管理员跳过预留；
 * - 引用白名单：模型编造的键（不在事实层允许表内）与未在报告中的模块一律丢弃；
 * - 降级档（无宫位盘）事实层不进 prompt：上升、天顶、宫位与隐藏行星不得出现在提示词里。
 *
 * 参照写法：apps/web/src/app/api/destiny/astrology/report/route.test.ts（SSE 流式路由）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import type { ModuleReading } from '@/lib/astrology/interpretation';

// 通过 hoisted 引用控制每次测试的登录用户（admin 跳过额度预留，普通用户走预留→结算）
const { mockUserRef, streamModelRef, quotaSessionMocks } = vi.hoisted(() => ({
  mockUserRef: {
    current: { id: 'test-user', role: 'user', isAnonymous: true } as {
      id: string;
      role: string;
      isAnonymous: boolean;
    },
  },
  streamModelRef: {
    /** 每次调用的分块序列（由用例准备；字符串按给定切分推送） */
    chunks: [] as string[],
    /** 模拟上游流式错误 */
    error: null as string | null,
    /** 记录调用入参（模型、协议、温度、输出上限、json schema） */
    calls: [] as Array<Record<string, unknown>>,
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

// 路由重构至 QuotaSession，mock 接缝本身
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionMocks.reserve },
}));

// 全链路用例把客户端接缝的 HTTP 调用转交给真实路由 handler（其余用例不经过此 mock）
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(async (url: string, init: RequestInit) => {
    const { POST: routePost } = await import('./route');
    return routePost(
      new Request(`http://localhost${url}`, {
        method: init.method ?? 'POST',
        body: init.body as BodyInit,
        signal: init.signal as AbortSignal,
      })
    );
  }),
}));

// 模型客户端边界：只替换上游调用，其余（配置解析 / 归一化）保持真实
vi.mock('@repo/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    streamModel: vi.fn(() => {
      const chunks = [...streamModelRef.chunks];
      return (async function* () {
        for (const chunk of chunks) {
          yield { type: 'text-delta', text: chunk };
        }
        if (streamModelRef.error) {
          yield { type: 'error', error: streamModelRef.error };
          return;
        }
        yield { type: 'done', usage: null, rawUsage: { input_tokens: 800, output_tokens: 300 } };
      })();
    }),
  };
});

import { POST } from './route';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { streamModel } from '@repo/shared';
import {
  AstrologyQaRequestError,
  astrologyQaErrorMessage,
  requestAstrologyAnswer,
} from '@/lib/astrology/qa-request';
import { buildFactReferenceKeys } from '@/lib/astrology/interpretation';
import { computeChartFacts, startOfNaturalWeekUtc } from '@/lib/astrology/chart-engine';
import { selectActiveTransits } from '@/lib/astrology/transit-selection';
import { SAMPLE_PROFILE_ACCURATE, SAMPLE_PROFILE_UNKNOWN } from '@/lib/astrology/sample-chart';

const streamModelMock = vi.mocked(streamModel);

/* ---------- 请求与事件读取工具 ---------- */

/** 冻结示例盘（1995-10-08 14:30 上海）：与本模块报告路由同一份真值口径 */
const ACCURATE_FACTS: AstrologyChartFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
const UNKNOWN_FACTS: AstrologyChartFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);

/**
 * 生活模块夹具：真实报告里由模型产出（报告路由下发的同一形状），
 * 引用只落在星体星座这类稳定事实上——无宫位档自然也编不出宫位/角点引用。
 */
function moduleFixtures(): ModuleReading[] {
  return [
    { id: 'who', title: '我是谁', summary: '核心气质偏向先照顾气氛。', tags: ['太阳 天秤'], action: '先说自己的想法。', factReferences: ['planet:sun:sign'] },
    { id: 'love', title: '关系如何运作', summary: '在关系里需要被稳定回应。', tags: ['月亮 白羊'], action: '先说感受，再谈事情。', factReferences: ['planet:moon:sign'] },
    { id: 'career', title: '事业如何发挥', summary: '推进工作偏向细致务实。', tags: ['水星 天秤'], action: '把大事拆成最小一步。', factReferences: ['planet:mercury:sign'] },
    { id: 'strengths', title: '我的优势与盲点', summary: '天赋来自自然同频的相位。', tags: ['金星 处女'], action: '记录毫不费力的瞬间。', factReferences: ['planet:venus:sign'] },
    { id: 'week', title: '本周宇宙提示', summary: '本周适合主动创造新鲜体验。', tags: ['本周', '行运'], action: '写下三件做得好的小事。', factReferences: ['planet:mars:sign'] },
  ];
}

const ACCURATE_MODULES: ModuleReading[] = moduleFixtures();
const UNKNOWN_MODULES: ModuleReading[] = moduleFixtures();

const QUESTION = '我在亲密关系里最需要被理解的是什么？';

function buildBody(overrides: Record<string, unknown> = {}) {
  return {
    report: { facts: ACCURATE_FACTS, modules: ACCURATE_MODULES },
    question: QUESTION,
    timePrecision: 'accurate',
    ...overrides,
  };
}

function postCopilot(body: Record<string, unknown> = buildBody()) {
  return POST(
    new Request('http://localhost/api/destiny/astrology/copilot', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, any>);
}

/** 允许引用的事实键全集（与该盘的报告路由同口径） */
function allowedRefsOf(facts: AstrologyChartFacts): Set<string> {
  const week = startOfNaturalWeekUtc(Date.now());
  const selected = selectActiveTransits(facts, { weekStartMs: week.startMs, weekEndMs: week.endMs });
  return new Set(buildFactReferenceKeys(facts, { transitRefKeys: selected.map((s) => s.refKey) }));
}

/** 模型输出夹具：结构化回答（正文 + 引用键） */
function answerPayload(
  facts: AstrologyChartFacts,
  options: { text?: string; citations?: string[] } = {}
) {
  const allowed = allowedRefsOf(facts);
  const planetRef = ['planet:moon:sign', 'planet:sun:sign'].find((key) => allowed.has(key));
  return {
    text:
      options.text ??
      '你的情绪需要被稳定回应，关系里最让你安心的是被认真听完。\n可以练习：先说感受，再谈事情。',
    citations:
      options.citations ??
      [planetRef, 'module:love'].filter((item): item is string => Boolean(item)),
  };
}

/** 把整段 JSON 切成小块（模拟真实流式分块，含跨字段切割） */
function chunked(text: string, size = 32): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function primeStream(payload: Record<string, unknown>) {
  streamModelRef.error = null;
  streamModelRef.chunks = chunked(JSON.stringify(payload));
}

/* ---------- 用例 ---------- */

describe('POST /api/destiny/astrology/copilot（星语问答）', () => {
  beforeEach(() => {
    mockUserRef.current = { id: 'test-user', role: 'user', isAnonymous: true };
    streamModelRef.calls = [];
    streamModelRef.error = null;
    streamModelRef.chunks = [];
    quotaSessionMocks.reserve.mockReset();
    quotaSessionMocks.finalize.mockReset();
    quotaSessionMocks.reserve.mockImplementation(() =>
      createFakeQuotaSession({
        inputUnits: 900,
        outputLimit: 2048,
        finalize: quotaSessionMocks.finalize,
      })
    );
    process.env.ARK_API_KEY = 'test-key';
    process.env.DEEPSEEK_MODEL = 'test-deepseek-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('敏感话题：命中即返回安全提示与自我观察方向，不过 LLM、不计费', async () => {
    const response = await postCopilot(buildBody({ question: '我该不该去看病？' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseEvents(response);
    expect(events.map((event) => event.type)).toEqual(['answer']);
    const answer = events[0].answer;
    expect(answer.kind).toBe('blocked');
    expect(answer.text).toContain('不能据此作出医疗、财务或法律判断');
    expect(answer.text).toContain('观察');
    expect(answer.citations.length).toBeGreaterThanOrEqual(1);
    expect(answer.citations[0]).toMatchObject({ moduleId: 'who' });

    // 不过 LLM、不预留也不结算
    expect(streamModelMock).not.toHaveBeenCalled();
    expect(quotaSessionMocks.reserve).not.toHaveBeenCalled();
    expect(quotaSessionMocks.finalize).not.toHaveBeenCalled();
  });

  it('敏感话题：财务与法律同样前置拦截（三类话题规则齐备）', async () => {
    for (const question of ['我适合投资股票吗？', '这场官司我能赢吗？']) {
      const events = await readSseEvents(await postCopilot(buildBody({ question })));
      expect(events).toHaveLength(1);
      expect(events[0].answer.kind).toBe('blocked');
      expect(events[0].answer.text).toContain('不能据此作出医疗、财务或法律判断');
    }
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('同一份报告不设次数上限：连续提问每次都照常回答（次数只由额度约束）', async () => {
    // 请求体不携带任何已提问数：服务端只按额度裁决，不做每报告计数拦截
    for (let i = 0; i < 4; i += 1) {
      primeStream(answerPayload(ACCURATE_FACTS));
      const events = await readSseEvents(await postCopilot());
      expect(events[events.length - 1].type).toBe('answer');
    }
    expect(streamModelMock).toHaveBeenCalledTimes(4);
  });

  it('正常问题：正文增量流式推送，终帧给出回答与白名单引用', async () => {
    const payload = answerPayload(ACCURATE_FACTS);
    primeStream(payload);

    const events = await readSseEvents(await postCopilot());
    const kinds = events.map((event) => event.type);
    expect(kinds.filter((kind) => kind === 'text-delta').length).toBeGreaterThan(1);
    expect(kinds[kinds.length - 1]).toBe('answer');

    const streamed = events
      .filter((event) => event.type === 'text-delta')
      .map((event) => event.text)
      .join('');
    expect(streamed).toBe(payload.text);

    const answer = events[events.length - 1].answer;
    expect(answer.kind).toBe('answer');
    expect(answer.text).toBe(payload.text);
    // 引用：事实标签可定位回星盘轮，模块引用定位回生活模块
    expect(answer.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ refKey: 'planet:moon:sign', body: 'moon' }),
        expect.objectContaining({ moduleId: 'love' }),
      ])
    );
    expect(answer.citations[0].label).toContain('月亮');
  });

  it('额度：普通用户提问前调用 QuotaSession 预留，成功后声明 success 终态', async () => {
    primeStream(answerPayload(ACCURATE_FACTS));

    await readSseEvents(await postCopilot());

    expect(quotaSessionMocks.reserve).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.reserve.mock.calls[0][0]).toMatchObject({
      userId: 'test-user',
      feature: 'destiny',
      maxOutputTokens: 2048,
      metadata: { reportType: 'astrology', stream: true },
    });
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-copilot',
        endpoint: '/api/destiny/astrology/copilot',
        usage: { input_tokens: 800, output_tokens: 300 },
      })
    );
  });

  it('匿名用户可提问（不登录也能走同一条预留→结算链路）', async () => {
    mockUserRef.current = { id: 'anon-1', role: 'user', isAnonymous: true };
    primeStream(answerPayload(ACCURATE_FACTS));

    const events = await readSseEvents(await postCopilot());

    expect(events[events.length - 1].type).toBe('answer');
    expect(quotaSessionMocks.reserve.mock.calls[0][0]).toMatchObject({ userId: 'anon-1' });
  });

  it('管理员提问同样完成预留与成功结算（免扣与归档由 QuotaSession 决策表承担）', async () => {
    mockUserRef.current = { id: 'test-admin', role: 'admin', isAnonymous: false };
    primeStream(answerPayload(ACCURATE_FACTS));

    const events = await readSseEvents(await postCopilot());

    expect(events[events.length - 1].type).toBe('answer');
    expect(quotaSessionMocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-admin',
        feature: 'destiny',
      }),
      'admin'
    );
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-copilot',
        endpoint: '/api/destiny/astrology/copilot',
      })
    );
  });

  it('额度不足：返回 402，不调用模型', async () => {
    const { BillingError } = await import('@/lib/billing/billing-errors');
    quotaSessionMocks.reserve.mockRejectedValueOnce(
      new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', { requestId: 'r' })
    );

    const response = await postCopilot();

    expect(response.status).toBe(402);
    const payload = (await response.json()) as { code?: string; error?: string };
    expect(payload.code).toBe('QUOTA_INSUFFICIENT');
    expect(payload.error).toContain('额度不足');
    expect(streamModelMock).not.toHaveBeenCalled();
    expect(quotaSessionMocks.finalize).not.toHaveBeenCalled();
  });

  it('引用白名单收敛：编造的键与报告中不存在的模块引用一律丢弃', async () => {
    // 只带 who / love 两个模块：module:strengths 不在报告中
    const modules = ACCURATE_MODULES.filter((m) => m.id === 'who' || m.id === 'love');
    primeStream(
      answerPayload(ACCURATE_FACTS, {
        citations: [
          'planet:pluto:house', // 编造键（白名单外）
          'module:strengths', // 报告中不存在该模块
          'planet:sun:sign',
          '角度', // 非法引用
        ],
      })
    );

    const events = await readSseEvents(
      await postCopilot(buildBody({ report: { facts: ACCURATE_FACTS, modules }, question: '我是什么样的人？' }))
    );

    const answer = events[events.length - 1].answer;
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ refKey: 'planet:sun:sign', body: 'sun' });
  });

  it('引用：行运键可引用（界面标注依据），非稳定事实不给出引用', async () => {
    const allowed = allowedRefsOf(ACCURATE_FACTS);
    const transitRef = [...allowed].find((key) => key.startsWith('transit:'));
    // 无行运数据时本用例不适用（时间未知档；当前盘为含行运的完整盘）
    expect(transitRef).toBeTruthy();
    primeStream(answerPayload(ACCURATE_FACTS, { citations: [transitRef!] }));

    const events = await readSseEvents(await postCopilot());
    const answer = events[events.length - 1].answer;

    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0].refKey).toBe(transitRef);
    expect(answer.citations[0].label).toContain('行运');
  });

  it('上游报错：不产出兜底文案，推错误事件并声明 failed 终态释放预留', async () => {
    const payload = answerPayload(ACCURATE_FACTS);
    const full = JSON.stringify(payload);
    // 只推正文一部分后上游报错
    streamModelRef.chunks = [full.slice(0, full.indexOf('","citations"'))];
    streamModelRef.error = '模型服务暂时不可用，请稍后重试';

    const events = await readSseEvents(await postCopilot());

    expect(events[events.length - 1].type).toBe('error');
    expect(events[events.length - 1].error).toBe('模型服务暂时不可用，请稍后重试');
    // 用户只看到错误卡：必须按 failed 结算并整额释放预留
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-copilot',
        reason: '模型服务暂时不可用，请稍后重试',
      })
    );
  });

  it('一个字都没产出就失败：声明 failed 终态释放预留', async () => {
    streamModelRef.chunks = [];
    streamModelRef.error = '模型服务暂时不可用，请稍后重试';

    const events = await readSseEvents(await postCopilot());

    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-copilot',
        reason: '模型服务暂时不可用，请稍后重试',
      })
    );
  });

  it('模型输出不是合法 JSON：诚实报错，不拼装任何回答，推错误事件并声明 failed 终态释放预留', async () => {
    streamModelRef.chunks = chunked('抱歉，我无法回答这个问题。');
    streamModelRef.error = null;

    const events = await readSseEvents(await postCopilot());

    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(events[0].error).toContain('回答');
    // 用户只看到错误卡：声明 failed 终态整额释放预留
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-copilot',
      })
    );
  });

  it('模型配置缺失：500 且不预留额度', async () => {
    delete process.env.ARK_API_KEY;

    const response = await postCopilot();

    expect(response.status).toBe(500);
    expect(quotaSessionMocks.reserve).not.toHaveBeenCalled();
    expect(quotaSessionMocks.finalize).not.toHaveBeenCalled();
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('提示词：携带盘面事实与允许引用键表，明令不绝对化', async () => {
    primeStream(answerPayload(ACCURATE_FACTS));

    await readSseEvents(await postCopilot());

    const call = streamModelMock.mock.calls[0][0];
    const system = call.messages[0].content;
    const user = call.messages[1].content;
    expect(user).toContain(QUESTION);
    expect(user).toContain('planet:moon:sign');
    expect(user).toContain('aspect:');
    expect(system).toContain('一定');
    expect(system).toContain('医疗');
    // 温度偏低保事实忠实（与报告解读 0.7 不同档）
    expect(call.temperature).toBe(0.3);
    expect(call.maxTokens).toBe(2048);
    expect(call.json?.schema?.schema).toMatchObject({ type: 'object' });
    // 与报告路由同档：推理摘要不参与「引用事实后作答」，省下的预算全给正文
    expect(call.reasoningEffort).toBe('minimal');
  });

  it('降级档（时间未知）：prompt 不含上升/天顶/宫位与度数，引用只落在稳定事实上', async () => {
    const payload = answerPayload(UNKNOWN_FACTS);
    primeStream(payload);

    const events = await readSseEvents(
      await postCopilot(
        buildBody({
          report: { facts: UNKNOWN_FACTS, modules: UNKNOWN_MODULES },
          question: '我的性格底色是什么样的？',
          timePrecision: 'unknown',
        })
      )
    );

    const user = streamModelMock.mock.calls[0][0].messages[1].content;
    expect(user).not.toContain('angle:ascendant:sign');
    // 无宫位档：宫位与角点表整体为空（不是「有内容但没给」，与报告解读同一口径）
    expect(user).toContain('"houses": []');
    expect(user).toContain('"angles": []');
    expect(user).toContain('出生时间未知');
    // 无宫位档：模型即便编造 angle/house 引用也会被丢弃，引用只落在稳定事实上
    const citations = events[events.length - 1].answer.citations as Array<{ refKey?: string }>;
    expect(citations.some((item) => item.refKey === payload.citations[0])).toBe(true);
    expect(citations.every((item) => !item.refKey || !/^(angle|house):/.test(item.refKey))).toBe(true);
  });

  it('请求体校验：问题为空、缺盘面事实、provider 非法一律 400', async () => {
    const cases: Array<Record<string, unknown>> = [
      buildBody({ question: '   ' }),
      { report: { modules: ACCURATE_MODULES }, question: QUESTION },
      buildBody({ provider: 'gpt' }),
    ];

    for (const body of cases) {
      const response = await postCopilot(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('provider 生效：请求体切换 DeepSeek 时走同一份 schema 弱约束', async () => {
    primeStream(answerPayload(ACCURATE_FACTS));

    await readSseEvents(await postCopilot(buildBody({ provider: 'deepseek' })));

    const call = streamModelMock.mock.calls[0][0];
    expect(call.config.protocol).toBe('deepseek-chat');
    expect(call.json?.schema?.name).toBe('astrology_qa_answer');
  });
});

/**
 * 全链路（前端接缝 → 真实路由 handler，只把 HTTP 传输换成直接调用）：
 * 验证面板侧确实拿到真实 LLM 答案与白名单引用；敏感拦截与超限也用同一路径返回。
 */
describe('客户端接缝 → 问答路由（全链路）', () => {
  beforeEach(() => {
    mockUserRef.current = { id: 'test-user', role: 'user', isAnonymous: true };
    streamModelRef.calls = [];
    streamModelRef.error = null;
    streamModelRef.chunks = [];
    quotaSessionMocks.reserve.mockReset();
    quotaSessionMocks.finalize.mockReset();
    quotaSessionMocks.reserve.mockImplementation(() =>
      createFakeQuotaSession({
        inputUnits: 900,
        outputLimit: 2048,
        finalize: quotaSessionMocks.finalize,
      })
    );
    process.env.ARK_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('提问：正文增量回调与终帧答案一致，引用可定位', async () => {
    const payload = answerPayload(ACCURATE_FACTS);
    primeStream(payload);
    const deltas: string[] = [];

    const answer = await requestAstrologyAnswer(QUESTION, ACCURATE_FACTS, ACCURATE_MODULES, {
      onDelta: (text) => deltas.push(text),
    });

    expect(answer.kind).toBe('answer');
    expect(answer.text).toBe(payload.text);
    expect(deltas.join('')).toBe(payload.text);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations[0]).toMatchObject({ refKey: 'planet:moon:sign', body: 'moon' });
  });

  it('敏感问题：同一路径返回安全话术，且未调用模型、未预留额度', async () => {
    const answer = await requestAstrologyAnswer('我该不该去看病？', ACCURATE_FACTS, ACCURATE_MODULES, {});

    expect(answer.kind).toBe('blocked');
    expect(answer.text).toContain('不能据此作出医疗、财务或法律判断');
    expect(streamModelMock).not.toHaveBeenCalled();
    expect(quotaSessionMocks.reserve).not.toHaveBeenCalled();
  });

  it('额度不足：同一路径按 402 口径返回服务端中文提示（面板据此展示，全局弹框另行提示）', async () => {
    const { BillingError } = await import('@/lib/billing/billing-errors');
    quotaSessionMocks.reserve.mockRejectedValueOnce(
      new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', { requestId: 'req-1' })
    );
    const error = await requestAstrologyAnswer(QUESTION, ACCURATE_FACTS, ACCURATE_MODULES, {}).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(AstrologyQaRequestError);
    expect((error as AstrologyQaRequestError).kind).toBe('quota');
    expect(astrologyQaErrorMessage(error)).toContain('额度不足');
    expect(streamModelMock).not.toHaveBeenCalled();
  });
});
