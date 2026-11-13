import { useHistoryStore } from '@/stores/history-store';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import type { DestinyHistoryItem } from '@/types/history';
import type { DerivationMetadata } from '@repo/shared';
import type { BaziFormData } from '@/app/destiny/_components/bazi-types';
import type {
  DestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
} from '@/app/destiny/_components/types';

export type SaveZiweiHistoryOptions = {
  id?: string;
  derivation?: DerivationMetadata;
};

/**
 * 紫微斗数历史记录落盘薄缝
 *
 * 组装紫微斗数命盘与分析的完整数据载荷并写入统一历史 Store，实现历史落盘单点收口。
 */
export function saveZiweiHistoryRecord(
  formData: BaziFormData,
  report: DestinyReport,
  chartData: ZiweiChartData | null,
  lockedSections: ZiweiLockedSections,
  options?: SaveZiweiHistoryOptions
): DestinyHistoryItem {
  const headline = report?.coreTone?.headline?.trim();
  const description = report?.coreTone?.description?.trim();
  const rawPreview = headline || description || '紫微斗数星盘分析';
  const previewText = rawPreview.length > 150 ? rawPreview.slice(0, 150) : rawPreview;
  const title = `${formData.name}的紫微斗数命理报告`;
  const coreTone = report?.coreTone?.tag?.trim() || '紫微斗数';

  const reportData = {
    report,
    chartData,
    lockedSections,
  };

  const item = createDestinyHistoryItem(
    'ziwei',
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
