'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  FolderGit2,
  CheckCircle2,
  History,
  RotateCcw,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deriveArtifactDepositState,
  getArtifactVersions,
  type ArtifactVersion,
  type SectionPatchFailureReason,
} from '@repo/shared';
import { CodeBlock } from '../code-block';
import { DepositArtifactDialog } from './deposit-artifact-dialog';
import { ArtifactDiffPanel } from './artifact-diff-panel';
import { ArtifactMarkdown } from './artifact-markdown';
import { ArtifactResizeHandle } from './artifact-resize-handle';
import { trackArtifactEvent } from '@/lib/events/artifact-events';
import { StreamingPatchPreview } from './artifact-section-preview';
import { HighlightedMarkdown } from './artifact-section-highlight';
import type { ArtifactType, Artifact } from '@repo/shared';

interface ArtifactWorkspaceProps {
  className?: string;
  isMobile?: boolean;
  /** 把文本预填到对话输入框（只预填，不自动发送；用于「让模型重试」） */
  onPrefillInput?: (text: string) => void;
  /** 桌面右栏拖拽调宽（仅桌面非全屏时显示手柄；移动端与全屏忽略） */
  resize?: {
    width: number;
    min: number;
    max: number;
    onChange: (width: number) => void;
    onCommit: (width: number) => void;
  };
}

/** 产物埋点输入：只取类型、当前版序号与内容长度，不触碰标题与正文（ADR-0037 §8） */
function eventInput(artifact: Artifact, versionSeq?: number) {
  const versions = getArtifactVersions(artifact);
  return {
    type: artifact.type,
    versionSeq: versionSeq ?? versions[versions.length - 1]?.seq ?? 1,
    contentLength: artifact.content.length,
  };
}

/** 改动章节高亮的持续时间（毫秒） */
const HIGHLIGHT_DURATION_MS = 4000;

/** 章节补丁未应用的原因文案 */
const PATCH_FAILURE_TEXT: Record<SectionPatchFailureReason, string> = {
  'not-found': '未找到该标题',
  duplicate: '标题重复，无法唯一定位',
  'not-heading-start': '补丁内容未以该标题开头',
};

