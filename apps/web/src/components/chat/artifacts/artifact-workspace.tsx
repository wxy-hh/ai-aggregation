'use client';

import React, { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useChatStore } from '@/stores/chat-store';
import { cn } from '@/lib/utils';
import {
  FileText,
  Table,
  Code,
  Image as ImageIcon,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  X,
  ChevronLeft,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { CodeBlock } from '../code-block';
import { SafeParagraph } from '../markdown-utils';
import type { ArtifactType, Artifact } from '@repo/shared';

interface ArtifactWorkspaceProps {
  className?: string;
  isMobile?: boolean;
}

const TYPE_CONFIG: Record<
  ArtifactType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  markdown: { label: 'Markdown 研报', icon: FileText },
  table: { label: '对比表格', icon: Table },
  code: { label: '源码文件', icon: Code },
  image: { label: '生成图像', icon: ImageIcon },
};

export function ArtifactWorkspace({ className, isMobile = false }: ArtifactWorkspaceProps) {
  const artifacts = useChatStore((state) => state.artifacts);
  const activeArtifactId = useChatStore((state) => state.activeArtifactId);
  const isWorkspaceOpen = useChatStore((state) => state.isWorkspaceOpen);
  const setActiveArtifactId = useChatStore((state) => state.setActiveArtifactId);
  const closeWorkspace = useChatStore((state) => state.closeWorkspace);

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSelectorMenu, setShowSelectorMenu] = useState(false);

  // 获取当前活动产物（若 activeArtifactId 无效，默认回退到最后一个）
  const activeArtifact = useMemo(() => {
    if (!artifacts || artifacts.length === 0) return null;
    return artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[artifacts.length - 1];
  }, [artifacts, activeArtifactId]);

  // 复制代码或内容
  const handleCopy = useCallback(() => {
    if (!activeArtifact?.content) return;
    navigator.clipboard.writeText(activeArtifact.content);
    setCopied(true);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  }, [activeArtifact]);

  // 导出为 Markdown 文件
  const handleExportMarkdown = useCallback(() => {
    if (!activeArtifact?.content) return;
    const blob = new Blob([activeArtifact.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (activeArtifact.title || 'artifact').replace(/[\\/:*?"<>|]/g, '_');
    a.href = url;
    a.download = `${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Markdown 文件已导出');
  }, [activeArtifact]);

  if (!isWorkspaceOpen || !activeArtifact) {
    return null;
  }

  const typeConfig = TYPE_CONFIG[activeArtifact.type] ?? TYPE_CONFIG.markdown;
  const IconComponent = typeConfig.icon;
  const isStreaming = activeArtifact.status === 'streaming';

  return (
    <div
      data-testid={isMobile ? 'mobile-artifact-overlay' : 'artifact-workspace'}
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden',
        isMobile
          ? 'fixed inset-0 z-50 bg-slate-50 pb-safe dark:bg-slate-950'
          : isFullscreen
            ? 'fixed inset-0 z-50 bg-slate-50/95 backdrop-blur-xl dark:bg-slate-950/95'
            : 'w-full rounded-[24px] border border-slate-200/80 bg-white/80 shadow-[0_12px_36px_rgba(76,95,154,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80',
        className
      )}
    >
      {/* 顶部操作与切换栏 */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200/80 px-4 dark:border-slate-800">
        {/* 左侧：返回（移动端）或标题/产物切换选择器 */}
        <div className="flex min-w-0 flex-1 items-center gap-2 mr-2">
          {/* 移动端专属大热区返回按钮（≥44x44px） */}
          {isMobile && (
            <button
              onClick={closeWorkspace}
              aria-label="返回对话"
              className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* 产物选择器 / 标题 */}
          <div className="relative min-w-0 flex-1">
            {artifacts.length > 1 ? (
              <div>
                <button
                  data-testid="artifact-selector"
                  onClick={() => setShowSelectorMenu(!showSelectorMenu)}
                  className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/80 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-200/80 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <IconComponent className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="max-w-[120px] truncate sm:max-w-[180px]">
                    {activeArtifact.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    {artifacts.length} 个产物
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>

                {/* 下拉切换菜单 */}
                {showSelectorMenu && (
                  <div className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900">
                    <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                      会话产物清单
                    </div>
                    {artifacts.map((item) => {
                      const ItemIcon = TYPE_CONFIG[item.type]?.icon ?? FileText;
                      const isCurrent = item.id === activeArtifact.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveArtifactId(item.id);
                            setShowSelectorMenu(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors',
                            isCurrent
                              ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                          )}
                        >
                          <ItemIcon className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.status === 'streaming' && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex max-w-[240px] items-center gap-2 sm:max-w-[280px]">
                <IconComponent className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {activeArtifact.title}
                </span>
              </div>
            )}
          </div>

          {/* 生成态呼吸指示 */}
          {isStreaming && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" />
              流式生成中
            </span>
          )}
        </div>

        {/* 右侧：操作栏按钮 */}
        <div className="flex shrink-0 items-center gap-1">
          {/* 一键复制 */}
          <button
            onClick={handleCopy}
            aria-label="复制产物内容"
            title="复制"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>

          {/* 导出 Markdown（非图片类型） */}
          {activeArtifact.type !== 'image' && (
            <button
              onClick={handleExportMarkdown}
              aria-label="导出 Markdown 文件"
              title="导出 Markdown"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Download className="h-4 w-4" />
            </button>
          )}

          {/* 全屏阅读模式（桌面端） */}
          {!isMobile && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              aria-label={isFullscreen ? '退出全屏' : '全屏预览'}
              title={isFullscreen ? '退出全屏' : '全屏预览'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          )}

          {/* 桌面端收起/关闭按钮 */}
          {!isMobile && (
            <button
              onClick={closeWorkspace}
              aria-label="收起工作台"
              title="收起工作台"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 产物正文渲染区域 */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {activeArtifact.type === 'image' ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-md dark:border-slate-800">
              <img
                src={activeArtifact.content}
                alt={activeArtifact.title}
                className="max-h-[600px] w-auto object-contain"
              />
            </div>
            <a
              href={activeArtifact.content}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              在新标签页查看原图
            </a>
          </div>
        ) : activeArtifact.type === 'code' ? (
          <div className="overflow-hidden rounded-xl">
            <CodeBlock language={activeArtifact.language || 'typescript'}>
              {activeArtifact.content || '// 生成中...'}
            </CodeBlock>
          </div>
        ) : (
          <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-pre:p-0 prose-table:text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                p: SafeParagraph,
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children);
                  if (match || codeString.includes('\n')) {
                    return (
                      <CodeBlock language={match?.[1] || 'text'}>
                        {codeString}
                      </CodeBlock>
                    );
                  }
                  return (
                    <code
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {activeArtifact.content || '*(正在生成产物内容...)*'}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
