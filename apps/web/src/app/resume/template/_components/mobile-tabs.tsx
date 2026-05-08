'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Edit3, Eye, Sparkles } from 'lucide-react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export type TabType = 'edit' | 'preview' | 'ai';

interface MobileTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'edit' as TabType, label: '编辑', icon: Edit3 },
  { id: 'preview' as TabType, label: '预览', icon: Eye },
  { id: 'ai' as TabType, label: 'AI 助手', icon: Sparkles },
];

export function MobileTabs({ activeTab, onTabChange }: MobileTabsProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="lg:hidden fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-[20px] border-b border-gray-200/50 dark:border-slate-700/50">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center flex-1 h-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2"
              aria-label={`切换到${tab.label}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* 图标 */}
              <Icon
                className={`w-5 h-5 mb-1 transition-colors ${
                  isActive ? 'text-[#2F6BFF]' : 'text-gray-500 dark:text-gray-400'
                }`}
              />

              {/* 标签文字 */}
              <span
                className={`text-xs font-medium transition-colors ${
                  isActive ? 'text-[#2F6BFF]' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </span>

              {/* 激活指示器 */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F6BFF]"
                  initial={false}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: 500,
                          damping: 30,
                        }
                  }
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
