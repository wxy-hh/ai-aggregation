import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWebFetchTool } from './web-fetch';
import { ToolError } from '@/lib/agent/registry';
import * as http from 'node:http';
import * as https from 'node:https';

describe('createWebFetchTool 单元测试 (ADR-0017)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('非法 URL 或内网地址被拦截', async () => {
    const tool = createWebFetchTool();
    const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

    await expect(tool.execute({ url: 'http://127.0.0.1/admin' }, ctx)).rejects.toThrow();
    await expect(tool.execute({ url: 'file:///etc/passwd' }, ctx)).rejects.toThrow();
  });
});
