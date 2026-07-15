'use client';

/**
 * DerivationBadge — 历史卡片「由某来源接力生成 · 查看来源」（REQ-013）
 *
 * 仅当历史项带接力派生元数据（derivedFromRelayId）时渲染。
 * 「查看来源」打开来源快照只读预览。
 */

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { RELAY_COPY } from '@/lib/relay/copy';
import { ReferenceSourcePreview } from '@/components/relay/reference-source-preview';
import { useRelayStore } from '@/stores/relay-store';
import type { BaseHistoryItem } from '@/types/history';

export function DerivationBadge({ item }: { item: BaseHistoryItem }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const relayId = item.derivedFromRelayId;
  const bundle = useRelayStore((s) => (relayId ? (s.bundles[relayId] ?? null) : null));

  if (!relayId) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
      <Share2 className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{RELAY_COPY.history.derivedFrom}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPreviewOpen(true);
        }}
        className="shrink-0 font-medium text-blue-500 hover:text-blue-600 hover:underline dark:text-blue-400"
      >
        {RELAY_COPY.history.viewSource}
      </button>
      <ReferenceSourcePreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        item={bundle?.items[0] ?? null}
      />
    </div>
  );
}
