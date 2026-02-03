# 设计文档 - 上传音频历史记录功能

## 概述

本文档设计了上传音频历史记录功能的技术实现方案。该功能将为现有的语音转录系统添加完整的历史记录管理能力，包括创建、读取、更新、删除（CRUD）操作。设计重点评估了多种存储方案，提供了详细的技术架构和实现策略，最终由用户选择最适合的方案。

## 架构设计

### 整体架构

```mermaid
graph TB
    A[用户界面层] --> B[状态管理层]
    B --> C[服务抽象层]
    C --> D[存储引擎层]

    A1[Recordin
```

gLibrary 组件] --> A
A2[UploadAudio 组件] --> A
A3[历史记录详情组件] --> A

    B1[Zustand Store] --> B
    B2[React Query] --> B

    C1[AudioHistoryService] --> C
    C2[StorageAdapter 接口] --> C

    D1[IndexedDBStorage] --> D
    D2[DatabaseStorage] --> D
    D3[LocalStorageStorage] --> D

````

### 分层架构说明

1. **用户界面层**: React 组件，负责用户交互和数据展示
2. **状态管理层**: 使用 Zustand 管理应用状态，React Query 处理异步数据
3. **服务抽象层**: 提供统一的业务逻辑接口，隔离存储实现细节
4. **存储引擎层**: 具体的存储实现，支持多种存储方案

## 存储方案对比分析

### 方案一：IndexedDB 本地存储

#### 技术实现
- 使用浏览器原生 IndexedDB API
- 通过 Dexie.js 库简化操作
- 实现异步数据操作和事务支持

#### 优势分析
- **实现复杂度**: 中等，有成熟的库支持
- **数据持久性**: 中等，浏览器清理数据时会丢失
- **跨设备同步**: 不支持
- **性能影响**: 低，本地存储响应快速
- **存储容量**: 大，支持几百MB到几GB数据
- **用户体验**: 优秀，离线可用，响应迅速
- **开发成本**: 低，无需服务端支持
- **维护成本**: 低，客户端代码维护

#### 劣势分析
- 数据仅存储在本地，设备损坏或浏览器重置会导致数据丢失
- 无法在多设备间同步数据
- 浏览器兼容性需要考虑（虽然现代浏览器支持良好）

#### 适用场景
- 单设备使用为主的用户
- 对数据同步要求不高的场景
- 希望快速实现功能的项目
- 离线使用需求较强的场景

### 方案二：PostgreSQL + Prisma 数据库存储

#### 技术实现
- 使用现有的 Prisma ORM 配置
- 创建数据库表结构存储历史记录
- 实现 RESTful API 接口
- 添加用户认证和权限控制

#### 优势分析
- **实现复杂度**: 高，需要完整的后端开发
- **数据持久性**: 优秀，专业数据库保证数据安全
- **跨设备同步**: 完全支持
- **性能影响**: 中等，网络请求增加延迟
- **存储容量**: 无限制（相对而言）
- **用户体验**: 良好，支持多设备访问
- **开发成本**: 高，需要后端开发和部署
- **维护成本**: 高，需要数据库运维

#### 劣势分析
- 需要服务端支持，增加系统复杂度
- 依赖网络连接，离线时无法使用
- 需要实现用户认证和会话管理
- 数据库性能和扩展性需要考虑

#### 适用场景
- 多设备使用需求强烈的用户
- 对数据安全和持久性要求高的场景
- 已有后端基础设施的项目
- 团队协作和数据共享需求

### 方案三：localStorage 简单存储

#### 技术实现
- 使用浏览器 localStorage API
- JSON 序列化存储数据
- 同步操作，代码简单

#### 优势分析
- **实现复杂度**: 极低，几行代码即可实现
- **数据持久性**: 低，容易丢失
- **跨设备同步**: 不支持
- **性能影响**: 极低，同步操作
- **存储容量**: 极小，5-10MB限制
- **用户体验**: 一般，容量限制严重
- **开发成本**: 极低
- **维护成本**: 极低

#### 劣势分析
- 存储容量严重不足，无法存储大量历史记录
- 数据持久性差，容易丢失
- 只能存储字符串，需要序列化处理

