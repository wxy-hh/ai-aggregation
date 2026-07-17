'use client';

/**
 * ReferenceSourcePreview — 只读来源预览（REQ-004）
 *
 * 查看来源快照，不可编辑草稿。桌面浮层 / 移动底部抽屉。
 */

import { useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { RelayReferenceItem } from '@repo/shared';

export interface ReferenceSourcePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RelayReferenceItem | null;
}

export function ReferenceSourcePreview({ open, onOpenChange, item }: ReferenceSourcePreviewProps) {
  // 打开时把焦点移到正文容器，避免默认聚焦到右上角 X 导致一圈 focus ring
  const bodyRef = useRef<HTMLDivElement | null>(null);
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          bodyRef.current?.focus();
        }}
      >
        <div className="min-w-0 border-b border-slate-200 px-5 py-4 pr-16 dark:border-slate-700">
          <DialogTitle
            title={item.sourceTitle}
            className="block truncate text-left text-base font-semibold text-slate-900 dark:text-white"
          >
            {item.sourceTitle}
          </DialogTitle>
          <DialogDescription className="mt-0.5 block truncate text-left text-xs text-slate-400">
            {item.sourceModel ?? ''}
          </DialogDescription>
        </div>
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="max-h-[70vh] overflow-y-auto p-5 outline-none"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        >
          {item.snapshotMediaUrl && !item.mediaInvalid ? (

            <img
              src={item.snapshotMediaUrl}
              alt={item.sourceTitle}
              className="w-full rounded-xl object-contain"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {item.snapshotText || item.sourceTitle}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
