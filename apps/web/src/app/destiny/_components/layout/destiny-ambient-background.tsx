'use client';

import { cn } from '@/lib/utils';

export type DestinyAmbientTone = 'blue' | 'violet' | 'indigo';

const TONE_ORB_CLASS: Record<
  DestinyAmbientTone,
  { primary: string; secondary: string; accent: string }
> = {
  blue: {
    primary: 'bg-blue-400/30 dark:bg-blue-500/20',
    secondary: 'bg-indigo-400/20 dark:bg-indigo-500/15',
    accent: 'bg-cyan-300/20 dark:bg-cyan-400/10',
  },
  violet: {
    primary: 'bg-violet-400/30 dark:bg-violet-500/20',
    secondary: 'bg-purple-400/20 dark:bg-purple-500/15',
    accent: 'bg-fuchsia-300/15 dark:bg-fuchsia-400/10',
  },
  indigo: {
    primary: 'bg-indigo-400/30 dark:bg-indigo-500/20',
    secondary: 'bg-violet-400/20 dark:bg-violet-500/15',
    accent: 'bg-sky-300/15 dark:bg-sky-400/10',
  },
};

/**
 * 命理页环境光层：多层柔光 + 轻网格，供玻璃卡片透出磨砂质感（DESIGN G-3 背光依赖）
 * night=true 时(紫微结果步)交叉渐变为深空夜底——页面级入夜,缝隙与边角全部沉入夜色
 */
export function DestinyAmbientBackground({
  tone = 'blue',
  night = false,
  className,
}: {
  tone?: DestinyAmbientTone;
  /** 页面级入夜(紫微结果步):白昼层与夜幕层 700ms 交叉渐变 */
  night?: boolean;
  className?: string;
}) {
  const orb = TONE_ORB_CLASS[tone];

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      {/* ═══ 白昼层(表单步 / 八字 / 奇门) ═══ */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          night ? 'opacity-0' : 'opacity-100'
        )}
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
        <div className="absolute bottom-[18%] right-[22%] h-40 w-40 rounded-full bg-rose-300/15 blur-3xl dark:bg-rose-400/10" />

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

      {/* ═══ 夜幕层(紫微结果步,暮色三段式的"房间底色") ═══ */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          night ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* 深空墨蓝渐变(与内容面板同源) */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#10152E_0%,#0A0E20_45%,#06081A_100%)]" />

        {/* 紫微星云：右上 */}
        <div className="absolute -right-[10%] -top-[12%] h-[min(560px,78vh)] w-[min(560px,78vh)] rounded-full bg-violet-600/15 blur-3xl" />
        {/* 鎏金星云：左下 */}
        <div className="absolute -bottom-[14%] -left-[12%] h-[min(480px,65vh)] w-[min(480px,65vh)] rounded-full bg-[#B8934A]/10 blur-3xl" />
        {/* 靛蓝星云：中部偏左 */}
        <div className="absolute left-[18%] top-[42%] h-56 w-56 rounded-full bg-indigo-500/10 blur-[88px] sm:h-72 sm:w-72" />

        {/* 轻网格纹理(夜色下进一步压低,仅作肌理) */}
        <div
          className={cn(
            'absolute inset-0 opacity-[0.06]',
            'bg-[linear-gradient(rgba(167,139,250,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(167,139,250,0.35)_1px,transparent_1px)]',
            'bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_78%)]'
          )}
        />
      </div>
    </div>
  );
}
