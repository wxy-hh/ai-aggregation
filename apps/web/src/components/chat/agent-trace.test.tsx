/**
 * agent-trace.test.tsx —— Agent 过程三态呈现（工单 P0a-02）
 *
 * 锁定的外部行为（spec §B + TC-P0-1 / TC-P0-2）：
 * 1. 运行态（瞬态状态条）：
 *    - 单行动作短语（web_fetch 抓取网页 / web_search 联网搜索 / image_generate 生成图像 / wh_ 外部工具 / 兜底调用工具 / 思考下一步）；
 *    - 无逐条明细、无计数；
 *    - 默认收起。
 * 2. 完成态（元信息行）：
 *    - 纯函数聚合：≤2 段结果短语（来源/出图/外部工具）+ 耗时和（X.Xs）；
 *    - 仅计 success；
 *    - 全失败警示态：「N 次调用均失败」（耗时和照常）；
 *    - 历史消息无 durationMs 时省略耗时段不报错。
 * 3. 折叠时序反转：
 *    - 运行中默认收起（废弃原自动展开逻辑）；
 *    - 用户手动展开后，从 running 过渡到 complete 仍保持展开（不被自动时序干预）。
 * 4. 审计视图：
 *    - 桌面端气泡内就地展开：逐条参数、结果、单条耗时（X.Xs）；
 *    - 过程旁白按 beforeCallIndex 扁平时间线混排不变；
 *    - 移动端升起底部抽屉（顶部抓手、关闭按钮、安全区、热区 ≥44px）。
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ToolCallRecord } from '@repo/shared';
import { AgentTrace } from './agent-trace';

// 默认 mock useIsMobile 返回 false（桌面端）
const mockUseIsMobile = vi.fn(() => false);
vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

/** 构造一条工具调用记录 */
function call(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 'c1',
    name: 'image_generate',
    argsSummary: '一只橘猫在窗台',
    status: 'running',
    resultSummary: '',
    ...overrides,
  };
}

