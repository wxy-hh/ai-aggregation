'use client';

/**
 * ReferenceSourcePreview — 只读来源预览（REQ-004）
 *
 * 查看来源快照，不可编辑草稿。桌面浮层 / 移动底部抽屉。
 */

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayReferenceItem } from '@repo/shared';

export interface ReferenceSourcePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RelayReferenceItem | null;
}

export function ReferenceSourcePreview({ open, onOpenChange, item }: ReferenceSourcePreviewProps) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
            {item.sourceTitle}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-left text-xs text-slate-400">
            {item.sourceModel ?? ''}
          </DialogDescription>
        </div>
        <div
          className="max-h-[70vh] overflow-y-auto p-5"
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
