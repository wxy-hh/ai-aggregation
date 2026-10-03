'use client';

// Agent 过程卡片：渲染 agent 模式下一轮回答里的工具调用过程与过程旁白（二期多步循环）。
//
// 折叠时序与 ThinkingBlock 同构（`userOverride ?? defaultExpanded` 先例），折叠信号
// 看工具运行态与正文（spec §5.1 / D10 / 二期 D-二期-6）：
//   流式中 且（尚无正文 **或** 仍有工具在跑）默认展开 → 收尾步正文开始流出且工具全部落定后
//   自动折叠（仅这一次）→ 用户手动操作后不再被自动时序干预。
// 二期语义下该公式天然覆盖多步循环：中间轮决策文本以 agent_note 进卡片、不进正文，
// 正文只在收尾步出现，故「无正文即展开」覆盖整个循环期间（含只有旁白、没有工具在跑的
// 中间轮），不会出现秒级折叠-展开抖动。
//
// 视觉语言同样对齐 ThinkingBlock（左线块，非玻璃卡片）：
// 卡片位于 AI 气泡内部的实色白面上，玻璃材质在这里没有可折射的底（DESIGN.md §4.1
// 玻璃用于容器级、内容区不实心玻璃），硬上玻璃等于白做。仅通过左线 + 弱化字号
// 与正文区分层级。

import { memo, useState, Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  ImageIcon,
  MessageSquareMore,
  Wrench,
} from 'lucide-react';
import type { AgentNote, ToolCallRecord } from '@repo/shared';
import { cn } from '@/lib/utils';

/** 工具名 → 中文展示名（未登记的工具直接显示原名，新增工具无需改这里也能渲染） */
const TOOL_LABELS: Record<string, string> = {
  web_fetch: '网页抓取',
  image_generate: '图像生成',
  web_search: '联网搜索',
};

/** 工具名 → 图标 */
const TOOL_ICONS: Record<string, typeof Globe> = {
  web_fetch: Globe,
  image_generate: ImageIcon,
  web_search: Globe,
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

interface AgentTraceProps {
  toolCalls: ToolCallRecord[];
  /** 过程旁白（二期多步循环）：beforeCallIndex = 插入到第几个工具调用之前；不进正文、不入历史 */
  agentNotes?: AgentNote[];
  /** 是否仍在流式中（终止态下不再有进行中动画） */
  isStreaming: boolean;
  /** 是否已有正文（折叠信号之一：无正文保持展开；有正文但仍有工具在跑也不折叠，见 D10） */
  hasContent: boolean;
}

export const AgentTrace = memo(function AgentTrace({
  toolCalls,
  agentNotes,
  isStreaming,
  hasContent,
}: AgentTraceProps) {
  // 用户手动展开/收起的覆盖态：一旦设置，该消息内不再被自动时序干预
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  // 过程可见的关键：有调用正在执行时，折叠头本身也要能看出「此刻在动」
  const runningCount = toolCalls.filter((c) => c.status === 'running').length;
  const failedCount = toolCalls.filter((c) => c.status === 'failed').length;
  const runningName = toolCalls.find((c) => c.status === 'running')?.name;

  // 取「应插入到第 index 个工具调用之前」的旁白行（扁平时间线混排，不按轮次分组）
  const notesBefore = (index: number) =>
    (agentNotes ?? []).filter((n) => n.beforeCallIndex === index);

  /**
   * 默认展开：流式中 且（尚未出正文 **或** 仍有工具在跑）。
   *
   * 后半条来自 spec §5.1 修订（决策 D10）：决策步正文可以先于 `tool_call` 到达
   * （模型常见的「我查一下」类过程前言）。若仍只以「正文到达」为折叠信号，
   * 卡片会在工具还没开始跑时就收起，用户失去「工具正在执行」的反馈。
   * 故改以**工具运行态**为准：工具全部落定后才自动折叠。
   */
  const defaultExpanded = isStreaming && (runningCount > 0 || !hasContent);
  const expanded = userOverride ?? defaultExpanded;

  const headerText =
    runningCount > 0
      ? `正在${runningName ? `调用${toolLabel(runningName)}` : '调用工具'}…`
      : toolCalls.length === 0
        ? // 旁白先于该轮 tool_call 到达（编排器步末先推旁白再执行工具），
          // 此刻还没有任何工具记录，不能显示「调用了 0 个工具」
          isStreaming
          ? '正在思考下一步…'
          : '过程记录'
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
          {toolCalls.map((call, index) => {
            const ToolIcon = TOOL_ICONS[call.name] ?? Wrench;
            return (
              <Fragment key={call.id}>
                {/* 该轮工具调用前的过程旁白（beforeCallIndex 锚定） */}
                {notesBefore(index).map((note, noteIndex) => (
                  <NoteRow key={`note-${index}-${noteIndex}`} text={note.text} />
                ))}
                <li className="flex items-start gap-2">
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
              </Fragment>
            );
          })}
          {/* 末尾旁白：最后一轮工具之后仍有旁白的兜底（正常协议下旁白总先于该轮工具，防御性渲染） */}
          {notesBefore(toolCalls.length).map((note, noteIndex) => (
            <NoteRow key={`note-tail-${noteIndex}`} text={note.text} />
          ))}
        </ul>
      )}
    </div>
  );
});
