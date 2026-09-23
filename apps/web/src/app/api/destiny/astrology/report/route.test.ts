/**
 * route.test.ts —— POST /api/destiny/astrology/report（星座寰宇报告流路由）
 *
 * 锁定的外部行为（工单 03；事实层断言沿用 02 工单，改为在模型客户端边界 mock）：
 * - 完整协议 chart-facts → headline → bigThree → modules → transits → complete 按序推送，
 *   chart-facts 永远是第一帧（额度与模型配置只在解读阶段介入）；
 * - 豆包（json_schema 强约束）与 DeepSeek（json_object 弱约束）走同一份 schema，
 *   请求体 provider 生效（默认豆包）；
 * - 额度：解读前预留（管理员跳过）→ 成功按 usage 归一化结算；流失败有文本按 partial 部分结算，
 *   一个字都没有则整额释放；预留不足只降级解读层（quota），星盘照常下发；
 * - 解读超时 / 校验失败 / 模型报错：不产出任何兜底文案，只推 interpretation-unavailable(reason='model')；
 * - 降级档：进 prompt 的事实层不含被隐藏字段（无宫位档没有上升、天顶、宫位与度数）；
 * - 请求体校验与表单口径一致：未来日期、缺失时分、缺经纬度/时区、非法 provider 一律 400。
 *
 * 参照写法：apps/web/src/app/api/destiny/report/route.test.ts（SSE 流式路由）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import { aspectRefKey, buildFactReferenceKeys } from '@/lib/astrology/interpretation';

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
      })
    );
  }),
}));

// 模型客户端边界：只替换上游调用，其余（配置解析 / 归一化 / schema 注入）保持真实
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
        yield { type: 'done', usage: null, rawUsage: { input_tokens: 1500, output_tokens: 900 } };
      })();
    }),
  };
});

import { POST } from './route';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { streamModel } from '@repo/shared';
import { onQuotaExhausted } from '@/lib/api/quota-events';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { startChartFactsRequest } from '@/lib/astrology/chart-request';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import { SAMPLE_CHART_ACCURATE, SAMPLE_CHART_UNKNOWN } from '@/lib/astrology/sample-chart';
import { computeChartFacts, startOfNaturalWeekUtc } from '@/lib/astrology/chart-engine';
import { selectActiveTransits } from '@/lib/astrology/transit-selection';
import { SAMPLE_PROFILE_ACCURATE, SAMPLE_PROFILE_UNKNOWN } from '@/lib/astrology/sample-chart';

const streamModelMock = vi.mocked(streamModel);

/* ---------- 请求与事件读取工具 ---------- */

