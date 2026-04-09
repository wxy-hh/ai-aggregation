'use client';

import { cn } from '@/lib/utils';
import { BookOpen, Compass, LayoutGrid, Sparkles } from 'lucide-react';

export type DestinyModuleKey = 'bazi' | 'ziwei' | 'qimen';

const groups: Array<{
  title: string;
  items: Array<{ key: DestinyModuleKey; label: string; icon: typeof LayoutGrid }>;
}> = [
  {
    title: '命理分析类别',
    items: [
      { key: 'bazi', label: '八字格局精批', icon: LayoutGrid },
      { key: 'ziwei', label: '紫微斗数排盘', icon: Sparkles },
      { key: 'qimen', label: '奇门遁甲演化', icon: Compass },
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
        <div className="w-10 h-10 rounded-2xl bg-white/70 border border-white/40 flex items-center justify-center shadow-sm">
          <BookOpen className="w-5 h-5 text-[#2F6BFF]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900 truncate">命理大师</div>
          <div className="text-xs text-slate-500 truncate">多维解析 · 结构化报告</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <div className="text-[11px] font-bold text-slate-400 tracking-[0.18em] uppercase mb-3">
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
                      'border border-transparent hover:border-white/60 hover:bg-white/45',
                      active && 'bg-[#2F6BFF]/10 border-[#2F6BFF]/25 shadow-sm text-slate-900'
                    )}
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center border',
                        active
                          ? 'bg-[#2F6BFF] border-[#2F6BFF] text-white shadow-lg shadow-blue-500/25'
                          : 'bg-white/60 border-white/50 text-slate-600'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={cn('text-sm font-bold truncate', !active && 'text-slate-700')}
                      >
                        {item.label}
                      </div>
                      {g.title === '命理分析类别' && (
                        <div className="text-xs text-slate-500 truncate">点击进入分析模块</div>
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
