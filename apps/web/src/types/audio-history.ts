/**
 * Audio History Types and Interfaces
 *
 * This file contains all TypeScript type definitions for the upload audio history system.
 * These types support the core data layer and storage infrastructure.
 */

export type ProcessingStatus =
  | 'uploading' // 上传中
  | 'transcribing' // 转录中
  | 'translating' // 翻译中
  | 'completed' // 完成
  | 'error'; // 错误

export interface AudioHistoryItem {
  id: string; // 唯一标识符
  fileName: string; // 原始文件名
  fileSize: number; // 文件大小（字节）
  fileMimeType: string; // 文件MIME类型
  uploadTime: Date; // 上传时间
  transcriptionText?: string; // 转录文本
  translationText?: string; // 翻译文本
  processingStatus: ProcessingStatus; // 处理状态
  tags: string[]; // 用户标签
  title: string; // 用户自定义标题
  duration?: number; // 音频时长（秒）
  audioUrl?: string; // 音频文件URL（可选，历史记录中通常不保存）
  errorMessage?: string; // 错误信息
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
}

export interface AudioHistoryFilter {
  searchQuery?: string; // 搜索关键词
  dateRange?: {
    // 日期范围
    start: Date;
    end: Date;
  };
  tags?: string[]; // 标签过滤
  status?: ProcessingStatus[]; // 状态过滤
}

export interface AudioHistoryStats {
  totalItems: number; // 总记录数
  totalSize: number; // 总文件大小
  completedItems: number; // 完成处理的记录数
  errorItems: number; // 错误记录数
}

export interface StorageInfo {
  used: number; // 已使用存储空间
  available: number; // 可用存储空间
  total: number; // 总存储空间
}

/**
 * Storage Adapter Interface
 *
 * This interface defines the contract for all storage implementations.
 * It provides a unified API for different storage backends (IndexedDB, Database, etc.)
 */
export interface StorageAdapter {
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
  getStorageInfo(): Promise<StorageInfo>;
  getDbName?(): string; // Optional method for IndexedDB storage
}

/**
 * Error Recovery Strategy Interface
 *
 * Defines methods for handling different types of errors in the audio history system
 */
export interface ErrorRecoveryStrategy {
  // 存储错误恢复
  handleStorageError(error: Error): Promise<void>;

  // 数据损坏恢复
  handleDataCorruption(): Promise<void>;

  // 网络错误恢复
  handleNetworkError(error: Error): Promise<void>;

  // 清理和重置
  resetToCleanState(): Promise<void>;
}

/**
 * Audio History Service Configuration
 */
export interface AudioHistoryServiceConfig {
  storage: StorageAdapter;
  errorRecovery?: ErrorRecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Type guards for runtime type checking
 */
export function isProcessingStatus(value: string): value is ProcessingStatus {
  return ['uploading', 'transcribing', 'translating', 'completed', 'error'].includes(value);
}

export function isAudioHistoryItem(obj: any): obj is AudioHistoryItem {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.fileName === 'string' &&
    typeof obj.fileSize === 'number' &&
    typeof obj.fileMimeType === 'string' &&
    obj.uploadTime instanceof Date &&
    isProcessingStatus(obj.processingStatus) &&
    Array.isArray(obj.tags) &&
    typeof obj.title === 'string' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  );
}
