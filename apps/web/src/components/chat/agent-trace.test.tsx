/**
 * agent-trace.test.tsx —— agent 过程卡片的可见性与折叠时序测试
 *
 * 锁定的外部行为（spec §8 + D10「过程可见性复用思考块时序」）：
 * 1. 工具执行期默认展开：用户能实时看到调用名与参数摘要；
 * 2. **工具全部落定后**才自动折叠 —— 决策步正文可以先于 tool_call 到达（§5.1 修订），
 *    所以「有正文」不再是折叠的充分条件，必须工具也已落定；
 * 3. 用户手动操作后不再被自动时序干预（手动覆盖优先且不可逆）；
 * 4. 状态可见：执行中显示「执行中…」，失败在折叠头累计计数。
 */

import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ToolCallRecord } from '@repo/shared';
import { AgentTrace } from './agent-trace';

/** 构造一条工具调用记录（默认取进行中的图像生成） */
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

describe('AgentTrace 过程卡片', () => {
  afterEach(() => cleanup());

  it('流式中且无正文时默认展开：显示工具中文名与参数摘要', () => {
    render(<AgentTrace toolCalls={[call()]} isStreaming hasContent={false} />);

    const header = screen.getByRole('button', { name: '收起工具调用过程' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('图像生成')).toBeInTheDocument();
    expect(screen.getByText('一只橘猫在窗台')).toBeInTheDocument();
  });

  it('正文到达但工具仍在跑 → 保持展开（§5.1 修订 / D10 回归）', () => {
    // 回归背景：决策步正文可以先于 tool_call 到达（模型常说「我查一下」再调工具）。
    // 若仍以「有正文」为唯一折叠信号，卡片会在工具还没开始跑时就收起，
    // 用户看不到「工具正在执行」——这正是改以工具运行态为信号的原因。
    render(<AgentTrace toolCalls={[call({ status: 'running' })]} isStreaming hasContent />);

    const header = screen.getByRole('button', { name: '收起工具调用过程' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    // 明细可见
    expect(screen.getByText('一只橘猫在窗台')).toBeInTheDocument();
    // 折叠头如实反映「正在进行」，而不是已完成的计数
    expect(screen.getByText('正在调用图像生成…')).toBeInTheDocument();
  });

  it('正文到达且工具已全部落定 → 自动折叠：明细不可见', () => {
    render(<AgentTrace toolCalls={[call({ status: 'success' })]} isStreaming hasContent />);

    const header = screen.getByRole('button', { name: '展开工具调用过程' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('一只橘猫在窗台')).not.toBeInTheDocument();
  });

  it('多个工具：只要还有一个在跑就不折叠（避免中途收起）', () => {
    const calls: ToolCallRecord[] = [
      call({ id: 'c1', name: 'web_fetch', status: 'success', resultSummary: '已抓取' }),
      call({ id: 'c2', name: 'image_generate', status: 'running' }),
    ];
    render(<AgentTrace toolCalls={calls} isStreaming hasContent />);

    expect(screen.getByRole('button', { name: '收起工具调用过程' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('用户手动展开后不再被自动时序干预（覆盖态不可逆）', () => {
    const { rerender } = render(
      <AgentTrace toolCalls={[call()]} isStreaming hasContent={false} />
    );
    // 手动收起
    fireEvent.click(screen.getByRole('button', { name: '收起工具调用过程' }));
    expect(screen.getByRole('button', { name: '展开工具调用过程' })).toBeInTheDocument();

    // 仍是工具执行期（hasContent 依旧 false）：不因时序重新展开
    rerender(<AgentTrace toolCalls={[call()]} isStreaming hasContent={false} />);
    expect(screen.getByRole('button', { name: '展开工具调用过程' })).toBeInTheDocument();
  });

  it('执行中：折叠头显示「正在调用图像生成…」，行内显示执行中', () => {
    render(<AgentTrace toolCalls={[call()]} isStreaming hasContent={false} />);

    expect(screen.getByText('正在调用图像生成…')).toBeInTheDocument();
    expect(screen.getByText('执行中…')).toBeInTheDocument();
  });

  it('终态：成功显示结果摘要，失败在折叠头累计计数', () => {
    const calls: ToolCallRecord[] = [
      call({
        id: 'c1',
        name: 'web_fetch',
        argsSummary: 'https://example.com',
        status: 'success',
        resultSummary: 'Example Domain',
      }),
      call({ id: 'c2', name: 'image_generate', status: 'failed', resultSummary: '上游超时' }),
    ];
    render(<AgentTrace toolCalls={calls} isStreaming={false} hasContent />);

    expect(screen.getByText('调用了 2 个工具（1 个失败）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开工具调用过程' }));
    expect(screen.getByText('网页抓取')).toBeInTheDocument();
    expect(screen.getByText('Example Domain')).toBeInTheDocument();
    expect(screen.getByText('上游超时')).toBeInTheDocument();
  });

  // jsdom 无排版引擎，量不到真实宽度，因此这里锁「类名契约」。
  // 背景（T07 真机实测）：工具名是 flex item 且默认 min-width:auto，中文可在任意字间断行，
  // 于是被右侧 flex-1 的参数摘要挤成每行一个字（375px 视口实测 12px 宽 × 4 行）。
  // 修复 = 工具名 shrink-0 + whitespace-nowrap，截断责任交给带 truncate 的参数摘要。
  it('布局契约：工具名不参与收缩，截断由参数摘要承担', () => {
    render(
      <AgentTrace
        toolCalls={[call({ argsSummary: '{"prompt":"一段很长很长的中文提示词把这一行占满"}' })]}
        isStreaming={false}
        hasContent
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '展开工具调用过程' }));

    const label = screen.getByText('图像生成');
    expect(label).toHaveClass('shrink-0');
    expect(label).toHaveClass('whitespace-nowrap');

    const args = screen.getByText(/"prompt"/);
    expect(args).toHaveClass('truncate');
  });
});
