'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { MessageItem, type Message } from '@/components/chat/message-item';
import { ChatInput } from '@/components/chat/chat-input';

// 生成唯一ID的工具函数
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        '你好！我是你的智能助手。关于你查询的报告，以下是主要内容概览：\n\n这份报告主要涵盖了以下几个关键趋势：\n\n*   **生成式 AI 的企业级落地**：从实验阶段转向实际生产环境，特别是在客户服务和自动化代码生成领域。\n*   **多模态模型的崛起**：GPT-4o 等模型能够同时处理文本、音频和图像，使得交互更加自然流畅。',
    },
    {
      id: 'init-2',
      role: 'user',
      content: '请帮我进一步分析其中关于"端侧 AI"的具体应用场景。',
    },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 使用 ref 追踪当前流式消息和中断状态
  const streamingRef = useRef<{
    messageId: string | null;
    intervalId: NodeJS.Timeout | null;
    aborted: boolean;
  }>({
    messageId: null,
    intervalId: null,
    aborted: false,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 清理函数
  useEffect(() => {
    return () => {
      if (streamingRef.current.intervalId) {
        clearInterval(streamingRef.current.intervalId);
      }
    };
  }, []);

  const handleSend = useCallback(async (content: string) => {
    // 如果正在流式输出，先中断
    if (streamingRef.current.intervalId) {
      clearInterval(streamingRef.current.intervalId);
      streamingRef.current.aborted = true;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    // 模拟 AI 响应
    const responseContent =
      "关于端侧 AI (Edge AI) 的具体应用场景，主要体现在以下几个方面：\n\n1.  **智能手机与可穿戴设备**\n    *   **实时翻译与语音助手**：无需联网即可进行低延迟的语音识别和翻译，保护隐私的同时提升响应速度。\n    *   **健康监测**：智能手表实时分析心率、血氧等数据，提供即时健康建议。\n\n2.  **智能家居**\n    *   **隐私保护监控**：本地处理摄像头画面，仅在检测到异常（如陌生人闯入、跌倒）时上传报警，减少数据传输和隐私泄露风险。\n    *   **语音控制**：离线语音指令识别，断网也能控制灯光窗帘。\n\n3.  **自动驾驶**\n    *   **实时决策**：车载芯片毫秒级处理传感器数据，进行障碍物识别和路径规划，确保行车安全。\n\n4.  **工业物联网 (IIoT)**\n    *   **预测性维护**：设备本地分析振动、温度数据，预测故障并提前预警，减少停机时间。\n\n端侧 AI 的核心优势在于**低延迟、高隐私保护和降低带宽成本**，是未来 AI 普及的关键一环。\n\n```javascript\n// 示例代码：边缘 AI 推理\nconst model = await loadModel('edge-ai-model.wasm');\nconst result = model.predict(inputData);\nconsole.log(result);\n```";

    const messageId = generateId();
    streamingRef.current.messageId = messageId;
    streamingRef.current.aborted = false;

    // 添加空的 AI 消息
    const responseMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages((prev) => [...prev, responseMessage]);

    // 使用分块更新而不是逐字更新，减少渲染次数
    const CHUNK_SIZE = 5; // 每次添加5个字符
    const chars = responseContent.split('');
    let currentIndex = 0;

    const interval = setInterval(() => {
      // 检查是否被中断
      if (streamingRef.current.aborted || streamingRef.current.messageId !== messageId) {
        clearInterval(interval);
        return;
      }

      if (currentIndex < chars.length) {
        const endIndex = Math.min(currentIndex + CHUNK_SIZE, chars.length);
        const chunk = chars.slice(0, endIndex).join('');

        setMessages((prev) => {
          return prev.map((msg) => (msg.id === messageId ? { ...msg, content: chunk } : msg));
        });

        currentIndex = endIndex;
      } else {
        // 流式完成
        clearInterval(interval);
        streamingRef.current.intervalId = null;
        streamingRef.current.messageId = null;

        setIsStreaming(false);
        setMessages((prev) => {
          return prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg));
        });
      }
    }, 50); // 50ms 更新一次，比之前的 30ms 慢一点，但更稳定

    streamingRef.current.intervalId = interval;
  }, []);

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-slate-50 dark:bg-dark-bg transition-colors">
        {/* Header */}
        <header className="flex-none px-6 py-4 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border flex items-center justify-between shadow-sm z-10">
          <h1 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            AI 趋势分析报告
          </h1>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300">
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              GPT-4o
              <svg
                className="w-3 h-3 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

            <button className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </button>
            <button className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="max-w-4xl mx-auto flex flex-col pt-4">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-none z-10">
          <ChatInput onSend={handleSend} isLoading={isStreaming} />
        </div>
      </div>
    </AppLayout>
  );
}
