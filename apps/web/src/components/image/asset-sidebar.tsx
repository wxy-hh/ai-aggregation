'use client';

import { cn } from '@/lib/utils';

interface AssetSidebarProps {
  className?: string;
}

const historyImages = [
  { id: 1, gradient: 'from-blue-400 to-cyan-300' },
  { id: 2, gradient: 'from-purple-400 to-pink-300' },
  { id: 3, gradient: 'from-amber-400 to-orange-300' },
  { id: 4, gradient: 'from-emerald-400 to-teal-300' },
];

export function AssetSidebar({ className }: AssetSidebarProps) {
  return (
    <div
      className={cn(
        'hidden lg:flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-80 shrink-0',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <svg
            className="w-4 h-4 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className="text-xs font-bold text-slate-500 tracking-wider uppercase">资产中心</h2>
        </div>
        <div className="text-[10px] text-slate-400">ASSET DOCK & CROSS-MODULE</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Active Reference Card */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400">
              正在引用 (ACTIVE REF)
            </h3>
          </div>

          <div className="relative group p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl hover:shadow-md transition-all cursor-pointer">
            <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-blue-500 rounded-r-full"></div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-300">
                <span className="text-lg font-serif">"</span>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                  语音转写片段 #024
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 italic">
                  "...一只在霓虹灯雨夜中行走的赛博格猫咪，毛发呈现金属光泽，背景是高耸的摩天大楼..."
                </p>

                <div className="flex items-center justify-between mt-3 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800">
                    Source: Meeting_A.mp3
                  </span>
                  <span className="text-slate-400">14:02</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Assets Grid */}
        <div>
          <div className="flex items-center justify-between mb-3 text-xs">
            <h3 className="font-bold text-slate-500 dark:text-slate-400">最近生成的素材</h3>
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[10px]">
              24张
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {historyImages.map((img) => (
              <div
                key={img.id}
                className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer"
              >
                {/* Gradient Placeholder */}
                <div className={cn('absolute inset-0 bg-gradient-to-br', img.gradient)}></div>

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button className="p-1.5 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: GPU Quota */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">
            <span>算力配额</span>
            <span>1275 / 2000</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden mb-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full w-[65%]"></div>
          </div>
          <div className="text-[10px] text-slate-400">本月剩余额度 (消耗中...)</div>
        </div>
      </div>
    </div>
  );
}
