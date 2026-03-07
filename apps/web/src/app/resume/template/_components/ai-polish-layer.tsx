'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * AI 润色浮层组件属性
 */
export interface AIPolishLayerProps {
  /** 是否显示浮层 */
  isOpen: boolean;
  /** 原始文本 */
  originalText: string;
  /** 优化后的文本 */
  optimizedText?: string;
  /** 是否加载中 */
  isLoading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 应用回调 */
  onApply: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 重试回调 */
  onRetry?: () => void;
  /** 点击外部区域回调 */
  onClickOutside?: () => void;
}

/**
 * AI 润色浮层组件
 *
 * 功能:
 * - 展示优化前后的内容对比
 * - 玻璃态设计风格 (backdrop-filter blur(28px))
 * - 提供"应用"和"取消"操作按钮
 * - 支持点击外部区域关闭
 * - 显示加载状态并禁用重复提交
 * - 显示错误提示和重试按钮
 * - 空内容时禁用润色按钮（在 ResumeInput/ResumeTextarea 中实现）
 * - 打开时自动聚焦到第一个可交互元素
 * - 支持 Escape 键关闭
 *
 * 对应需求: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 13.4, 13.5
 */
export function AIPolishLayer({
  isOpen,
  originalText,
  optimizedText,
  isLoading = false,
  error,
  onApply,
  onCancel,
  onRetry,
  onClickOutside,
}: AIPolishLayerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // 焦点陷阱
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  // 焦点返回
  useFocusReturn(isOpen);

  // 当浮层打开时，自动聚焦到关闭按钮
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // 监听 Escape 键关闭浮层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            onClick={onClickOutside}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            aria-hidden="true"
          />

          {/* 浮层内容 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={dialogRef}
              initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95, y: 20 }}
              transition={
                prefersReducedMotion ? {} : { type: 'spring', stiffness: 300, damping: 30 }
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="polish-dialog-title"
              aria-describedby="polish-dialog-description"
              className="
                w-full max-w-2xl max-h-[80vh]
                bg-white/95 dark:bg-slate-800/95
                backdrop-blur-[28px]
                border border-white/60 dark:border-slate-700/60
                rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]
                overflow-hidden
              "
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#2F6BFF]" aria-hidden="true" />
                  <h3
                    id="polish-dialog-title"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    AI 智能润色
                  </h3>
                </div>
                <button
                  ref={closeButtonRef}
                  onClick={onCancel}
                  className="
                  p-2 rounded-lg
                  hover:bg-slate-100 dark:hover:bg-slate-700
                  transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                "
                  aria-label="关闭对话框"
                >
                  <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>

              {/* 内容区域 */}
              <div
                id="polish-dialog-description"
                className="p-6 space-y-4 overflow-y-auto max-h-[calc(80vh-180px)]"
              >
                {/* 原始文本 */}
                <div>
                  <label
                    className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block"
                    id="original-text-label"
                  >
                    原始内容
                  </label>
                  <div
                    className="
                  p-4 rounded-xl
                  bg-slate-50 dark:bg-slate-900/50
                  border border-slate-200 dark:border-slate-700
                  text-sm text-slate-600 dark:text-slate-400
                  leading-relaxed
                "
                    role="region"
                    aria-labelledby="original-text-label"
                  >
                    {originalText}
                  </div>
                </div>

                {/* 优化后文本 */}
                <div>
                  <label
                    className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block"
                    id="optimized-text-label"
                  >
                    优化建议
                  </label>
                  <div
                    className="
                  p-4 rounded-xl
                  bg-gradient-to-br from-[#2F6BFF]/5 to-[#2F6BFF]/10
                  border border-[#2F6BFF]/20
                  text-sm text-slate-900 dark:text-slate-100
                  leading-relaxed
                  min-h-[100px]
                "
                    role="region"
                    aria-labelledby="optimized-text-label"
                    aria-live="polite"
                    aria-busy={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <motion.div
                          animate={prefersReducedMotion ? {} : { rotate: 360 }}
                          transition={
                            prefersReducedMotion
                              ? {}
                              : { duration: 1, repeat: Infinity, ease: 'linear' }
                          }
                          aria-hidden="true"
                        >
                          <Sparkles className="w-6 h-6 text-[#2F6BFF]" />
                        </motion.div>
                        <span className="ml-2 text-slate-600 dark:text-slate-400">
                          AI 正在优化中...
                        </span>
                      </div>
                    ) : error ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3">
                        <div className="text-center" role="alert" aria-live="assertive">
                          <p className="text-red-500 font-medium mb-1">优化失败</p>
                          <p className="text-slate-600 dark:text-slate-400 text-xs">{error}</p>
                        </div>
                        {onRetry && (
                          <button
                            onClick={onRetry}
                            className="
                            px-4 py-2 rounded-lg
                            bg-[#2F6BFF] hover:bg-[#2557CC]
                            text-white text-sm font-medium
                            transition-colors duration-150
                            flex items-center gap-2
                            focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                          "
                            aria-label="重试 AI 润色"
                          >
                            <Sparkles className="w-4 h-4" aria-hidden="true" />
                            重试
                          </button>
                        )}
                      </div>
                    ) : optimizedText ? (
                      optimizedText
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        等待 AI 生成优化建议...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 底部操作按钮 */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="
                  px-4 py-2 rounded-xl
                  bg-slate-100 dark:bg-slate-700
                  text-slate-700 dark:text-slate-300
                  text-sm font-medium
                  hover:bg-slate-200 dark:hover:bg-slate-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                "
                  aria-label="取消润色"
                >
                  取消
                </button>
                <button
                  ref={applyButtonRef}
                  onClick={onApply}
                  disabled={isLoading || !optimizedText}
                  className="
                  px-4 py-2 rounded-xl
                  bg-[#2F6BFF] hover:bg-[#2557CC]
                  text-white text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150
                  flex items-center gap-2
                  focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
                "
                  aria-label="应用优化建议"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  应用优化
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
