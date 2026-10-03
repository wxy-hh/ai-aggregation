/**
 * 消息通知 Hook：底层接入 Emil Kowalski 的 Sonner 规范，提供统一的反馈体验
 */

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

export function useToast() {
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) => {
      if (type === 'success') {
        toast.success(message, { duration });
      } else if (type === 'error') {
        toast.error(message, { duration });
      } else {
        toast.info(message, { duration });
      }
    },
    []
  );

  return {
    toasts: [] as Toast[],
    showToast,
    removeToast: (_id: string) => {},
    success: (message: string, duration?: number) => toast.success(message, { duration }),
    error: (message: string, duration?: number) => toast.error(message, { duration }),
    info: (message: string, duration?: number) => toast.info(message, { duration }),
  };
}
