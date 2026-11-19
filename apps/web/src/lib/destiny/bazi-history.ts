import { useHistoryStore } from '@/stores/history-store';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import type { DestinyHistoryItem } from '@/types/history';
import type { DerivationMetadata } from '@repo/shared';
import type { BaziFormData } from '@/app/destiny/_components/bazi-types';
import type {
  BaziLockedSections,
  DestinyReport,
} from '@/app/destiny/_components/types';

export type SaveBaziHistoryOptions = {
  id?: string;
  derivation?: DerivationMetadata;
};

/**
 * 八字命理历史记录落盘薄缝
 *
 * 组装八字个人报告与锁定分区的完整数据载荷并写入统一历史 Store，实现历史落盘单点收口。
 */
export function saveBaziHistoryRecord(
  formData: BaziFormData,
  report: DestinyReport,
  lockedSections: BaziLockedSections,
  options?: SaveBaziHistoryOptions
): DestinyHistoryItem {
  const headline = report?.coreTone?.headline?.trim();
  const description = report?.coreTone?.description?.trim();
  const rawPreview = headline || description || '八字格局精批';
  const previewText = rawPreview.length > 150 ? rawPreview.slice(0, 150) : rawPreview;
  const title = `${formData.name}的八字命理报告`;
  const coreTone = report?.coreTone?.tag?.trim() || '八字命理';

  const reportData = {
    report,
    lockedSections,
  };

  const item = createDestinyHistoryItem(
    'bazi',
    { ...formData } as unknown as Record<string, unknown>,
    reportData as unknown as Record<string, unknown>,
    'doubao-seed-2-0',
    {
      id: options?.id,
      title,
      preview: previewText,
      coreTone,
      derivation: options?.derivation,
    }
  );

  useHistoryStore.getState().addItem(item);
  return item;
}
