import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateAgentProgress } from './evaluator';

// 模拟 ai 模块
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { generateText } from 'ai';
const mockedGenerateText = vi.mocked(generateText);

describe('TC01: Evaluator 纯函数评估模块与容错降级', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. 完整检索材料判定 passed: true 且 Token 受控 (TC01-1)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        passed: true,
        missingAspects: [],
      }),
      usage: { promptTokens: 60, completionTokens: 15, totalTokens: 75 },
    } as any);

    const result = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '对比 React 与 Vue3 的核心优势',
      toolResultsSummary: '工具已检索出 React 和 Vue3 的最新特性对比数据',
    });

    expect(result.passed).toBe(true);
    expect(result.missingAspects).toEqual([]);

    // 验证 generateText 调用的 maxOutputTokens 预算严格 <= 256
    expect(mockedGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 256,
      })
    );
  });

  it('2. 核心对比实体遗漏判定 passed: false 并生成建议 (TC01-2)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        passed: false,
        missingAspects: ['Svelte'],
        suggestion: '请补充搜索 Svelte 的相关特性与生态数据',
      }),
      usage: { promptTokens: 70, completionTokens: 30, totalTokens: 100 },
    } as any);

    const result = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '对比 React, Vue 和 Svelte 的最新特性与生态',
      toolResultsSummary: '工具已检索出 React 和 Vue 的数据，未找到 Svelte 相关信息',
    });

    expect(result.passed).toBe(false);
    expect(result.missingAspects).toContain('Svelte');
    expect(result.suggestion).toBe('请补充搜索 Svelte 的相关特性与生态数据');
  });

  it('3. 工具全军覆没或事实真空状态侦测并打回 (TC01-3)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        passed: false,
        missingAspects: ['全部实体'],
        suggestion: '所有网页抓取均返回404，请更换关键词重新检索',
      }),
    } as any);

    const result = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询 2026 年最新大模型价格表',
      toolResultsSummary: '工具调用 web_fetch 全部失败 (HTTP 404 / connection timeout)',
    });

    expect(result.passed).toBe(false);
    expect(result.suggestion).toContain('重新检索');
  });

  it('4. 围栏清洗容错与超时或异常 Fail-Open 降级放行 (TC01-4)', async () => {
    // 场景 A: 包含 ```json 围栏与前缀后缀空格
    mockedGenerateText.mockResolvedValueOnce({
      text: '```json\n{\n  "passed": true,\n  "missingAspects": []\n}\n```',
    } as any);

    const fencedResult = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询天气',
      toolResultsSummary: '已获取北京天气晴朗',
    });
    expect(fencedResult.passed).toBe(true);

    // 场景 B: 模型输出非合法 JSON 文本 -> Fail-Open 放行
    mockedGenerateText.mockResolvedValueOnce({
      text: '抱歉，我无法输出 JSON，我认为一切都很好。',
    } as any);

    const malformedResult = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询金融数据',
      toolResultsSummary: '已获取大盘指数',
    });
    expect(malformedResult.passed).toBe(true);

    // 场景 C: 模型调用抛出网络或超时异常 -> Fail-Open 放行
    mockedGenerateText.mockRejectedValueOnce(new Error('Gateway Timeout'));

    const errorResult = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询汇率',
      toolResultsSummary: '已获取美元汇率',
    });
    expect(errorResult.passed).toBe(true);
  });

  it('5. 真实验证 5000ms 超时触发 abort 并 Fail-open 放行 (TC01-4 / P-W3)', async () => {
    vi.useFakeTimers();
    try {
      mockedGenerateText.mockImplementationOnce(({ abortSignal }: any) => {
        return new Promise((_, reject) => {
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              reject(new Error('This operation was aborted'));
            });
          }
        });
      });

      const evalPromise = evaluateAgentProgress({
        model: {} as any,
        userPrompt: '慢请求测试',
        toolResultsSummary: '已有部分摘要',
        timeoutMs: 5000,
      });

      await vi.advanceTimersByTimeAsync(5001);

      const result = await evalPromise;
      expect(result.passed).toBe(true);
      expect(result.missingAspects).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('6. 完整验证 evaluator_check Generation 观测埋点与元数据 (TC04-1 / P-W4)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        passed: false,
        missingAspects: ['实体X'],
        suggestion: '请补充实体X检索',
      }),
      usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
    } as any);

    const endMock = vi.fn();
    const generationMock = vi.fn(() => ({ end: endMock }));
    const mockTrace: any = {
      generation: generationMock,
    };

    const result = await evaluateAgentProgress({
      model: { modelId: 'mock-eval-model' } as any,
      userPrompt: '调研实体X与Y',
      toolResultsSummary: '已检索实体Y',
      trace: mockTrace,
      timeoutMs: 3000,
    });

    expect(result.passed).toBe(false);
    expect(generationMock).toHaveBeenCalledTimes(1);
    expect(generationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'evaluator_check',
        model: 'mock-eval-model',
        input: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('调研实体X与Y'),
          }),
        ]),
        output: JSON.stringify({
          passed: false,
          missingAspects: ['实体X'],
          suggestion: '请补充实体X检索',
        }),
        usage: {
          promptTokens: 40,
          completionTokens: 20,
          totalTokens: 60,
        },
        usageType: 'actual',
        metadata: {
          passed: false,
          missingAspectsCount: 1,
          timeoutMs: 3000,
        },
      })
    );
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('7. JSON 解析失败 Fail-open 放行时仍携带已产生的 usage (TC01-7 / P-M1)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '抱歉，我无法输出 JSON。',
      usage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 },
    } as any);

    const result = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询金融数据',
      toolResultsSummary: '已获取大盘指数',
    });

    expect(result.passed).toBe(true);
    expect(result.usage).toEqual({ promptTokens: 30, completionTokens: 12, totalTokens: 42 });
  });

  it('8. Schema 校验失败 Fail-open 放行时仍携带已产生的 usage (TC01-7 / P-M1)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ passed: 'yes' }),
      usage: { inputTokens: 25, outputTokens: 8, totalTokens: 33 },
    } as any);

    const result = await evaluateAgentProgress({
      model: {} as any,
      userPrompt: '查询汇率',
      toolResultsSummary: '已获取美元汇率',
    });

    expect(result.passed).toBe(true);
    expect(result.usage).toEqual({ promptTokens: 25, completionTokens: 8, totalTokens: 33 });
  });

  it('9. 解析失败 Fail-open 放行时仍写入 evaluator_check Generation (TC04-4 / P-W13)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '抱歉，我无法输出 JSON。',
      usage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 },
    } as any);

    const endMock = vi.fn();
    const generationMock = vi.fn(() => ({ end: endMock }));

    const result = await evaluateAgentProgress({
      model: { modelId: 'mock-eval-model' } as any,
      userPrompt: '查询金融数据',
      toolResultsSummary: '已获取大盘指数',
      trace: { generation: generationMock } as any,
    });

    expect(result.passed).toBe(true);
    expect(generationMock).toHaveBeenCalledTimes(1);
    expect(generationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'evaluator_check',
        output: '抱歉，我无法输出 JSON。',
        usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
        metadata: expect.objectContaining({ passed: true, fallbackReason: 'json_parse_failed' }),
      })
    );
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
