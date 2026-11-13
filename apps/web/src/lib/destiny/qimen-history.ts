import { useHistoryStore } from '@/stores/history-store';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import type { DestinyHistoryItem } from '@/types/history';
import type { DerivationMetadata } from '@repo/shared';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSections,
  QimenFormData,
} from '@/app/destiny/_components/qimen-types';

export type SaveQimenHistoryOptions = {
  id?: string;
  derivation?: DerivationMetadata;
};

/**
 * 奇门遁甲历史记录落盘薄缝
 *
 * 组装奇门分析的完整数据载荷并写入统一历史 Store，实现历史落盘单点收口。
 */
export function saveQimenHistoryRecord(
  formData: QimenFormData,
  baseResult: QimenAnalysisBaseResult | null,
  sections: QimenAsyncSections,
  analysisId: string,
  options?: SaveQimenHistoryOptions
): DestinyHistoryItem {
  const description = formData.description?.trim() || '奇门遁甲推演';
  const previewText = description.length > 150 ? description.slice(0, 150) : description;
  const chartTitle = baseResult?.chartTitle?.trim() || '盘局分析';
  const title = `奇门遁甲推演 · ${chartTitle}`;
  const coreTone = baseResult?.chartTitle?.trim() || '奇门遁甲';

  const reportData = {
    baseResult,
    sections,
    analysisId,
    formData,
  };

  const item = createDestinyHistoryItem(
    'qimen',
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
