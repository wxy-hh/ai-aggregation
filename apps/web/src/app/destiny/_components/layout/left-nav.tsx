'use client';

import Image, { type StaticImageData } from 'next/image';
import astrologyIcon from '@/assets/image/astrology.svg';
import qimendunjiaIcon from '@/assets/image/qimendunjia.svg';
import ziweiIcon from '@/assets/image/ziwei.svg';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';
import { BookOpen, LayoutGrid } from 'lucide-react';

type LeftNavIconProps = {
  className?: string;
  active?: boolean;
  /** 紫微结果态入夜:非激活图标换浅色滤镜 */
  night?: boolean;
};

function AssetImageIcon({
  className,
  src,
  active = false,
  night = false,
}: {
  className?: string;
  src: StaticImageData;
  active?: boolean;
  night?: boolean;
}) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      className={cn(
        className,
        'select-none object-contain',
        active
          ? 'brightness-0 invert'
          : night
            ? 'opacity-85 [filter:brightness(0)_saturate(100%)_invert(78%)_sepia(8%)_hue-rotate(210deg)]'
            : 'opacity-88 [filter:brightness(0)_saturate(100%)_invert(36%)_sepia(16%)_saturate(610%)_hue-rotate(181deg)_brightness(93%)_contrast(88%)]'
      )}
    />
  );
}

const ZiweiChartIcon: ComponentType<LeftNavIconProps> = ({ className, active, night }) => (
  <AssetImageIcon src={ziweiIcon} className={className} active={active} night={night} />
);

const QimenJiugongIcon: ComponentType<LeftNavIconProps> = ({ className, active, night }) => (
  <AssetImageIcon src={qimendunjiaIcon} className={className} active={active} night={night} />
);

const AstrologyChartIcon: ComponentType<LeftNavIconProps> = ({ className, active, night }) => (
  <AssetImageIcon src={astrologyIcon} className={className} active={active} night={night} />
);

const BaziGridIcon: ComponentType<LeftNavIconProps> = ({ className }) => <LayoutGrid className={className} />;

export type DestinyModuleKey = 'bazi' | 'ziwei' | 'qimen' | 'astrology';

const groups: Array<{
  title: string;
  items: Array<{
    key: DestinyModuleKey;
    label: string;
    icon: ComponentType<LeftNavIconProps>;
    iconClassName?: string;
  }>;
}> = [
  {
    title: '命理分析类别',
    items: [
      { key: 'bazi', label: '八字格局精批', icon: BaziGridIcon },
      {
        key: 'ziwei',
        label: '紫微斗数排盘',
        icon: ZiweiChartIcon,
        iconClassName: 'h-[22px] w-[22px]',
      },
      {
        key: 'qimen',
        label: '奇门遁甲演化',
        icon: QimenJiugongIcon,
        iconClassName: 'h-[22px] w-[22px]',
      },
      {
        key: 'astrology',
        label: '星座寰宇',
        icon: AstrologyChartIcon,
        iconClassName: 'h-[22px] w-[22px]',
      },
    ],
  },
];

export function LeftNav({
  activeModule = 'bazi',
  onModuleChange,
  night = false,
}: {
  activeModule?: DestinyModuleKey;
  onModuleChange?: (key: DestinyModuleKey) => void;
  /** 紫微结果态入夜(暮色三段式中间调) */
  night?: boolean;
}) {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm transition-colors duration-500',
            night
              ? 'border-[#E7C873]/25 bg-[#E7C873]/10'
              : 'bg-white/70 dark:bg-slate-800/70 border-white/40 dark:border-white/10'
          )}
        >
          <BookOpen
            className={cn(
              'w-5 h-5 transition-colors duration-500',
              night ? 'text-[#E7C873]' : 'text-[#4969E9] dark:text-indigo-400'
            )}
          />
        </div>
        <div className="min-w-0">
          <div
            className={cn(
              'text-sm font-extrabold truncate transition-colors duration-500',
              night ? 'font-song text-[#EDE7DA]' : 'text-slate-900 dark:text-white'
            )}
          >
            命理大师
          </div>
          <div
            className={cn(
              'text-xs truncate transition-colors duration-500',
              night ? 'text-[#8B87A0]' : 'text-slate-500 dark:text-slate-400'
            )}
          >
            多维解析 · 结构化报告
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <div
              className={cn(
                'text-[11px] font-bold tracking-[0.18em] uppercase mb-3 transition-colors duration-500',
                night ? 'text-[#6E6A86]' : 'text-slate-400 dark:text-slate-500'
              )}
            >
              {g.title}
            </div>
            <div className="space-y-2">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeModule;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onModuleChange?.(item.key)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition',
                      'border border-transparent',
                      !active &&
                        (night
                          ? 'hover:border-white/10 hover:bg-white/5'
                          : 'hover:border-white/60 dark:hover:border-white/10 hover:bg-white/45 dark:hover:bg-slate-800/45'),
                      active &&
                        (night
                          ? 'border-[#A78BFA]/35 bg-[#A78BFA]/15 text-[#EDE7DA] shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                          : 'bg-[#4969E9]/10 dark:bg-indigo-500/10 border-[#4969E9]/25 dark:border-indigo-500/25 shadow-sm text-slate-900 dark:text-white')
                    )}
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center border transition-colors duration-500',
                        active
                          ? night
                            ? 'border-[#8B5CF6] bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white shadow-[0_0_16px_rgba(139,92,246,0.45)]'
                            : 'bg-[#4969E9] dark:bg-indigo-500 border-[#4969E9] dark:border-indigo-500 text-white shadow-lg shadow-blue-500/25 dark:shadow-indigo-500/25'
                          : night
                            ? 'border-white/10 bg-white/5 text-[#B9B3CC]'
                            : 'bg-white/60 dark:bg-slate-800/60 border-white/50 dark:border-white/10 text-slate-600 dark:text-slate-300'
                      )}
                    >
                      <Icon className={item.iconClassName ?? 'h-4 w-4'} active={active} night={night} />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          'text-sm font-bold truncate transition-colors duration-500',
                          !active && (night ? 'text-[#B9B3CC]' : 'text-slate-700 dark:text-slate-200')
                        )}
                      >
                        {item.label}
                      </div>
                      {g.title === '命理分析类别' && (
                        <div
                          className={cn(
                            'text-xs truncate transition-colors duration-500',
                            night ? 'text-[#6E6A86]' : 'text-slate-500 dark:text-slate-400'
                          )}
                        >
                          点击进入分析模块
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
