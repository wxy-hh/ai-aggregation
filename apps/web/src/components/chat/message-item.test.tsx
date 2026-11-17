import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageItem } from './message-item';
import type { Message } from '@/stores/chat-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe('MessageItem Markdown 渲染 (行内代码 vs 独立代码块)', () => {
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
    const mockCitation = {
      knowledgeBaseId: 'kb-test-1',
      documentId: 'doc-100',
      documentName: '珀金协议规范',
      documentVersion: 1,
      pageNumber: 2,
      headingPath: '2.1 熔断条件',
      chunkIndex: 0,
      snippet: '连续失败 3 次触发熔断。',
    };

    const message: Message = {
      id: 'msg-cite-test',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: mockCitation,
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
    expect(onOpenCitation).toHaveBeenCalledWith(mockCitation);

    // 4. 点击正文行内角标 [^1]，同样直接触发 onOpenCitation (TC01)
    onOpenCitation.mockClear();
    const citeBadge = screen.getByTestId('citation-badge-1');
    fireEvent.click(citeBadge);
    expect(onOpenCitation).toHaveBeenCalledWith(mockCitation);
  });

  it('user-event 真实 pointer 点击行内角标直接打开全文抽屉且不弹 Popover (ADR-0025)', async () => {
    const user = userEvent.setup();
    const onOpenCitation = vi.fn();
    const mockCitation = {
      knowledgeBaseId: 'kb-test-1',
      documentId: 'doc-100',
      documentName: '珀金协议规范',
      documentVersion: 1,
      pageNumber: 2,
      headingPath: '2.1 熔断条件',
      chunkIndex: 0,
      snippet: '连续失败 3 次触发熔断。',
    };

    const message: Message = {
      id: 'msg-cite-pointer',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: mockCitation,
      },
    };

    render(<MessageItem message={message} onOpenCitation={onOpenCitation} />);

    const badge = screen.getByTestId('citation-badge-1');
    await user.click(badge);

    expect(onOpenCitation).toHaveBeenCalledWith(mockCitation);
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
    const mockCitation = {
      knowledgeBaseId: 'kb-test-1',
      documentId: 'doc-100',
      documentName: '珀金协议规范',
      documentVersion: 1,
      pageNumber: 2,
      headingPath: '2.1 熔断条件',
      chunkIndex: 0,
      snippet: '连续失败 3 次触发熔断。',
    };

    const message: Message = {
      id: 'msg-cite-popover',
      role: 'assistant',
      content: '根据珀金协议 [^1] 规定，满足条件将熔断。',
      isStreaming: false,
      citations: {
        1: mockCitation,
      },
    };

    render(<MessageItem message={message} />);

    await user.click(screen.getByTestId('citation-badge-1'));

    expect(await screen.findByText('引用来源 [^1]')).toBeInTheDocument();
    expect(screen.getByText('《珀金协议规范》')).toBeInTheDocument();
  });
});
