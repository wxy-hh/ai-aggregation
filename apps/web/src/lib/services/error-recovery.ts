/**
 * Error Recovery Strategy Implementation
 *
 * This module provides error recovery mechanisms for the audio history system.
 * It ensures that errors in the history feature don't affect the main transcription functionality.
 */

import { ErrorRecoveryStrategy } from '../../types/audio-history';
import {
  IndexedDBStorage,
  cleanOldRecords,
  validateAndRepairData,
  resetDatabase,
} from '../storage';

/**
 * Default Error Recovery Strategy
 *
 * Implements graceful degradation and error isolation for the audio history system.
 */
export class DefaultErrorRecoveryStrategy implements ErrorRecoveryStrategy {
  private errorLog: Array<{ timestamp: Date; context: string; error: Error }> = [];
  private maxLogSize = 100;
  private storage?: IndexedDBStorage;

  constructor(storage?: IndexedDBStorage) {
    this.storage = storage;
  }

  /**
   * Set storage instance for advanced recovery operations
   */
  setStorage(storage: IndexedDBStorage): void {
    this.storage = storage;
  }

  /**
   * Handle storage errors with graceful degradation
   */
  async handleStorageError(error: Error): Promise<void> {
    this.logError('StorageError', error);

    // Check if it's a quota exceeded error
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[ErrorRecovery] Storage quota exceeded. Attempting automatic cleanup...');

      if (this.storage) {
        try {
          // Try to clean old records (older than 90 days)
          const deletedCount = await cleanOldRecords(this.storage, {
            olderThanDays: 90,
          });

          console.log(`[ErrorRecovery] Cleaned ${deletedCount} old records`);

          // If still not enough space, try more aggressive cleanup
          if (deletedCount === 0) {
            const stats = await this.storage.getStats();
            const keepCount = Math.floor(stats.totalItems * 0.5); // Keep only 50% of records

            const deletedCount2 = await cleanOldRecords(this.storage, {
              keepCount,
            });

            console.log(`[ErrorRecovery] Aggressive cleanup: removed ${deletedCount2} records`);
          }
        } catch (cleanupError) {
          console.error('[ErrorRecovery] Failed to clean old records:', cleanupError);
          // Notify user that manual cleanup is needed
          throw new Error('存储空间不足，请手动清理一些历史记录。您可以在设置中找到清理选项。');
        }
      } else {
        throw new Error('存储空间不足，请清理一些历史记录');
      }
    }

    // Check if IndexedDB is corrupted
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
      console.error('[ErrorRecovery] Database in invalid state. Attempting recovery...');

