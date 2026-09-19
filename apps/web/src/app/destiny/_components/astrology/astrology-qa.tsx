'use client';

/**
 * astrology-qa.tsx —— 星语问答（设计文档 §6.7，10 工单建；04 工单切真实问答路由）
 *
 * - 仅在报告完成后出现（结果页洞察轨内）；问答状态以 calculatedAt 作 key，重算即重置，不跨报告携带。
 * - 每份报告每个会话最多 3 个用户问题（首问 + 2 次追问）：面板计数拦截，服务端按请求携带的
 *   已提问数二次强制，两层一致；达到上限给出文档原文提示。
 * - 回答由真实 LLM 经异步接缝产出（POST /api/destiny/astrology/copilot，协议见 qa-events.ts）：
 *   正文增量在等待气泡内逐字浮现，终帧替换为完整回答（引用只落在白名单事实与报告模块上，不绝对化）；
 *   敏感主题（医疗/财务/法律）由服务端前置拦截，返回安全话术 + 自我观察方向（琥珀色气泡）。
 * - 发送后用户气泡立即入列，等待期锁住输入与发送；回答到达即替换等待气泡。
 * - 形态：桌面端（≥1280px）在洞察轨内联展开对话面板（不新开页面、不遮挡星盘轮）；
 *   移动端使用既有底部抽屉（Dialog 底部滑入，关闭后焦点自动返回触发按钮）。
 * - 引用片可点击：模块引用定位到对应生活模块，事实引用定位回星盘轮星体（移动端先关抽屉再定位）。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircleQuestion, SendHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import type { ModuleId, ModuleReading } from '@/lib/astrology/interpretation';
import { ASTROLOGY_QA_MAX_QUESTIONS, type QaCitation } from '@/lib/astrology/qa-events';
import {
  abortAstrologyQaRequest,
  astrologyQaErrorMessage,
  requestAstrologyAnswer,
} from '@/lib/astrology/qa-request';
import { ASTROLOGY_CTA_GRADIENT_CLASS, AstrologyCtaButton } from './astrology-cta-button';

/** 引导问题（设计文档 §6.7 原文） */
const GUIDE_QUESTIONS = [
  '我在亲密关系里最需要被理解的是什么？',
  '本周工作中适合主动争取什么？',
  '这个相位如何影响我的表达？',
];

interface QaMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'answer' | 'blocked';
  citations?: QaCitation[];
}

/** 是否桌面宽度（≥1280px，对应 xl 断点；决定内联面板还是底部抽屉） */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return isDesktop;
}

export type AstrologyQaEntryProps = {
  facts: AstrologyChartFacts;
  modules: ModuleReading[];
  onLocateBody: (body: PlanetBody | null) => void;
  onLocateModule: (id: ModuleId) => void;
};

