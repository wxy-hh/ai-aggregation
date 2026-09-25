/**
 * 消息通知组件桥接层：统一接入 Emil Kowalski 的 Sonner 工业级反馈体系
 */

'use client';

import React from 'react';
import { toast as sonnerToast } from 'sonner';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose?: () => void;
}

/**
 * 历史 Toast 兼容组件：直接调用 Sonner 触发物理动效通知
 */
export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  React.useEffect(() => {
    if (type === 'success') {
      sonnerToast.success(message, { duration, onDismiss: onClose });
    } else if (type === 'error') {
      sonnerToast.error(message, { duration, onDismiss: onClose });
    } else {
      sonnerToast.info(message, { duration, onDismiss: onClose });
    }
  }, [message, type, duration, onClose]);

  return null;
}

/**
 * 历史 ToastContainer 容器兼容层：Sonner 全局挂载于根布局 Toaster，无需手动布局容器
 */
export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts?: Array<ToastProps & { id: string }>;
  onRemove?: (id: string) => void;
}) {
  return null;
}