      if (this.storage) {
        try {
          // Try to validate and repair data
          const result = await validateAndRepairData(this.storage);

          console.log('[ErrorRecovery] Data validation result:', result);

          if (result.corruptedItems > 0) {
            console.warn(
              `[ErrorRecovery] Found ${result.corruptedItems} corrupted items. ` +
                `Repaired: ${result.repairedItems}, Deleted: ${result.deletedItems}`
            );
          }
        } catch (repairError) {
          console.error('[ErrorRecovery] Failed to repair data:', repairError);
          // As last resort, offer to reset database
          throw new Error(
            '数据库状态异常。建议重置数据库以恢复正常功能。注意：这将清除所有历史记录。'
          );
        }
      } else {
        throw new Error('数据库状态异常，请刷新页面重试');
      }
    }

    // Check if IndexedDB is not supported
    if (error.message && error.message.includes('not supported')) {
      throw new Error(
        '您的浏览器不支持历史记录功能。请使用现代浏览器（Chrome、Firefox、Edge等）。'
      );
    }

    // Ensure the error doesn't propagate to the main application
    // The history feature should fail gracefully
  }

  /**
   * Handle data corruption with recovery attempts
   */
  async handleDataCorruption(): Promise<void> {
    this.logError('DataCorruption', new Error('Data corruption detected'));

    console.error('[ErrorRecovery] Data corruption detected. Attempting recovery...');

    if (this.storage) {
      try {
        const result = await validateAndRepairData(this.storage);

        console.log('[ErrorRecovery] Data validation and repair completed:', result);

        if (result.deletedItems > 0) {
          console.warn(
            `[ErrorRecovery] Deleted ${result.deletedItems} corrupted items that could not be repaired`
          );
        }

        if (result.repairedItems > 0) {
          console.log(`[ErrorRecovery] Successfully repaired ${result.repairedItems} items`);
        }
      } catch (error) {
        console.error('[ErrorRecovery] Failed to repair corrupted data:', error);
        throw new Error('数据损坏严重，建议重置数据库');
      }
    }
  }

  /**
   * Handle network errors (for future database storage implementation)
   */
  async handleNetworkError(error: Error): Promise<void> {
    this.logError('NetworkError', error);

    console.warn('[ErrorRecovery] Network error occurred:', error.message);

    // In a real implementation with remote storage, you might want to:
    // 1. Queue operations for retry when network is restored
    // 2. Switch to offline mode with local cache
    // 3. Notify user of connectivity issues
    // 4. Implement exponential backoff for retries

    // For IndexedDB-only implementation, network errors shouldn't occur
    // But we handle them for future extensibility
  }

  /**
   * Reset to clean state (last resort recovery)
   */
  async resetToCleanState(): Promise<void> {
    this.logError('ResetToCleanState', new Error('Resetting to clean state'));

    console.warn('[ErrorRecovery] Resetting audio history to clean state...');

    if (this.storage) {
      try {
        // Check if storage has getDbName method (IndexedDB specific)
        if ('getDbName' in this.storage && typeof this.storage.getDbName === 'function') {
          const dbName = this.storage.getDbName();

          // Clear all data first
          await this.storage.clear();

          // Then reset the database
          await resetDatabase(dbName);

          console.log('[ErrorRecovery] Database reset successfully');
        } else {
          // For other storage types, just clear the data
          await this.storage.clear();
          console.log('[ErrorRecovery] Storage cleared successfully');
        }

        // Clear error log
        this.errorLog = [];
      } catch (error) {
        console.error('[ErrorRecovery] Failed to reset database:', error);
        throw new Error(`重置数据库失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    } else {
      throw new Error('无法重置数据库：存储实例未初始化');
    }
  }

  /**
   * Clean old records manually
   */
  async cleanOldRecords(options: {
    olderThanDays?: number;
    keepCount?: number;
    targetSizeBytes?: number;
  }): Promise<number> {
    if (!this.storage) {
      throw new Error('存储实例未初始化');
    }

    try {
      const deletedCount = await cleanOldRecords(this.storage, options);
      console.log(`[ErrorRecovery] Manually cleaned ${deletedCount} records`);
      return deletedCount;
    } catch (error) {
      console.error('[ErrorRecovery] Failed to clean records:', error);
      throw new Error(`清理记录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * Get error log for debugging
   */
  getErrorLog(): Array<{ timestamp: Date; context: string; error: Error }> {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Check if system is in healthy state
   */
  isHealthy(): boolean {
    // Consider system unhealthy if there are too many recent errors
    const recentErrors = this.errorLog.filter(
      (log) => Date.now() - log.timestamp.getTime() < 60000 // Last minute
    );

    return recentErrors.length < 10;
  }

  /**
   * Log error for tracking
   */
  private logError(context: string, error: Error): void {
    this.errorLog.push({
      timestamp: new Date(),
      context,
      error,
    });

    // Limit log size to prevent memory issues
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }
}

/**
 * Error Isolation Wrapper
 *
 * Wraps operations to ensure errors don't propagate to the main application.
 * This is critical for maintaining the main transcription functionality.
 */
export class ErrorIsolationWrapper {
  private errorRecovery: ErrorRecoveryStrategy;

  constructor(errorRecovery: ErrorRecoveryStrategy) {
    this.errorRecovery = errorRecovery;
  }

  /**
   * Execute an operation with error isolation
   *
   * If the operation fails, the error is handled gracefully and doesn't propagate.
   * Returns null on error to allow the caller to handle the failure case.
   */
  async executeIsolated<T>(
    operation: () => Promise<T>,
    context: string,
    fallbackValue?: T
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      console.error(`[ErrorIsolation] Error in ${context}:`, error);

      // Handle different types of errors
      if (error instanceof DOMException) {
        await this.errorRecovery.handleStorageError(error);
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        await this.errorRecovery.handleNetworkError(error);
      } else if (error instanceof Error) {
        // Generic error handling
        console.error(`[ErrorIsolation] Unhandled error type in ${context}`);
      }

      // Return fallback value or null
      return fallbackValue !== undefined ? fallbackValue : null;
    }
  }

  /**
   * Execute an operation with error isolation (void return)
   */
  async executeIsolatedVoid(operation: () => Promise<void>, context: string): Promise<void> {
    try {
      await operation();
    } catch (error) {
      console.error(`[ErrorIsolation] Error in ${context}:`, error);

      // Handle different types of errors
      if (error instanceof DOMException) {
        await this.errorRecovery.handleStorageError(error);
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        await this.errorRecovery.handleNetworkError(error);
      }

      // Don't throw - just log and continue
      // This ensures the main application continues to function
    }
  }
}

/**
 * Factory function to create error recovery strategy
 */
export function createErrorRecoveryStrategy(): ErrorRecoveryStrategy {
  return new DefaultErrorRecoveryStrategy();
}

/**
 * Factory function to create error isolation wrapper
 */
export function createErrorIsolationWrapper(
  errorRecovery?: ErrorRecoveryStrategy
): ErrorIsolationWrapper {
  const recovery = errorRecovery || createErrorRecoveryStrategy();
  return new ErrorIsolationWrapper(recovery);
}