/** 冻结示例盘对应的表单口径请求体（1995-10-08 14:30 上海，三档共用出生资料） */
const BASE_BODY = {
  name: '小宇',
  birthDate: { year: 1995, month: 10, day: 8 },
  topic: 'self' as const,
  timePrecision: 'accurate' as const,
  birthTime: { hour: '14', minute: '30' },
  approximateSlot: '',
  location: { name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' },
};

function postReport(body: Record<string, unknown> = BASE_BODY) {
  return POST(
    new Request('http://localhost/api/destiny/astrology/report', {
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

/** 抹掉生成时刻与行运（行运窗口随请求时刻变化）后比对真值主体 */
function withoutVolatile(facts: AstrologyChartFacts) {
  const { calculatedAt: _at, transits: _transits, ...rest } = facts;
  return rest;
}

/* ---------- 模型输出夹具（四个分区，内容随盘面事实生成） ---------- */

function buildReportPayload(facts: AstrologyChartFacts) {
  const ascendant = facts.angles.ascendant.sign;
  const stableAspect = facts.aspects.find((a) => a.stability === 'stable') ?? null;
  const week = startOfNaturalWeekUtc(Date.now());
  const selected = selectActiveTransits(facts, { weekStartMs: week.startMs, weekEndMs: week.endMs });
  // 依据键必须落在该盘的白名单内（降级档的月亮等字段可能整体缺席）
  const allowed = new Set(
    buildFactReferenceKeys(facts, { transitRefKeys: selected.map((s) => s.refKey) })
  );
  const planetRefs = [...allowed].filter((k) => k.startsWith('planet:') && k.endsWith(':sign'));
  const primaryRefs = ['planet:sun:sign', 'planet:moon:sign'].filter((k) => allowed.has(k));
  const headlineRefs = primaryRefs.length > 0 ? primaryRefs : planetRefs.slice(0, 2);
  const moduleRef = headlineRefs[0];
  const strengthRef = stableAspect ? aspectRefKey(stableAspect) : moduleRef;
  return {
    headline: {
      text: '在稳定与自由之间，练习把感受说清楚。',
      factReferences: headlineRefs,
    },
    bigThree: {
      sun: { plain: '你先做再说的底色很明显。', action: '开口前先数三秒。' },
      moon: { plain: '你需要被回应才安心。', action: '先说一句我现在有点急。' },
      ascendant: ascendant ? { plain: '你给人的第一印象是直接有劲。', action: '必要时展示柔软。' } : null,
    },
    modules: [
      {
        id: 'who',
        title: '先稳后亮的表达者',
        summary: '你的核心气质偏稳，情绪来得直接，两种状态都是真的你。',
        scenario: '你可能这样：在人群里先观察，独处时情绪来得直接。',
        tags: ['太阳天秤', '月亮巨蟹'],
        action: '每周留一件只为喜欢的小事。',
        factReferences: headlineRefs,
      },
      {
        id: 'love',
        title: '在关系里说清楚',
        summary: '你在关系里需要被回应，表达在乎的方式偏细腻。',
        tags: ['金星', '第七宫'],
        action: '先说感受，再谈事情。',
        factReferences: [moduleRef],
      },
      {
        id: 'career',
        title: '稳住节奏再放大',
        summary: '把复杂问题拆开之后，你的稳定判断力更能体现。',
        tags: ['水星', '太阳'],
        action: '把一件重要的事拆成今天就能完成的一步。',
        factReferences: [moduleRef],
      },
      {
        id: 'strengths',
        title: '同频即天赋',
        summary: '顺相位的能量在你身上几乎不费力，值得被刻意调用。',
        tags: ['稳定相位'],
        action: '记录一个「毫不费力却做得好」的瞬间。',
        factReferences: [strengthRef],
      },
      {
        id: 'week',
        title: '本周宇宙提示',
        summary: '本周先把节奏稳住，再决定要不要加速。',
        tags: ['本周', '行运'],
        action: '本周写下一件今天做得不错的小事。',
        factReferences: [moduleRef],
      },
    ],
    transits: {
      opportunity: '顺相位适合把一件事往前推一步。',
      caution: '紧张相位出现时先照顾情绪。',
      action: '本周写下一件今天做得不错的小事。',
      transitReferences: selected.length > 0 ? [selected[0].refKey] : [],
      keyAspects: stableAspect
        ? [
            {
              refKey: aspectRefKey(stableAspect),
              energy: '两颗星的能量关系说明。',
              life: '在生活里可能这样表现。',
              practice: '给自己一个小练习。',
            },
          ]
        : [],
    },
  };
}

/** 把整段 JSON 切成小块（模拟真实流式分块，含跨分区切割） */
function chunked(text: string, size = 48): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function primeStream(facts: AstrologyChartFacts, options: { chunks?: number } = {}) {
  streamModelRef.error = null;
  streamModelRef.chunks = chunked(JSON.stringify(buildReportPayload(facts)), options.chunks ?? 48);
}

describe('POST /api/destiny/astrology/report（解读流）', () => {
  beforeEach(() => {
    mockUserRef.current = { id: 'test-user', role: 'user', isAnonymous: true };
    streamModelRef.calls = [];
    quotaSessionMocks.reserve.mockReset();
    quotaSessionMocks.finalize.mockReset();
    quotaSessionMocks.reserve.mockImplementation(() =>
      createFakeQuotaSession({
        outputLimit: 6000,
        finalize: quotaSessionMocks.finalize,
      })
    );
    process.env.ARK_API_KEY = 'test-key';
    process.env.DEEPSEEK_MODEL = 'test-deepseek-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('完整协议：chart-facts → headline → bigThree → modules → transits → complete 按序推送', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    const response = await postReport();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseEvents(response);
    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'headline',
      'bigThree',
      'modules',
      'transits',
      'complete',
    ]);
    expect(events[0].facts.planets.find((p: any) => p.body === 'sun')?.sign).toBe('libra');
    expect(events[1].headline.factReferences).toEqual(['planet:sun:sign', 'planet:moon:sign']);
    expect(events[2].bigThree.sun.plain).toContain('底色');
    expect(events[3].modules.map((m: any) => m.id)).toEqual(['who', 'love', 'career', 'strengths', 'week']);
    expect(events[4].transits.keyAspects).toHaveLength(1);
  });

  it('chart-facts 永远是第一帧：模型配置缺失也只降级解读层', async () => {
    delete process.env.ARK_API_KEY;
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    const events = await readSseEvents(await postReport());
    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(events[1].reason).toBe('model');
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('结算失败：只记日志，不补发 complete、不降级已经送达的解读结论', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    quotaSessionMocks.finalize.mockRejectedValueOnce(new Error('记账后端不可用'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = await readSseEvents(await postReport());

    // 协议不变：四分区齐备 + 恰好一个 complete，绝不出现第二个 complete 或降级事件
    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'headline',
      'bigThree',
      'modules',
      'transits',
      'complete',
    ]);
    expect(events.filter((event) => event.type === 'complete')).toHaveLength(1);
    expect(events.some((event) => event.type === 'interpretation-unavailable')).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('结算失败'),
      expect.anything()
    );
    consoleError.mockRestore();
  });

  it('豆包：走 json_schema 强约束，温度与输出上限按星座解读档位', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    await readSseEvents(await postReport({ ...BASE_BODY, provider: 'doubao' }));

    const call = streamModelMock.mock.calls[0][0];
    expect(call.config.model).toBeTruthy();
    expect(call.json?.schema?.name).toBe('astrology_interpretation_report');
    expect(call.json?.schema?.schema).toMatchObject({ type: 'object' });
    expect(call.temperature).toBe(0.7);
    expect(call.maxTokens).toBe(6000); // 余额允许的上限（QuotaSession.reserve 返回值）
    // 解读不需要深推理：ARK 推理摘要会吃光输出预算（匿名档曾因此一帧正文都出不来）
    expect(call.reasoningEffort).toBe('minimal');
    const systemPrompt = call.messages[0].content;
    expect(systemPrompt).toContain('18–28 字');
    expect(systemPrompt).toContain('练习把感受也写进计划里。'); // 黄金样例 few-shot
  });

  it('DeepSeek：请求体 provider 生效（弱约束 + schema 样例注入）', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    await readSseEvents(await postReport({ ...BASE_BODY, provider: 'deepseek' }));

    const call = streamModelMock.mock.calls[0][0];
    expect(call.config.protocol).toBe('deepseek-chat');
    // 弱约束的样例注入由模型客户端负责：传入的系统提示词本身不带 schema JSON
    expect(call.messages[0].content).not.toContain('"additionalProperties"');
    expect(call.json?.schema?.schema).toMatchObject({ type: 'object' });
  });

  it('非法 provider：按请求体校验拦截为 400', async () => {
    const response = await postReport({ ...BASE_BODY, provider: 'gpt' });
    expect(response.status).toBe(400);
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('额度：解读前调用 QuotaSession 预留，成功后声明 success 终态（普通用户）', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    await readSseEvents(await postReport());

    expect(quotaSessionMocks.reserve).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.reserve.mock.calls[0][0]).toMatchObject({
      userId: 'test-user',
      feature: 'destiny',
      maxOutputTokens: 8000,
      metadata: { reportType: 'astrology', timePrecision: 'accurate' },
    });
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-report',
        endpoint: '/api/destiny/astrology/report',
        usage: expect.objectContaining({ input_tokens: 1500, output_tokens: 900 }),
      })
    );
  });

  it('额度：管理员请求同样调用 QuotaSession 预留与声明 success 终态（免扣由决策表承担）', async () => {
    mockUserRef.current = { id: 'test-admin', role: 'admin', isAnonymous: false };
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    await readSseEvents(await postReport());

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
        action: 'destiny-report',
        endpoint: '/api/destiny/astrology/report',
      })
    );
  });

  it('额度不足：真值照常下发，解读降级为 unavailable(quota)', async () => {
    const { BillingError } = await import('@/lib/billing/billing-errors');
    quotaSessionMocks.reserve.mockRejectedValueOnce(
      new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', { requestId: 'r' })
    );

    const events = await readSseEvents(await postReport());

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(events[0].facts).toBeTruthy();
    expect(events[1].reason).toBe('quota');
    expect(streamModelMock).not.toHaveBeenCalled();
    expect(quotaSessionMocks.finalize).not.toHaveBeenCalled();
  });

  it('解读超时/上游报错：不产出任何兜底文案，降级为 unavailable(model) 并声明 partial 终态部分结算', async () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    primeStream(facts);
    // 只推前半段（headline 已闭合）后上游报错
    const full = JSON.stringify(buildReportPayload(facts));
    streamModelRef.chunks = [full.slice(0, full.indexOf('"bigThree"'))];
    streamModelRef.error = '模型服务暂时不可用，请稍后重试';

    const events = await readSseEvents(await postReport());

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'headline',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(events[2].reason).toBe('model');
    // 已产出部分文本 → 声明 partial 终态
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'partial',
      expect.objectContaining({
        action: 'destiny-report',
        reason: '模型服务暂时不可用，请稍后重试',
      })
    );
  });

  it('一个字都没产出就失败：声明 failed 终态释放预留', async () => {
    streamModelRef.chunks = [];
    streamModelRef.error = '模型服务暂时不可用，请稍后重试';

    const events = await readSseEvents(await postReport());

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledTimes(1);
    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'destiny-report',
        reason: '模型服务暂时不可用，请稍后重试',
      })
    );
  });

  it('模型输出缺分区：不补齐、不兜底，降级为 unavailable(model)', async () => {
    // 只有 headline 与 bigThree：modules / transits 缺失
    const payload = buildReportPayload(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    const partial = JSON.stringify({ headline: payload.headline, bigThree: payload.bigThree });
    streamModelRef.chunks = chunked(partial);
    streamModelRef.error = null;

    const events = await readSseEvents(await postReport());

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'headline',
      'bigThree',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(events[3].reason).toBe('model');
  });

  it('模型引用了被降级隐藏的字段：引用被丢弃，剩余证据不足则降级', async () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    const payload = buildReportPayload(facts);
    // headline 只引用一个不存在的键（编造引用）→ 无可用依据 → 解读层降级
    streamModelRef.chunks = chunked(
      JSON.stringify({ ...payload, headline: { text: '练习把感受说清楚。', factReferences: ['planet:pluto:house'] } })
    );
    streamModelRef.error = null;

    const events = await readSseEvents(await postReport());

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'interpretation-unavailable',
      'complete',
    ]);
    expect(events[1].reason).toBe('model');
  });

  it('无宫位档（时间未知）：进 prompt 的事实层不含上升/天顶/宫位，产出仍走完整协议', async () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
    primeStream(facts);

    const events = await readSseEvents(
      await postReport({
        ...BASE_BODY,
        // 与冻结的无宫位档案同一出生资料（1995-10-10 完全未知）
        birthDate: { year: 1995, month: 10, day: 10 },
        timePrecision: 'unknown',
        birthTime: { hour: '', minute: '' },
      })
    );

    expect(events.map((event) => event.type)).toEqual([
      'chart-facts',
      'headline',
      'bigThree',
      'modules',
      'transits',
      'complete',
    ]);
    // 真值为无宫位盘（与冻结档案同口径）
    expect(withoutVolatile(events[0].facts)).toEqual(withoutVolatile(SAMPLE_CHART_UNKNOWN));
    // 上升被强制清空：模型没有可依据的上升事实
    expect(events[2].bigThree.ascendant).toBeNull();
    // 进 prompt 的事实层不含被隐藏字段
    const userPrompt = streamModelMock.mock.calls[0][0].messages[1].content;
    expect(userPrompt).not.toContain('angle:ascendant:sign');
    // 无宫位档：宫位与角点表整体为空（不是「有内容但没给」）
    expect(userPrompt).toContain('"houses": []');
    expect(userPrompt).toContain('"angles": []');
    expect(userPrompt).toContain('出生时间未知');
    // 时间未知档行运为空 → 三角与引用一并清空
    expect(events[4].transits.transitReferences).toEqual([]);
    expect(events[4].transits.opportunity).toBe('');
  });

  it('含宫位档：事实层进 prompt 且行运按紧密度筛选 Top 8', async () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    primeStream(facts);

    await readSseEvents(await postReport());

    const userPrompt = streamModelMock.mock.calls[0][0].messages[1].content;
    expect(userPrompt).toContain('angle:ascendant:sign');
    expect(userPrompt).toContain('"houses"');
    const week = startOfNaturalWeekUtc(Date.now());
    const selected = selectActiveTransits(facts, { weekStartMs: week.startMs, weekEndMs: week.endMs });
    expect(selected.length).toBeLessThanOrEqual(8);
    for (const transit of selected) expect(userPrompt).toContain(transit.refKey);
  });

  it('同一份出生资料重算：真值确定性一致（重试只补解读，不改变星盘）', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    const first = await readSseEvents(await postReport());
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    const second = await readSseEvents(await postReport());

    expect(withoutVolatile(second[0].facts)).toEqual(withoutVolatile(first[0].facts));
  });

  it('请求体校验：未来日期、缺时区、精确档缺时分、二月三十日一律 400', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const cases: Array<Record<string, unknown>> = [
      { ...BASE_BODY, location: { name: '上海', lat: null, lon: null, timezone: null } },
      { ...BASE_BODY, location: { name: '上海', lat: 31.23, lon: 121.47, timezone: '' } },
      { ...BASE_BODY, birthTime: { hour: '', minute: '' } },
      { ...BASE_BODY, birthDate: { year: 1995, month: 2, day: 30 } },
      {
        ...BASE_BODY,
        birthDate: { year: tomorrow.getFullYear(), month: tomorrow.getMonth() + 1, day: tomorrow.getDate() },
      },
    ];

    for (const body of cases) {
      const response = await postReport(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(streamModelMock).not.toHaveBeenCalled();
  });

  it('流式解读成功完成：将模型返回的 usage 透传至 finalize 上下文', async () => {
    streamModelRef.error = null;
    const payload = buildReportPayload(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    streamModelRef.chunks = chunked(JSON.stringify(payload));
    await readSseEvents(await postReport());

    expect(quotaSessionMocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'destiny-report',
        endpoint: '/api/destiny/astrology/report',
        usage: expect.objectContaining({ input_tokens: 1500, output_tokens: 900 }),
      })
    );
  });
});

