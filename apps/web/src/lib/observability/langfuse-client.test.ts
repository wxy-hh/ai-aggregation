import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRootTrace,
  isObservabilityConfigured,
  flushObservability,
  _resetClientForTesting,
  _setLangfuseClientForTesting,
} from './langfuse-client';

describe('langfuse-client (可观测深模块)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    _resetClientForTesting();
    process.env = { ...originalEnv };
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASEURL;
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetClientForTesting();
  });

  describe('未配置环境变量时（No-op 降级模式）', () => {
    it('isObservabilityConfigured 应返回 false', () => {
      expect(isObservabilityConfigured()).toBe(false);
    });

    it('createRootTrace 返回包含完整接口的 no-op 对象，不抛错', () => {
      const trace = createRootTrace({
        traceId: 'trace-123',
        userId: 'user-abc',
        runId: 'run-xyz',
        conversationId: 'conv-456',
        input: { message: 'hello' },
      });

      expect(trace).toBeDefined();
      expect(trace.traceId).toBe('trace-123');

      // 验证 generation 操作为 no-op 且不报错
      const gen = trace.generation({
        name: 'decision_1',
        model: 'deepseek-flash',
        input: 'prompt',
        output: 'response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        usageType: 'actual',
      });
      expect(gen).toBeDefined();
      expect(() => gen.update({ output: 'new response' })).not.toThrow();
      expect(() => gen.end()).not.toThrow();

      // 验证 span 操作为 no-op 且不报错
      const span = trace.span({
        name: 'tool:web_search',
        input: { query: 'test' },
        status: 'success',
        durationMs: 120,
      });
      expect(span).toBeDefined();
      expect(() => span.update({ output: 'result' })).not.toThrow();
      expect(() => span.end()).not.toThrow();

      // 验证 trace 本身操作不报错
      expect(() => trace.update({ output: 'final' })).not.toThrow();
      expect(() => trace.end()).not.toThrow();
    });

    it('flushObservability 应快速完成且不执行外部请求', async () => {
      await expect(flushObservability()).resolves.toBeUndefined();
    });
  });

  describe('已配置环境变量时', () => {
    let mockTrace: any;
    let mockGeneration: any;
    let mockSpan: any;
    let mockClient: any;

    beforeEach(() => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      process.env.LANGFUSE_BASEURL = 'http://localhost:3100';

      mockGeneration = {
        update: vi.fn(),
        end: vi.fn(),
      };
      mockSpan = {
        update: vi.fn(),
        end: vi.fn(),
      };
      mockTrace = {
        generation: vi.fn(() => mockGeneration),
        span: vi.fn(() => mockSpan),
        update: vi.fn(),
      };

      mockClient = {
        trace: vi.fn(() => mockTrace),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };

      _setLangfuseClientForTesting(mockClient);
    });

    it('isObservabilityConfigured 应返回 true', () => {
      expect(isObservabilityConfigured()).toBe(true);
    });

    it('createRootTrace 能正常构造带 traceId、runId、conversationId 的 Trace 实例并脱敏', () => {
      const trace = createRootTrace({
        traceId: 'trace-live-1',
        runId: 'run-live-1',
        conversationId: 'conv-live-1',
        userId: 'u1',
        name: 'chat-agent-root',
        input: { prompt: 'hi with sk-proj-1234567890abcdef12' },
      });

      expect(trace).toBeDefined();
      expect(trace.traceId).toBe('trace-live-1');
      expect(mockClient.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trace-live-1',
          name: 'chat-agent-root',
          userId: 'u1',
          sessionId: 'conv-live-1',
          metadata: expect.objectContaining({
            runId: 'run-live-1',
            conversationId: 'conv-live-1',
          }),
        })
      );

      const gen = trace.generation({
        name: 'decision_1',
        model: 'deepseek-flash',
        input: { apiKey: 'secret-key-1' },
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        usageType: 'actual',
      });
      expect(gen).toBeDefined();
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'decision_1',
          model: 'deepseek-flash',
          input: { apiKey: '[MASKED]' },
          metadata: expect.objectContaining({
            usageAccountingType: 'actual',
            priceBookVersion: '2026.1',
          }),
        })
      );
      expect(() => gen.end()).not.toThrow();
      expect(mockGeneration.end).toHaveBeenCalled();

      const span = trace.span({
        name: 'tool:web_search',
        input: { query: 'test query with Bearer token-1234567890abcdef' },
        output: { result: 'ok' },
        status: 'success',
        durationMs: 50,
      });
      expect(span).toBeDefined();
      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tool:web_search',
          input: { query: 'test query with Bearer [MASKED]' },
          statusMessage: 'success',
          metadata: expect.objectContaining({
            durationMs: 50,
          }),
        })
      );
      expect(() => span.end()).not.toThrow();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('flushObservability 应触发 client.flushAsync', async () => {
      await flushObservability();
      expect(mockClient.flushAsync).toHaveBeenCalled();
    });
  });
});

