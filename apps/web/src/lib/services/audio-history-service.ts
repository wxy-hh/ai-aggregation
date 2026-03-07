/**
 * Audio History Service
 *
 * This service provides high-level business logic for managing audio history records.
 * It acts as an abstraction layer over the storage adapter and handles common operations.
 */

import {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  StorageAdapter,
  ProcessingStatus,
  AudioHistoryServiceConfig,
  ErrorRecoveryStrategy,
} from '../../types/audio-history';
import {
  createErrorRecoveryStrategy,
  ErrorIsolationWrapper,
  DefaultErrorRecoveryStrategy,
} from './error-recovery';

/**
 * Error Handler Utility
 */
class ErrorHandler {
  static handle(error: unknown, context: string): string {
    console.error(`[${context}] Error:`, error);

    if (error instanceof DOMException) {
      // IndexedDB errors
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
      // Network errors
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

/**
 * Audio History Service Implementation
 */
export class AudioHistoryService {
  private storage: StorageAdapter;
  private maxRetries: number;
  private retryDelay: number;
  private errorRecovery: ErrorRecoveryStrategy;
  private errorIsolation: ErrorIsolationWrapper;

  constructor(config: AudioHistoryServiceConfig) {
    this.storage = config.storage;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.errorRecovery = config.errorRecovery || createErrorRecoveryStrategy();

    // Pass storage instance to error recovery if it's the default strategy
    if (
      this.errorRecovery instanceof DefaultErrorRecoveryStrategy &&
      'setStorage' in this.errorRecovery
    ) {
      (this.errorRecovery as any).setStorage(this.storage);
    }

    this.errorIsolation = new ErrorIsolationWrapper(this.errorRecovery);
  }

  /**
   * Create history record from uploaded file
   */
  async createFromUpload(
    file: File,
    transcriptionText?: string,
    translationText?: string
  ): Promise<AudioHistoryItem> {
    try {
      const duration = await this.getAudioDuration(file);

      // Convert File to Blob for storage
      const audioBlob = new Blob([file], { type: file.type });

      const item = await ErrorHandler.withRetry(
        () =>
          this.storage.create({
            fileName: file.name,
            fileSize: file.size,
            fileMimeType: file.type,
            uploadTime: new Date(),
            transcriptionText,
            translationText,
            processingStatus: this.determineInitialStatus(transcriptionText, translationText),
            tags: [],
            title: this.generateDefaultTitle(file.name),
            duration,
            audioBlob, // Save audio blob (will be kept for recent 10 items only)
          }),
        this.maxRetries,
        this.retryDelay
      );

      return item;
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.createFromUpload');
      throw new Error(message);
    }
  }

  /**
   * Update processing status and related data
   */
  async updateProcessingStatus(
    id: string,
    status: ProcessingStatus,
    data?: {
      transcriptionText?: string;
      translationText?: string;
      segments?: AudioHistoryItem['segments'];
      errorMessage?: string;
    }
  ): Promise<AudioHistoryItem> {
    try {
      return await ErrorHandler.withRetry(
        () =>
          this.storage.update(id, {
            processingStatus: status,
            ...data,
            updatedAt: new Date(),
          }),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.updateProcessingStatus');
      throw new Error(message);
    }
  }

  /**
   * Search and filter history records
   */
  async searchHistory(filter: AudioHistoryFilter): Promise<AudioHistoryItem[]> {
    try {
      return await ErrorHandler.withRetry(
        () => this.storage.getAll(filter),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.searchHistory');
      throw new Error(message);
    }
  }

  /**
   * Get history record by ID
   */
  async getById(id: string): Promise<AudioHistoryItem | null> {
    try {
      return await ErrorHandler.withRetry(
        () => this.storage.getById(id),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.getById');
      throw new Error(message);
    }
  }

  /**
   * Update history record
   */
  async updateItem(id: string, updates: Partial<AudioHistoryItem>): Promise<AudioHistoryItem> {
    try {
      // Validate title length if provided
      if (updates.title && updates.title.length > 100) {
        throw new Error('标题长度不能超过100个字符');
      }

      return await ErrorHandler.withRetry(
        () =>
          this.storage.update(id, {
            ...updates,
            updatedAt: new Date(),
          }),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.updateItem');
      throw new Error(message);
    }
  }

  /**
   * Delete single history record
   */
  async deleteItem(id: string): Promise<void> {
    try {
      await ErrorHandler.withRetry(() => this.storage.delete(id), this.maxRetries, this.retryDelay);
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.deleteItem');
      throw new Error(message);
    }
  }

  /**
   * Delete multiple history records
   */
  async deleteMultiple(ids: string[]): Promise<void> {
    try {
      if (ids.length === 0) {
        return;
      }

      await ErrorHandler.withRetry(
        () => this.storage.deleteMany(ids),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.deleteMultiple');
      throw new Error(message);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<AudioHistoryStats> {
    try {
      return await ErrorHandler.withRetry(
        () => this.storage.getStats(),
        this.maxRetries,
        this.retryDelay
      );
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.getStatistics');
      throw new Error(message);
    }
  }

  /**
   * Clear all history records
   */
  async clearAll(): Promise<void> {
    try {
      await ErrorHandler.withRetry(() => this.storage.clear(), this.maxRetries, this.retryDelay);
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.clearAll');
      throw new Error(message);
    }
  }

  /**
   * Get storage information
   */
  async getStorageInfo() {
    try {
      return await this.storage.getStorageInfo();
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.getStorageInfo');
      throw new Error(message);
    }
  }

  /**
   * Generate default title from filename
   */
  private generateDefaultTitle(fileName: string): string {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return nameWithoutExt || '未命名音频';
  }

  /**
   * Get audio duration from file
   */
  private async getAudioDuration(file: File): Promise<number | undefined> {
    return new Promise((resolve) => {
      const audio = new Audio();

      const cleanup = () => {
        URL.revokeObjectURL(audio.src);
      };

      audio.onloadedmetadata = () => {
        resolve(audio.duration);
        cleanup();
      };

      audio.onerror = () => {
        resolve(undefined);
        cleanup();
      };

      // Set a timeout to avoid hanging
      setTimeout(() => {
        resolve(undefined);
        cleanup();
      }, 5000);

      audio.src = URL.createObjectURL(file);
    });
  }

  /**
   * Determine initial processing status based on available data
   */
  private determineInitialStatus(
    transcriptionText?: string,
    translationText?: string
  ): ProcessingStatus {
    if (transcriptionText && translationText) {
      return 'completed';
    } else if (transcriptionText) {
      return 'translating';
    } else {
      return 'transcribing';
    }
  }

  /**
   * Get the underlying storage adapter (for advanced usage)
   */
  getStorageAdapter(): StorageAdapter {
    return this.storage;
  }

  /**
   * Get error recovery strategy
   */
  getErrorRecovery(): ErrorRecoveryStrategy {
    return this.errorRecovery;
  }

  /**
   * Check if the service is in a healthy state
   */
  isHealthy(): boolean {
    if ('isHealthy' in this.errorRecovery && typeof this.errorRecovery.isHealthy === 'function') {
      return (this.errorRecovery as any).isHealthy();
    }
    return true;
  }

  /**
   * Reset the service to a clean state (use with caution)
   */
  async resetToCleanState(): Promise<void> {
    try {
      await this.errorRecovery.resetToCleanState();
      await this.storage.clear();
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.resetToCleanState');
      throw new Error(message);
    }
  }

  /**
   * Clean old records
   */
  async cleanOldRecords(options: {
    olderThanDays?: number;
    keepCount?: number;
    targetSizeBytes?: number;
  }): Promise<number> {
    try {
      if (
        this.errorRecovery instanceof DefaultErrorRecoveryStrategy &&
        'cleanOldRecords' in this.errorRecovery
      ) {
        return await (this.errorRecovery as any).cleanOldRecords(options);
      }
      throw new Error('清理功能不可用');
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.cleanOldRecords');
      throw new Error(message);
    }
  }

  /**
   * Validate and repair data
   */
  async validateAndRepairData(): Promise<{
    totalItems: number;
    corruptedItems: number;
    repairedItems: number;
    deletedItems: number;
  }> {
    try {
      const { validateAndRepairData } = await import('../storage');
      if ('getDbName' in this.storage) {
        return await validateAndRepairData(this.storage as any);
      }
      throw new Error('验证功能不可用');
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.validateAndRepairData');
      throw new Error(message);
    }
  }

  /**
   * Migrate data to current schema version
   */
  async migrateData(): Promise<{
    itemsProcessed: number;
    itemsMigrated: number;
    itemsFailed: number;
    errors: string[];
  }> {
    try {
      const { migrateAllItems, saveMigrationLog, createMigrationLog, CURRENT_SCHEMA_VERSION } =
        await import('../storage');

      // Get all items
      const allItems = await this.storage.getAll();

      // Migrate items
      const result = migrateAllItems(allItems);

      // Save migration log
      const log = createMigrationLog(0, CURRENT_SCHEMA_VERSION, result);
      saveMigrationLog(log);

      // If any items were migrated, update them in storage
      if (result.itemsMigrated > 0) {
        // Clear existing data
        await this.storage.clear();

        // Add migrated items
        for (const item of result.migratedItems) {
          await this.storage.create({
            fileName: item.fileName,
            fileSize: item.fileSize,
            fileMimeType: item.fileMimeType,
            uploadTime: item.uploadTime,
            transcriptionText: item.transcriptionText,
            translationText: item.translationText,
            processingStatus: item.processingStatus,
            tags: item.tags,
            title: item.title,
            duration: item.duration,
            errorMessage: item.errorMessage,
          });
        }
      }

      return {
        itemsProcessed: result.itemsProcessed,
        itemsMigrated: result.itemsMigrated,
        itemsFailed: result.itemsFailed,
        errors: result.errors,
      };
    } catch (error) {
      const message = ErrorHandler.handle(error, 'AudioHistoryService.migrateData');
      throw new Error(message);
    }
  }

  /**
   * Execute operation with error isolation
   * This ensures errors in history operations don't affect the main transcription feature
   */
  async executeWithIsolation<T>(
    operation: () => Promise<T>,
    context: string,
    fallbackValue?: T
  ): Promise<T | null> {
    return this.errorIsolation.executeIsolated(operation, context, fallbackValue);
  }
}

/**
 * Factory function to create AudioHistoryService
 */
export function createAudioHistoryService(config: AudioHistoryServiceConfig): AudioHistoryService {
  return new AudioHistoryService(config);
}

// Re-export error recovery utilities
export {
  DefaultErrorRecoveryStrategy,
  ErrorIsolationWrapper,
  createErrorRecoveryStrategy,
  createErrorIsolationWrapper,
} from './error-recovery';
