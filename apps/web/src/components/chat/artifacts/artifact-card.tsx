'use client';

import React from 'react';
import { useChatStore } from '@/stores/chat-store';
import { cn } from '@/lib/utils';
import { FileText, Table, Code, Image as ImageIcon, ArrowUpRight, Sparkles } from 'lucide-react';
import type { ArtifactType } from '@repo/shared';

interface ArtifactCardProps {
  artifactId: string;
  className?: string;
}

const TYPE_CONFIG: Record<
  ArtifactType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  markdown: { label: '研报文档', icon: FileText },
  table: { label: '对比表格', icon: Table },
  code: { label: '代码文件', icon: Code },
  image: { label: '生成图像', icon: ImageIcon },
};

export function ArtifactCard({ artifactId, className }: ArtifactCardProps) {
  const artifact = useChatStore((state) => state.artifacts.find((a) => a.id === artifactId));
  const activeArtifactId = useChatStore((state) => state.activeArtifactId);
  const setActiveArtifactId = useChatStore((state) => state.setActiveArtifactId);
  const setWorkspaceOpen = useChatStore((state) => state.setWorkspaceOpen);

  if (!artifact) return null;

  const config = TYPE_CONFIG[artifact.type] ?? TYPE_CONFIG.markdown;
  const IconComponent = config.icon;
  const isActive = activeArtifactId === artifact.id;
  const isStreaming = artifact.status === 'streaming';

  const handleClick = () => {
    setActiveArtifactId(artifact.id);
    setWorkspaceOpen(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="artifact-card"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        'group relative my-2.5 flex items-center justify-between gap-3.5 rounded-2xl border p-3.5',
        'min-h-[56px] w-full max-w-md cursor-pointer select-none text-left transition-all duration-200',
        'bg-white/80 backdrop-blur-md dark:bg-slate-900/80',
        isActive
          ? 'border-blue-500/60 bg-blue-50/50 shadow-[0_4px_16px_rgba(59,130,246,0.12)] ring-2 ring-blue-500/20 dark:border-blue-500/60 dark:bg-blue-950/25'
          : 'border-slate-200/80 shadow-sm hover:border-blue-400/50 hover:bg-slate-50/70 hover:shadow-md dark:border-slate-800 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/60',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* 类型图标 */}
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
            isActive
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-900/40 dark:group-hover:text-blue-400'
          )}
        >
          <IconComponent className="h-5 w-5" />
        </div>

        {/* 标题与类型 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {artifact.title || '交付产物'}
            </span>
            {isStreaming && (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" />
                生成中
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span>{config.label}</span>
            {artifact.language && <span>· {artifact.language}</span>}
            {artifact.content && artifact.type !== 'image' && (
              <span>· {artifact.content.length} 字符</span>
            )}
          </div>
        </div>
      </div>

      {/* 右侧查看提示 */}
      <div className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
        <span className="hidden sm:inline">在工作台查看</span>
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </div>
  );
}
