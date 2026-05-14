'use client';

import Image, { type StaticImageData } from 'next/image';
import qimendunjiaIcon from '@/assets/image/qimendunjia.svg';
import ziweiIcon from '@/assets/image/ziwei.svg';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';
import { BookOpen, LayoutGrid } from 'lucide-react';

type LeftNavIconProps = {
  className?: string;
  active?: boolean;
};

function AssetImageIcon({
  className,
  src,
  active = false,
}: {
  className?: string;
  src: StaticImageData;
  active?: boolean;
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
          : 'opacity-88 [filter:brightness(0)_saturate(100%)_invert(36%)_sepia(16%)_saturate(610%)_hue-rotate(181deg)_brightness(93%)_contrast(88%)]'
      )}
    />
  );
}

const ZiweiChartIcon: ComponentType<LeftNavIconProps> = ({ className, active }) => (
  <AssetImageIcon src={ziweiIcon} className={className} active={active} />
);

const QimenJiugongIcon: ComponentType<LeftNavIconProps> = ({ className, active }) => (
  <AssetImageIcon src={qimendunjiaIcon} className={className} active={active} />
);

const BaziGridIcon: ComponentType<LeftNavIconProps> = ({ className }) => <LayoutGrid className={className} />;

export type DestinyModuleKey = 'bazi' | 'ziwei' | 'qimen';

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
    ],
  },
];

export function LeftNav({
  activeModule = 'bazi',
  onModuleChange,
}: {
  activeModule?: DestinyModuleKey;
  onModuleChange?: (key: DestinyModuleKey) => void;
}) {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/40 dark:border-white/10 flex items-center justify-center shadow-sm">
          <BookOpen className="w-5 h-5 text-[#2F6BFF] dark:text-indigo-400" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
            命理大师
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            多维解析 · 结构化报告
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-[0.18em] uppercase mb-3">
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
                        'hover:border-white/60 dark:hover:border-white/10 hover:bg-white/45 dark:hover:bg-slate-800/45',
                      active &&
                        'bg-[#2F6BFF]/10 dark:bg-indigo-500/10 border-[#2F6BFF]/25 dark:border-indigo-500/25 shadow-sm text-slate-900 dark:text-white'
                    )}
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center border',
                        active
                          ? 'bg-[#2F6BFF] dark:bg-indigo-500 border-[#2F6BFF] dark:border-indigo-500 text-white shadow-lg shadow-blue-500/25 dark:shadow-indigo-500/25'
                          : 'bg-white/60 dark:bg-slate-800/60 border-white/50 dark:border-white/10 text-slate-600 dark:text-slate-300'
                      )}
                    >
                      <Icon className={item.iconClassName ?? 'h-4 w-4'} active={active} />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          'text-sm font-bold truncate',
                          !active && 'text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {item.label}
                      </div>
                      {g.title === '命理分析类别' && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
