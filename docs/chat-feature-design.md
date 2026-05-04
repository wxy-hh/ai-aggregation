# 智能对话功能设计文档

> AI 聚合平台 - 智能对话模块完整技术实现

## 目录

1. [功能概述](#功能概述)
2. [整体架构](#整体架构)
3. [流式对话实现](#流式对话实现)
4. [自动滚动机制](#自动滚动机制)
5. [打字效果实现](#打字效果实现)
6. [Markdown 渲染](#markdown-渲染)
7. [代码高亮](#代码高亮)
8. [接口封装](#接口封装)
9. [状态管理](#状态管理)
10. [附件上传](#附件上传)
11. [聊天流处理工具](#聊天流处理工具)

---

## 功能概述

智能对话模块是 AI 聚合平台的核心功能，提供了与多个 AI 模型（讯飞星火、豆包）进行实时对话的能力。

### 核心特性

- ✅ **流式对话**：AI 回复逐字显示，提升用户体验
- ✅ **自动滚动**：新消息自动滚动到可视区域
- ✅ **打字效果**：流式输出时显示光标动画
- ✅ **Markdown 渲染**：支持富文本格式（标题、列表、链接等）
- ✅ **代码高亮**：自动识别代码块并语法高亮
- ✅ **多模态支持**：支持图片和 PDF 文件上传（豆包模型）
- ✅ **对话管理**：创建、切换、删除多个对话
- ✅ **历史记录**：自动保存对话历史到本地存储
- ✅ **模型切换**：支持在不同 AI 模型间切换

---

## 整体架构

### 技术栈

```
前端框架：Next.js 15 + React 19
状态管理：Zustand (持久化到 localStorage)
UI 组件：shadcn/ui + Tailwind CSS
Markdown：react-markdown + remark-gfm
代码高亮：rehype-highlight + highlight.js
流式处理：Fetch API + ReadableStream
```

### 目录结构

```
apps/web/src/
├── app/
│   ├── chat/
│   │   └── page.tsx              # 聊天页面主组件
│   └── api/
│       └── chat/
│           └── route.ts          # 聊天 API 路由（流式响应）
├── components/
│   └── chat/
│       ├── chat-input.tsx        # 输入框组件
│       ├── message-item.tsx      # 消息展示组件
│       └── code-block.tsx        # 代码块组件
└── stores/
    ├── chat-store.ts             # 聊天状态管理
    └── conversations-store.ts    # 对话列表管理
```

### 数据流向

```
用户输入
    ↓
ChatInput 组件
    ↓
chat-store.sendMessage()
    ↓
POST /api/chat (流式请求)
    ↓
AI Provider (讯飞/豆包)
    ↓
ReadableStream (逐块返回)
    ↓
chat-store 更新 messages
    ↓
MessageItem 组件渲染
    ↓
自动滚动到底部
```

---

## 流式对话实现

### 1. 前端发起流式请求

**位置**：`apps/web/src/stores/chat-store.ts`

```typescript
// ============ 发送消息核心逻辑 ============
sendMessage: async (contentOverrides) => {
  const { input, messages, provider, model, isLoading, activeConversationId, attachment } = get();
  const content = contentOverrides || input;

  // 1. 验证输入
  if ((!content.trim() && !attachment) || isLoading) return;

  // 2. 中断之前的请求（如果有）
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  // 3. 构造用户消息和空的 AI 消息
  const userMessage: Message = {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    attachments: attachment ? [attachment] : undefined,
  };

  const assistantMessage: Message = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: '',           // 初始内容为空
    isStreaming: true,     // 标记为流式状态
  };

  // 4. 立即更新 UI（显示用户消息和空的 AI 消息）
  const newMessages = [...messages, userMessage, assistantMessage];
  set({
    messages: newMessages,
    input: '',
    isLoading: true,
    error: null,
    attachment: null,
  });

  try {
    // 5. 发起流式请求
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        provider,
        model,
      }),
      signal: abortController.signal,  // 支持取消请求
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    if (!response.body) throw new Error('响应体为空');

    // 6. 处理流式响应
    const reader = response.body.getReader();// 获取流读取器
    const decoder = new TextDecoder();// 创建一个 TextDecoder 实例
    let accumulatedContent = '';  // 累积的内容

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;  // 流结束

      // 解码当前块
      const chunk = decoder.decode(value, { stream: true });
      accumulatedContent += chunk;

      // 7. 实时更新 UI（关键：每次收到新数据就更新）
      set((state) => {
        const updatedMessages = state.messages.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: accumulatedContent }  // 更新 AI 消息内容
            : msg
        );
        return { messages: updatedMessages };
      });
    }

    // 8. 流结束，移除 isStreaming 标记
    set((state) => {
      const finalMessages = state.messages.map((msg) =>
        msg.id === assistantMessage.id
          ? { ...msg, isStreaming: false }  // 标记流式结束
          : msg
      );
      return { messages: finalMessages };
    });

  } catch (err) {
    // 错误处理
    if (err instanceof Error && err.name === 'AbortError') return;
    set({ error: err instanceof Error ? err : new Error('未知错误') });
  } finally {
    set({ isLoading: false });
    abortController = null;
  }
},
```

### 2. 后端返回流式响应

**位置**：`apps/web/src/app/api/chat/route.ts`

```typescript
// ============ 讯飞星火流式响应 ============
if (provider === 'xunfei') {
  const stream = createXunfeiStreamResponse({
    model: modelName,
    messages: messages as XunfeiMessage[],
    stream: true,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked', // 分块传输
    },
  });
}

// ============ 豆包流式响应 ============
if (provider === 'doubao') {
  const response = await fetch(`${arkBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arkApiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      input: convertToDoubaoInput(messages),
      stream: true, // 启用流式
    }),
  });

  // 转换豆包 SSE 流为纯文本流
  const reader = response.body.getReader(); // 获取流读取器
  const decoder = new TextDecoder(); // 创建一个 TextDecoder 实例
  const encoder = new TextEncoder(); // 创建一个 TextEncoder 实例

  const stream = new ReadableStream({
    // 创建一个可读流
    async start(controller) {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read(); // 读取数据
        if (done) break; // 流结束

        buffer += decoder.decode(value, { stream: true }); // 解码当前块
        const lines = buffer.split('\n'); // 按行分割
        buffer = lines.pop() || ''; // 保存最后一行

        for (const line of lines) {
          // 处理每一行
          if (line.startsWith('data: ')) {
            // 判断是否为数据块
            const jsonStr = line.slice(6); // 去除前缀
            if (jsonStr === '[DONE]') continue; // 结束标记

            const data = JSON.parse(jsonStr); // 解析 JSON

            // 提取文本增量
            if (data.type === 'response.output_text.delta') {
              const content = data.delta;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            }
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
```

### 3. 流式响应的关键点

1. **分块传输**：使用 `Transfer-Encoding: chunked` 头
2. **实时解码**：使用 `TextDecoder` 逐块解码
3. **累积内容**：每次收到新块，累加到之前的内容
4. **实时更新**：每次累加后立即更新 UI
5. **取消支持**：使用 `AbortController` 支持中断

---

## 自动滚动机制

### 实现原理

使用 React 的 `useRef` 和 `useEffect` 实现自动滚动到最新消息。

**位置**：`apps/web/src/app/chat/page.tsx`

```typescript
// ============ 1. 创建底部标记元素的引用 ============
const messagesEndRef = useRef<HTMLDivElement>(null);

// ============ 2. 监听消息变化，自动滚动 ============
useEffect(() => {
  // scrollIntoView 将元素滚动到可视区域
  // behavior: 'smooth' 表示平滑滚动（有动画效果）
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, isLoading]); // 依赖项：消息列表或加载状态变化时触发

// ============ 3. 在消息列表底部放置标记元素 ============
return (
  <div className="flex-1 overflow-y-auto">
    {displayMessages.map((msg) => (
      <MessageItem key={msg.id} message={msg} />
    ))}
    {/* 底部标记元素 */}
    <div ref={messagesEndRef} />
  </div>
);
```

### 触发时机

1. **新消息添加**：用户发送消息或 AI 回复时
2. **流式更新**：AI 回复内容增加时（每次更新都滚动）
3. **加载状态变化**：开始或结束加载时

### 优化建议

``typescript
// 使用 IntersectionObserver 优化性能
// 只在用户滚动到底部附近时才自动滚动
const [isNearBottom, setIsNearBottom] = useState(true);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      setIsNearBottom(entry.isIntersecting);
    },
    { threshold: 0.5 }
  );

  if (messagesEndRef.current) {
    observer.observe(messagesEndRef.current);
  }

  return () => observer.disconnect();
}, []);

useEffect(() => {
  // 只在用户在底部附近时才自动滚动
  if (isNearBottom) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, isNearBottom]);
```

---

## 打字效果实现

### 流式状态下的光标动画

**位置**：`apps/web/src/components/chat/message-item.tsx`

```typescript
// ============ 流式内容组件 ============
const StreamingContent = memo(function StreamingContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {content}
      {/* 光标动画：蓝色方块 + 脉冲效果 */}
      <span className="inline-block w-2 h-5 ml-0.5 bg-blue-500 animate-pulse rounded-sm" />
    </div>
  );
});

// ============ 在消息组件中使用 ============
export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const isStreaming = message.isStreaming ?? false;

  return (
    <div className="message-bubble">
      {isStreaming ? (
        // 流式状态：显示光标
        <StreamingContent content={message.content} />
      ) : (
        // 完成状态：渲染 Markdown
        <MarkdownContent content={message.content} />
      )}
    </div>
  );
});
```

### 思考状态动画

当 AI 还没开始输出时，显示"思考中"动画：

``typescript
// ============ 思考指示器组件 ============
const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <div className="w-full max-w-[400px] space-y-3 py-1">
      {/* 标题动画 */}
      <div className="flex items-center gap-1 text-sm font-medium text-blue-600 animate-pulse">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>AI 正在思考</span>
        <span className="flex gap-0.5 ml-1">
          <span className="animate-bounce delay-0">.</span>
          <span className="animate-bounce delay-150">.</span>
          <span className="animate-bounce delay-300">.</span>
        </span>
      </div>

      {/* 骨架屏线条 */}
      <div className="space-y-2.5">
        <div className="h-4 bg-slate-200 rounded-md w-full animate-pulse" />
        <div className="h-4 bg-slate-200 rounded-md w-[90%] animate-pulse delay-75" />
        <div className="h-4 bg-slate-200 rounded-md w-[95%] animate-pulse delay-150" />
        <div className="h-4 bg-slate-200 rounded-md w-[80%] animate-pulse delay-200" />
      </div>
    </div>
  );
});

// ============ 判断是否处于思考状态 ============
const isThinking = !isUser && isStreaming && !message.content;

return (
  <div className="message-bubble">
    {isThinking ? (
      <ThinkingIndicator />
    ) : isStreaming ? (
      <StreamingContent content={message.content} />
    ) : (
      <MarkdownContent content={message.content} />
    )}
  </div>
);
```

### CSS 动画配置

```
/* Tailwind 配置 */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-25%);
  }
}

/* 延迟动画 */
.delay-0 {
  animation-delay: 0ms;
}
.delay-75 {
  animation-delay: 75ms;
}
.delay-150 {
  animation-delay: 150ms;
}
.delay-200 {
  animation-delay: 200ms;
}
.delay-300 {
  animation-delay: 300ms;
}
```

---

## Markdown 渲染

### 使用 react-markdown

**位置**：`apps/web/src/components/chat/message-item.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';  // GitHub Flavored Markdown
import rehypeHighlight from 'rehype-highlight';  // 代码高亮

// ============ Markdown 内容组件 ============
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // 使用 useMemo 缓存 components 配置，避免每次渲染都创建新对象
  const components = useMemo(
    () => ({
      // 自定义代码块渲染
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');

        // 提取纯文本内容
        const getTextContent = (child: any): string => {
          if (typeof child === 'string') return child;
          if (Array.isArray(child)) return child.map(getTextContent).join('');
          if (child && typeof child === 'object' && child.props && child.props.children) {
            return getTextContent(child.props.children);
          }
          return '';
        };

        const textContent = getTextContent(children);

        // 多行代码块：使用自定义 CodeBlock 组件
        if (!inline && match) {
          return (
            <CodeBlock language={match[1]} className={className}>
              {textContent.replace(/\n$/, '')}
            </CodeBlock>
          );
        }

        // 行内代码：简单样式
        return (
          <code
            className="bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded text-indigo-600 font-mono text-sm"
            {...props}
          >
            {textContent}
          </code>
        );
      },
    }),
    []
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}  // 支持表格、删除线等
      rehypePlugins={[rehypeHighlight]}  // 代码高亮
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
```

### 支持的 Markdown 语法

```
# 标题 1

## 标题 2

### 标题 3

**粗体** _斜体_ ~~删除线~~

- 无序列表
- 项目 2

1. 有序列表
2. 项目 2

[链接](https://example.com)

> 引用文本

`行内代码`

\`\`\`javascript
// 代码块
console.log('Hello');
\`\`\`

| 表头1  | 表头2  |
| ------ | ------ |
| 单元格 | 单元格 |
```

### Markdown 样式配置

```
// Tailwind Typography 插件配置
<div className="prose dark:prose-invert max-w-none
  prose-p:leading-relaxed
  prose-pre:p-0
  prose-pre:border
  prose-pre:border-slate-200
  prose-pre:rounded-xl">
  <MarkdownContent content={message.content} />
</div>
```

---

## 代码高亮

### CodeBlock 组件实现

**位置**：`apps/web/src/components/chat/code-block.tsx`

```
'use client';

import { useState, useCallback, memo } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({
  language,
  children,
  className
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // ============ 复制代码功能 ============
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 rounded-t-xl border-b border-slate-700">
        {/* 语言标签 */}
        <span className="text-xs font-medium text-slate-400 uppercase">
          {language}
        </span>

        {/* 复制按钮 */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>

      {/* 代码内容 */}
      <div className="overflow-x-auto">
        <pre className={`!mt-0 !rounded-t-none ${className}`}>
          <code className={`language-${language}`}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
});
```

### highlight.js 配置

```
// 导入 highlight.js 样式
import 'highlight.js/styles/github-dark.css';

// 在 rehype-highlight 插件中自动应用
import rehypeHighlight from 'rehype-highlight';

<ReactMarkdown
  rehypePlugins={[rehypeHighlight]}
  // ...
>
  {content}
</ReactMarkdown>
```

### 支持的编程语言

highlight.js 自动识别以下语言（部分列表）：

- JavaScript / TypeScript
- Python
- Java / C / C++
- Go / Rust
- HTML / CSS
- SQL
- Bash / Shell
- JSON / YAML
- Markdown
- 等 180+ 种语言

---

## 接口封装

### API 路由设计

```
POST /api/chat
```

**请求体**：

```typescript
interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: Attachment[];
  }>;
  provider: 'xunfei' | 'doubao';
  model?: string;
}
```

**响应**：

```
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked

流式文本内容...
```

### Provider 适配层

**位置**：`packages/providers/`

```typescript
// ============ 创建 Provider ============
export function createProvider(provider: ProviderName) {
  switch (provider) {
    case 'xunfei':
      return createXunfeiProvider();
    case 'doubao':
      return createDoubaoProvider();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ============ 讯飞星火 Provider ============
export function createXunfeiStreamResponse(options: {
  model: string;
  messages: XunfeiMessage[];
  stream: boolean;
}): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // 构建 WebSocket 连接
        const ws = await connectXunfeiWebSocket(options);

        // 监听消息
        ws.on('message', (data) => {
          const response = JSON.parse(data.toString());
          const content = response.payload?.choices?.text?.[0]?.content;

          if (content) {
            controller.enqueue(encoder.encode(content));
          }

          // 检查是否结束
          if (response.header?.status === 2) {
            controller.close();
            ws.close();
          }
        });

        ws.on('error', (error) => {
          controller.error(error);
        });
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ============ 豆包 Provider ============
export async function createDoubaoStreamResponse(options: {
  model: string;
  messages: any[];
  stream: boolean;
}): Promise<Response> {
  const arkApiKey = process.env.ARK_API_KEY;
  const arkBaseUrl = process.env.ARK_BASE_URL;

  const response = await fetch(`${arkBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arkApiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: options.messages,
      stream: true,
    }),
  });

  return response;
}
```

### 错误处理

```
// ============ 统一错误处理 ============
try {
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(requestBody),
    signal: abortController.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `请求失败: ${response.status}`);
  }

  // 处理流...
} catch (err) {
  // 取消请求不算错误
  if (err instanceof Error && err.name === 'AbortError') {
    return;
  }

  // 显示错误信息
  const error = err instanceof Error ? err : new Error('未知错误');
  set({ error });

  // 移除错误的消息
  set((state) => ({
    messages: state.messages.filter((msg) => msg.id !== assistantMessage.id),
  }));
}
```

---

## 状态管理

### Zustand Store 架构

```
// ============ Chat Store 结构 ============
interface ChatState {
  // 状态
  messages: Message[]; // 当前对话的消息列表
  input: string; // 输入框内容
  isLoading: boolean; // 是否正在加载
  error: Error | null; // 错误信息
  provider: ProviderName; // AI 提供商
  model: string | undefined; // 模型名称
  activeConversationId: string | null; // 当前对话 ID
  attachment: Attachment | null; // 当前附件

  // Actions
  setInput: (value: string) => void;
  setMessages: (messages: Message[]) => void;
  switchProvider: (provider: ProviderName, model?: string) => void;
  setAttachment: (attachment: Attachment | null) => void;
  sendMessage: (content?: string) => Promise<void>;
  reload: (msgId?: string) => Promise<void>;
  stop: () => void;
  loadConversation: (id: string, messages: Message[], provider: string, model: string) => void;
  reset: () => void;
}
```

### 持久化配置

```
// ============ Conversations Store（持久化） ============
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      isLoaded: false,

      // ... actions
    }),
    {
      name: 'conversations-storage', // localStorage key
      onRehydrateStorage: () => (state) => {
        // 数据加载完成后的回调
        if (state) {
          state.isLoaded = true;
        }
      },
    }
  )
);
```

### Store 之间的通信

```
// ============ Chat Store 更新 Conversations Store ============
sendMessage: async (content) => {
  // ... 发送逻辑

  // 同步消息到对话列表
  if (activeConversationId) {
    useConversationsStore.getState().updateMessages(activeConversationId, newMessages);
  }

  // 保存到历史记录
  useHistoryStore.getState().addItem({
    id: activeConversationId,
    type: 'chat',
    messages: newMessages,
    provider,
    model,
  });
};
```

---

## 附件上传

### 图片上传（Base64）

**位置**：`apps/web/src/components/chat/chat-input.tsx`

```
// ============ 图片上传处理 ============
const handleImageSelect = useCallback(
  async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    // 2. 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    // 3. 创建临时附件对象
    const tempAttachment: Attachment = {
      id: `img-${Date.now()}`,
      type: 'image',
      name: file.name,
      size: file.size,
      status: 'uploading',
    };
    setAttachment(tempAttachment);

    try {
      // 4. 转换为 base64
      const reader = new FileReader();

      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachment({
          ...tempAttachment,
          imageUrl: base64, // 保存 base64 数据
          status: 'ready',
        });
      };

      reader.onerror = () => {
        setAttachment({
          ...tempAttachment,
          status: 'error',
          error: '图片读取失败',
        });
      };

      reader.readAsDataURL(file); // 开始读取
    } catch (error) {
      setAttachment({
        ...tempAttachment,
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },
  [setAttachment]
);
```

### 文件上传（服务器）

```
// ============ PDF 文件上传处理 ============
const handleFileSelect = useCallback(
  async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. 验证文件类型（仅 PDF）
    if (file.type !== 'application/pdf') {
      toast.error('仅支持 PDF 格式');
      return;
    }

    // 2. 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      toast.error('文件大小不能超过 5MB');
      return;
    }

    // 3. 创建临时附件对象
    const tempAttachment: Attachment = {
      id: `file-${Date.now()}`,
      type: 'file',
      name: file.name,
      size: file.size,
      status: 'uploading',
    };
    setAttachment(tempAttachment);

    try {
      // 4. 上传到服务器
      const formData = new FormData();
      formData.append('file', file);

      // 设置超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('/api/files', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '上传失败');
      }

      // 5. 更新附件状态
      setAttachment({
        ...tempAttachment,
        fileId: result.fileId, // 保存服务器返回的文件 ID
        status: 'ready',
      });
    } catch (error) {
      let displayError = '上传失败';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          displayError = '上传超时，请检查网络连接';
        } else {
          displayError = error.message;
        }
      }

      setAttachment({
        ...tempAttachment,
        status: 'error',
        error: displayError,
      });
    }
  },
  [setAttachment]
);
```

### 文件上传 API

**位置**：`apps/web/src/app/api/files/route.ts`

```
// ============ 文件上传 API ============
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // 验证文件类型
    if (file.type !== 'application/pdf') {
      return Response.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    // 验证文件大小
    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'File size exceeds 5MB' }, { status: 400 });
    }

    // 上传到豆包 Files API
    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL;

    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('purpose', 'file-extract');

    const response = await fetch(`${arkBaseUrl}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
      },
      body: uploadFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const result = await response.json();

    return Response.json({
      success: true,
      fileId: result.id, // 返回文件 ID
      filename: result.filename,
      bytes: result.bytes,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

// ============ 文件删除 API ============
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');

    if (!fileId) {
      return Response.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL;

    const response = await fetch(`${arkBaseUrl}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Delete failed');
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('File delete error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
```

### 附件预览组件

```
// ============ 附件预览组件 ============
const AttachmentPreview = memo(function AttachmentPreview({
  attachment
}: {
  attachment: Attachment
}) {
  // 图片预览
  if (attachment.type === 'image' && attachment.imageUrl) {
    return (
      <div className="relative group mb-2">
        <img
          src={attachment.imageUrl}
          alt={attachment.name}
          className="max-w-[300px] max-h-[200px] rounded-lg object-cover border"
        />
        <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
          {attachment.name}
        </div>
      </div>
    );
  }

  // 文件预览
  if (attachment.type === 'file') {
    return (
      <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 mb-2">
        <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center">
          <FileText className="w-4 h-4 text-red-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          {attachment.size && (
            <p className="text-xs opacity-70">
              {(attachment.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
});
```

---

## 性能优化

### 1. 组件 Memo 化

```
// 使用 React.memo 避免不必要的重渲染
export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  // ...
});

const StreamingContent = memo(function StreamingContent({ content }: { content: string }) {
  // ...
});

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // ...
});
```

### 2. useMemo 缓存计算

```
// 缓存 Markdown components 配置
const components = useMemo(
  () => ({
    code({ node, inline, className, children, ...props }: any) {
      // ...
    },
  }),
  []
);

// 缓存搜索过滤结果
const filteredGroups = useMemo(() => {
  if (!searchQuery.trim()) return groupedConversations;
  // ... 过滤逻辑
}, [groupedConversations, searchQuery]);
```

### 3. useCallback 缓存函数

```
// 缓存事件处理函数
const handleSend = useCallback(
  (content: string) => {
    // ...
  },
  [currentConversationId, createConversation, provider, model]
);

const handleCopy = useCallback(() => {
  navigator.clipboard.writeText(message.content);
}, [message.content]);
```

### 4. 虚拟滚动（可选）

对于超长对话，可以使用虚拟滚动优化性能：

```
import { useVirtualizer } from '@tanstack/react-virtual';

function MessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,  // 估计每条消息高度
    overscan: 5,  // 预渲染 5 条
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageItem message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 常见问题

### 1. 流式响应中断

**问题**：用户刷新页面或切换对话时，流式请求没有正确中断。

**解决方案**：

```
// 使用 AbortController
let abortController: AbortController | null = null;

sendMessage: async () => {
  // 中断之前的请求
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  const response = await fetch('/api/chat', {
    signal: abortController.signal, // 传入 signal
  });

  // ...
};

// 组件卸载时清理
useEffect(() => {
  return () => {
    if (abortController) {
      abortController.abort();
    }
  };
}, []);
```

### 2. Markdown 渲染性能问题

**问题**：长文本 Markdown 渲染导致卡顿。

**解决方案**：

```
// 1. 只在流式结束后才渲染 Markdown
{isStreaming ? (
  <StreamingContent content={message.content} />  // 纯文本
) : (
  <MarkdownContent content={message.content} />   // Markdown
)}

// 2. 使用 React.memo 避免重复渲染
const MarkdownContent = memo(function MarkdownContent({ content }) {
  // ...
});

// 3. 缓存 components 配置
const components = useMemo(() => ({ /* ... */ }), []);
```

### 3. 自动滚动抖动

**问题**：流式更新时频繁滚动导致抖动。

**解决方案**：

```
// 使用 requestAnimationFrame 节流
let scrollPending = false;

useEffect(() => {
  if (!scrollPending) {
    scrollPending = true;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      scrollPending = false;
    });
  }
}, [messages]);
```

### 4. 附件上传失败

**问题**：文件上传后 AI 提示"文件正在处理中"。

**解决方案**：

```
// 等待文件处理就绪
async function waitForFileReady(fileId: string): Promise<boolean> {
  const maxWaitTime = 10000; // 最多等待 10 秒
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`/api/files/${fileId}`);
    const result = await response.json();

    if (result.status === 'active') {
      return true; // 文件就绪
    }

    await new Promise((resolve) => setTimeout(resolve, 500)); // 等待 500ms
  }

  return false; // 超时
}

// 在发送消息前检查
if (attachment?.fileId) {
  const isReady = await waitForFileReady(attachment.fileId);
  if (!isReady) {
    throw new Error('文件正在处理中，请稍后重试');
  }
}
```

---

## 总结

智能对话功能的核心实现要点：

1. **流式对话**：使用 ReadableStream + TextDecoder 实现逐字显示
2. **自动滚动**：useRef + useEffect 监听消息变化
3. **打字效果**：CSS 动画 + 条件渲染
4. **Markdown 渲染**：react-markdown + remark-gfm
5. **代码高亮**：rehype-highlight + highlight.js
6. **接口封装**：统一的 Provider 适配层
7. **状态管理**：Zustand + persist 中间件
8. **附件上传**：Base64（图片）+ 服务器（文件）

通过这些技术的组合，实现了一个功能完整、体验流畅的智能对话系统。

---

## 参考资料

- [Next.js 文档](https://nextjs.org/docs)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
- [react-markdown 文档](https://github.com/remarkjs/react-markdown)
- [highlight.js 文档](https://highlightjs.org/)
- [Fetch API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [ReadableStream - MDN](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
