/**
 * agent-trace-summary.test.ts —— 元信息聚合纯函数与动作映射单测（工单 P0a-02）
 */

import { describe, it, expect } from 'vitest';
import type { ToolCallRecord } from '@repo/shared';
import {
  getRunningActionText,
  formatSingleDuration,
  formatTotalDuration,
  getCompleteSummary,
  getToolLabel,
} from './agent-trace-summary';

function call(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 'c1',
    name: 'web_fetch',
    argsSummary: '',
    status: 'success',
    resultSummary: '',
    ...overrides,
  };
}

describe('agent-trace-summary 纯函数模块', () => {
  describe('getToolLabel', () => {
    it('返回预设中文名或原名，wh_ 开头归为外部工具', () => {
      expect(getToolLabel('web_fetch')).toBe('网页抓取');
      expect(getToolLabel('image_generate')).toBe('图像生成');
      expect(getToolLabel('web_search')).toBe('联网搜索');
      expect(getToolLabel('wh_weather')).toBe('外部工具');
      expect(getToolLabel('custom_tool')).toBe('custom_tool');
    });
  });

  describe('getRunningActionText 动作短语映射', () => {
    it('空或未定义时返回「正在思考下一步…」', () => {
      expect(getRunningActionText()).toBe('正在思考下一步…');
      expect(getRunningActionText(undefined)).toBe('正在思考下一步…');
    });

    it('web_fetch 映射为「正在抓取网页…」', () => {
      expect(getRunningActionText('web_fetch')).toBe('正在抓取网页…');
    });

    it('web_search 映射为「正在联网搜索…」', () => {
      expect(getRunningActionText('web_search')).toBe('正在联网搜索…');
    });

    it('image_generate 映射为「正在生成图像…」', () => {
      expect(getRunningActionText('image_generate')).toBe('正在生成图像…');
    });

    it('wh_ 前缀映射为「正在调用外部工具…」', () => {
      expect(getRunningActionText('wh_send_msg')).toBe('正在调用外部工具…');
    });

    it('未知工具兜底为「正在调用工具…」', () => {
      expect(getRunningActionText('my_sql_query')).toBe('正在调用工具…');
    });
  });

  describe('formatSingleDuration & formatTotalDuration', () => {
    it('无有效耗时时返回 null', () => {
      expect(formatSingleDuration(undefined)).toBeNull();
      expect(formatSingleDuration(-10)).toBeNull();
      expect(formatTotalDuration(undefined)).toBeNull();
      expect(formatTotalDuration(-5)).toBeNull();
    });

    it('格式化为 X.Xs 格式', () => {
      expect(formatSingleDuration(0)).toBe('0.0s');
      expect(formatSingleDuration(240)).toBe('0.2s');
      expect(formatSingleDuration(1250)).toBe('1.3s');

      expect(formatTotalDuration(0)).toBe('耗时 0.0s');
      expect(formatTotalDuration(500)).toBe('耗时 0.5s');
      expect(formatTotalDuration(2300)).toBe('耗时 2.3s');
    });
  });

  describe('getCompleteSummary 完成态聚合', () => {
    it('0 条记录返回「过程记录」', () => {
      const res = getCompleteSummary([]);
      expect(res.text).toBe('过程记录');
      expect(res.isAllFailed).toBe(false);
      expect(res.totalDurationMs).toBeUndefined();
    });

    it('单条成功：来源数 + 耗时', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'success', durationMs: 400 }),
      ]);
      expect(res.text).toBe('引用 1 个来源 · 耗时 0.4s');
      expect(res.isAllFailed).toBe(false);
      expect(res.totalDurationMs).toBe(400);
    });

    it('多条成功来源合并（web_fetch 与 web_search）', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'success', durationMs: 300 }),
        call({ name: 'web_search', status: 'success', durationMs: 500 }),
      ]);
      expect(res.text).toBe('引用 2 个来源 · 耗时 0.8s');
    });

    it('三类工具同时成功时，按优先级取前 2 段（来源 > 出图 > 外部工具）', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'success', durationMs: 100 }),
        call({ name: 'image_generate', status: 'success', durationMs: 200 }),
        call({ name: 'wh_feishu', status: 'success', durationMs: 300 }),
      ]);
      // 来源 1 + 出图 1，外部工具被截断；总耗时 0.6s
      expect(res.text).toBe('引用 1 个来源 · 生成 1 张图片 · 耗时 0.6s');
    });

    it('仅有出图和外部工具成功时，正确渲染两段', () => {
      const res = getCompleteSummary([
        call({ name: 'image_generate', status: 'success', durationMs: 400 }),
        call({ name: 'wh_dingtalk', status: 'success', durationMs: 600 }),
      ]);
      expect(res.text).toBe('生成 1 张图片 · 调用 1 个外部工具 · 耗时 1.0s');
    });

    it('全部失败：警示态「N 次调用均失败」（耗时和照常显示）', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'failed', durationMs: 200 }),
        call({ name: 'web_search', status: 'failed', durationMs: 300 }),
      ]);
      expect(res.isAllFailed).toBe(true);
      expect(res.text).toBe('2 次调用均失败 · 耗时 0.5s');
    });

    it('部分失败部分成功：仅计成功项，不触发全失败警示', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'success', durationMs: 200 }),
        call({ name: 'web_search', status: 'failed', durationMs: 300 }),
      ]);
      expect(res.isAllFailed).toBe(false);
      expect(res.text).toBe('引用 1 个来源 · 耗时 0.5s');
    });

    it('历史消息无 durationMs 时，省略耗时段不报错', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'success' }),
      ]);
      expect(res.text).toBe('引用 1 个来源');
      expect(res.totalDurationMs).toBeUndefined();
    });

    it('全失败但无 durationMs 时，仅显示警示语', () => {
      const res = getCompleteSummary([
        call({ name: 'web_fetch', status: 'failed' }),
      ]);
      expect(res.text).toBe('1 次调用均失败');
      expect(res.isAllFailed).toBe(true);
    });

    it('未知未分类工具成功时，兜底显示「调用了 N 个工具」', () => {
      const res = getCompleteSummary([
        call({ name: 'custom_sql', status: 'success', durationMs: 150 }),
      ]);
      expect(res.text).toBe('调用了 1 个工具 · 耗时 0.2s');
    });

    it('远程 MCP 工具携带 serverName 时输出 [MCP: Server] 标签并聚合摘要', () => {
      expect(getToolLabel('mcp_srv_1_read_value', '受控服务')).toBe('[MCP: 受控服务]');
      expect(getRunningActionText('mcp_srv_1_read_value', '受控服务')).toContain('MCP');
      const res = getCompleteSummary([
        call({
          name: 'mcp_srv_1_read_value',
          serverName: '受控服务',
          status: 'success',
          durationMs: 42,
        }),
      ]);
      expect(res.text).toBe('调用 1 次 MCP 工具 · 耗时 0.0s');
    });
  });
});
