/**
 * 聊天域统一 AI SDK 双 mock 测试替身 (ADR-0051 / 工单 01)
 *
 * 统一替换流式（streamText）与非流式（generateText）两个模型调用入口。
 * 默认状态下非流式入口直接 reject（"测试环境不接真实模型"），
 * 彻底杜绝测试过程中外网模型请求泄漏与靠 401 降级通过的问题。
 */

import { vi } from 'vitest';

/**
 * 缺省错误文案：标识测试环境不接真实模型
 */
export const MOCK_UNEXPECTED_REAL_MODEL_ERROR = '测试环境不接真实模型';

/** 流式生成入口 mock 句柄 */
export const streamTextMock = vi.fn();

/** 非流式生成入口 mock 句柄 */
export const generateTextMock = vi.fn();

/**
 * 初始化并重置聊天域 AI SDK 双 mock 替身
 *
 * @param options 可选的默认实现特化参数
 * @returns 包含两个 mock 句柄的对象
 */
export function setupAiSdkMocks(options?: {
  defaultStreamText?: (...args: any[]) => any;
  defaultGenerateText?: (...args: any[]) => any;
}) {
  vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>();
    return {
      ...actual,
      streamText: streamTextMock,
      generateText: generateTextMock,
    };
  });

  streamTextMock.mockReset();
  generateTextMock.mockReset();

  if (options?.defaultStreamText) {
    streamTextMock.mockImplementation(options.defaultStreamText);
  }

  if (options?.defaultGenerateText) {
    generateTextMock.mockImplementation(options.defaultGenerateText);
  } else {
    generateTextMock.mockRejectedValue(new Error(MOCK_UNEXPECTED_REAL_MODEL_ERROR));
  }

  return { streamTextMock, generateTextMock };
}

// 模块加载时执行一次默认初始化，确保首次调用即进入缺省隔离状态
setupAiSdkMocks();
