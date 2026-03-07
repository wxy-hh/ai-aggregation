'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AIAssistantPanel } from './ai-assistant-panel';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useFocusReturn } from '@/hooks/use-focus-return';

/**
 * AI 助手抽屉组件属性
 */
interface AIDrawerProps {
  /** 是否打开抽屉 */
  isOpen: boolean;
  /** 关闭抽屉回调 */
  onClose: () => void;
}

/**
 * AI 助手抽屉组件
 *
 * 功能:
 * - 在 1024-1439px 视口下显示
 * - 从右侧滑入/滑出
 * - 点击遮罩层或关闭按钮关闭
 * - 使用 Framer Motion 实现流畅动画
 * - 支持焦点陷阱和焦点返回
 * - 支持 Escape 键关闭
 *
 * 对应需求: 9.2, 13.4, 13.5
 */
export function AIDrawer({ isOpen, onClose }: AIDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 焦点陷阱
  const drawerRef = useFocusTrap<HTMLDivElement>(isOpen);

  // 焦点返回
  useFocusReturn(isOpen);

  // 打开时自动聚焦到关闭按钮
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);
  // 按下 Escape 键关闭抽屉
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // 打开抽屉时禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            aria-hidden="true"
          />

          {/* 抽屉面板 */}
          <motion.div
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            className="
              fixed top-0 right-0 bottom-0
              w-[400px] max-w-[90vw]
              bg-[#F6F8FF] dark:bg-slate-900
              shadow-[-8px_0_32px_rgba(0,0,0,0.12)]
              z-50
              overflow-hidden
            "
            role="dialog"
            aria-modal="true"
            aria-label="AI 诊断助手"
          >
            {/* 关闭按钮 */}
            <div className="absolute top-4 right-4 z-10">
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="
                  p-2 rounded-lg
                  bg-white/80 dark:bg-slate-800/80
                  backdrop-blur-[20px]
                  border border-white/60 dark:border-slate-700/60
                  shadow-[0_4px_16px_rgba(0,0,0,0.08)]
                  hover:bg-white dark:hover:bg-slate-800
                  transition-all duration-150
                  focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                "
                aria-label="关闭 AI 助手"
              >
                <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
            </div>

            {/* AI 助手面板内容 */}
            <div className="h-full overflow-y-auto">
              <AIAssistantPanel />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
