'use client';

import { cn } from '@/lib/utils';

export type DestinyAmbientTone = 'blue' | 'violet' | 'indigo';

const TONE_ORB_CLASS: Record<
  DestinyAmbientTone,
  { primary: string; secondary: string; accent: string }
> = {
  blue: {
    primary: 'bg-blue-400/30 dark:bg-blue-500/22',
    secondary: 'bg-indigo-400/22 dark:bg-indigo-500/16',
    accent: 'bg-cyan-300/18 dark:bg-cyan-400/12',
  },
  violet: {
    primary: 'bg-violet-400/28 dark:bg-violet-500/20',
    secondary: 'bg-purple-400/20 dark:bg-purple-500/14',
    accent: 'bg-fuchsia-300/16 dark:bg-fuchsia-400/10',
  },
  indigo: {
    primary: 'bg-indigo-400/28 dark:bg-indigo-500/20',
    secondary: 'bg-violet-400/20 dark:bg-violet-500/14',
    accent: 'bg-sky-300/16 dark:bg-sky-400/10',
  },
};

/**
 * 命理页环境光层：多层柔光 + 轻网格，供玻璃卡片透出磨砂质感（DESIGN G-3 背光依赖）
 */
export function DestinyAmbientBackground({
  tone = 'blue',
  className,
}: {
  tone?: DestinyAmbientTone;
  className?: string;
}) {
  const orb = TONE_ORB_CLASS[tone];

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      {/* 底色渐变 */}
      <div
        className={cn(
          'absolute inset-0',
          'bg-[linear-gradient(165deg,#F8FAFF_0%,#EEF2F9_38%,#F3F6FC_72%,#E9EEF6_100%)]',
          'dark:bg-[linear-gradient(165deg,#07080D_0%,#0C0E16_42%,#10131C_100%)]'
        )}
      />

      {/* 主光斑：右上 */}
      <div
        className={cn(
          'absolute -right-[10%] -top-[12%] h-[min(560px,78vh)] w-[min(560px,78vh)] rounded-full blur-3xl',
          orb.primary
        )}
      />
      {/* 辅光斑：左下 */}
      <div
        className={cn(
          'absolute -bottom-[14%] -left-[12%] h-[min(480px,65vh)] w-[min(480px,65vh)] rounded-full blur-3xl',
          orb.secondary
        )}
      />
      {/* 点缀：中部偏左 */}
      <div
        className={cn(
          'absolute left-[18%] top-[42%] h-56 w-56 rounded-full blur-[88px] sm:h-72 sm:w-72',
          orb.accent
        )}
      />
      {/* 点缀：右下淡粉（打破单调） */}
      <div className="absolute bottom-[18%] right-[22%] h-40 w-40 rounded-full bg-rose-300/14 blur-3xl dark:bg-rose-400/8" />

      {/* 轻网格纹理 */}
      <div
        className={cn(
          'absolute inset-0 opacity-[0.35] dark:opacity-[0.12]',
          'bg-[linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)]',
          'bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_78%)]'
        )}
      />

      {/* 顶部高光边 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/20" />
    </div>
  );
}
