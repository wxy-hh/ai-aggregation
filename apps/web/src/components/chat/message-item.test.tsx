import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
});
