import {
  setupAiSdkMocks,
  streamTextMock,
  generateTextMock,
  MOCK_UNEXPECTED_REAL_MODEL_ERROR,
} from './mock-ai-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateText, streamText } from 'ai';

describe('TC03: 模型调用双 mock 测试替身 (工单 01)', () => {
  beforeEach(() => {
    setupAiSdkMocks();
  });

  it('1. 替身缺省状态下，非流式模型入口首次调用即 reject，错误文案标识测试环境不接真实模型 (TC03-1)', async () => {
    await expect(generateText({} as any)).rejects.toThrow(MOCK_UNEXPECTED_REAL_MODEL_ERROR);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('2. 同一用例内可同时特化流式与非流式入口且互不覆盖 (TC03-2)', async () => {
    const fakeStreamResult = {
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '流式输出内容' };
      })(),
    };
    streamTextMock.mockReturnValueOnce(fakeStreamResult as any);

    const fakeGenerateResult = {
      text: '非流式生成结果',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
    generateTextMock.mockResolvedValueOnce(fakeGenerateResult as any);

    const sResult = streamText({} as any);
    const gResult = await generateText({} as any);

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(sResult).toBe(fakeStreamResult);
    expect(gResult).toEqual(fakeGenerateResult);
  });

  it('4. 替身导出句柄与方法完整性校验 (TC03-4)', () => {
    expect(typeof setupAiSdkMocks).toBe('function');
    expect(typeof streamTextMock).toBe('function');
    expect(typeof generateTextMock).toBe('function');
    expect(MOCK_UNEXPECTED_REAL_MODEL_ERROR).toBe('测试环境不接真实模型');
  });
});
