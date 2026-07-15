import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResumeAiTimeoutMs } from './ai-timeout';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('简历 AI 超时策略', () => {
  it('开发环境默认保留 30 秒真实供应商验收窗口', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESUME_AI_TIMEOUT_MS', '');

    expect(getResumeAiTimeoutMs()).toBe(30_000);
  });

  it('生产环境默认保留 8 秒平台超时缓冲，且允许显式覆盖', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESUME_AI_TIMEOUT_MS', '12000');

    expect(getResumeAiTimeoutMs()).toBe(12_000);
  });
});