#### 适用场景
- 仅作为临时存储或缓存使用
- 数据量极小的场景
- 快速原型验证

### 方案四：混合存储方案

#### 技术实现
- IndexedDB 作为本地缓存
- PostgreSQL 作为远程持久化存储
- 实现数据同步机制
- 支持离线优先的操作模式

#### 优势分析
- **实现复杂度**: 极高，需要处理复杂的同步逻辑
- **数据持久性**: 优秀，双重保障
- **跨设备同步**: 完全支持
- **性能影响**: 低，本地缓存提供快速响应
- **存储容量**: 无限制
- **用户体验**: 最佳，快速响应且数据安全
- **开发成本**: 极高
- **维护成本**: 极高

#### 劣势分析
- 实现复杂度极高，需要处理数据同步冲突
- 开发和测试工作量巨大
- 需要复杂的缓存策略和一致性保证

#### 适用场景
- 对用户体验要求极高的产品
- 有充足开发资源的团队
- 长期产品规划中的高级功能

## 推荐方案选择

### 阶段性实施建议

1. **第一阶段（MVP）**: 选择 IndexedDB 方案
   - 快速实现核心功能
   - 满足大部分用户需求
   - 开发成本可控

2. **第二阶段（增强）**: 可选择升级到数据库方案
   - 根据用户反馈决定是否需要跨设备同步
   - 可以实现数据迁移功能

3. **第三阶段（完善）**: 考虑混合方案
   - 在有充足资源时实现最佳用户体验

## 组件和接口设计

### 数据模型

```typescript
interface AudioHistoryItem {
  id: string;                    // 唯一标识符
  fileName: string;              // 原始文件名
  fileSize: number;              // 文件大小（字节）
  fileMimeType: string;          // 文件MIME类型
  uploadTime: Date;              // 上传时间
  transcriptionText?: string;    // 转录文本
  translationText?: string;      // 翻译文本
  processingStatus: ProcessingStatus; // 处理状态
  tags: string[];                // 用户标签
  title: string;                 // 用户自定义标题
  duration?: number;             // 音频时长（秒）
  errorMessage?: string;         // 错误信息
  createdAt: Date;              // 创建时间
  updatedAt: Date;              // 更新时间
}

type ProcessingStatus =
  | 'uploading'     // 上传中
  | 'transcribing'  // 转录中
  | 'translating'   // 翻译中
  | 'completed'     // 完成
  | 'error';        // 错误

interface AudioHistoryFilter {
  searchQuery?: string;          // 搜索关键词
  dateRange?: {                  // 日期范围
    start: Date;
    end: Date;
  };
  tags?: string[];               // 标签过滤
  status?: ProcessingStatus[];   // 状态过滤
}

interface AudioHistoryStats {
  totalItems: number;            // 总记录数
  totalSize: number;             // 总文件大小
  completedItems: number;        // 完成处理的记录数
  errorItems: number;            // 错误记录数
}
````

### 存储适配器接口

```typescript
interface StorageAdapter {
  // 基础 CRUD 操作
  create(item: Omit<AudioHistoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioHistoryItem>;
  getById(id: string): Promise<AudioHistoryItem | null>;
  getAll(filter?: AudioHistoryFilter): Promise<AudioHistoryItem[]>;
  update(id: string, updates: Partial<AudioHistoryItem>): Promise<AudioHistoryItem>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;

  // 高级查询
  search(query: string): Promise<AudioHistoryItem[]>;
  getByDateRange(start: Date, end: Date): Promise<AudioHistoryItem[]>;
  getByTags(tags: string[]): Promise<AudioHistoryItem[]>;

  // 统计信息
  getStats(): Promise<AudioHistoryStats>;

  // 存储管理
  clear(): Promise<void>;
  getStorageInfo(): Promise<{
    used: number;
    available: number;
    total: number;
  }>;
}
```

### 服务层设计

```typescript
class AudioHistoryService {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // 创建历史记录（从上传音频触发）
  async createFromUpload(
    file: File,
    transcriptionText?: string,
    translationText?: string
  ): Promise<AudioHistoryItem> {
    const item = await this.storage.create({
      fileName: file.name,
      fileSize: file.size,
      fileMimeType: file.type,
      uploadTime: new Date(),
      transcriptionText,
      translationText,
      processingStatus: transcriptionText ? 'completed' : 'transcribing',
      tags: [],
      title: this.generateDefaultTitle(file.name),
      duration: await this.getAudioDuration(file),
    });

    return item;
  }