export function AstrologyQaEntry({ facts, modules, onLocateBody, onLocateModule }: AstrologyQaEntryProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const entryRef = useRef<HTMLButtonElement>(null);

  /** 对话状态托管在入口层：面板/抽屉开关不丢消息，3 问上限不被「关掉重开」绕过；
   *  重算后结果页整体重挂载（entryView 流转），状态自然随新报告重置，不跨报告携带 */
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [pending, setPending] = useState(false);
  /** 流式正文（等待气泡内逐字浮现）：终帧到达即被完整回答替换 */
  const [streaming, setStreaming] = useState('');
  const idRef = useRef(0);
  /** 在途问答的令牌：回答到达时只有最新一次请求允许落进消息列表（同一条等待气泡不得被串批覆盖） */
  const requestTokenRef = useRef(0);
  /** 卸载标记：问答在途时切走模块（组件卸载）后不再写状态；在途请求一并取消 */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortAstrologyQaRequest();
    };
  }, []);
  const asked = messages.filter((m) => m.role === 'user').length;
  const remaining = ASTROLOGY_QA_MAX_QUESTIONS - asked;
  const capped = remaining <= 0;

  const send = (text: string) => {
    const q = text.trim();
    if (!q || capped || pending) return;
    setMessages((prev) => [...prev, { id: ++idRef.current, role: 'user', text: q }]);
    setPending(true);
    setStreaming('');
    const token = ++requestTokenRef.current;
    // 真实问答：正文增量边到边渲染（等待气泡内逐字浮现），终帧给完整回答与白名单引用；
    // 已提问数随请求上行，服务端按同一上限二次强制。
    requestAstrologyAnswer(q, facts, modules, {
      askedCount: asked,
      onDelta: (delta) => {
        if (!aliveRef.current || token !== requestTokenRef.current) return;
        setStreaming((prev) => prev + delta);
      },
    })
      .then((answer) => {
        if (!aliveRef.current || token !== requestTokenRef.current) return;
        setMessages((prev) => [
          ...prev,
          { id: ++idRef.current, role: 'assistant', text: answer.text, kind: answer.kind, citations: answer.citations },
        ]);
        setPending(false);
        setStreaming('');
      })
      .catch((error) => {
        if (!aliveRef.current || token !== requestTokenRef.current) return;
        // 失败也要解开输入锁，否则面板会永远停在等待态；超限 / 额度不足沿用服务端中文提示
        setMessages((prev) => [
          ...prev,
          { id: ++idRef.current, role: 'assistant', text: astrologyQaErrorMessage(error) },
        ]);
        setPending(false);
        setStreaming('');
      });
  };

  /** 关闭内联面板后焦点返回触发按钮（抽屉由 Dialog 自带焦点归还） */
  const closeInline = () => {
    setOpen(false);
    entryRef.current?.focus();
  };

  const conversationProps = {
    messages,
    pending,
    streaming,
    remaining,
    capped,
    onSend: send,
    onLocateBody,
    onLocateModule,
  };

  return (
    <section
      aria-label="星语问答"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-all duration-300 dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]',
        open && isDesktop ? 'p-0' : 'p-5'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent dark:block"
      />

      {/* 桌面端：点击开始提问后，卡片原位蜕变为问答舱，彻底消除套娃边框与重复标题 */}
      {open && isDesktop ? (
        <div id="astro-qa-conversation">
          <QaConversation {...conversationProps} onRequestClose={closeInline} />
        </div>
      ) : (
        /* 收拢态：极简优雅的问答入口 */
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion
                className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]"
                strokeWidth={1.9}
              />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">星语问答</h3>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                capped
                  ? 'bg-slate-100 text-day-muted dark:bg-white/[0.06] dark:text-night-faint'
                  : asked > 0
                    ? 'bg-amber-100/80 text-amber-700 dark:bg-amber-400/[0.15] dark:text-amber-300'
                    : 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-400/[0.12] dark:text-indigo-300'
              )}
            >
              {capped ? '已完成 3 问' : asked > 0 ? `还可问 ${remaining} 次` : '每份报告 3 问'}
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
            带着你的星盘提问，回答只引用盘面已确认事实。
          </p>
          {/* 展开态随 open 变化：桌面为原位展开（控件在展开后不再渲染），移动端为底部对话框抽屉 */}
          <button
            ref={entryRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={open ? 'astro-qa-conversation' : undefined}
            aria-haspopup={isDesktop ? undefined : 'dialog'}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-indigo-300/60 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-indigo-300/30 dark:text-indigo-200 dark:hover:bg-indigo-400/10"
          >
            {asked > 0 ? '继续提问' : '开始提问'}
          </button>
        </div>
      )}

      {/* 移动端：底部半屏抽屉（关闭后焦点与滚动位置由 Dialog 归还触发处） */}
      {!isDesktop && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className={cn(
              'inset-x-0 bottom-0 top-auto flex max-h-[82vh] w-full max-w-none translate-x-0 translate-y-0 flex-col',
              'rounded-t-[28px] border border-white/60 p-0 pb-[env(safe-area-inset-bottom)]',
              'bg-white/95 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0D1226]/95',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
            )}
          >
            <DialogTitle className="sr-only">星语问答</DialogTitle>
            <DialogDescription className="sr-only">
              围绕当前星盘报告提问，回答只引用已确认事实，每份报告最多 3 问。
            </DialogDescription>
            <div id="astro-qa-conversation" className="min-h-0 flex-1">
              <QaConversation {...conversationProps} onRequestClose={() => setOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

/* ---------- 对话体（桌面内联与移动抽屉共用；状态由入口层托管） ---------- */

function QaConversation({
  messages,
  pending,
  streaming,
  remaining,
  capped,
  onSend,
  onLocateBody,
  onLocateModule,
  onRequestClose,
}: {
  messages: QaMessage[];
  pending: boolean;
  /** 流式正文（等待气泡内逐字浮现；空串时显示「正在思考」） */
  streaming: string;
  remaining: number;
  capped: boolean;
  onSend: (text: string) => void;
  onLocateBody: (body: PlanetBody | null) => void;
  onLocateModule: (id: ModuleId) => void;
  onRequestClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const asked = ASTROLOGY_QA_MAX_QUESTIONS - remaining;

  /** 新消息 / 流式正文更新时滚动到列表底部 */
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
  }, [messages, pending, streaming, reduceMotion]);

  const sendDraft = () => {
    onSend(draft);
    setDraft('');
  };

  /** 引用片点击：移动端先关抽屉再定位（避免抽屉遮挡目标） */
  const followCitation = (c: QaCitation) => {
    if (c.moduleId) {
      onRequestClose();
      // 等抽屉关闭动画起步后再滚动定位
      setTimeout(() => onLocateModule(c.moduleId!), 80);
    } else if (c.body !== undefined && c.body !== null) {
      onRequestClose();
      setTimeout(() => onLocateBody(c.body!), 80);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 头部：图标 + 标题 + 剩余次数 + 收起按钮 */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[0.08]">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion
            className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]"
            strokeWidth={1.9}
          />
          <p className="text-sm font-bold text-slate-900 dark:text-white">星语问答</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              capped
                ? 'bg-slate-100 text-day-muted dark:bg-white/[0.06] dark:text-night-faint'
                : 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-400/[0.12] dark:text-indigo-300'
            )}
          >
            {capped ? '已完成 3 问' : `还可问 ${remaining} 次`}
          </span>
          <button
            type="button"
            onClick={onRequestClose}
            aria-label="收起星语问答"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-day-muted transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-night-faint dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 消息区：role=log + polite 播报助手新回复；不用 assertive，避免抢读用户自己的提问与 pending 提示 */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="问答消息"
        className="max-h-[250px] min-h-[140px] flex-1 space-y-3 overflow-y-auto px-4 py-3 custom-scrollbar"
      >
        {messages.length === 0 && (
          <p className="text-xs leading-relaxed text-day-muted dark:text-night-faint">
            你的出生资料与盘面事实已作为上下文。可以问自己、关系、事业或某个相位——回答只引用盘面上已确认的事实。
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? cn('text-white', ASTROLOGY_CTA_GRADIENT_CLASS)
                  : m.kind === 'blocked'
                    ? 'border border-amber-300/50 bg-amber-50/80 text-amber-800 dark:border-amber-300/25 dark:bg-amber-400/[0.08] dark:text-amber-100'
                    : 'bg-slate-100/90 text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'
              )}
            >
              {m.text.split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? 'mt-1.5' : undefined}>
                  {line}
                </p>
              ))}
              {/* 引用片：模块 → 定位生活模块；事实 → 定位星盘轮；纯标签不可点 */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.citations.map((c, i) => {
                    const clickable = c.moduleId !== undefined || (c.body !== undefined && c.body !== null);
                    // 44px 热区只给可点的引用片；纯标签不是交互目标，保持紧凑（否则不可点胶囊白占高度）
                    const cls = 'inline-flex items-center rounded-full border px-2.5 text-[10px] font-medium';
                    return clickable ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => followCitation(c)}
                        className={cn(
                          cls,
                          'min-h-11',
                          m.kind === 'blocked'
                            ? 'border-amber-300/60 text-amber-700 hover:bg-amber-100/70 dark:border-amber-300/30 dark:text-amber-200 dark:hover:bg-amber-400/10'
                            : 'border-indigo-300/50 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-300/25 dark:text-indigo-200 dark:hover:bg-indigo-400/10',
                          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40'
                        )}
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span
                        key={i}
                        className={cn(cls, 'border-slate-300/50 text-day-muted dark:border-white/[0.12] dark:text-night-faint')}
                      >
                        {c.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {/* 回答在途：等待气泡（三点呼吸，减少动态时静态）；真实回答到达即被完整气泡替换。
            正文增量已到时在同一气泡内逐字浮现（aria-live="off"：逐字跳动不逐帧播报，
            完整回答作为新消息由 role=log 的 polite 播报一次） */}
        {pending && (
          <div className="flex justify-start">
            <div
              aria-live={streaming ? 'off' : undefined}
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5',
                streaming
                  ? 'bg-slate-100/90 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'
                  : 'flex items-center gap-2 text-xs text-day-muted dark:text-night-faint'
              )}
            >
              {streaming ? (
                streaming.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1.5' : undefined}>
                    {line}
                  </p>
                ))
              ) : (
                <>
                  <span aria-hidden className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="acw-thinking-dot h-1.5 w-1.5 rounded-full bg-indigo-400 dark:bg-indigo-300/80"
                        style={{ animationDelay: `${i * 0.16}s` }}
                      />
                    ))}
                  </span>
                  正在思考…
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 引导问题（尚未提问且未达上限时展示） */}
      {asked === 0 && !capped && (
        <div className="flex flex-col gap-1.5 px-4 pb-3">
          <p className="text-[11px] font-medium text-day-muted dark:text-night-faint">你可以试着这样问：</p>
          {GUIDE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSend(q)}
              disabled={pending}
              className="rounded-xl border border-indigo-100/80 bg-indigo-50/40 px-3 py-2 text-left text-xs leading-relaxed text-indigo-700 transition-colors hover:bg-indigo-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 disabled:opacity-50 dark:border-indigo-300/20 dark:bg-white/[0.04] dark:text-indigo-200 dark:hover:bg-indigo-400/10"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 输入区 / 上限提示 */}
      {capped ? (
        <p className="border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-day-muted dark:border-white/[0.08] dark:text-night-faint">
          本次星语问答已完成，可重新打开报告后继续探索。
        </p>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-white/[0.08]"
          onSubmit={(e) => {
            e.preventDefault();
            sendDraft();
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="问一个关于你星盘的问题…"
            aria-label="星语问答输入框"
            maxLength={120}
            disabled={pending}
            className="h-10 min-w-0 flex-1 rounded-full border border-slate-200/90 bg-white/70 px-4 text-sm text-slate-800 placeholder:text-day-muted focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.12] dark:bg-white/[0.05] dark:text-slate-100 dark:placeholder:text-night-faint"
          />
          <AstrologyCtaButton
            type="submit"
            size="icon"
            disabled={!draft.trim() || pending}
            aria-label="发送问题"
            className="shrink-0"
          >
            <SendHorizontal className="h-4 w-4" strokeWidth={2.2} />
          </AstrologyCtaButton>
        </form>
      )}
    </div>
  );
}