/**
 * 全链路（前端接缝 → 真实路由 handler，只把 HTTP 传输换成直接调用）：
 * 验证提交链路确实拿到本人星盘，并把流式解读分区落进工作区；额度不足走既有降级链路。
 * 浏览器里的 fetch/SSE 传输由 chart-request.test.ts 的流行为测试覆盖。
 */
describe('客户端接缝 → 报告路由（全链路）', () => {
  beforeEach(() => {
    mockUserRef.current = { id: 'test-user', role: 'user', isAnonymous: true };
    process.env.ARK_API_KEY = 'test-key';
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  afterEach(() => {
    vi.clearAllMocks();
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  function formDataOf(body: typeof BASE_BODY): AstrologyFormData {
    return body as unknown as AstrologyFormData;
  }

  it('表单提交 → 真值兑现为本人星盘，解读分区落到工作区 ready', async () => {
    primeStream(computeChartFacts(SAMPLE_PROFILE_ACCURATE));

    const { result } = startChartFactsRequest(formDataOf(BASE_BODY));
    const facts = await result;

    expect(withoutVolatile(facts)).toEqual(withoutVolatile(SAMPLE_CHART_ACCURATE));
    // 分区逐区到达：等最后一个分区（transits）落库后再整体断言
    await vi.waitFor(() =>
      expect(useDestinyWorkspaceStore.getState().astrology.interpretation.report?.transits).toBeTruthy()
    );
    const interpretation = useDestinyWorkspaceStore.getState().astrology.interpretation;
    expect(interpretation.status).toBe('ready');
    expect(interpretation.reason).toBeNull();
    expect(interpretation.report?.headline?.text).toContain('稳定与自由');
    expect(interpretation.report?.bigThree?.sun?.plain).toContain('底色');
    expect(interpretation.report?.modules.map((m) => m.id)).toEqual([
      'who',
      'love',
      'career',
      'strengths',
      'week',
    ]);
    expect(interpretation.report?.transits?.weekRange).toBeTruthy();
    expect(interpretation.report?.transits?.keyAspects.length).toBeGreaterThan(0);
  });

  it('额度不足：真值照常兑现，工作区落 quota 并唤起额度耗尽对话框', async () => {
    const { BillingError } = await import('@/lib/billing/billing-errors');
    quotaSessionMocks.reserve.mockRejectedValueOnce(
      new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', { requestId: 'r' })
    );
    const quotaListener = vi.fn();
    const off = onQuotaExhausted(quotaListener);

    const { result } = startChartFactsRequest(formDataOf(BASE_BODY));
    await expect(result).resolves.toMatchObject({ dataCompleteness: 'with-houses' });

    await vi.waitFor(() =>
      expect(useDestinyWorkspaceStore.getState().astrology.interpretation).toEqual({
        status: 'unavailable',
        reason: 'quota',
        report: null,
      })
    );
    expect(quotaListener).toHaveBeenCalledTimes(1);
    off();
  });
});
