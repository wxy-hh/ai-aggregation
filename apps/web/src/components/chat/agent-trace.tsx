'use client';

// Agent 过程卡片：渲染 agent 模式下一轮回答里的工具调用过程。
//
// 折叠时序与 ThinkingBlock 完全同构（DESIGN.md 唯一的「流式折叠块」先例）：
//   工具执行期（流式中且尚无正文）默认展开 → 首个正文增量到达即自动折叠（仅这一次）
//   → 用户手动操作后不再被自动时序干预。
// 这样用户不必学第二套折叠心智，也不会在气泡里多出一个独立的状态面。
//
// 视觉语言同样对齐 ThinkingBlock（左线块，非玻璃卡片）：
// 卡片位于 AI 气泡内部的实色白面上，玻璃材质在这里没有可折射的底（DESIGN.md §4.1
// 玻璃用于容器级、内容区不实心玻璃），硬上玻璃等于白做。仅通过左线 + 弱化字号
// 与正文区分层级。

import { memo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  ImageIcon,
  Wrench,
} from 'lucide-react';
import type { ToolCallRecord } from '@repo/shared';
import { cn } from '@/lib/utils';

/** 工具名 → 中文展示名（未登记的工具直接显示原名，新增工具无需改这里也能渲染） */
const TOOL_LABELS: Record<string, string> = {
  web_fetch: '网页抓取',
  image_generate: '图像生成',
};

/** 工具名 → 图标 */
const TOOL_ICONS: Record<string, typeof Globe> = {
  web_fetch: Globe,
  image_generate: ImageIcon,
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

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

interface AgentTraceProps {
  toolCalls: ToolCallRecord[];
  /** 是否仍在流式中（终止态下不再有进行中动画） */
  isStreaming: boolean;
  /** 是否已有正文：首个正文增量到达即折叠（与 ThinkingBlock 同一分界点） */
  hasContent: boolean;
}

export const AgentTrace = memo(function AgentTrace({
  toolCalls,
  isStreaming,
  hasContent,
}: AgentTraceProps) {
  // 用户手动展开/收起的覆盖态：一旦设置，该消息内不再被自动时序干预
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const defaultExpanded = isStreaming && !hasContent;
  const expanded = userOverride ?? defaultExpanded;

  // 过程可见的关键：有调用正在执行时，折叠头本身也要能看出「此刻在动」
  const runningCount = toolCalls.filter((c) => c.status === 'running').length;
  const failedCount = toolCalls.filter((c) => c.status === 'failed').length;
  const runningName = toolCalls.find((c) => c.status === 'running')?.name;

  const headerText =
    runningCount > 0
      ? `正在${runningName ? `调用${toolLabel(runningName)}` : '调用工具'}…`
      : failedCount > 0
        ? `调用了 ${toolCalls.length} 个工具（${failedCount} 个失败）`
        : `调用了 ${toolCalls.length} 个工具`;

  return (
    <div
      data-testid="agent-trace"
      className="mb-3 rounded-xl border-l-2 border-slate-300 pl-3 dark:border-slate-600"
    >
      {/* 折叠头：整行可点；移动端 44px 热区，桌面 32px（与 ThinkingBlock 同规格） */}
      <button
        type="button"
        onClick={() => setUserOverride(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? '收起工具调用过程' : '展开工具调用过程'}
        className="flex min-h-[44px] w-full items-center gap-1.5 text-xs text-day-muted dark:text-slate-400 md:min-h-[32px]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className={cn(runningCount > 0 && 'text-blue-500')}>{headerText}</span>
      </button>

      {expanded && (
        <ul className="animate-in fade-in-0 space-y-1.5 pb-2 duration-fast">
          {toolCalls.map((call) => {
            const ToolIcon = TOOL_ICONS[call.name] ?? Wrench;
            return (
              <li key={call.id} className="flex items-start gap-2">
                <StatusIcon status={call.status} />
                <div className="min-w-0 flex-1 leading-5">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <ToolIcon className="h-3 w-3 shrink-0 text-slate-400" />
                    {/* shrink-0 + nowrap：否则窄屏下 Chinese 可在任意字间断行，
                        min-width:auto 会把工具名压成每行一个字（实测 12px 宽 × 4 行）。
                        截断交给右侧 flex-1 的参数摘要承担。 */}
                    <span className="shrink-0 whitespace-nowrap font-medium">
                      {toolLabel(call.name)}
                    </span>
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
            );
          })}
        </ul>
      )}
    </div>
  );
});
