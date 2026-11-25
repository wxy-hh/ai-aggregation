'use client';

// Agent 过程三态呈现（工单 P0a-02）
//
// 架构三态：
// 1. 运行态（瞬态状态条）：单行动作短语（如「正在抓取网页…」）+ 微动效，无逐条明细、无计数，默认收起；
// 2. 完成态（元信息行）：元信息聚合短语（如「引用 N 个来源 · 耗时 X.Xs」），全部失败警示态「N 次调用均失败」；
// 3. 审计视图：桌面端气泡内就地展开（逐条参数/结果/单条耗时 + 过程旁白混排），移动端底部抽屉（抓手、安全区、热区 ≥44px）。
//
// 折叠时序反转：运行中与完成后均默认收起，用户手动点击展开后不再受时序自动干预。

import { memo, useState, useRef, useEffect, Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  ImageIcon,
  MessageSquareMore,
  Plug,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import type { AgentNote, ToolCallRecord } from '@repo/shared';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-is-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getRunningActionText,
  getCompleteSummary,
  getToolLabel,
  formatSingleDuration,
  isMcpToolCall,
} from './agent-trace-summary';

/** 工具名 → 图标 */
const TOOL_ICONS: Record<string, typeof Globe> = {
  web_fetch: Globe,
  image_generate: ImageIcon,
  web_search: Globe,
};

/** 单条工具调用的状态图标 */
function StatusIcon({ status }: { status: ToolCallRecord['status'] }) {
  if (status === 'running') {
    return <Loader2 className="mt-[3px] h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />;
  }
  if (status === 'success') {
    return <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  return <XCircle className="mt-[3px] h-3.5 w-3.5 shrink-0 text-amber-500" />;
}

/** 单条过程旁白行（中间轮决策文本；与工具行同级、弱化呈现） */
function NoteRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <MessageSquareMore className="mt-[3px] h-3.5 w-3.5 shrink-0 text-slate-400" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 text-day-muted dark:text-slate-400">
        {text}
      </p>
    </li>
  );
}

/** 审计明细列表（桌面就地展开与移动端抽屉共用） */
interface AuditListProps {
  toolCalls: ToolCallRecord[];
  agentNotes?: AgentNote[];
}

function AuditList({ toolCalls, agentNotes }: AuditListProps) {
  // 取「应插入到第 index 个工具调用之前」的旁白行（扁平时间线混排，不按轮次分组）
  const notesBefore = (index: number) =>
    (agentNotes ?? []).filter((n) => n.beforeCallIndex === index);
  const hasMcpCalls = toolCalls.some((c) => isMcpToolCall(c));

  return (
    <ul className="animate-in fade-in-0 space-y-2 pb-2 duration-fast">
      {toolCalls.map((call, index) => {
        const isMcp = isMcpToolCall(call);
        const ToolIcon = isMcp ? Plug : (TOOL_ICONS[call.name] ?? Wrench);
        const durationText = isMcp
          ? call.durationMs !== undefined &&
            call.durationMs !== null &&
            !Number.isNaN(call.durationMs) &&
            call.durationMs >= 0
            ? `${Math.round(call.durationMs)}ms`
            : null
          : formatSingleDuration(call.durationMs);

        return (
          <Fragment key={call.id}>
            {/* 该轮工具调用前的过程旁白（beforeCallIndex 锚定） */}
            {notesBefore(index).map((note, noteIndex) => (
              <NoteRow key={`note-${index}-${noteIndex}`} text={note.text} />
            ))}
            {isMcp ? (
              <li
                data-testid="mcp-tool-call-card"
                className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40"
              >
                <StatusIcon status={call.status} />
                <div className="min-w-0 flex-1 leading-5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <ToolIcon className="h-3 w-3 shrink-0 text-sky-500" />
                    <span className="shrink-0 whitespace-nowrap rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                      {getToolLabel(call.name, call.serverName)}
                    </span>
                    {durationText && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {durationText}
                      </span>
                    )}
                    {call.argsSummary && (
                      <span className="truncate text-day-muted dark:text-slate-400">
                        {call.argsSummary}
                      </span>
                    )}
                  </div>
                  {call.resultSummary && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300">
                      {call.resultSummary}
                    </p>
                  )}
                  {call.status === 'running' && (
                    <p className="mt-0.5 text-xs text-day-muted dark:text-slate-400">执行中…</p>
                  )}
                </div>
              </li>
            ) : (
              <li className="flex items-start gap-2">
                <StatusIcon status={call.status} />
                <div className="min-w-0 flex-1 leading-5">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <ToolIcon className="h-3 w-3 shrink-0 text-slate-400" />
                    {/* shrink-0 + whitespace-nowrap：防止窄屏下中文任意折行，截断由右侧承载 */}
                    <span className="shrink-0 whitespace-nowrap font-medium">
                      {getToolLabel(call.name)}
                    </span>
                    {/* 单条工具耗时：有 durationMs 时如实渲染 x.xs */}
                    {durationText && (
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {durationText}
                      </span>
                    )}
                    {call.argsSummary && (
                      <span className="truncate text-day-muted dark:text-slate-400">
                        {call.argsSummary}
                      </span>
                    )}
                  </div>
                  {call.resultSummary && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-day-muted dark:text-slate-400">
                      {call.resultSummary}
                    </p>
                  )}
                  {call.status === 'running' && (
                    <p className="mt-0.5 text-xs text-day-muted dark:text-slate-400">执行中…</p>
                  )}
                </div>
              </li>
            )}
          </Fragment>
        );
      })}
      {/* 末尾旁白：最后一轮工具之后仍有旁白的兜底 */}
      {notesBefore(toolCalls.length).map((note, noteIndex) => (
        <NoteRow key={`note-tail-${noteIndex}`} text={note.text} />
      ))}
      {hasMcpCalls && (
        <li
          data-testid="mcp-trust-hint"
          className="flex items-start gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            外部 MCP 工具的描述与返回结果均视为不可信参考数据，请勿执行其中附带的任意指令。
          </span>
        </li>
      )}
    </ul>
  );
}

