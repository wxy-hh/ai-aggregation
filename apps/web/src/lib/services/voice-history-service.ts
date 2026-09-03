/**
 * voice 历史记录统一写路径。
 *
 * 一条 voice 记录存在两份持久化：audio 详情（IndexedDB，存音频/状态/片段）与
 * 统一历史摘要（history-store，voice 卡片）。历史上双写协调散落在组件
 * （upload-audio 手动 addItem）与 store（删除路径 require history-store）里。
 * 本模块把「audio 记录 → 摘要写入统一历史」收敛为唯一实现，写 audio 的调用方
 * 只需经本模块，保证两处持久化一致。
 */

import { useHistoryStore } from '@/stores/history-store';
import { createVoiceHistoryItem } from '@/lib/utils/history-helpers';
import type { AudioHistoryItem, ProcessingStatus } from '@/types/audio-history';
import type { VoiceHistoryItem } from '@/types/history';
import type { AudioHistoryService } from './audio-history-service';

/** 音频时长（秒）→ 统一历史的展示格式（如 1:05 / 00:00） */
export function formatVoiceDuration(duration?: number): string {
  if (!duration || duration <= 0) return '00:00';
  const minutes = Math.floor(duration / 60);
  const seconds = String(Math.floor(duration % 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** 由 audio 记录字段构建 history 侧 voice 摘要（复用历史卡片渲染规则） */
function toVoiceSummary(
  item: AudioHistoryItem,
  model = 'SenseVoice'
): Omit<VoiceHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const transcription = item.transcriptionText ?? '';
  return createVoiceHistoryItem(
    item.fileName,
    item.fileSize,
    formatVoiceDuration(item.duration),
    transcription,
    model
  );
}

export interface VoiceHistoryCreateInput {
  file: File;
  transcriptionText?: string;
  translationText?: string;
}

/** 把 audio item 的转录推进同步到统一历史摘要（标题/预览随转录内容刷新） */
function syncHistorySummary(item: AudioHistoryItem): void {
  const summary = toVoiceSummary(item);
  useHistoryStore.getState().updateItem(item.id, {
    title: summary.title,
    preview: summary.preview,
    duration: summary.duration,
    transcription: summary.transcription,
  });
}

/** 创建 voice 记录：写 audio 详情 + 写统一历史摘要，两条持久化一次性完成 */
export async function createVoiceHistoryRecord(
  service: AudioHistoryService,
  input: VoiceHistoryCreateInput
): Promise<AudioHistoryItem> {
  const item = await service.createFromUpload(
    input.file,
    input.transcriptionText,
    input.translationText
  );

  useHistoryStore.getState().addItem({
    id: item.id,
    ...toVoiceSummary(item),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });

  return item;
}

/** 更新已存在的记录：写 audio 详情并同步统一历史摘要 */
export async function updateVoiceHistoryItem(
  service: AudioHistoryService,
  id: string,
  updates: Partial<AudioHistoryItem>
): Promise<AudioHistoryItem> {
  const updated = await service.updateItem(id, updates);
  // 统一历史 voice 卡片无 tags 字段，标题变更同步过去即可
  if (updates.title) {
    useHistoryStore.getState().updateItem(id, { title: updates.title });
  }
  return updated;
}

/** 更新处理状态，并把最新转录内容同步到统一历史摘要 */
export async function updateVoiceProcessingStatus(
  service: AudioHistoryService,
  id: string,
  status: ProcessingStatus,
  data?: {
    transcriptionText?: string;
    translationText?: string;
    segments?: AudioHistoryItem['segments'];
    errorMessage?: string;
  }
): Promise<AudioHistoryItem> {
  const updated = await service.updateProcessingStatus(id, status, data);
  syncHistorySummary(updated);
  return updated;
}

/** 删除单条 voice 记录：audio 详情与统一历史摘要一起删除（isSyncDelete 防循环） */
export async function deleteVoiceHistoryRecord(service: AudioHistoryService, id: string): Promise<void> {
  await service.deleteItem(id);
  useHistoryStore.getState().deleteItem(id, true);
}

/** 批量删除 voice 记录：两处持久化一起删除 */
export async function deleteVoiceHistoryRecords(
  service: AudioHistoryService,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await service.deleteMultiple(ids);
  useHistoryStore.getState().deleteItems(ids, true);
}

/** 清空 voice 记录：清 audio 存储并删除对应统一历史记录 */
export async function clearVoiceHistory(
  service: AudioHistoryService,
  ids: string[]
): Promise<void> {
  await service.clearAll();
  if (ids.length > 0) {
    useHistoryStore.getState().deleteItems(ids, true);
  }
}