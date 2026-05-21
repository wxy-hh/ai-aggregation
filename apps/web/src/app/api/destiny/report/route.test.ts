import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-optional-user-id', () => ({
  getOptionalUserId: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage: vi.fn((value) => value),
  safeRecordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from './route';

function createArkCompletedResponse(payload: Record<string, unknown>) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'response.completed',
              response: {
                id: 'resp_test',
                usage: { input_tokens: 100, output_tokens: 200 },
                output: [{ type: 'output_text', text: JSON.stringify(payload) }],
              },
            })}\n\n`
          )
        );
        controller.close();
      },
    }),
    { status: 200 }
  );
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

describe('POST /api/destiny/report', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://ark.example.com/api/v3';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('先流出 baziBasis，再用本地真值合成最终报告', async () => {
    const currentYear = new Date().getFullYear();
    global.fetch = vi.fn().mockResolvedValue(
      createArkCompletedResponse({
        coreDestinyTone: {
          headline: '先稳后发，厚积见成',
          description: '你的节奏更适合先打基础再放大成果，越到后期越能靠稳定判断拉开差距。',
        },
        pillars: [
          { label: '年柱', tooltip: '年柱代表祖基与早年环境。这意味着你对外部秩序有较强感受。' },
          { label: '月柱', tooltip: '月柱代表提纲与事业根基。这意味着你做事先看长期结构。' },
          { label: '日柱', tooltip: '日柱代表自己与关系核心。这意味着你在关键关系里很重兑现。' },
          { label: '时柱', tooltip: '时柱代表行动落点与后续趋势。这意味着你越往后越重视结果。' },
        ],
        elementsAndTenGods: {
          lifeDimensions: [
            { key: 'career', label: '事业', value: 72 },
            { key: 'wealth', label: '财运', value: 68 },
            { key: 'health', label: '健康', value: 61 },
            { key: 'love', label: '感情', value: 56 },
            { key: 'wisdom', label: '智慧/创造', value: 74 },
          ],
          lifeDimensionHighlights: {
            strength: '稳定判断与后续执行力更强，适合做中长期积累。',
            caution: '压力一大容易把情绪收得太紧，作息乱时会影响发挥。',
          },
          tenGodDomains: [
            {
              key: 'self',
              label: '自我与社交',
              technicalLabel: '比肩/劫财',
              value: 18,
              description: '有主见，但不爱在无意义竞争里消耗自己。',
            },
            {
              key: 'expression',
              label: '创造与表达',
              technicalLabel: '食神/伤官',
              value: 25,
              description: '熟悉场景里表达会更自然，也更容易产出好点子。',
            },
            {
              key: 'wealth',
              label: '物质与掌控',
              technicalLabel: '正财/偏财',
              value: 52,
              description: '更适合把资源做长期配置，而不是追逐短线波动。',
            },
            {
              key: 'order',
              label: '秩序与责任',
              technicalLabel: '正官/七杀',
              value: 23,
              description: '关键节点愿意扛住责任，对边界和结果比较敏感。',
            },
            {
              key: 'resource',
              label: '资源与守护',
              technicalLabel: '正印/偏印',
              value: 32,
              description: '吸收和复盘能力不错，越做越稳，越做越有体系。',
            },
          ],
          balanceInsight: {
            title: '命局偏强',
            value: '金、水',
            tooltip: '金水更显时，通常先求确定性与效率，再逐步扩大投入。',
          },
          patternHighlights: [
            { label: '官印相生', tooltip: '责任感和学习力能互相抬升，适合走长期积累路线。' },
            { label: '伤官配印', tooltip: '想法不少，但也知道如何把表达收回到结构里。' },
          ],
        },
        modulePersonality: {
          title: '性格底色与优势',
          summary: '你更像是先观察、再判断、再出手的人，一旦认定方向，后续执行会很稳。',
          bullets: ['先看结构再行动', '越到后期越见稳', '适合长期积累'],
        },
        moduleCareer: {
          title: '事业发展潜力解析',
          summary: '更适合持续积累型赛道，把复杂问题拆开之后，反而更能体现你的稳定判断力。',
          bullets: ['适合中长期项目', '别被短期噪音带走', '主动争取关键节点'],
        },
        moduleLove: {
          title: '感情模式与关系建议',
          summary: '关系里重兑现，也重秩序感，越是走得长的关系，越需要留出表达与松动空间。',
          bullets: ['把感受说出来', '别只用行动代替表达'],
        },
        moduleWealth: {
          title: '财运结构与风险节奏',
          summary: '更适合稳健配置而非高频冲动，先把本金和节奏守住，收益反而更容易慢慢放大。',
          bullets: ['适合长期配置', '不要情绪化决策'],
        },
        moduleHealth: {
          title: '健康关注点与作息建议',
          summary: '压力上来时更容易先紧绷后透支，规律作息和稳定节奏会直接影响整体发挥。',
          bullets: ['先稳睡眠', '别长期硬扛'],
        },
        timeline: [
          {
            title: '乙巳年 · 站稳主轴',
            summary: '适合沿着已有积累继续放大成果，重点是稳住节奏，不要因为着急而换主线。',
            detail: {
              opportunities: ['已有项目更容易见成果'],
              risks: ['容易因求快而加压过头'],
              actions: ['把目标收敛到一两个关键点'],
            },
          },
          {
            title: '丙午年 · 主动发力',
            summary: '曝光和行动力都会增强，但也更考验你的边界感和恢复能力。',
            detail: {
              opportunities: ['适合主动表达和推进合作'],
              risks: ['别因为高压而透支身体'],
              actions: ['用阶段性复盘稳住节奏'],
            },
          },
          {
            title: '丁未年 · 沉淀整合',
            summary: '更适合把前两年的成果做整理和沉淀，形成自己的方法论与稳定节奏。',
            detail: {
              opportunities: ['适合整理资产与经验'],
              risks: ['容易把情绪压回自己身上'],
              actions: ['给身体和关系留出缓冲'],
            },
          },
        ],
      })
    ) as typeof fetch;

    const response = await POST(
      new Request('http://localhost/api/destiny/report', {
        method: 'POST',
        body: JSON.stringify({
          name: '测试用户',
          gender: 'male',
          birthDate: { year: 1993, month: 8, day: 16 },
          birthTime: { hour: '09', minute: '30' },
          location: { name: '杭州', lat: 30.27, lon: 120.16 },
        }),
      })
    );

    expect(response.status).toBe(200);
    const events = await readSseEvents(response);
    const basisEvent = events.find(
      (item) => item.type === 'section-final' && item.sectionKey === 'baziBasis'
    );
    const profileEvent = events.find(
      (item) => item.type === 'section-final' && item.sectionKey === 'profileOverview'
    );
    const completeEvent = events.find((item) => item.type === 'complete');

    expect(basisEvent).toBeTruthy();
    expect(profileEvent).toBeTruthy();
    expect(completeEvent).toBeTruthy();

    const report = completeEvent?.report as Record<string, any>;
    expect(report.baziBasis).toBeTruthy();
    expect(report.coreTone.chartSummary).toMatch(/^乾造：/);
    expect(report.elements).toHaveLength(5);
    expect(report.timeline[0].year).toBe(currentYear);
    expect(report.timeline[1].year).toBe(currentYear + 1);
    expect(report.timeline[2].year).toBe(currentYear + 2);
  });
});
