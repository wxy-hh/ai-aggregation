import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const validPayload = {
  name: '测试',
  gender: 'male' as const,
  birthDate: { year: 1995, month: 6, day: 18 },
  birthTime: { hour: '12', minute: '30' },
  location: { name: '北京', lat: 39.9, lon: 116.4 },
};

function createRequest() {
  return new Request('http://localhost/api/destiny/ziwei-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });
}

function createArkResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractSseEvents(payload: string) {
  return payload
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) {
        throw new Error(`缺少 data 行: ${block}`);
      }
      return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
    });
}

describe('/api/destiny/ziwei-report', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ARK_API_KEY;
  const originalBaseUrl = process.env.ARK_BASE_URL;

  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://example.com/api/v3';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ARK_API_KEY = originalApiKey;
    process.env.ARK_BASE_URL = originalBaseUrl;
    vi.restoreAllMocks();
  });

  it('按分区事件流返回紫微区块，并在 complete 中保留首批区块内容', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        createArkResponse({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_json',
                  json: {
                    profileOverview: {
                      name: '测试',
                      genderLabel: '男',
                      birthText: '农历 1995年六月十八 12:30',
                      lunarText: '乙亥年六月十八午时',
                      locationText: '北京',
                    },
                    overviewModules: {
                      personality: {
                        title: '命理总论',
                        summary: '首批总论摘要',
                        bullets: ['先稳后动', '适合积累'],
                      },
                      career: {
                        title: '事业趋势',
                        summary: '首批事业摘要',
                        bullets: ['节奏渐强', '贵人可借'],
                      },
                      wealth: {
                        title: '财富节奏',
                        summary: '首批财富摘要',
                        bullets: ['稳中有升', '谨慎投资'],
                      },
                    },
                    timeline: [
                      {
                        year: 2026,
                        title: '流年标题',
                        summary: '首批流年摘要',
                        detail: {
                          opportunities: ['机会1', '机会2'],
                          risks: ['风险1', '风险2'],
                          actions: ['行动1', '行动2'],
                        },
                      },
                    ],
                    relations: {
                      summary: '首批六亲摘要',
                      opportunities: ['关系机会1', '关系机会2'],
                      risks: ['关系风险1', '关系风险2'],
                      actions: ['关系行动1', '关系行动2'],
                    },
                  },
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createArkResponse({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_json',
                  json: {
                    profile: {
                      name: '测试',
                      genderLabel: '男',
                      birthText: '完整出生信息',
                      lunarText: '乙亥年六月十八午时',
                      locationText: '北京',
                    },
                    pillars: [
                      { stem: '甲', branch: '子', label: '年柱', element: 'wood', tooltip: '年柱说明' },
                      { stem: '乙', branch: '丑', label: '月柱', element: 'wood', tooltip: '月柱说明' },
                      { stem: '丙', branch: '寅', label: '日柱', element: 'fire', tooltip: '日柱说明' },
                      { stem: '丁', branch: '卯', label: '时柱', element: 'fire', tooltip: '时柱说明' },
                    ],
                    elements: [
                      { key: 'metal', label: '金', value: 48 },
                      { key: 'wood', label: '木', value: 76 },
                      { key: 'water', label: '水', value: 58 },
                      { key: 'fire', label: '火', value: 66 },
                      { key: 'earth', label: '土', value: 51 },
                    ],
                    tenGods: [
                      { key: 'zhengguan', label: '正官', value: 62, tooltip: '正官说明' },
                      { key: 'qisha', label: '七杀', value: 38, tooltip: '七杀说明' },
                      { key: 'zhengyin', label: '正印', value: 57, tooltip: '正印说明' },
                      { key: 'shishen', label: '食神', value: 46, tooltip: '食神说明' },
                    ],
                    modules: {
                      personality: { title: '命理总论', summary: '完整总论摘要', bullets: ['a', 'b'] },
                      career: { title: '事业趋势', summary: '完整事业摘要', bullets: ['a', 'b'] },
                      love: { title: '情感关系', summary: '完整感情摘要', bullets: ['a', 'b'] },
                      wealth: { title: '财富节奏', summary: '完整财富摘要', bullets: ['a', 'b'] },
                      health: { title: '健康关注', summary: '完整健康摘要', bullets: ['a', 'b'] },
                    },
                    timeline: [
                      {
                        year: 2026,
                        title: '完整流年标题',
                        summary: '完整流年摘要',
                        detail: {
                          opportunities: ['机会1', '机会2'],
                          risks: ['风险1', '风险2'],
                          actions: ['行动1', '行动2'],
                        },
                      },
                      {
                        year: 2027,
                        title: '完整流年标题2',
                        summary: '完整流年摘要2',
                        detail: {
                          opportunities: ['机会1', '机会2'],
                          risks: ['风险1', '风险2'],
                          actions: ['行动1', '行动2'],
                        },
                      },
                      {
                        year: 2028,
                        title: '完整流年标题3',
                        summary: '完整流年摘要3',
                        detail: {
                          opportunities: ['机会1', '机会2'],
                          risks: ['风险1', '风险2'],
                          actions: ['行动1', '行动2'],
                        },
                      },
                    ],
                    ziweiCenter: {
                      chartTitle: '紫微命盘',
                      mingZhu: '紫微',
                      shenZhu: '天相',
                    },
                    ziweiPalaces: Array.from({ length: 12 }).map((_, index) => ({
                      key: `palace-${index + 1}`,
                      label: ['父母宫','福德宫','田宅宫','官禄宫','命宫','兄弟宫','奴仆宫','夫妻宫','迁移宫','子女宫','财帛宫','疾厄宫'][index],
                      branch: `地支${index + 1}`,
                      stars: ['紫微', '天府'],
                      dominant: '紫微',
                      summary: `宫位摘要${index + 1}`,
                      suggestions: ['建议1', '建议2'],
                    })),
                  },
                },
              ],
            },
          ],
        })
      ) as typeof fetch;

    const response = await POST(createRequest());
    const text = await response.text();
    const events = extractSseEvents(text);

    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(events.some((event) => event.type === 'section-final')).toBe(true);
    expect(events.at(-1)?.type).toBe('complete');

    const completeEvent = events.at(-1) as {
      type: 'complete';
      report: {
        profile: { birthText: string };
        modules: { personality: { summary: string } };
      };
    };

    expect(completeEvent.report.profile.birthText).toBe('农历 1995年六月十八 12:30');
    expect(completeEvent.report.modules.personality.summary).toBe('首批总论摘要');
  });
});
