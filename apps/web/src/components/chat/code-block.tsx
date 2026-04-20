import { useState } from 'react';
import { cn } from '@/lib/utils';

// 代码块组件的属性类型
interface CodeBlockProps {
  language: string; // 编程语言（如 javascript, python 等）
  children: string; // 代码内容
  className?: string; // 可选的自定义样式类名
}

/**
 * 代码块组件
 * 用于在聊天消息中展示代码，支持语法高亮和一键复制
 */
export function CodeBlock({ language, children, className }: CodeBlockProps) {
  // 复制状态：用于显示"已复制"提示
  const [copied, setCopied] = useState(false);

  /**
   * 复制代码到剪贴板
   */
  const handleCopy = () => {
    // 移除末尾的换行符后复制
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    // 显示"已复制"提示
    setCopied(true);
    // 2秒后恢复"复制"按钮
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-4 rounded-xl overflow-hidden bg-slate-900 mx-0">
      {/* 顶部工具栏：显示语言和复制按钮 */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/50 border-b border-white/10 text-xs text-slate-400">
        {/* 左侧：编程语言标签 */}
        <span className="font-mono">{language}</span>

        {/* 右侧：复制按钮 */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          {copied ? (
            // 已复制状态：显示绿色对勾图标
            <>
              <svg
                className="w-3.5 h-3.5 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>已复制</span>
            </>
          ) : (
            // 默认状态：显示复制图标
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>复制</span>
            </>
          )}
        </button>
      </div>

      {/* 代码内容区域：支持横向滚动 */}
      <div className="p-4 overflow-x-auto">
        <code className={className}>{children}</code>
      </div>
    </div>
  );
}
