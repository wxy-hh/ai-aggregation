import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AudioHistoryItem } from '../../types/audio-history';
import type { AudioHistoryService } from './audio-history-service';

// history-store 替换为纯内存 zustand（服务只依赖 addItem/updateItem/deleteItem/deleteItems）
vi.mock('@/stores/history-store', () => {
  const { create } = require('zustand');
  const useHistoryStore = create((set: (fn: (s: { items: unknown[] }) => { items: unknown[] }) => void) => ({
    items: [] as unknown[],
    addItem: (item: unknown) =>
      set((s) => ({ items: [item, ...s.items.filter((i) => (i as { id: string }).id !== (item as { id: string }).id)] })),
    updateItem: (id: string, updates: Record<string, unknown>) =>
      set((s) => ({
        items: s.items.map((i) =>
          (i as { id: string }).id === id ? { ...(i as object), ...updates } : i
        ),
      })),
    deleteItem: (id: string) => set((s) => ({ items: s.items.filter((i) => (i as { id: string }).id !== id) })),
    deleteItems: (ids: string[]) =>
      set((s) => ({ items: s.items.filter((i) => !ids.includes((i as { id: string }).id)) })),
  }));
  return { useHistoryStore };
});

import {
  createVoiceHistoryRecord,
  updateVoiceProcessingStatus,
  deleteVoiceHistoryRecord,
  formatVoiceDuration,
} from './voice-history-service';
import { useHistoryStore } from '@/stores/history-store';

// ─── fake AudioHistoryService（内存实现）──────────────────

type FakeService = AudioHistoryService & { items: AudioHistoryItem[] };

function createFakeService(): FakeService {
  let items: AudioHistoryItem[] = [];
  const service = {
    items,
    async createFromUpload(file: File, transcriptionText?: string, translationText?: string) {
      const item: AudioHistoryItem = {
        id: 'audio-1',
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type,
        uploadTime: new Date(),
        transcriptionText,
        translationText,
        processingStatus: 'transcribing',
        tags: [],
        title: file.name.replace(/\.[^/.]+$/, ''),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      items = [item, ...items];
      service.items = items;
      return item;
    },
    async updateProcessingStatus(
      id: string,
      status: AudioHistoryItem['processingStatus'],
      data?: { transcriptionText?: string; translationText?: string }
    ) {
      const current = items.find((item) => item.id === id) ?? ({} as AudioHistoryItem);
      const updated: AudioHistoryItem = {
        ...current,
        ...data,
        processingStatus: status,
        updatedAt: new Date(),
      };
      items = items.map((item) => (item.id === id ? updated : item));
      service.items = items;
      return updated;
    },
    async updateItem(id: string, updates: Partial<AudioHistoryItem>) {
      const current = items.find((item) => item.id === id) ?? ({} as AudioHistoryItem);
      const updated: AudioHistoryItem = { ...current, ...updates, updatedAt: new Date() };
      items = items.map((item) => (item.id === id ? updated : item));
      service.items = items;
      return updated;
    },
    async deleteItem(id: string) {
      items = items.filter((item) => item.id !== id);
      service.items = items;
    },
    async deleteMultiple(ids: string[]) {
      items = items.filter((item) => !ids.includes(item.id));
      service.items = items;
    },
    async clearAll() {
      items = [];
      service.items = items;
    },
  } as unknown as FakeService;
  return service;
}

describe('voice-history-service（统一写路径）', () => {
  beforeEach(() => {
    useHistoryStore.setState({ items: [] });
  });

  it('创建记录：audio 详情与统一历史摘要同步写入（同 id、type=voice）', async () => {
    const service = createFakeService();
    const file = new File(['audio'], 'demo.mp3', { type: 'audio/mpeg' });

    const item = await createVoiceHistoryRecord(service, { file });

    expect(service.items).toHaveLength(1);
    const historyItem = useHistoryStore.getState().items[0];
    expect(historyItem.id).toBe(item.id);
    expect(historyItem.type).toBe('voice');
  });

  it('更新处理状态：统一历史摘要的预览随转录内容刷新', async () => {
    const service = createFakeService();
    const file = new File(['audio'], 'demo.mp3', { type: 'audio/mpeg' });
    await createVoiceHistoryRecord(service, { file });

    await updateVoiceProcessingStatus(service, 'audio-1', 'translating', {
      transcriptionText: '你好，世界',
    });

    const historyItem = useHistoryStore.getState().items.find((i) => i.id === 'audio-1');
    expect(historyItem?.preview).toContain('你好，世界');
    expect(historyItem?.type).toBe('voice');
  });

  it('删除记录：audio 详情与统一历史摘要一并删除', async () => {
    const service = createFakeService();
    const file = new File(['audio'], 'demo.mp3', { type: 'audio/mpeg' });
    await createVoiceHistoryRecord(service, { file });

    await deleteVoiceHistoryRecord(service, 'audio-1');

    expect(service.items).toHaveLength(0);
    expect(useHistoryStore.getState().items.find((i) => i.id === 'audio-1')).toBeUndefined();
  });

  it('时长格式化：秒 → mm:ss，非法值回落 00:00', () => {
    expect(formatVoiceDuration(65)).toBe('1:05');
    expect(formatVoiceDuration(0)).toBe('00:00');
    expect(formatVoiceDuration(undefined)).toBe('00:00');
  });
});