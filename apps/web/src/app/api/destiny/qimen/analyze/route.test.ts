import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const validPayload = {
  context: {
    datetime: '2026-04-16 09:30',
    location: '上海',
    chartMethod: 'time' as const,
  },
  question: {
    category: 'career' as const,
    description: '我想判断近期是否适合换工作，以及该怎么安排节奏。',
    focus: 'risk_control' as const,
    outputStyle: 'plain' as const,
    outputLength: 'brief' as const,
  },
};

function createRequest() {
  return new Request('http://localhost/api/destiny/qimen/analyze', {
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
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data: '));

      if (!dataLine) {
        throw new Error(`缺少 data 行: ${block}`);
      }

      return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
    });
}

describe('/api/destiny/qimen/analyze', () => {
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

  it('按分区事件流返回，并在 complete 中保留已先行落盘的区块内容', async () => {
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
                    overallAssessment: '阶段一综合评估',
                    riskAlerts: ['阶段一风险 1', '阶段一风险 2', '阶段一风险 3'],
                    actionSuggestions: ['阶段一建议 1', '阶段一建议 2', '阶段一建议 3'],
                    timingWindows: [
                      { period: '近 3 天', guidance: '先做小范围试探。' },
                      { period: '近 2 周', guidance: '确认信息后再推进。' },
                    ],
                    chartSummary: '阶段一盘局摘要',
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
                    chartTitle: '奇门遁甲排盘',
                    chartMeta: {
                      dun: '阳遁',
                      ju: '三局',
                      jiaziXunkong: '甲辰旬 寅卯空',
                      horsePosition: '马星在巳',
                      valueSymbol: '天冲星',
                      valueDoor: '伤门',
                    },
                    board: [
                      {
                        palace: '巽四宫',
                        luoshu: 4,
                        direction: '东南',
                        god: '螣蛇',
                        star: '天辅',
                        door: '杜门',
                        heavenStem: '壬',
                        earthStem: '丙',
                      },
                      {
                        palace: '离九宫',
                        luoshu: 9,
                        direction: '正南',
                        god: '九天',
                        star: '天英',
                        door: '景门',
                        heavenStem: '丙',
                        earthStem: '戊',
                      },
                      {
                        palace: '坤二宫',
                        luoshu: 2,
                        direction: '西南',
                        god: '九地',
                        star: '天芮',
                        door: '死门',
                        heavenStem: '丁',
                        earthStem: '己',
                      },
                      {
                        palace: '震三宫',
                        luoshu: 3,
                        direction: '正东',
                        god: '值符',
                        star: '天冲',
                        door: '伤门',
                        heavenStem: '癸',
                        earthStem: '乙',
                        isValueSymbol: true,
                        isValueDoor: true,
                      },
                      {
                        palace: '中五宫',
                        luoshu: 5,
                        direction: '中宫',
                        god: '-',
                        star: '天禽',
                        door: '-',
                        heavenStem: '戊',
                        earthStem: '戊',
                      },
                      {
                        palace: '兑七宫',
                        luoshu: 7,
                        direction: '正西',
                        god: '六合',
                        star: '天柱',
                        door: '惊门',
                        heavenStem: '辛',
                        earthStem: '丁',
                      },
                      {
                        palace: '艮八宫',
                        luoshu: 8,
                        direction: '东北',
                        god: '勾陈',
                        star: '天任',
                        door: '生门',
                        heavenStem: '己',
                        earthStem: '庚',
                      },
                      {
                        palace: '坎一宫',
                        luoshu: 1,
                        direction: '正北',
                        god: '朱雀',
                        star: '天蓬',
                        door: '休门',
                        heavenStem: '乙',
                        earthStem: '癸',
                      },
                      {
                        palace: '乾六宫',
                        luoshu: 6,
                        direction: '西北',
                        god: '太阴',
                        star: '天心',
                        door: '开门',
                        heavenStem: '庚',
                        earthStem: '壬',
                      },
                    ],
                    chartSummary: '阶段二盘局摘要',
                    overallAssessment: '阶段二综合评估',
                    riskAlerts: ['阶段二风险 1', '阶段二风险 2', '阶段二风险 3'],
                    actionSuggestions: ['阶段二建议 1', '阶段二建议 2', '阶段二建议 3'],
                    timingWindows: [
                      { period: '近 1 周', guidance: '先对齐核心预期。' },
                      { period: '近 1 个月', guidance: '在窗口期集中推进。' },
                    ],
                    score: 82,
                    disclaimer: '仅供参考',
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
    expect(events.findIndex((event) => event.type === 'section-final')).toBeGreaterThan(
      events.findIndex((event) => event.type === 'status')
    );
    expect(events.findIndex((event) => event.type === 'complete')).toBeGreaterThan(
      events.findIndex((event) => event.type === 'section-final')
    );

    const completeEvent = events.at(-1) as {
      type: 'complete';
      result: {
        overallAssessment: string;
        chartSummary: string;
        riskAlerts: string[];
      };
    };

    expect(completeEvent.result.overallAssessment).toBe('阶段一综合评估');
    expect(completeEvent.result.chartSummary).toBe('阶段一盘局摘要');
    expect(completeEvent.result.riskAlerts).toEqual([
      '阶段一风险 1',
      '阶段一风险 2',
      '阶段一风险 3',
    ]);
    expect(text.includes('text-delta')).toBe(false);
  });

  it('第一阶段只产出部分区块时仅发送对应的 section-final，并由 complete 补齐剩余结果', async () => {
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
                    overallAssessment: '阶段一只给综合评估',
                    chartSummary: '阶段一只给摘要',
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
                    chartTitle: '奇门遁甲排盘',
                    chartMeta: {
                      dun: '阳遁',
                      ju: '三局',
                      jiaziXunkong: '甲辰旬 寅卯空',
                      horsePosition: '马星在巳',
                      valueSymbol: '天冲星',
                      valueDoor: '伤门',
                    },
                    board: [
                      { palace: '巽四宫', luoshu: 4, direction: '东南', god: '螣蛇', star: '天辅', door: '杜门', heavenStem: '壬', earthStem: '丙' },
                      { palace: '离九宫', luoshu: 9, direction: '正南', god: '九天', star: '天英', door: '景门', heavenStem: '丙', earthStem: '戊' },
                      { palace: '坤二宫', luoshu: 2, direction: '西南', god: '九地', star: '天芮', door: '死门', heavenStem: '丁', earthStem: '己' },
                      { palace: '震三宫', luoshu: 3, direction: '正东', god: '值符', star: '天冲', door: '伤门', heavenStem: '癸', earthStem: '乙' },
                      { palace: '中五宫', luoshu: 5, direction: '中宫', god: '-', star: '天禽', door: '-', heavenStem: '戊', earthStem: '戊' },
                      { palace: '兑七宫', luoshu: 7, direction: '正西', god: '六合', star: '天柱', door: '惊门', heavenStem: '辛', earthStem: '丁' },
                      { palace: '艮八宫', luoshu: 8, direction: '东北', god: '勾陈', star: '天任', door: '生门', heavenStem: '己', earthStem: '庚' },
                      { palace: '坎一宫', luoshu: 1, direction: '正北', god: '朱雀', star: '天蓬', door: '休门', heavenStem: '乙', earthStem: '癸' },
                      { palace: '乾六宫', luoshu: 6, direction: '西北', god: '太阴', star: '天心', door: '开门', heavenStem: '庚', earthStem: '壬' },
                    ],
                    chartSummary: '完整结果摘要',
                    overallAssessment: '完整结果综合评估',
                    riskAlerts: ['完整结果风险 1', '完整结果风险 2', '完整结果风险 3'],
                    actionSuggestions: ['完整结果建议 1', '完整结果建议 2', '完整结果建议 3'],
                    timingWindows: [
                      { period: '近 1 周', guidance: '先对齐核心预期。' },
                      { period: '近 1 个月', guidance: '在窗口期集中推进。' },
                    ],
                    score: 80,
                    disclaimer: '仅供参考',
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
    const sectionFinalEvents = events.filter(
      (event): event is { type: 'section-final'; sectionKey: string; payload: unknown } =>
        event.type === 'section-final'
    );
    const completeEvent = events.at(-1) as {
      type: 'complete';
      result: {
        overallAssessment: string;
        chartSummary: string;
        riskAlerts: string[];
      };
    };

    expect(sectionFinalEvents.map((event) => event.sectionKey)).toEqual([
      'overallAssessment',
      'chartSummary',
      'riskAlerts',
      'actionSuggestions',
      'timingWindows',
    ]);
    expect(completeEvent.result.overallAssessment).toBe('阶段一只给综合评估');
    expect(completeEvent.result.chartSummary).toBe('阶段一只给摘要');
    expect(completeEvent.result.riskAlerts).toEqual([
      '完整结果风险 1',
      '完整结果风险 2',
      '完整结果风险 3',
    ]);
  });

  it('当完整结果阶段失败时返回 error 事件而不是自由文本', async () => {
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
                    overallAssessment: '阶段一综合评估',
                  },
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'upstream failed' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      ) as typeof fetch;

    const response = await POST(createRequest());
    const text = await response.text();
    const events = extractSseEvents(text);

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: '模型服务暂时不可用，请稍后重试',
    });
    expect(text.includes('text-delta')).toBe(false);
  });

  it('当第一阶段没有产出分区时，会在 complete 前根据完整结果补发 section-final', async () => {
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
                  json: {},
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
                  json: {},
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
                    chartTitle: '奇门遁甲排盘',
                    chartMeta: {
                      dun: '阳遁',
                      ju: '三局',
                      jiaziXunkong: '甲辰旬 寅卯空',
                      horsePosition: '马星在巳',
                      valueSymbol: '天冲星',
                      valueDoor: '伤门',
                    },
                    board: [
                      { palace: '巽四宫', luoshu: 4, direction: '东南', god: '螣蛇', star: '天辅', door: '杜门', heavenStem: '壬', earthStem: '丙' },
                      { palace: '离九宫', luoshu: 9, direction: '正南', god: '九天', star: '天英', door: '景门', heavenStem: '丙', earthStem: '戊' },
                      { palace: '坤二宫', luoshu: 2, direction: '西南', god: '九地', star: '天芮', door: '死门', heavenStem: '丁', earthStem: '己' },
                      { palace: '震三宫', luoshu: 3, direction: '正东', god: '值符', star: '天冲', door: '伤门', heavenStem: '癸', earthStem: '乙' },
                      { palace: '中五宫', luoshu: 5, direction: '中宫', god: '-', star: '天禽', door: '-', heavenStem: '戊', earthStem: '戊' },
                      { palace: '兑七宫', luoshu: 7, direction: '正西', god: '六合', star: '天柱', door: '惊门', heavenStem: '辛', earthStem: '丁' },
                      { palace: '艮八宫', luoshu: 8, direction: '东北', god: '勾陈', star: '天任', door: '生门', heavenStem: '己', earthStem: '庚' },
                      { palace: '坎一宫', luoshu: 1, direction: '正北', god: '朱雀', star: '天蓬', door: '休门', heavenStem: '乙', earthStem: '癸' },
                      { palace: '乾六宫', luoshu: 6, direction: '西北', god: '太阴', star: '天心', door: '开门', heavenStem: '庚', earthStem: '壬' },
                    ],
                    chartSummary: '完整结果摘要',
                    overallAssessment: '完整结果综合评估',
                    riskAlerts: ['完整结果风险 1', '完整结果风险 2', '完整结果风险 3'],
                    actionSuggestions: ['完整结果建议 1', '完整结果建议 2', '完整结果建议 3'],
                    timingWindows: [
                      { period: '近 1 周', guidance: '先对齐核心预期。' },
                      { period: '近 1 个月', guidance: '在窗口期集中推进。' },
                    ],
                    score: 80,
                    disclaimer: '仅供参考',
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
    const sectionFinalEvents = events.filter(
      (event): event is { type: 'section-final'; sectionKey: string; payload: unknown } =>
        event.type === 'section-final'
    );

    expect(sectionFinalEvents.map((event) => event.sectionKey)).toEqual([
      'overallAssessment',
      'riskAlerts',
      'actionSuggestions',
      'timingWindows',
      'chartSummary',
    ]);
    expect(events.at(-1)?.type).toBe('complete');
  });
});
