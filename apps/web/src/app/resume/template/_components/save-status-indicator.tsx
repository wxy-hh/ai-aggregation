'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * 保存状态类型
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 保存状态指示器组件属性
 */
export interface SaveStatusIndicatorProps {
  /** 当前保存状态 */
  status: SaveStatus;
  /** 最后保存时间 */
  lastSavedAt?: Date;
  /** 错误信息 */
  errorMessage?: string;
}

/**
 * 保存状态指示器组件
 *
 * 功能:
 * - 显示"已保存"、"保存中..."、"保存失败"状态
 * - 自动保存 2 秒防抖
 * - 显示最后保存时间
 * - 保存失败时显示错误提示
 *
 * 对应需求: 11.1, 11.3, 11.4
 */
export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
}: SaveStatusIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();

  // 添加调试日志
  console.log('[SaveStatusIndicator] 接收到状态:', status, '最后保存时间:', lastSavedAt);

  const getStatusConfig = () => {
    switch (status) {
      case 'saving':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: '保存中...',
          color: 'text-[#2F6BFF]',
          bgColor: 'bg-[#2F6BFF]/10',
        };
      case 'saved':
        return {
          icon: <Check className="w-4 h-4" />,
          text: '已保存',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-950/20',
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          text: '保存失败',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-950/20',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();

  if (!config) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
        animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
          ${config.bgColor}
          border border-current/20
        `}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={config.color} aria-hidden="true">
          {config.icon}
        </span>
        <span className={`text-sm font-medium ${config.color}`}>{config.text}</span>
        {status === 'saved' && lastSavedAt && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatRelativeTime(lastSavedAt)}
          </span>
        )}
      </motion.div>

      {/* 错误提示 */}
      {status === 'error' && errorMessage && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
          animate={prefersReducedMotion ? {} : { opacity: 1, height: 'auto' }}
          exit={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
          className="mt-2 text-xs text-red-600 dark:text-red-400"
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return '刚刚';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} 分钟前`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} 小时前`;
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
