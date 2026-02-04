'use client';

import { cn } from '@/lib/utils';
import { FolderOpen, Quote, Eye, Cpu } from 'lucide-react';

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
        'hidden lg:flex flex-col h-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-l border-white/20 dark:border-white/5 w-80 shrink-0',
        className
      )}
    >
      {/* 头部 */}
      <div className="p-4 border-b border-white/20 dark:border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="w-4 h-4 text-blue-500" />
          <h2 className="text-xs font-bold text-slate-500 tracking-wider uppercase">资产中心</h2>
        </div>
        <div className="text-[10px] text-slate-400">ASSET DOCK & CROSS-MODULE</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* 活跃引用卡片 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400">
              正在引用 (ACTIVE REF)
            </h3>
          </div>

          <div className="relative group p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl hover:shadow-md transition-all cursor-pointer backdrop-blur-sm">
            <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-blue-500 rounded-r-full"></div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-300">
                <Quote className="w-4 h-4" />
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

        {/* 最近生成的素材网格 */}
        <div>
          <div className="flex items-center justify-between mb-3 text-xs">
            <h3 className="font-bold text-slate-500 dark:text-slate-400">最近生成的素材</h3>
            <span className="px-1.5 py-0.5 bg-white/50 dark:bg-slate-800/50 text-slate-500 rounded text-[10px] border border-slate-100 dark:border-slate-800">
              24张
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {historyImages.map((img) => (
              <div
                key={img.id}
                className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer shadow-sm hover:shadow-md transition-all border border-black/5 dark:border-white/5"
              >
                {/* 渐变占位图 */}
                <div className={cn('absolute inset-0 bg-gradient-to-br', img.gradient)}></div>

                {/* 遮罩层 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors shadow-lg">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 页脚：GPU 额度 */}
      <div className="p-4 border-t border-white/20 dark:border-white/5 bg-white/20 dark:bg-slate-900/20 backdrop-blur-md">
        <div className="bg-white/50 dark:bg-slate-800/50 border border-white/50 dark:border-white/10 rounded-xl p-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-3.5 h-3.5 text-blue-500" />
            <div className="flex items-center justify-between flex-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <span>算力配额</span>
              <span>1275 / 2000</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden mb-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full w-[65%] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
          </div>
          <div className="text-[10px] text-slate-400">本月剩余额度 (消耗中...)</div>
        </div>
      </div>
    </div>
  );
}