  // 更新处理状态
  async updateProcessingStatus(
    id: string,
    status: ProcessingStatus,
    data?: {
      transcriptionText?: string;
      translationText?: string;
      errorMessage?: string;
    }
  ): Promise<AudioHistoryItem> {
    return this.storage.update(id, {
      processingStatus: status,
      ...data,
      updatedAt: new Date(),
    });
  }

  // 搜索和过滤
  async searchHistory(filter: AudioHistoryFilter): Promise<AudioHistoryItem[]> {
    return this.storage.getAll(filter);
  }

  // 批量操作
  async deleteMultiple(ids: string[]): Promise<void> {
    return this.storage.deleteMany(ids);
  }

  // 获取统计信息
  async getStatistics(): Promise<AudioHistoryStats> {
    return this.storage.getStats();
  }

  private generateDefaultTitle(fileName: string): string {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return nameWithoutExt || '未命名音频';
  }

  private async getAudioDuration(file: File): Promise<number | undefined> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
      };
      audio.onerror = () => resolve(undefined);
      audio.src = URL.createObjectURL(file);
    });
  }
}
```

### IndexedDB 存储实现

```typescript
import Dexie, { Table } from 'dexie';

class AudioHistoryDB extends Dexie {
  audioHistory!: Table<AudioHistoryItem>;

  constructor() {
    super('AudioHistoryDB');
    this.version(1).stores({
      audioHistory: '++id, fileName, uploadTime, processingStatus, tags, title, createdAt',
    });
  }
}

class IndexedDBStorage implements StorageAdapter {
  private db: AudioHistoryDB;

  constructor() {
    this.db = new AudioHistoryDB();
  }

