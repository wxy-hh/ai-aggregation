import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StorageAdapter, AudioHistoryItem, AudioHistoryFilter } from '../../types/audio-history';

// ─── mock StorageAdapter ──────────────────────────────────
function createMockStorage() {
  return {
    _items: [] as AudioHistoryItem[],
    create: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    search: vi.fn(),
    getByDateRange: vi.fn(),
    getByTags: vi.fn(),
    getStats: vi.fn(),
    clear: vi.fn(),
    getStorageInfo: vi.fn(),
  } as unknown as StorageAdapter & {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    getStorageInfo: ReturnType<typeof vi.fn>;
  };
}

// mock Audio 全局对象
vi.stubGlobal('Audio', class {
  src = '';
  duration = 0;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
});

vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
});

// 导入被测模块（mock 放在导入前）
import { AudioHistoryService, createAudioHistoryService } from './audio-history-service';

function makeItem(overrides: Partial<AudioHistoryItem> = {}): AudioHistoryItem {
  return {
    id: 'item-1',
    fileName: 'test.mp3',
    fileSize: 1024,
    fileMimeType: 'audio/mpeg',
    uploadTime: new Date(),
    processingStatus: 'completed',
    tags: [],
    title: '测试音频',
    duration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(name = 'test.mp3', size = 1024): File {
  const buffer = new ArrayBuffer(8);
  return new File([buffer], name, { type: 'audio/mpeg' });
}

describe('AudioHistoryService', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: AudioHistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createMockStorage();
    service = new AudioHistoryService({
      storage,
      maxRetries: 1,
      retryDelay: 0,
    });
  });

  // ─── createFromUpload ─────────────────────────────────
  describe('createFromUpload', () => {
    it('创建记录并调用 storage.create', async () => {
      const item = makeItem();
      storage.create.mockResolvedValue(item);

      const file = makeFile();
      const result = await service.createFromUpload(file, '转录文本');

      expect(storage.create).toHaveBeenCalledTimes(1);
      expect(storage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'test.mp3',
          transcriptionText: '转录文本',
        })
      );
      expect(result.id).toBe('item-1');
    });

    it('有转录和翻译文本时初始状态为 completed', async () => {
      storage.create.mockResolvedValue(makeItem({ processingStatus: 'completed' }));

      await service.createFromUpload(makeFile(), '转录', '翻译');

      expect(storage.create).toHaveBeenCalledWith(
        expect.objectContaining({ processingStatus: 'completed' })
      );
    });

    it('仅有转录文本时初始状态为 translating', async () => {
      storage.create.mockResolvedValue(makeItem({ processingStatus: 'translating' }));

      await service.createFromUpload(makeFile(), '转录');

      expect(storage.create).toHaveBeenCalledWith(
        expect.objectContaining({ processingStatus: 'translating' })
      );
    });

    it('无文本时初始状态为 transcribing', async () => {
      storage.create.mockResolvedValue(makeItem({ processingStatus: 'transcribing' }));

      await service.createFromUpload(makeFile());

      expect(storage.create).toHaveBeenCalledWith(
        expect.objectContaining({ processingStatus: 'transcribing' })
      );
    });
  });

  // ─── updateProcessingStatus ────────────────────────────
  describe('updateProcessingStatus', () => {
    it('更新处理状态', async () => {
      const updated = makeItem({ processingStatus: 'completed' });
      storage.update.mockResolvedValue(updated);

      const result = await service.updateProcessingStatus('item-1', 'completed', {
        transcriptionText: '转录完成',
      });

      expect(storage.update).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          processingStatus: 'completed',
          transcriptionText: '转录完成',
        })
      );
      expect(result.processingStatus).toBe('completed');
    });
  });

  // ─── searchHistory ────────────────────────────────────
  describe('searchHistory', () => {
    it('透传 filter 到 storage.getAll', async () => {
      const items = [makeItem()];
      storage.getAll.mockResolvedValue(items);

      const filter: AudioHistoryFilter = { searchQuery: '测试' };
      const result = await service.searchHistory(filter);

      expect(storage.getAll).toHaveBeenCalledWith(filter);
      expect(result).toHaveLength(1);
    });
  });

  // ─── getById ──────────────────────────────────────────
  describe('getById', () => {
    it('返回指定记录', async () => {
      storage.getById.mockResolvedValue(makeItem());

      const result = await service.getById('item-1');
      expect(result?.id).toBe('item-1');
    });

    it('不存在时返回 null', async () => {
      storage.getById.mockResolvedValue(null);

      const result = await service.getById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── updateItem ───────────────────────────────────────
  describe('updateItem', () => {
    it('正常更新标题', async () => {
      storage.update.mockResolvedValue(makeItem({ title: '新标题' }));

      await service.updateItem('item-1', { title: '新标题' });

      expect(storage.update).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ title: '新标题' })
      );
    });

    it('标题超过 100 字符时抛出异常', async () => {
      const longTitle = 'a'.repeat(101);

      await expect(service.updateItem('item-1', { title: longTitle })).rejects.toThrow(
        '标题长度不能超过100个字符'
      );
    });
  });

  // ─── deleteItem ───────────────────────────────────────
  describe('deleteItem', () => {
    it('调用 storage.delete', async () => {
      storage.delete.mockResolvedValue(undefined);

      await service.deleteItem('item-1');
      expect(storage.delete).toHaveBeenCalledWith('item-1');
    });
  });

  // ─── deleteMultiple ───────────────────────────────────
  describe('deleteMultiple', () => {
    it('调用 storage.deleteMany', async () => {
      storage.deleteMany.mockResolvedValue(undefined);

      await service.deleteMultiple(['item-1', 'item-2']);
      expect(storage.deleteMany).toHaveBeenCalledWith(['item-1', 'item-2']);
    });

    it('空数组不调用 deleteMany', async () => {
      await service.deleteMultiple([]);
      expect(storage.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── getStatistics ────────────────────────────────────
  describe('getStatistics', () => {
    it('返回统计信息', async () => {
      storage.getStats.mockResolvedValue({
        totalItems: 10,
        totalSize: 2048,
        completedItems: 8,
        errorItems: 1,
      });

      const result = await service.getStatistics();
      expect(result.totalItems).toBe(10);
      expect(result.errorItems).toBe(1);
    });
  });

  // ─── clearAll ─────────────────────────────────────────
  describe('clearAll', () => {
    it('调用 storage.clear', async () => {
      storage.clear.mockResolvedValue(undefined);

      await service.clearAll();
      expect(storage.clear).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getStorageInfo ───────────────────────────────────
  describe('getStorageInfo', () => {
    it('返回存储信息', async () => {
      storage.getStorageInfo.mockResolvedValue({
        used: 1024,
        available: 999,
        total: 2023,
      });

      const result = await service.getStorageInfo();
      expect(result.used).toBe(1024);
    });
  });

  // ─── factory ──────────────────────────────────────────
  describe('createAudioHistoryService', () => {
    it('工厂函数返回 AudioHistoryService 实例', async () => {
      const s = createAudioHistoryService({ storage, maxRetries: 1, retryDelay: 0 });
      expect(s).toBeInstanceOf(AudioHistoryService);
      expect(s.getStorageAdapter()).toBe(storage);
    });
  });

  // ─── retry behavior ──────────────────────────────────
  describe('retry', () => {
    it('首次失败后重试成功', async () => {
      const retryService = new AudioHistoryService({
        storage,
        maxRetries: 2,
        retryDelay: 0,
      });

      storage.getAll
        .mockRejectedValueOnce(new Error('网络错误'))
        .mockResolvedValueOnce([makeItem()]);

      const result = await retryService.searchHistory({});
      expect(result).toHaveLength(1);
      expect(storage.getAll).toHaveBeenCalledTimes(2);
    });

    it('超过重试次数后抛出异常', async () => {
      const retryService = new AudioHistoryService({
        storage,
        maxRetries: 2,
        retryDelay: 0,
      });

      storage.clear.mockRejectedValue(new Error('持续失败'));

      await expect(retryService.clearAll()).rejects.toThrow('持续失败');
      expect(storage.clear).toHaveBeenCalledTimes(2);
    });
  });
});
