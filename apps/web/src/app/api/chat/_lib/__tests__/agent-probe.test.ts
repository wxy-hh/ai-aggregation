/**
 * 智能体环境探针与自动优雅降级单元测试
 *
 * 覆盖用例：TC04 (Covers US 4, 5)
 * 断言：
 * 1. 未配置 DEEPSEEK_API_KEY 环境变量时，智能体环境探针返回降级标记 fallback: true 与中文原因描述；
 * 2. 用户 Token 余额低于智能体最低执行预留门槛（4,096 tokens）时，探针返回降级标记 fallback: true 与中文原因描述；
 * 3. 触发降级后，聊天处理器将执行模式转为极速对话，并在响应头注入 x-agent-fallback 标记，且不抛出 500 或 402 HTTP 异常。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkAgentEnvironment, AGENT_MIN_REQUIRED_TOKENS } from '../agent-probe';
import { createChatHandler } from '../chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { encodeSseEvent } from '../sse';
import type { ChatContext, ChatProviderAdapter } from '../types';

const { currentUserMock, rateLimiterMock, quotaSessionReserveMock, getAvailableQuotaMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  rateLimiterMock: {
    check: vi.fn(),
  },
  quotaSessionReserveMock: vi.fn(),
  getAvailableQuotaMock: vi.fn(),
}));

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: currentUserMock,
}));

vi.mock('@repo/redis', () => ({
  getRateLimiter: () => rateLimiterMock,
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: {
    reserve: quotaSessionReserveMock,
  },
}));

vi.mock('@/lib/billing/quota-service', () => ({
  getAvailableQuota: getAvailableQuotaMock,
}));

describe('TC04: 智能体环境探针与自动优雅降级', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    currentUserMock.mockResolvedValue({
      id: 'test-user-id',
      role: 'user',
    });

    rateLimiterMock.check.mockResolvedValue({
      allowed: true,
      remaining: 60,
      reset: Date.now() + 60000,
    });

    const fakeSession = createFakeQuotaSession({
      outputLimit: 2048,
    });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
  });

  it('断言 1: 未配置 DEEPSEEK_API_KEY 环境变量时，探针返回 fallback: true 与中文原因', () => {
    // 显式传入空字符串模拟未配置环境变量
    const result = checkAgentEnvironment({ envApiKey: '' });
    expect(result.fallback).toBe(true);
    expect(result.reason).toContain('未配置 DeepSeek 密钥');
    expect(result.reason).toContain('极速对话');

    // 显式传入 undefined 且环境变量无 Key
    const prevKey = process.env.DEEPSEEK_API_KEY;
    const prevModel = process.env.DEEPSEEK_MODEL;
    try {
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.DEEPSEEK_MODEL;
      const envResult = checkAgentEnvironment();
      expect(envResult.fallback).toBe(true);
      expect(envResult.reason).toContain('未配置 DeepSeek 密钥');
    } finally {
      if (prevKey !== undefined) {
        process.env.DEEPSEEK_API_KEY = prevKey;
      } else {
        delete process.env.DEEPSEEK_API_KEY;
      }
      if (prevModel !== undefined) {
        process.env.DEEPSEEK_MODEL = prevModel;
      } else {
        delete process.env.DEEPSEEK_MODEL;
      }
    }
  });

  it('断言 1b: 兼容读取既有 DEEPSEEK_MODEL 环境变量承载 API Key', () => {
    const prevKey = process.env.DEEPSEEK_API_KEY;
    const prevModel = process.env.DEEPSEEK_MODEL;
    try {
      delete process.env.DEEPSEEK_API_KEY;
      process.env.DEEPSEEK_MODEL = 'sk-legacy-test-model-key';
      const envResult = checkAgentEnvironment();
      expect(envResult.fallback).toBe(false);
      expect(envResult.reason).toBeUndefined();
    } finally {
      if (prevKey !== undefined) {
        process.env.DEEPSEEK_API_KEY = prevKey;
      } else {
        delete process.env.DEEPSEEK_API_KEY;
      }
      if (prevModel !== undefined) {
        process.env.DEEPSEEK_MODEL = prevModel;
      } else {
        delete process.env.DEEPSEEK_MODEL;
      }
    }
  });

  it('断言 2: 用户 Token 余额低于最低执行预留门槛 (4,096 tokens) 时，探针返回 fallback: true', () => {
    expect(AGENT_MIN_REQUIRED_TOKENS).toBe(4096);

    // 余额低于 4,096 tokens（例如 2,000 tokens）
    const lowQuotaResult = checkAgentEnvironment({
      envApiKey: 'test-valid-key',
      availableQuota: 2000,
    });
    expect(lowQuotaResult.fallback).toBe(true);
    expect(lowQuotaResult.reason).toContain('Token 余额不足');
    expect(lowQuotaResult.reason).toContain('极速对话');

    // 余额满足门槛（例如 5,000 tokens）
    const sufficientQuotaResult = checkAgentEnvironment({
      envApiKey: 'test-valid-key',
      availableQuota: 5000,
    });
    expect(sufficientQuotaResult.fallback).toBe(false);
    expect(sufficientQuotaResult.reason).toBeUndefined();
  });

  it('断言 3: 触发降级后，聊天处理器转为极速对话并在响应头注入 x-agent-fallback 标记，不抛出 500 或 402', async () => {
    let adapterCalled = false;
    const mockAdapter: ChatProviderAdapter = {
      stream: vi.fn(async (ctx: ChatContext) => {
        adapterCalled = true;
        return new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encodeSseEvent({ type: 'text-delta', text: '极速回答内容' }));
            await ctx.onFinish({
              outcome: 'success',
              usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18, estimated: false },
              outputText: '极速回答内容',
            });
            controller.enqueue(encodeSseEvent({ type: 'done' }));
            controller.close();
          },
        });
      }),
    };

    // 配置模拟探针直接返回降级决策
    const handler = createChatHandler({
      getAdapter: () => mockAdapter,
      checkAgentEnvironment: () => ({
        fallback: true,
        reason: '未配置 DeepSeek 密钥，已自动为您平滑切换为极速对话',
      }),
    });

    // 客户端发起 agent: true 智能体请求
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'refresh_token=test-session-cookie',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '测试智能体降级' }],
        agent: true,
        provider: 'xunfei',
      }),
    });

    const response = await handler(request);

    // 验证状态码为 200，绝非 500 或 402
    expect(response.status).toBe(200);

    // 验证响应头注入降级标记
    expect(response.headers.get('x-agent-fallback')).toBe('true');
    const headerReason = response.headers.get('x-agent-fallback-reason');
    expect(headerReason).toBeDefined();
    expect(decodeURIComponent(headerReason!)).toContain('未配置 DeepSeek 密钥');

    // 验证委派给了常规单段适配器而非智能体编排器
    expect(adapterCalled).toBe(true);
  });
});