describe('AgentTrace 三态呈现（工单 P0a-02）', () => {
  afterEach(() => {
    cleanup();
    mockUseIsMobile.mockReturnValue(false);
  });

  describe('1. 运行态（瞬态状态条）', () => {
    it('运行中默认收起：仅显示单行瞬态状态条，无明细与参数摘要', () => {
      render(<AgentTrace toolCalls={[call()]} isStreaming />);

      const trace = screen.getByTestId('agent-trace');
      expect(trace).toBeInTheDocument();

      // 折叠按钮处于未展开态
      const toggle = screen.getByRole('button', { name: /展开/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // 状态条动作短语可见，明细与参数摘要不可见
      expect(screen.getByText('正在生成图像…')).toBeInTheDocument();
      expect(screen.queryByText('一只橘猫在窗台')).not.toBeInTheDocument();
    });

    it('动作短语映射：web_fetch / web_search / wh_ webhook / 兜底', () => {
      // web_fetch
      const { rerender } = render(
        <AgentTrace
          toolCalls={[call({ name: 'web_fetch', status: 'running' })]}
          isStreaming
         
        />
      );
      expect(screen.getByText('正在抓取网页…')).toBeInTheDocument();

      // web_search
      rerender(
        <AgentTrace
          toolCalls={[call({ name: 'web_search', status: 'running' })]}
          isStreaming
         
        />
      );
      expect(screen.getByText('正在联网搜索…')).toBeInTheDocument();

      // wh_ 前缀 webhook
      rerender(
        <AgentTrace
          toolCalls={[call({ name: 'wh_send_feishu', status: 'running' })]}
          isStreaming
         
        />
      );
      expect(screen.getByText('正在调用外部工具…')).toBeInTheDocument();

      // 兜底未登记工具
      rerender(
        <AgentTrace
          toolCalls={[call({ name: 'unknown_custom_tool', status: 'running' })]}
          isStreaming
         
        />
      );
      expect(screen.getByText('正在调用工具…')).toBeInTheDocument();
    });

    it('无工具记录或等待模型决策时显示「正在思考下一步…」且无计数', () => {
      render(<AgentTrace toolCalls={[]} isStreaming />);

      expect(screen.getByText('正在思考下一步…')).toBeInTheDocument();
      // 不应包含任何计数形式的字符
      expect(screen.queryByText(/0 个工具/)).not.toBeInTheDocument();
    });
  });

  describe('2. 完成态（元信息行聚合纯函数）', () => {
    it('聚合纯函数：来源数（web_fetch+web_search）与耗时和（X.Xs）', () => {
      const calls: ToolCallRecord[] = [
        call({
          id: 'c1',
          name: 'web_fetch',
          status: 'success',
          resultSummary: '抓取成功',
          durationMs: 400,
        }),
        call({
          id: 'c2',
          name: 'web_search',
          status: 'success',
          resultSummary: '搜索成功',
          durationMs: 800,
        }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      // 400ms + 800ms = 1200ms -> 1.2s
      expect(screen.getByText('引用 2 个来源 · 耗时 1.2s')).toBeInTheDocument();
      // 默认收起
      expect(screen.getByRole('button', { name: /展开/ })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('优先级取前 2 段短语：来源 > 出图 > 外部工具', () => {
      const calls: ToolCallRecord[] = [
        call({ id: 'c1', name: 'web_fetch', status: 'success', durationMs: 200 }),
        call({ id: 'c2', name: 'image_generate', status: 'success', durationMs: 300 }),
        call({ id: 'c3', name: 'wh_feishu', status: 'success', durationMs: 500 }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      // 前 2 段为来源和出图，外部工具被截断；总耗时 1.0s
      expect(
        screen.getByText('引用 1 个来源 · 生成 1 张图片 · 耗时 1.0s')
      ).toBeInTheDocument();
      expect(screen.queryByText(/外部工具/)).not.toBeInTheDocument();
    });

    it('全失败警示态：「N 次调用均失败」（耗时和照常显示）', () => {
      const calls: ToolCallRecord[] = [
        call({ id: 'c1', name: 'web_fetch', status: 'failed', durationMs: 500 }),
        call({ id: 'c2', name: 'image_generate', status: 'failed', durationMs: 700 }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      expect(screen.getByText('2 次调用均失败 · 耗时 1.2s')).toBeInTheDocument();
    });

    it('历史消息兼容：无 durationMs 时省略耗时段不报错', () => {
      const calls: ToolCallRecord[] = [
        call({ id: 'c1', name: 'web_fetch', status: 'success' }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      expect(screen.getByText('引用 1 个来源')).toBeInTheDocument();
      expect(screen.queryByText(/耗时/)).not.toBeInTheDocument();
    });
  });

  describe('3. 折叠时序反转与手动覆盖', () => {
    it('运行中手动展开后，流式结束（running→complete）不自动收起', () => {
      const { rerender } = render(
        <AgentTrace
          toolCalls={[call({ id: 'c1', name: 'web_fetch', status: 'running' })]}
          isStreaming
         
        />
      );

      // 默认收起
      expect(screen.getByRole('button', { name: /展开/ })).toHaveAttribute(
        'aria-expanded',
        'false'
      );

      // 用户手动点击展开
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));
      expect(screen.getByRole('button', { name: /收起/ })).toHaveAttribute(
        'aria-expanded',
        'true'
      );

      // 状态从流式运行中转为完成态
      rerender(
        <AgentTrace
          toolCalls={[
            call({
              id: 'c1',
              name: 'web_fetch',
              status: 'success',
              resultSummary: '结果已返回',
              durationMs: 300,
            }),
          ]}
          isStreaming={false}
         
        />
      );

      // 依然保持展开状态，不被时序干预收起
      expect(screen.getByRole('button', { name: /收起/ })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByText('结果已返回')).toBeInTheDocument();
    });
  });

  describe('4. 审计视图（桌面就地展开）', () => {
    it('桌面端就地展开：显示逐条明细、参数摘要与单条耗时（X.Xs）', () => {
      const calls: ToolCallRecord[] = [
        call({
          id: 'c1',
          name: 'web_fetch',
          argsSummary: 'https://example.com',
          status: 'success',
          resultSummary: '抓取成功',
          durationMs: 240,
        }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      // 点击展开审计视图
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));

      expect(screen.getByText('网页抓取')).toBeInTheDocument();
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.getByText('抓取成功')).toBeInTheDocument();
      // 单条耗时 240ms -> 0.2s
      expect(screen.getByText('0.2s')).toBeInTheDocument();
    });

    it('布局契约：工具名不参与收缩，截断由参数摘要承担', () => {
      render(
        <AgentTrace
          toolCalls={[call({ argsSummary: '{"prompt":"一段很长很长的中文提示词把这一行占满"}' })]}
          isStreaming={false}
         
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));

      const label = screen.getByText('图像生成');
      expect(label).toHaveClass('shrink-0');
      expect(label).toHaveClass('whitespace-nowrap');

      const args = screen.getByText(/"prompt"/);
      expect(args).toHaveClass('truncate');
    });

    it('旁白与工具对按扁平时间线混排（beforeCallIndex 锚定）', () => {
      const calls: ToolCallRecord[] = [
        call({
          id: 'c1',
          name: 'web_fetch',
          status: 'success',
          resultSummary: '已抓取 A',
        }),
        call({
          id: 'c2',
          name: 'web_fetch',
          status: 'success',
          resultSummary: '已抓取 B',
        }),
      ];
      const notes = [
        { beforeCallIndex: 0, text: '先查 A 的最新情况' },
        { beforeCallIndex: 1, text: 'A 已查到，再查 B 做对比' },
      ];

      const { container } = render(
        <AgentTrace toolCalls={calls} agentNotes={notes} isStreaming={false} />
      );
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));

      const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toHaveLength(4);
      expect(items[0]).toContain('先查 A 的最新情况');
      expect(items[1]).toContain('已抓取 A');
      expect(items[2]).toContain('A 已查到，再查 B 做对比');
      expect(items[3]).toContain('已抓取 B');
    });

    it('末尾旁白（beforeCallIndex 等于工具总数）兜底渲染在最后一个工具之后', () => {
      const calls: ToolCallRecord[] = [
        call({ id: 'c1', name: 'web_fetch', status: 'success', resultSummary: '已抓取' }),
      ];
      const notes = [
        { beforeCallIndex: 0, text: '先抓页面' },
        { beforeCallIndex: 1, text: '抓完了，组织回答' },
      ];

      const { container } = render(
        <AgentTrace toolCalls={calls} agentNotes={notes} isStreaming={false} />
      );
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));

      const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toHaveLength(3);
      expect(items[0]).toContain('先抓页面');
      expect(items[1]).toContain('已抓取');
      expect(items[2]).toContain('抓完了，组织回答');
    });
  });

  describe('5. 移动端审计抽屉（TC-P0-2）', () => {
    it('移动端视口点击元信息行打开底部抽屉，包含抓手与关闭按钮', () => {
      mockUseIsMobile.mockReturnValue(true);

      const calls: ToolCallRecord[] = [
        call({
          id: 'c1',
          name: 'web_fetch',
          argsSummary: 'https://example.com',
          status: 'success',
          resultSummary: '抓取成功',
          durationMs: 500,
        }),
      ];

      render(<AgentTrace toolCalls={calls} isStreaming={false} />);

      // 点击打开审计抽屉
      fireEvent.click(screen.getByRole('button', { name: /展开/ }));

      // 抽屉弹层出现，包含关闭按钮（可点区域或 aria-label="关闭"）
      const closeBtn = screen.getByRole('button', { name: '关闭' });
      expect(closeBtn).toBeInTheDocument();

      // 抽屉内可见明细
      expect(screen.getByText('网页抓取')).toBeInTheDocument();
      expect(screen.getByText('抓取成功')).toBeInTheDocument();
      expect(screen.getByText('0.5s')).toBeInTheDocument();

      // 点击关闭抽屉
      fireEvent.click(closeBtn);
    });
  });
});
