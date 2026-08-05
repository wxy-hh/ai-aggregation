'use client';

/**
 * 星座寰宇 · 星语问答面板
 *
 * 报告内的受限追问：像一间静谧的「星盘旁对话室」。问题气泡为实体白卡，
 * AI 回答以浅蓝玻璃卡承载并标注引用的盘面事实。引导问题、安全拦截琥珀卡、
 * 每报告≤3 问（首问+2 追问），达上限输入框平滑收起为完成提示。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Send, Sparkles, ShieldAlert, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useAstrologyWorkspaceStore } from '@/stores/astrology-workspace-store';
import type { ChartFacts } from './astrology-types';

const GUIDED_QUESTIONS = [
  '我在亲密关系里最需要被理解的是什么？',
  '本周工作中适合主动争取什么？',
  '这个相位如何影响我的表达？',
];

const MAX_QA = 3;

type QAItem = {
  question: string;
  answer: string;
  sensitive?: boolean;
};

type AstrologyQaPanelProps = {
  chartFacts: ChartFacts;
  className?: string;
};

export function AstrologyQaPanel({ chartFacts, className }: AstrologyQaPanelProps) {
  const reduceMotion = useReducedMotion();
  const timePrecision = useAstrologyWorkspaceStore((s) => s.formData.timePrecision);
  const [items, setItems] = useState<QAItem[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);

  const askedCount = items.length;
  const reachedLimit = askedCount >= MAX_QA;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || asking || reachedLimit) return;
    setAsking(true);
    setInput('');
    try {
      const res = await authFetch('/api/destiny/astrology/qa', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          askedCount,
          chartFacts,
          timePrecision,
          provider: useDestinyWorkspaceStore.getState().provider,
        }),
      });
      const data = await res.json();
      setItems((cur) => [
        ...cur,
        { question: q, answer: data.answer ?? '暂时无法回答，请稍后再试。', sensitive: Boolean(data.sensitive) },
      ]);
    } catch {
      setItems((cur) => [...cur, { question: q, answer: '网络异常，请稍后重试。' }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className={cn('rounded-[24px] border border-white/60 bg-white/92 p-4 sm:p-6 dark:border-white/10 dark:bg-slate-900/92', className)}>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <MessageCircle className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        星语问答
      </h3>
      <p className="mb-4 text-xs text-slate-400">围绕这张本命盘追问，每份报告最多 {MAX_QA} 个问题。</p>

      {/* 引导问题 */}
      {askedCount === 0 && !asking && (
        <div className="mb-4 flex flex-wrap gap-2">
          {GUIDED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="min-h-11 rounded-full border border-indigo-500/25 bg-indigo-500/5 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-all hover:bg-indigo-500/10 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 问答记录 */}
      <div className="space-y-3">
        <AnimatePresence>
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {/* 用户问题（实体白卡） */}
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm border border-slate-200/70 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
                {item.question}
              </div>
              {/* AI 回答（浅蓝玻璃卡 / 敏感拦截琥珀卡） */}
              <div
                className={cn(
                  'w-fit max-w-[90%] rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-sm leading-relaxed',
                  item.sensitive
                    ? 'border-amber-500/30 bg-amber-500/8 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200'
                    : 'border-blue-500/20 bg-blue-500/6 text-slate-700 backdrop-blur-xl dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-slate-200'
                )}
              >
                {item.sensitive && <ShieldAlert className="mb-1 h-4 w-4 text-amber-500" />}
                {item.answer}
                {!item.sensitive && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-400 dark:text-indigo-300">
                    <Sparkles className="h-3 w-3" />
                    基于你的本命星盘事实
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {asking && (
          <div className="w-fit rounded-2xl rounded-bl-sm border border-blue-500/20 bg-blue-500/6 px-3.5 py-2.5 text-sm text-slate-400 dark:border-indigo-400/20 dark:bg-indigo-500/10">
            正在整理答案…
          </div>
        )}
      </div>

      {/* 输入区 / 上限提示 */}
      <AnimatePresence mode="wait">
        {reachedLimit ? (
          <motion.p
            key="limit"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400"
          >
            本次星语问答已完成，可重新打开报告后继续探索。
          </motion.p>
        ) : (
          <motion.div key="input" exit={{ opacity: 0, height: 0 }} className="mt-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ask(input)}
                placeholder="就这张星盘，问一个具体的问题…"
                aria-label="星语问答输入"
                disabled={asking}
                maxLength={200}
                className="h-11 flex-1 rounded-xl border border-slate-200/50 bg-white/80 px-4 text-sm text-slate-800 outline-none backdrop-blur-xl transition-all placeholder:text-slate-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800/50 dark:bg-slate-900/80 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={asking || !input.trim()}
                aria-label="发送问题"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_4px_10px_-2px_rgba(59,130,246,0.3)] transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="ml-1 mt-1.5 text-[10px] text-slate-400">
              还可提问 {MAX_QA - askedCount} 次 · 不涉及医疗、财务、法律的确定性判断
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
