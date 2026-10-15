/**
 * agent-tools API 客户端 stats 与 logs 扩展测试（工单 03）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
}));

vi.mock('./client', () => ({
  authFetch: mocks.authFetch,
}));

import {
  fetchAgentToolStats,
  fetchAgentToolLogs,
  AgentToolApiError,
} from './agent-tools';

describe('agent-tools client stats & logs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAgentToolStats', () => {
    it('成功获取工具调用统计数据', async () => {
      const mockStats = {
        totalCalls: 10,
        successRate: 90,
        avgDurationMs: 120,
        lastCalledAt: '2026-10-10T10:00:00.000Z',
        lastErrorSummary: '连接超时',
      };

      mocks.authFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockStats }),
      });

      const stats = await fetchAgentToolStats('tool_123');
      expect(stats).toEqual(mockStats);
      expect(mocks.authFetch).toHaveBeenCalledWith('/api/agent-tools/tool_123/stats');
    });

    it('遭遇 429 限流时抛出对应 AgentToolApiError', async () => {
      mocks.authFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      await expect(fetchAgentToolStats('tool_123')).rejects.toThrow(AgentToolApiError);
    });

    it('服务器返回 404 时抛出错误', async () => {
      mocks.authFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: '工具不存在', errorCode: 'NOT_FOUND' }),
      });

      await expect(fetchAgentToolStats('tool_123')).rejects.toThrow('工具不存在');
    });
  });

  describe('fetchAgentToolLogs', () => {
    it('成功倒序分页获取调用明细', async () => {
      const mockLogsResponse = {
        logs: [
          {
            id: 'call_1',
            method: 'POST',
            statusCode: 200,
            durationMs: 150,
            outcome: 'success',
            errorKind: null,
            createdAt: '2026-10-10T12:00:00.000Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      mocks.authFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockLogsResponse }),
      });

      const res = await fetchAgentToolLogs('tool_123', { limit: 15, offset: 30 });
      expect(res).toEqual(mockLogsResponse);
      expect(mocks.authFetch).toHaveBeenCalledWith(
        '/api/agent-tools/tool_123/logs?limit=15&offset=30'
      );
    });

    it('不传分页参数时默认不带多余 query', async () => {
      mocks.authFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { logs: [], total: 0, hasMore: false } }),
      });

      await fetchAgentToolLogs('tool_123');
      expect(mocks.authFetch).toHaveBeenCalledWith('/api/agent-tools/tool_123/logs');
    });
  });
});