  async create(
    item: Omit<AudioHistoryItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AudioHistoryItem> {
    const now = new Date();
    const newItem: AudioHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.audioHistory.add(newItem);
    return newItem;
  }

  async getById(id: string): Promise<AudioHistoryItem | null> {
    const item = await this.db.audioHistory.where('id').equals(id).first();
    return item || null;
  }

  async getAll(filter?: AudioHistoryFilter): Promise<AudioHistoryItem[]> {
    let query = this.db.audioHistory.orderBy('createdAt').reverse();

    if (filter?.searchQuery) {
      query = query.filter(
        (item) =>
          item.title.toLowerCase().includes(filter.searchQuery!.toLowerCase()) ||
          item.fileName.toLowerCase().includes(filter.searchQuery!.toLowerCase()) ||
          item.transcriptionText?.toLowerCase().includes(filter.searchQuery!.toLowerCase()) ||
          item.tags.some((tag) => tag.toLowerCase().includes(filter.searchQuery!.toLowerCase()))
      );
    }

    if (filter?.dateRange) {
      query = query.filter(
        (item) =>
          item.createdAt >= filter.dateRange!.start && item.createdAt <= filter.dateRange!.end
      );
    }

    if (filter?.tags && filter.tags.length > 0) {
      query = query.filter((item) => filter.tags!.some((tag) => item.tags.includes(tag)));
    }

    if (filter?.status && filter.status.length > 0) {
      query = query.filter((item) => filter.status!.includes(item.processingStatus));
    }

    return query.toArray();
  }

  async update(id: string, updates: Partial<AudioHistoryItem>): Promise<AudioHistoryItem> {
    await this.db.audioHistory.update(id, {
      ...updates,
      updatedAt: new Date(),
    });

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Item with id ${id} not found`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.audioHistory.delete(id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.db.audioHistory.bulkDelete(ids);
  }

  async search(query: string): Promise<AudioHistoryItem[]> {
    return this.getAll({ searchQuery: query });
  }

  async getByDateRange(start: Date, end: Date): Promise<AudioHistoryItem[]> {
    return this.getAll({ dateRange: { start, end } });
  }

  async getByTags(tags: string[]): Promise<AudioHistoryItem[]> {
    return this.getAll({ tags });
  }

  async getStats(): Promise<AudioHistoryStats> {
    const allItems = await this.db.audioHistory.toArray();

    return {
      totalItems: allItems.length,
      totalSize: allItems.reduce((sum, item) => sum + item.fileSize, 0),
      completedItems: allItems.filter((item) => item.processingStatus === 'completed').length,
      errorItems: allItems.filter((item) => item.processingStatus === 'error').length,
    };
  }

  async clear(): Promise<void> {
    await this.db.audioHistory.clear();
  }

  async getStorageInfo(): Promise<{ used: number; available: number; total: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0),
        total: estimate.quota || 0,
      };
    }

    // 降级处理
    return {
      used: 0,
      available: 100 * 1024 * 1024, // 假设100MB可用
      total: 100 * 1024 * 1024,
    };
  }
}
```

### 数据库存储实现

```typescript
// Prisma Schema 定义
/*
model AudioHistory {
  id                String            @id @default(cuid())
  fileName          String
  fileSize          Int
  fileMimeType      String
  uploadTime        DateTime
  transcriptionText String?
  translationText   String?
  processingStatus  ProcessingStatus
  tags              String[]
  title             String
  duration          Float?
  errorMessage      String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  userId            String            // 用户关联
  
  @@map("audio_history")
}

enum ProcessingStatus {
  UPLOADING
  TRANSCRIBING
  TRANSLATING
  COMPLETED
  ERROR
}
*/

class DatabaseStorage implements StorageAdapter {
  private prisma: PrismaClient;
  private userId: string;

  constructor(prisma: PrismaClient, userId: string) {
    this.prisma = prisma;
    this.userId = userId;
  }

  async create(
    item: Omit<AudioHistoryItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AudioHistoryItem> {
    const created = await this.prisma.audioHistory.create({
      data: {
        ...item,
        userId: this.userId,
        processingStatus: item.processingStatus.toUpperCase() as any,
      },
    });

    return this.mapFromPrisma(created);
  }

  async getById(id: string): Promise<AudioHistoryItem | null> {
    const item = await this.prisma.audioHistory.findFirst({
      where: { id, userId: this.userId },
    });

    return item ? this.mapFromPrisma(item) : null;
  }

  async getAll(filter?: AudioHistoryFilter): Promise<AudioHistoryItem[]> {
    const where: any = { userId: this.userId };

    if (filter?.searchQuery) {
      where.OR = [
        { title: { contains: filter.searchQuery, mode: 'insensitive' } },
        { fileName: { contains: filter.searchQuery, mode: 'insensitive' } },
        { transcriptionText: { contains: filter.searchQuery, mode: 'insensitive' } },
      ];
    }

    if (filter?.dateRange) {
      where.createdAt = {
        gte: filter.dateRange.start,
        lte: filter.dateRange.end,
      };
    }

    if (filter?.tags && filter.tags.length > 0) {
      where.tags = {
        hasSome: filter.tags,
      };
    }

    if (filter?.status && filter.status.length > 0) {
      where.processingStatus = {
        in: filter.status.map((s) => s.toUpperCase()),
      };
    }

    const items = await this.prisma.audioHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return items.map(this.mapFromPrisma);
  }

  async update(id: string, updates: Partial<AudioHistoryItem>): Promise<AudioHistoryItem> {
    const updated = await this.prisma.audioHistory.update({
      where: { id, userId: this.userId },
      data: {
        ...updates,
        processingStatus: updates.processingStatus?.toUpperCase() as any,
      },
    });

    return this.mapFromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.audioHistory.delete({
      where: { id, userId: this.userId },
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.prisma.audioHistory.deleteMany({
      where: { id: { in: ids }, userId: this.userId },
    });
  }

  async search(query: string): Promise<AudioHistoryItem[]> {
    return this.getAll({ searchQuery: query });
  }

  async getByDateRange(start: Date, end: Date): Promise<AudioHistoryItem[]> {
    return this.getAll({ dateRange: { start, end } });
  }

  async getByTags(tags: string[]): Promise<AudioHistoryItem[]> {
    return this.getAll({ tags });
  }

  async getStats(): Promise<AudioHistoryStats> {
    const [totalItems, totalSize, completedItems, errorItems] = await Promise.all([
      this.prisma.audioHistory.count({ where: { userId: this.userId } }),
      this.prisma.audioHistory.aggregate({
        where: { userId: this.userId },
        _sum: { fileSize: true },
      }),
      this.prisma.audioHistory.count({
        where: { userId: this.userId, processingStatus: 'COMPLETED' },
      }),
      this.prisma.audioHistory.count({
        where: { userId: this.userId, processingStatus: 'ERROR' },
      }),
    ]);

    return {
      totalItems,
      totalSize: totalSize._sum.fileSize || 0,
      completedItems,
      errorItems,
    };
  }

  async clear(): Promise<void> {
    await this.prisma.audioHistory.deleteMany({
      where: { userId: this.userId },
    });
  }

  async getStorageInfo(): Promise<{ used: number; available: number; total: number }> {
    // 数据库存储通常没有严格的容量限制
    // 这里返回一个估算值或配置值
    return {
      used: 0,
      available: Number.MAX_SAFE_INTEGER,
      total: Number.MAX_SAFE_INTEGER,
    };
  }

  private mapFromPrisma(item: any): AudioHistoryItem {
    return {
      ...item,
      processingStatus: item.processingStatus.toLowerCase(),
    };
  }
}
```

### 状态管理设计

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AudioHistoryState {
  // 数据状态
  items: AudioHistoryItem[];
  currentItem: AudioHistoryItem | null;
  filter: AudioHistoryFilter;
  stats: AudioHistoryStats | null;

  // UI 状态
  isLoading: boolean;
  error: string | null;
  selectedIds: string[];

  // 服务实例
  service: AudioHistoryService | null;

  // Actions
  initializeService: (storage: StorageAdapter) => void;
  loadItems: (filter?: AudioHistoryFilter) => Promise<void>;
  createItem: (
    file: File,
    transcriptionText?: string,
    translationText?: string
  ) => Promise<AudioHistoryItem>;
  updateItem: (id: string, updates: Partial<AudioHistoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteSelectedItems: () => Promise<void>;
  setCurrentItem: (item: AudioHistoryItem | null) => void;
  setFilter: (filter: AudioHistoryFilter) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  loadStats: () => Promise<void>;
  clearError: () => void;
}

export const useAudioHistoryStore = create<AudioHistoryState>()(
  devtools(
    (set, get) => ({
      // 初始状态
      items: [],
      currentItem: null,
      filter: {},
      stats: null,
      isLoading: false,
      error: null,
      selectedIds: [],
      service: null,

      // 初始化服务
      initializeService: (storage: StorageAdapter) => {
        const service = new AudioHistoryService(storage);
        set({ service });
      },

      // 加载历史记录
      loadItems: async (filter?: AudioHistoryFilter) => {
        const { service } = get();
        if (!service) return;

        set({ isLoading: true, error: null });

        try {
          const items = await service.searchHistory(filter || get().filter);
          set({ items, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '加载历史记录失败',
            isLoading: false,
          });
        }
      },

      // 创建历史记录
      createItem: async (file: File, transcriptionText?: string, translationText?: string) => {
        const { service } = get();
        if (!service) throw new Error('服务未初始化');

        set({ isLoading: true, error: null });

        try {
          const item = await service.createFromUpload(file, transcriptionText, translationText);
          set((state) => ({
            items: [item, ...state.items],
            isLoading: false,
          }));
          return item;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '创建历史记录失败',
            isLoading: false,
          });
          throw error;
        }
      },

      // 更新历史记录
      updateItem: async (id: string, updates: Partial<AudioHistoryItem>) => {
        const { service } = get();
        if (!service) return;

        try {
          const updatedItem = await service.storage.update(id, updates);
          set((state) => ({
            items: state.items.map((item) => (item.id === id ? updatedItem : item)),
            currentItem: state.currentItem?.id === id ? updatedItem : state.currentItem,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '更新历史记录失败',
          });
        }
      },

      // 删除历史记录
      deleteItem: async (id: string) => {
        const { service } = get();
        if (!service) return;

        try {
          await service.storage.delete(id);
          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
            currentItem: state.currentItem?.id === id ? null : state.currentItem,
            selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '删除历史记录失败',
          });
        }
      },

      // 删除选中的历史记录
      deleteSelectedItems: async () => {
        const { service, selectedIds } = get();
        if (!service || selectedIds.length === 0) return;

        try {
          await service.deleteMultiple(selectedIds);
          set((state) => ({
            items: state.items.filter((item) => !selectedIds.includes(item.id)),
            currentItem: selectedIds.includes(state.currentItem?.id || '')
              ? null
              : state.currentItem,
            selectedIds: [],
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '批量删除失败',
          });
        }
      },

      // 设置当前项目
      setCurrentItem: (item: AudioHistoryItem | null) => {
        set({ currentItem: item });
      },

      // 设置过滤条件
      setFilter: (filter: AudioHistoryFilter) => {
        set({ filter });
        get().loadItems(filter);
      },

      // 设置选中项目
      setSelectedIds: (ids: string[]) => {
        set({ selectedIds: ids });
      },

      // 切换选中状态
      toggleSelection: (id: string) => {
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedIds, id],
        }));
      },

      // 清除选中
      clearSelection: () => {
        set({ selectedIds: [] });
      },

      // 加载统计信息
      loadStats: async () => {
        const { service } = get();
        if (!service) return;

        try {
          const stats = await service.getStatistics();
          set({ stats });
        } catch (error) {
          console.error('加载统计信息失败:', error);
        }
      },

      // 清除错误
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'audio-history-store',
    }
  )
);
```

## 错误处理策略

### 错误分类和处理

1. **存储错误**
   - IndexedDB 不可用或损坏
   - 数据库连接失败
   - 存储空间不足

2. **数据验证错误**
   - 无效的文件格式
   - 数据结构不匹配
   - 必填字段缺失

3. **网络错误**（数据库方案）
   - 请求超时
   - 服务器错误
   - 认证失败

4. **业务逻辑错误**
   - 重复创建记录
   - 删除不存在的记录
   - 权限不足

### 错误处理机制

```typescript
class ErrorHandler {
  static handle(error: unknown, context: string): string {
    console.error(`[${context}] Error:`, error);

    if (error instanceof DOMException) {
      // IndexedDB 错误
      switch (error.name) {
        case 'QuotaExceededError':
          return '存储空间不足，请清理一些历史记录';
        case 'InvalidStateError':
          return '数据库状态异常，请刷新页面重试';
        case 'NotFoundError':
          return '请求的数据不存在';
        default:
          return '存储操作失败，请重试';
      }
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      // 网络错误
      return '网络连接失败，请检查网络状态';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return '未知错误，请重试';
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }
}
```

## 测试策略

### 单元测试

1. **存储适配器测试**
   - CRUD 操作正确性
   - 错误处理机制
   - 数据验证逻辑

2. **服务层测试**
   - 业务逻辑正确性
   - 状态转换逻辑
   - 异常处理

3. **组件测试**
   - 用户交互响应
   - 状态更新正确性
   - 错误状态显示

### 集成测试

1. **存储集成测试**
   - 不同存储引擎的一致性
   - 数据迁移功能
   - 性能基准测试

2. **端到端测试**
   - 完整的用户操作流程
   - 跨组件数据流
   - 错误恢复机制

### 性能测试

1. **大数据量测试**
   - 1000+ 历史记录的加载性能
   - 搜索和过滤响应时间
   - 内存使用情况

2. **并发操作测试**
   - 同时进行多个操作的稳定性
   - 数据一致性保证
   - 竞态条件处理

现在我需要使用 prework 工具来分析验收标准，然后完成正确性属性部分：

## 正确性属性

_属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上，是关于系统应该做什么的正式声明。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。_

### 属性 1: 历史记录项信息完整性

_对于任何_ 历史记录项的渲染结果，都应该包含文件名、上传时间、文件大小、转录状态等所有必需的基本信息
**验证需求: 需求 1.4**

### 属性 2: 上传文件自动创建历史记录

_对于任何_ 成功上传的音频文件，系统都应该自动创建对应的历史记录项，且该记录项包含正确的文件信息
**验证需求: 需求 2.1**

### 属性 3: 处理结果自动保存

_对于任何_ 完成转录或翻译处理的音频文件，系统都应该将处理结果正确保存到对应的历史记录项中
**验证需求: 需求 2.2, 2.3**

### 属性 4: 唯一标识符生成

_对于任何_ 新创建的历史记录项，系统都应该生成唯一的标识符，确保不会与现有记录冲突
**验证需求: 需求 2.5**

### 属性 5: 输入验证规则

_对于任何_ 用户输入的标题修改，系统都应该验证长度不超过100个字符，超出时拒绝保存
**验证需求: 需求 3.2**

### 属性 6: 标签管理功能

_对于任何_ 标签的添加或删除操作，系统都应该实时更新标签列表并正确保存到存储中
**验证需求: 需求 3.3**

### 属性 7: 编辑保存功能

_对于任何_ 有效的编辑保存操作，系统都应该验证数据有效性并成功更新到存储中
**验证需求: 需求 3.4**

### 属性 8: 删除操作完整性

_对于任何_ 确认的删除操作，系统都应该从存储中完全移除对应的历史记录项，且数据不可恢复
**验证需求: 需求 4.2, 4.3, 9.4**

### 属性 9: 批量删除功能

_对于任何_ 批量删除操作，系统都应该能够同时删除多个选中的历史记录项
**验证需求: 需求 4.5**

### 属性 10: 搜索过滤功能

_对于任何_ 搜索关键词或过滤条件，系统都应该返回匹配的历史记录，且结果准确包含所有符合条件的记录
**验证需求: 需求 5.1, 5.2, 5.3, 5.4**

### 属性 11: 数据持久性

_对于任何_ 保存的历史记录数据，在用户关闭浏览器后重新打开时都应该能够正确恢复
**验证需求: 需求 7.1**

### 属性 12: 错误隔离性

_对于任何_ 历史记录功能中发生的错误，都不应该影响主要转录功能的正常工作
**验证需求: 需求 2.4, 3.5, 4.4, 8.5**

### 属性 13: 系统集成功能

_对于任何_ 模式切换、转录完成或历史记录点击操作，相关的集成功能都应该正常工作且数据状态保持一致
**验证需求: 需求 10.1, 10.2, 10.4**

## 错误处理

### 错误分类

1. **存储层错误**
   - IndexedDB 不可用或损坏
   - 数据库连接失败
   - 存储空间不足
   - 数据序列化/反序列化失败

2. **数据验证错误**
   - 无效的文件格式
   - 数据结构不匹配
   - 必填字段缺失
   - 数据类型错误

3. **网络层错误**（数据库方案）
   - 请求超时
   - 服务器内部错误
   - 认证失败
   - 网络连接中断

4. **业务逻辑错误**
   - 重复操作
   - 资源不存在
   - 权限不足
   - 状态冲突

### 错误处理策略

1. **优雅降级**: 历史记录功能错误不影响主要转录功能
2. **用户友好**: 提供清晰的错误信息和恢复建议
3. **自动重试**: 对于临时性错误实现指数退避重试
4. **数据保护**: 确保错误情况下数据不会损坏或丢失
5. **日志记录**: 记录详细的错误信息用于调试和监控

### 错误恢复机制

```typescript
interface ErrorRecoveryStrategy {
  // 存储错误恢复
  handleStorageError(error: Error): Promise<void>;