/** 版本来源标注：整篇生成不标注，补丁合并标「章节修改」，回滚标「回滚自 vN」 */
function describeVersionSource(version: ArtifactVersion): string | null {
  if (version.source.kind === 'rollback') return `回滚自 v${version.source.fromSeq}`;
  if (version.source.kind === 'patch') return '章节修改';
  return null;
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

export function ArtifactWorkspace({ className, isMobile = false, onPrefillInput, resize }: ArtifactWorkspaceProps) {
  const artifacts = useChatStore((state) => state.artifacts);
  const activeArtifactId = useChatStore((state) => state.activeArtifactId);
  const isWorkspaceOpen = useChatStore((state) => state.isWorkspaceOpen);
  const setActiveArtifactId = useChatStore((state) => state.setActiveArtifactId);
  const closeWorkspace = useChatStore((state) => state.closeWorkspace);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const viewingVersions = useChatStore((state) => state.viewingVersions);
  const viewArtifactVersion = useChatStore((state) => state.viewArtifactVersion);
  const rollbackArtifactToVersion = useChatStore((state) => state.rollbackArtifactToVersion);

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSelectorMenu, setShowSelectorMenu] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  // 正在展示差异面板的产物 id（切换产物后自动收起）
  const [diffArtifactId, setDiffArtifactId] = useState<string | null>(null);

  // 获取当前活动产物（若 activeArtifactId 无效，默认回退到最后一个）
  const activeArtifact = useMemo(() => {
    if (!artifacts || artifacts.length === 0) return null;
    return artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[artifacts.length - 1];
  }, [artifacts, activeArtifactId]);

  // 补丁完成后短暂高亮被改章节：仅在本次挂载期间亲眼看到「流式 → 完成」的转换时触发，
  // 打开历史会话时不会对旧补丁重复高亮
  const [highlightSections, setHighlightSections] = useState<string[]>([]);
  const prevStatusRef = useRef<{ id: string; status: string } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSections = useMemo(
    () => (activeArtifact?.patchReport ?? []).filter((r) => r.status === 'applied').map((r) => r.section),
    [activeArtifact?.patchReport]
  );
  useEffect(() => {
    const previous = prevStatusRef.current;
    prevStatusRef.current = activeArtifact ? { id: activeArtifact.id, status: activeArtifact.status } : null;
    if (
      activeArtifact &&
      previous?.id === activeArtifact.id &&
      previous.status === 'streaming' &&
      activeArtifact.status === 'complete' &&
      appliedSections.length > 0
    ) {
      setHighlightSections(appliedSections);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightSections([]), HIGHLIGHT_DURATION_MS);
    }
  }, [activeArtifact, appliedSections]);
  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  // 复制代码或内容
  const handleCopy = useCallback(() => {
    if (!activeArtifact?.content) return;
    navigator.clipboard.writeText(activeArtifact.content);
    trackArtifactEvent('artifact.copy', eventInput(activeArtifact));
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
    trackArtifactEvent('artifact.export', eventInput(activeArtifact));
    toast.success('Markdown 文件已导出');
  }, [activeArtifact]);

  if (!isWorkspaceOpen || !activeArtifact) {
    return null;
  }

  const typeConfig = TYPE_CONFIG[activeArtifact.type] ?? TYPE_CONFIG.markdown;
  const IconComponent = typeConfig.icon;
  const isStreaming = activeArtifact.status === 'streaming';
  // 内容不完整（中止、失败或输出被截断）的产物；草稿被丢弃时保留的是上一版，不算未完成（ADR-0037）
  const isIncomplete = activeArtifact.status === 'error';
  const isDraftDiscarded = activeArtifact.notice === 'draft-discarded';
  // 最近一轮章节补丁中未应用的章节（失败章节与原因，ADR-0037）
  const failedPatches = (activeArtifact.patchReport ?? []).filter(
    (r): r is Extract<typeof r, { status: 'failed' }> => r.status === 'failed'
  );

  // 版本链（ADR-0037）：末尾版本即当前版；正在查看的历史版本缺失（被淘汰）时按查看当前版处理
  const versions = getArtifactVersions(activeArtifact);
  const currentVersion = versions[versions.length - 1];
  const viewingSeq = viewingVersions[activeArtifact.id];
  const viewedVersion =
    viewingSeq !== undefined && viewingSeq !== currentVersion?.seq
      ? versions.find((v) => v.seq === viewingSeq)
      : undefined;
  const isViewingHistory = viewedVersion !== undefined;
  const hasMultipleVersions = versions.length > 1;
  const currentSourceLabel = currentVersion ? describeVersionSource(currentVersion) : null;
  // 差异对照（ADR-0037 §7）：展示版本与其前一个正式版本对比；首版没有可对比的前一版
  const shownVersion = viewedVersion ?? currentVersion;
  const shownIndex = shownVersion ? versions.findIndex((v) => v.id === shownVersion.id) : -1;
  const diffBaseVersion = shownIndex > 0 ? versions[shownIndex - 1] : undefined;
  const canShowDiff = hasMultipleVersions && !!diffBaseVersion && !!shownVersion && activeArtifact.type !== 'image';
  const isDiffOpen = canShowDiff && diffArtifactId === activeArtifact.id;
  // 正文展示所查看版本的内容；复制、导出、入库始终针对当前版
  const displayContent = viewedVersion ? viewedVersion.content : activeArtifact.content;
  // 入库状态绑定版本：入库版本非当前版时提示「当前有新版本」
  const depositState = deriveArtifactDepositState(activeArtifact);
  // 头部文字按钮的触点高度：宽度由文案撑开，仅需保证高度
  const touchSize = isMobile ? 'h-11' : 'h-9';
  // 版本栏控件的触点尺寸：含纯图标按钮，宽度不由文案保证，故移动端宽高均不小于 44px（min-h-11 min-w-11）
  const barTouchSize = isMobile ? 'min-h-11 min-w-11' : 'h-9';
  // 补丁流式中的就地预览：仅当前版（非历史查看）时展示三块预览
  const isPatchStreaming = isStreaming && !!activeArtifact.patchDraft && !isViewingHistory;
  // 「让模型重试」：把失败章节标题预填到输入框，不自动发送；窄屏下工作台盖住输入框，预填后收起以便编辑
  const handleRetryFailedPatches = () => {
    if (!onPrefillInput || failedPatches.length === 0) return;
    const titles = failedPatches.map((r) => `- ${r.section}`).join('\n');
    onPrefillInput(
      `请重新修改产物《${activeArtifact.title}》中上次未能应用的章节，其余内容保持不变；section 请从标题目录中原样抄写标题行：\n${titles}`
    );
    if (isMobile) closeWorkspace();
  };

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
      {resize && !isMobile && !isFullscreen && <ArtifactResizeHandle {...resize} />}

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
          {isIncomplete && (
            <span
              data-testid="artifact-incomplete-badge"
              className="flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            >
              未完成
            </span>
          )}
        </div>

        {/* 右侧：操作栏按钮 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* 沉淀到知识库 / 已入库徽标 (ADR-0034) */}
          {activeArtifact.type !== 'image' && (
            depositState.status !== 'none' ? (
              <button
                data-testid="artifact-deposited-badge"
                onClick={() => setDepositDialogOpen(true)}
                title={`已沉淀至 ${activeArtifact.kbDeposit?.knowledgeBaseName || '知识库'}`}
                className={cn(
                  'flex items-center gap-1 rounded-lg bg-green-500/10 px-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-500/20 active:scale-95 dark:bg-green-500/20 dark:text-green-300',
                  touchSize
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                {depositState.status === 'stale' ? (
                  <>
                    {/* 窄屏也要看到「有新版本」这条关键状态 */}
                    <span className="sm:hidden">有新版本</span>
                    <span className="hidden sm:inline">{`已入库 v${depositState.depositedSeq}，当前有新版本`}</span>
                  </>
                ) : (
                  <span className="hidden sm:inline">已入库</span>
                )}
              </button>
            ) : (
              <button
                data-testid="deposit-to-kb-btn"
                onClick={() => setDepositDialogOpen(true)}
                aria-label="沉淀至知识库"
                title="沉淀至知识库"
                className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <FolderGit2 className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">存入知识库</span>
              </button>
            )
          )}

          {/* 入库版本落后于当前版时的「沉淀最新版」入口（沿用 ADR-0034 另存新文档语义） */}
          {activeArtifact.type !== 'image' && depositState.status === 'stale' && (
            <button
              data-testid="deposit-latest-btn"
              onClick={() => setDepositDialogOpen(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 active:scale-95',
                touchSize
              )}
            >
              <FolderGit2 className="h-4 w-4" />
              <span>沉淀最新版</span>
            </button>
          )}

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

      {/* 版本栏（ADR-0037）：多个版本时展示版本选择器；查看历史版本时只读并提供回滚 */}
      {hasMultipleVersions && currentVersion && (
        <div
          data-testid="artifact-version-bar"
          className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/80 px-4 py-2 dark:border-slate-800"
        >
          <div className="relative">
            <button
              data-testid="artifact-version-selector"
              onClick={() => setShowVersionMenu(!showVersionMenu)}
              aria-haspopup="listbox"
              aria-expanded={showVersionMenu}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-200/80 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                barTouchSize
              )}
            >
              <History className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>
                v{(viewedVersion ?? currentVersion).seq}
                {isViewingHistory ? '' : '（当前）'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>

            {showVersionMenu && (
              <div
                role="listbox"
                aria-label="产物版本"
                className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
              >
                {[...versions].reverse().map((version) => {
                  const isCurrentVersion = version.seq === currentVersion.seq;
                  const isSelected = (viewedVersion ?? currentVersion).seq === version.seq;
                  const sourceLabel = describeVersionSource(version);
                  return (
                    <button
                      key={version.id}
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`artifact-version-option-${version.seq}`}
                      onClick={() => {
                        viewArtifactVersion(activeArtifact.id, isCurrentVersion ? null : version.seq);
                        setShowVersionMenu(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs transition-colors',
                        isMobile ? 'min-h-11' : 'min-h-9',
                        isSelected
                          ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      )}
                    >
                      <span className="font-semibold tabular-nums">v{version.seq}</span>
                      {isCurrentVersion && <span>当前</span>}
                      {sourceLabel && <span className="text-slate-400">{sourceLabel}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 差异入口：对比当前展示版本与其前一个版本（首版无前一版则不提供） */}
          {canShowDiff && diffBaseVersion && shownVersion && (
            <button
              data-testid="artifact-diff-btn"
              onClick={() => {
                if (!isDiffOpen) {
                  trackArtifactEvent('artifact.diff_open', eventInput(activeArtifact, shownVersion.seq));
                }
                setDiffArtifactId(isDiffOpen ? null : activeArtifact.id);
              }}
              aria-pressed={isDiffOpen}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors active:scale-95',
                isDiffOpen
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                barTouchSize
              )}
            >
              <GitCompare className="h-3.5 w-3.5 shrink-0" />
              {isDiffOpen ? '返回正文' : '查看改动'}
            </button>
          )}

          {/* 当前版若由回滚产生，标注回滚来源 */}
          {!isViewingHistory && currentVersion?.source.kind === 'rollback' && (
            <span
              data-testid="artifact-rollback-source"
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {currentSourceLabel}
            </span>
          )}

          {/* 历史版本只读提示与回滚入口 */}
          {viewedVersion && (
            <>
              <span
                data-testid="artifact-history-readonly"
                role="status"
                className="text-[11px] text-slate-500 dark:text-slate-400"
              >
                正在查看历史版本 v{viewedVersion.seq}（只读），复制、导出、入库均针对当前版
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  data-testid="artifact-back-to-current"
                  onClick={() => viewArtifactVersion(activeArtifact.id, null)}
                  className={cn(
                    'rounded-lg px-3 text-xs text-slate-600 transition-colors hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800',
                    barTouchSize
                  )}
                >
                  返回当前版
                </button>
                {!isStreaming && (
                  <button
                    data-testid="artifact-rollback-btn"
                    onClick={() => {
                      trackArtifactEvent('artifact.rollback', eventInput(activeArtifact, viewedVersion.seq));
                      rollbackArtifactToVersion(activeArtifact.id, viewedVersion.seq);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20 active:scale-95',
                      barTouchSize
                    )}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    回滚到此版本
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 草稿丢弃提示：本次修改中止或失败，当前展示的是上一版 */}
      {isDraftDiscarded && (
        <div
          data-testid="artifact-draft-discarded-notice"
          role="status"
          className="flex-shrink-0 border-b border-amber-200/80 bg-amber-50 px-5 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
        >
          本次修改未完成，已保留上一版
        </div>
      )}

      {/* 章节补丁失败提示：逐条列出未应用的章节标题与原因，当前版保持不变 */}
      {failedPatches.length > 0 && (
        <div
          data-testid="artifact-patch-failures"
          role="alert"
          className="flex-shrink-0 border-b border-amber-200/80 bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="font-medium">{failedPatches.length} 处章节修改未应用，其余内容保持不变</p>
          <ul className="mt-1.5 space-y-1">
            {failedPatches.map((r, index) => (
              <li key={`${r.section}-${index}`} data-testid="artifact-patch-failure-item" className="break-words">
                <span className="font-mono">{r.section}</span>
                <span className="mx-1.5 opacity-60">·</span>
                <span>{PATCH_FAILURE_TEXT[r.reason]}</span>
              </li>
            ))}
          </ul>
          {onPrefillInput && (
            <button
              data-testid="artifact-patch-retry-btn"
              onClick={handleRetryFailedPatches}
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 active:scale-95 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60',
                barTouchSize
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              让模型重试
            </button>
          )}
        </div>
      )}

      {/* 产物正文渲染区域 */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {isDiffOpen && diffBaseVersion && shownVersion ? (
          <ArtifactDiffPanel
            fromSeq={diffBaseVersion.seq}
            fromContent={diffBaseVersion.content}
            toSeq={shownVersion.seq}
            toContent={shownVersion.content}
          />
        ) : activeArtifact.type === 'image' ? (
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
              {displayContent || '// 生成中...'}
            </CodeBlock>
          </div>
        ) : (
          isPatchStreaming && activeArtifact.patchDraft ? (
            <StreamingPatchPreview
              content={activeArtifact.content}
              section={activeArtifact.patchDraft.section}
              draft={activeArtifact.patchDraft.content}
            />
          ) : highlightSections.length > 0 && !isViewingHistory ? (
            <HighlightedMarkdown content={displayContent} sections={highlightSections} />
          ) : (
            <ArtifactMarkdown content={displayContent || '*(正在生成产物内容...)*'} />
          )
        )}
      </div>

      {/* 沉淀到知识库弹窗 */}
      <DepositArtifactDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        artifact={activeArtifact}
        sessionId={activeConversationId}
      />
    </div>
  );
}
