import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageItem } from './message-item';
import type { Message } from '@/stores/chat-store';
import type { CitationAnchor } from '@repo/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const MOCK_CITATION: CitationAnchor = {
  knowledgeBaseId: 'kb-test-1',
  documentId: 'doc-100',
  documentName: '珀金协议规范',
  documentVersion: 1,
  pageNumber: 2,
  headingPath: '2.1 熔断条件',
  chunkIndex: 0,
  snippet: '连续失败 3 次触发熔断。',
};

describe('MessageItem Markdown 渲染', () => {
  it('行内代码（如工具名 `web_fetch`）渲染为行内 code 标签，不展示代码块的复制按钮与语言标', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'assistant',
      content: '可调用的工具有：`web_fetch` 与 `image_generate`。',
      isStreaming: false,
    };

    render(<MessageItem message={message} />);

    // 行内代码应正常以 code 标签呈现
    const inlineCodes = screen.getAllByText(/web_fetch|image_generate/);
    expect(inlineCodes).toHaveLength(2);
    expect(inlineCodes[0].tagName.toLowerCase()).toBe('code');
    expect(inlineCodes[1].tagName.toLowerCase()).toBe('code');

    // 行内代码不应渲染独立代码块语言标识（如 text）
    expect(screen.queryByText('text')).not.toBeInTheDocument();
  });

  it('多行围栏代码块正常渲染为带复制按钮的 CodeBlock', () => {
    const message: Message = {
      id: 'msg-2',
      role: 'assistant',
      content: '```js\nconsole.log("hello");\n```',
      isStreaming: false,
    };

    render(<MessageItem message={message} />);

    // 块级代码应渲染出语言标识与一键复制按钮
    expect(screen.getByText('js')).toBeInTheDocument();
    expect(screen.getByText('console.log("hello");')).toBeInTheDocument();
    expect(screen.getByText('复制')).toBeInTheDocument();
  });
});

