'use client';

/**
 * astrology-interpretation-notice.tsx —— 文案区「解读暂不可用」卡（02 工单建卡，03 工单加失败重试）
 *
 * 何时出现：报告流给出 interpretation-unavailable（原因档 quota / model / not-wired）、本次提交
 * 没有任何解读分区到达（流中断），或从历史记录恢复的旧记录里没有存解读（解读未发起）。
 *
 * 诚实性约束：
 * - 不给「解读整理中」的无尽骨架——没有解读在途时就必须说出来；
 * - 不显示任何模板/mock 文案冒充 AI 产出（mock 文案库只做提示词样例与测试金样）；
 * - 只对解读层降级说话：明确告知星盘事实已经生成、可照常查看与点选，避免用户误以为整份报告失败；
 * - 提供「重试解读」入口（真值不重算：重试只重跑解读链路，星盘确定性一致）；
 * - 额度原因额外给登录 / 查看额度引导（额度耗尽对话框由接缝另行唤起，两处文案不重复报错）；
 * - 「记录里没有解读」档照实说清：解读服务早已接入，此处缺的是这份旧记录当时没存下的解读，
 *   不写「正在接入中」这种已经不符合事实的说明。
 */

import Link from 'next/link';
import { LockKeyhole, RefreshCw, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import type { AstrologyInterpretationReason } from '@/stores/destiny-workspace-store';
import { AstrologyCtaButton } from './astrology-cta-button';

/** not-saved：记录里没有存解读（旧记录 / 本次会话没有请求解读），与服务端原因档 not-wired 同槽位 */
type NoticeVariant = 'quota' | 'not-saved' | 'model' | 'unknown';

type NoticeContent = {
  title: string;
  body: string;
  hint: string;
};

const NOTICE_CONTENT: Record<NoticeVariant, NoticeContent> = {
  quota: {
    title: 'AI 解读需要额度',
    body: '你的星盘已经按真实星历算好了——行星落点、宫位与关键相位都可以照常查看与点选。本次解读没有开始，因为 AI 解读需要消耗额度。',
    hint: '额度恢复后点「重试解读」继续，星盘不会重算。',
  },
  model: {
    title: 'AI 解读没有完成',
    body: '本次 AI 解读超时或没有通过校验，暂时无法给出文案。你的星盘已经按真实星历算好——行星落点、宫位与关键相位都可以照常查看与点选。',
    hint: '可以点「重试解读」再试一次：重试只重新生成解读，星盘不会重算。',
  },
  'not-saved': {
    title: '这份记录只保存了星盘',
    body: '这条记录保存的是星盘真值——行星落点、宫位与关键相位都可以照常查看与点选；当时的 AI 解读没有随记录一起保存，所以本次没有解读内容可以还原。',
    hint: '点「重试解读」可以为这份星盘补上解读：只重新生成解读，星盘不会重算。',
  },
  unknown: {
    title: '解读暂时不可用',
    body: '本次没有取到解读结论，可以稍后重新测算再试。',
    hint: '你的星盘事实已经生成，不受影响，可照常查看与点选。',
  },
};

export function AstrologyInterpretationNotice({
  reason,
  onRetry,
}: {
  /** 降级原因档；null（本次会话未发起解读，如历史恢复）按「记录里没有存解读」口径说明 */
  reason: AstrologyInterpretationReason | null;
  /** 重试解读（重走报告流，真值确定性一致不重算）；缺省时不渲染重试入口 */
  onRetry?: () => void;
}) {
  const isAnonymous = useAuthStore((state) => state.user?.isAnonymous === true);
  const variant: NoticeVariant =
    reason === 'quota'
      ? 'quota'
      : reason === 'model'
        ? 'model'
        : reason === 'unknown'
          ? 'unknown'
          : 'not-saved';
  const content = NOTICE_CONTENT[variant];

  return (
    <section
      aria-label="AI 解读状态"
      className="rounded-[24px] border border-white/60 bg-white/85 p-5 shadow-[0_18px_48px_-24px_rgba(30,41,82,0.22)] backdrop-blur-xl backdrop-saturate-150 sm:p-6 dark:border-white/10 dark:bg-[#0D1226]/[0.88]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100/90 text-indigo-500 dark:bg-indigo-400/[0.14] dark:text-indigo-300"
        >
          {variant === 'quota' ? (
            <LockKeyhole className="h-5 w-5" strokeWidth={1.9} />
          ) : (
            <Sparkles className="h-5 w-5" strokeWidth={1.9} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white sm:text-lg">
            {content.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {content.body}
          </p>
          <p className="mt-2.5 text-xs leading-relaxed text-day-muted dark:text-night-muted">
            {content.hint}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {onRetry && (
              <AstrologyCtaButton onClick={onRetry}>
                <RefreshCw className="h-4 w-4" strokeWidth={2} />
                重试解读
              </AstrologyCtaButton>
            )}
            {variant === 'quota' && (
              <Link
                href={isAnonymous ? '/login' : '/profile'}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-indigo-300/70 bg-indigo-50/80 px-4 text-sm font-semibold text-indigo-600 transition-colors hover:border-indigo-400 hover:bg-indigo-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-indigo-300/25 dark:bg-indigo-400/10 dark:text-indigo-200 dark:hover:bg-indigo-400/20"
              >
                {isAnonymous ? '使用账号密码登录，获得更多额度' : '查看我的额度'}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