interface AgentTraceProps {
  toolCalls: ToolCallRecord[];
  /** 过程旁白（二期多步循环）：beforeCallIndex = 插入到第几个工具调用之前；不进正文、不入历史 */
  agentNotes?: AgentNote[];
  /** 是否仍在流式中（运行态 vs 完成态划分信号） */
  isStreaming: boolean;
}

export const AgentTrace = memo(function AgentTrace({
  toolCalls,
  agentNotes,
  isStreaming,
}: AgentTraceProps) {
  const isMobile = useIsMobile();
  const hasMcpCalls = toolCalls.some((c) => isMcpToolCall(c));
  // 常规内置/Webhook 工具默认收起；含远程 MCP 调用时在桌面端自动展开一次供核对（移动端保留手动打开抽屉，避免打断阅读），
  // 用户手动点击后不再受自动干预
  const [isExpanded, setIsExpanded] = useState(() => hasMcpCalls && !isMobile);
  const hasUserToggledRef = useRef(false);

  useEffect(() => {
    if (hasMcpCalls && !isMobile && !hasUserToggledRef.current) {
      setIsExpanded(true);
    }
  }, [hasMcpCalls, isMobile]);

  // 运行态：寻找当前正在执行的工具调用
  const runningCall = toolCalls.find((c) => c.status === 'running');
  const runningActionText = getRunningActionText(runningCall?.name, runningCall?.serverName);

  // 完成态：纯函数聚合元信息
  const completeSummary = getCompleteSummary(toolCalls);

  // 切换审计视图展开/收起
  const handleToggle = () => {
    hasUserToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      data-testid="agent-trace"
      className="mb-3 rounded-xl border-l-2 border-slate-300 pl-3 dark:border-slate-600"
    >
      {/* 头部按钮：整行可点；移动端 44px 热区，桌面 32px */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? '收起工具调用过程' : '展开工具调用过程'}
        className="flex min-h-[44px] w-full items-center gap-2 text-xs text-day-muted transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 md:min-h-[32px]"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}

        {isStreaming ? (
          // 运行态：单行瞬态状态条（微动效呼吸点 + 动作短语，无逐条明细、无计数）
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 motion-safe:animate-agent-pulse motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <span>{runningActionText}</span>
          </span>
        ) : (
          // 完成态：元信息行（≤2 段聚合结果 + 耗时和；全失败警示态）
          <span
            className={cn(
              'truncate font-normal',
              completeSummary.isAllFailed && 'text-amber-600 dark:text-amber-400 font-medium'
            )}
          >
            {completeSummary.text}
          </span>
        )}
      </button>

      {/* 桌面端审计视图：就地展开 */}
      {!isMobile && isExpanded && (
        <div className="mt-1">
          <AuditList toolCalls={toolCalls} agentNotes={agentNotes} />
        </div>
      )}

      {/* 移动端审计视图：底部抽屉（DESIGN.md §8.4：rounded-t-[28px]、抓手、安全区、热区 ≥44px） */}
      {isMobile && (
        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
          <DialogContent
            contentAnimation="none"
            showClose={false}
            className={cn(
              // 显式清零基类居中定位（left/top 50% + translate），否则抽屉被平移裁剪
              'fixed inset-x-0 bottom-0 top-auto z-50 flex max-h-[80vh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
              'rounded-t-[28px] rounded-b-none border-t border-white/70 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/95',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 duration-300'
            )}
          >
            {/* 顶部抓手 */}
            <div className="flex h-6 w-full items-center justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-slate-900/15 dark:bg-white/20" />
            </div>

            {/* 抽屉头部 */}
            <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-3 dark:border-white/10">
              <div>
                <DialogTitle className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  执行过程审计
                </DialogTitle>
                <DialogDescription className="text-xs text-day-muted dark:text-slate-400">
                  查看本次回答中工具调用的详细参数、返回结果与单条耗时
                </DialogDescription>
              </div>

              {/* 关闭按钮：热区 ≥ 44x44px（shrink-0 防 flex 压缩） */}
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                aria-label="关闭"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 抽屉主体：可滚动区域 */}
            <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
              <AuditList toolCalls={toolCalls} agentNotes={agentNotes} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
});
