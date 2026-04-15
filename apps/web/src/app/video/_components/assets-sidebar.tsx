'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Search, Grid, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AssetsSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex h-full">
      <AnimatePresence mode="popLayout">
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 80, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center py-4 gap-6 overflow-hidden"
          >
            {/* 资源标识 */}
            <div className="flex flex-col items-center gap-1 opacity-60">
              <Folder className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-widest uppercase">Assets</span>
            </div>

            {/* 搜索/过滤 */}
            <div className="flex flex-col gap-4 items-center w-full px-2">
              <button className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm">
                <Search className="w-5 h-5" />
              </button>
              <button className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm">
                <Grid className="w-5 h-5" />
              </button>
            </div>

            {/* 资源列表模拟 */}
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto no-scrollbar px-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden hover:border-blue-500 transition-colors cursor-pointer group shadow-sm"
                >
                  <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 group-hover:scale-110 transition-transform" />
                </div>
              ))}

              {/* 添加按钮 */}
              <button className="w-14 h-14 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-500 transition-all">
                <Plus className="w-6 h-6" />
              </button>
            </div>

            {/* 底部功能（如展开更多） */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 w-full flex flex-col items-center gap-4 py-2">
              <div className="w-8 h-1 bg-slate-200 dark:bg-slate-800 rounded-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 侧边切换按钮 */}
      <div className="h-full py-4 flex flex-col justify-end px-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-4 h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          {isOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