describe('MessageItem 引用角标与来源', () => {
  it('知识库问题命中检索后：回答正文含 [^1] 样式引用编号，气泡元信息行展示来源计数 (QA-004)', () => {
    const message: Message = {
      id: 'msg-rag-1',
      role: 'assistant',
      content: '根据珀金协议 [^1] 的规定，连续失败 3 次将触发熔断 [^2]。',
      isStreaming: false,
      toolCalls: [
        {
          id: 'call-1',
          name: 'knowledge_search',
          args: { query: '连败熔断触发条件' },
          status: 'success',
          resultSummary: '命中 2 条切片',
        },
      ],
    };

    render(<MessageItem message={message} />);

    // 1. 正文中存在 [^1] 和 [^2] 的引用徽标按钮
    const cite1 = screen.getByTestId('citation-badge-1');
    const cite2 = screen.getByTestId('citation-badge-2');
    expect(cite1).toBeInTheDocument();
    expect(cite2).toBeInTheDocument();
    expect(cite1).toHaveTextContent('[^1]');
    expect(cite2).toHaveTextContent('[^2]');

    // 2. 气泡元信息行展示检索类来源计数（QA-004 步骤 1）
    const metaRow = screen.getByTestId('retrieval-source-meta');
    expect(metaRow).toBeInTheDocument();
    expect(metaRow).toHaveTextContent('已参考知识库来源 · 2 处引用');
  });

  it('点击引用角标或参考来源折叠卡片触发 onOpenCitation 回调 (TC01/TC04 / ADR-0025)', async () => {
    const onOpenCitation = vi.fn();

    const message: Message = {
      id: 'msg-cite-test',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: MOCK_CITATION,
      },
    };

    render(<MessageItem message={message} onOpenCitation={onOpenCitation} />);

    // 1. 验证底部渲染参考来源卡片 (CitationReferenceCard)
    const refCard = screen.getByTestId('citation-reference-card');
    expect(refCard).toBeInTheDocument();
    expect(refCard).toHaveTextContent('参考来源');
    expect(refCard).toHaveTextContent('1 处引用');

    // 2. 展开参考来源列表
    const toggleBtn = screen.getByTestId('citation-reference-card-toggle');
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/珀金协议规范/)).toBeInTheDocument();

    // 3. 点击折叠列表中的条目，触发 onOpenCitation
    const itemBtn = screen.getByTestId('citation-ref-item-1');
    fireEvent.click(itemBtn);
    expect(onOpenCitation).toHaveBeenCalledWith(MOCK_CITATION);

    // 4. 点击正文行内角标 [^1]，同样直接触发 onOpenCitation (TC01)
    onOpenCitation.mockClear();
    const citeBadge = screen.getByTestId('citation-badge-1');
    fireEvent.click(citeBadge);
    expect(onOpenCitation).toHaveBeenCalledWith(MOCK_CITATION);
  });

  it('user-event 真实 pointer 点击行内角标直接打开全文抽屉且不弹 Popover (ADR-0025)', async () => {
    const user = userEvent.setup();
    const onOpenCitation = vi.fn();

    const message: Message = {
      id: 'msg-cite-pointer',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: MOCK_CITATION,
      },
    };

    render(<MessageItem message={message} onOpenCitation={onOpenCitation} />);

    const badge = screen.getByTestId('citation-badge-1');
    await user.click(badge);

    expect(onOpenCitation).toHaveBeenCalledWith(MOCK_CITATION);
    // 有全文抽屉回调时不得再依赖旧 Popover 交互
    expect(badge).not.toHaveAttribute('aria-haspopup');
    expect(screen.queryByText('引用来源 [^1]')).not.toBeInTheDocument();
  });

  it('提供 onOpenCitation 但引用无锚点时仍弹出 Popover 并提示未匹配物理切片锚点 (Spec P-X1)', async () => {
    const user = userEvent.setup();
    const onOpenCitation = vi.fn();

    const message: Message = {
      id: 'msg-cite-no-anchor',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
    };

    render(<MessageItem message={message} onOpenCitation={onOpenCitation} />);

    // 无锚点时角标仍是 Popover 触发器，而非直达全文抽屉的裸按钮
    const badge = screen.getByTestId('citation-badge-1');
    expect(badge).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(badge);

    expect(await screen.findByText('引用来源 [^1]')).toBeInTheDocument();
    expect(screen.getByText(/该条引用未匹配到物理切片锚点/)).toBeInTheDocument();
    expect(onOpenCitation).not.toHaveBeenCalled();
  });

  it('未提供 onOpenCitation 时点击行内角标仍展示 Popover 来源详情', async () => {
    const user = userEvent.setup();

    const message: Message = {
      id: 'msg-cite-popover',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: MOCK_CITATION,
      },
    };

    render(<MessageItem message={message} />);

    await user.click(screen.getByTestId('citation-badge-1'));

    expect(await screen.findByText('引用来源 [^1]')).toBeInTheDocument();
    expect(screen.getByText('《珀金协议规范》')).toBeInTheDocument();
  });

  it('用户消息正确渲染角色标识、完整人物轮廓头像与气泡内容', () => {
    const message: Message = {
      id: 'msg-user-1',
      role: 'user',
      content: '调研一下各个厂商的 token plan 的套餐用量',
    };

    const { container } = render(<MessageItem message={message} />);

    // 1. 用户标识文本正常呈现
    expect(screen.getByText('用户')).toBeInTheDocument();

    // 2. 消息气泡正文正常呈现
    expect(screen.getByText('调研一下各个厂商的 token plan 的套餐用量')).toBeInTheDocument();

    // 3. 用户头像包含完整的 SVG 人物轮廓（ChatUserMark）
    const userAvatar = container.querySelector('div.rounded-2xl svg[viewBox="0 0 24 24"]');
    expect(userAvatar).toBeInTheDocument();
    expect(userAvatar).toHaveClass('h-[22px]', 'w-[22px]');
  });
});

describe('运行时状态入口（ADR-0061 / 工单 03-04）', () => {
  it('任务不可用提示旁提供重新执行入口', () => {
    const message: Message = {
      id: 'msg-unavailable',
      role: 'assistant',
      content: '半截内容',
      isStreaming: false,
      runUnavailable: true,
    };
    const onRegenerate = vi.fn();

    render(<MessageItem message={message} onRegenerate={onRegenerate} />);

    expect(screen.getByText('任务已不可用，可重新执行')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: '重新执行' });
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);
    expect(onRegenerate).toHaveBeenCalledWith('msg-unavailable');
  });

  it('重连放弃后提供重新连接与停止入口', () => {
    const message: Message = {
      id: 'msg-reconnect-failed',
      role: 'assistant',
      content: '半截内容',
      isStreaming: false,
      runId: 'run-reconnect',
      runPending: true,
      runReconnectFailed: true,
      failed: true,
    };

    render(<MessageItem message={message} />);

    expect(screen.getByText('连接中断，任务可能仍在后台执行')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新连接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  });
});


describe('审批卡片与运行态入口（ADR-0041 / ADR-0061）', () => {
  it('审批卡片显示且凭证随消息保留', () => {
    const approval = {
      callId: 'c1',
      toolName: 'wh_notify',
      host: 'hooks.example.com',
      params: { message: '你好' },
      token: 'tok-123',
      expiresAt: Date.now() + 60_000,
      status: 'pending' as const,
    };
    const message: Message = {
      id: 'msg-approval',
      role: 'assistant',
      content: '',
      isStreaming: false,
      approval,
    };

    render(<MessageItem message={message} />);

    expect(screen.getAllByTestId('approval-card')).toHaveLength(1);
    expect(screen.getByText('wh_notify')).toBeInTheDocument();
    expect(message.approval?.token).toHaveLength('tok-123'.length);
  });
});
