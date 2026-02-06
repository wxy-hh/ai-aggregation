'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, LayoutGrid, Clock, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ResourceSidebarProps {}

export function ResourceSidebar({}: ResourceSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="relative h-full z-20 flex">
      <AnimatePresence mode="popLayout">
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="h-full border-l border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                资源库
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="w-6 h-6 text-gray-400">
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
              {/* Category: History */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                  <Clock className="w-3 h-3" />
                  <span>最近生成</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="aspect-video bg-white/5 rounded-lg border border-white/5 overflow-hidden hover:border-white/20 transition-colors cursor-pointer group"
                    >
                      <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Category: Assets */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                  <Folder className="w-3 h-3" />
                  <span>项目素材</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="aspect-square bg-white/5 rounded-lg border border-white/5 overflow-hidden hover:border-white/20 transition-colors cursor-pointer"
                    >
                      <div className="w-full h-full flex items-center justify-center text-gray-700">
                        Asset {i}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <div className="h-full py-4 pl-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-4 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-r-lg hover:bg-white/10 transition-colors backdrop-blur-md"
        >
          <ChevronRight
            className={cn(
              'w-3 h-3 text-gray-400 transition-transform duration-300',
              isOpen ? 'rotate-0' : 'rotate-180'
            )}
          />
        </button>
      </div>
    </div>
  );
}