  // 数据损坏恢复
  handleDataCorruption(): Promise<void>;

  // 网络错误恢复
  handleNetworkError(error: Error): Promise<void>;

  // 清理和重置
  resetToCleanState(): Promise<void>;
}
```

## 测试策略

### 双重测试方法

本系统采用单元测试和基于属性的测试相结合的方法：

- **单元测试**: 验证特定示例、边界情况和错误条件
- **属性测试**: 通过随机化验证所有输入的通用属性
- 两者互补，提供全面覆盖（单元测试捕获具体错误，属性测试验证一般正确性）

### 单元测试重点

单元测试应专注于：

- 演示正确行为的具体示例
- 组件间的集成点
- 边界情况和错误条件

避免编写过多单元测试 - 基于属性的测试处理大量输入覆盖。

### 基于属性的测试配置

- 每个属性测试最少运行 100 次迭代（由于随机化）
- 每个属性测试必须引用其设计文档属性
- 标签格式: **功能: upload-audio-history, 属性 {编号}: {属性文本}**
- 每个正确性属性必须由单个基于属性的测试实现

### 测试实现示例

```typescript
// 属性测试示例
describe('属性测试: 上传音频历史记录', () => {
  test('属性 1: 历史记录项信息完整性', async () => {
    // 功能: upload-audio-history, 属性 1: 历史记录项信息完整性
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          fileName: fc.string({ minLength: 1 }),
          fileSize: fc.integer({ min: 1 }),
          fileMimeType: fc.constantFrom('audio/mp3', 'audio/wav', 'audio/m4a'),
          uploadTime: fc.date(),
          processingStatus: fc.constantFrom('uploading', 'transcribing', 'completed', 'error'),
        }),
        async (historyItem) => {
          const rendered = renderHistoryItem(historyItem);

          expect(rendered).toContain(historyItem.fileName);
          expect(rendered).toContain(historyItem.uploadTime.toLocaleString());
          expect(rendered).toContain(formatFileSize(historyItem.fileSize));
          expect(rendered).toContain(historyItem.processingStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('属性 2: 上传文件自动创建历史记录', async () => {
    // 功能: upload-audio-history, 属性 2: 上传文件自动创建历史记录
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1 }),
          size: fc.integer({ min: 1 }),
          type: fc.constantFrom('audio/mp3', 'audio/wav', 'audio/m4a'),
        }),
        async (fileProps) => {
          const mockFile = new File([''], fileProps.name, {
            type: fileProps.type,
            lastModified: Date.now()
          });
          Object.defineProperty(mockFile, 'size', { value: fileProps.size });

          const initialCount = await historyService.getStatistics().then(s => s.totalItems);
          await historyService.createFromUpload(mockFile);
          const finalCount = await historyService.getStatistics().then(s => s.totalItems);

          expect(finalCount).toBe(initialCount + 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// 单元测试示例
describe('单元测试: 边界情况', () => {
  test('空历史记录列表显示', () => {
    const { getByText } = render(<RecordingLibrary />);
    expect(getByText('暂无历史记录')).toBeInTheDocument();
  });

  test('搜索结果为空显示', async () => {
    const { getByText, getByPlaceholderText } = render(<RecordingLibrary />);
    const searchInput = getByPlaceholderText('搜索录音...');

    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    await waitFor(() => {
      expect(getByText('未找到匹配记录')).toBeInTheDocument();
    });
  });
});
```

### 性能测试

1. **大数据量测试**
   - 测试 1000+ 历史记录的加载性能
   - 搜索和过滤响应时间基准
   - 内存使用监控

2. **存储性能测试**
   - IndexedDB vs 数据库存储的性能对比
   - 批量操作性能测试
   - 存储空间使用效率测试

3. **并发测试**
   - 同时进行多个操作的稳定性
   - 数据一致性保证
   - 竞态条件处理

### 集成测试

1. **跨组件集成**
   - UploadAudio 与历史记录的集成
   - RecordingLibrary 与状态管理的集成
   - 不同存储引擎的一致性测试

2. **端到端流程**
   - 完整的上传-转录-保存-显示流程
   - 编辑-保存-更新流程
   - 删除-确认-移除流程

## 总结

本设计文档提供了上传音频历史记录功能的完整技术方案，重点评估了四种主要存储方案：

1. **IndexedDB 方案**: 适合快速实现，单设备使用
2. **数据库方案**: 适合多设备同步，数据安全要求高
3. **localStorage 方案**: 仅适合原型验证
4. **混合方案**: 最佳用户体验，但实现复杂

推荐采用阶段性实施策略，从 IndexedDB 方案开始，根据用户需求逐步升级。设计采用分层架构和适配器模式，确保不同存储方案间的平滑切换和代码复用。

通过 13 个核心正确性属性和全面的测试策略，确保系统的可靠性和正确性。错误处理机制保证了历史记录功能的问题不会影响主要转录功能的正常运行。
