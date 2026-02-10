/**
 * IndexedDB Storage Adapter
 *
 * This file implements the StorageAdapter interface using IndexedDB with Dexie.js
 * for local browser storage of audio history records.
 */

import Dexie, { Table } from 'dexie';
import {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  StorageAdapter,
  StorageInfo,
  ProcessingStatus,
} from '../../types/audio-history';
import { validateAudioHistoryItem } from './data-validation';
import { generateUUID } from '../utils/uuid';

/**
 * Dexie Database Schema
 */
class AudioHistoryDB extends Dexie {
  audioHistory!: Table<AudioHistoryItem>;

  constructor(dbName: string = 'AudioHistoryDB') {
    super(dbName);

    // Define schema version 1
    this.version(1).stores({
      audioHistory: '++id, fileName, uploadTime, processingStatus, tags, title, createdAt',
    });

    // Schema version 2: Add audioBlob support
    this.version(2).stores({
      audioHistory: '++id, fileName, uploadTime, processingStatus, tags, title, createdAt',
    });

    // Add hooks for data transformation
    this.audioHistory.hook('creating', (primKey, obj, trans) => {
      // Ensure dates are properly stored
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
      obj.uploadTime = obj.uploadTime || new Date();
    });

    this.audioHistory.hook('updating', (modifications: any, primKey, obj, trans) => {
      // Update the updatedAt timestamp on any modification
      modifications.updatedAt = new Date();
    });
  }
}

/**
 * IndexedDB Storage Implementation
 */
export class IndexedDBStorage implements StorageAdapter {
  private db: AudioHistoryDB;
  private dbName: string;

  constructor(dbName: string = 'AudioHistoryDB') {
    this.dbName = dbName;
    this.db = new AudioHistoryDB(dbName);
  }

  /**
   * Get the database name
   */
  getDbName(): string {
    return this.dbName;
  }

  /**
   * Create a new audio history item
   */
  async create(
    item: Omit<AudioHistoryItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AudioHistoryItem> {
    try {
      const now = new Date();
      const newItem: AudioHistoryItem = {
        ...item,
        id: generateUUID(), // Generate unique ID with fallback support
        createdAt: now,
        updatedAt: now,
      };

      // Validate before creating
      const validation = validateAudioHistoryItem(newItem);
      if (!validation.isValid) {
        console.warn('[IndexedDBStorage] Validation warnings on create:', validation.errors);

        // Apply repairs if available
        if (validation.repairs) {
          Object.assign(newItem, validation.repairs);
        }
      }

      await this.db.audioHistory.add(newItem);

      // Clean up old audio blobs after adding new item
      await this.cleanupOldAudioBlobs();

      return newItem;
    } catch (error) {
      throw new Error(
        `Failed to create audio history item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get audio history item by ID
   */
  async getById(id: string): Promise<AudioHistoryItem | null> {
    try {
      const item = await this.db.audioHistory.where('id').equals(id).first();
      return item ? this.deserializeItem(item) : null;
    } catch (error) {
      throw new Error(
        `Failed to get audio history item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean up old audio blobs (keep only the most recent 10)
   */
  private async cleanupOldAudioBlobs(): Promise<void> {
    try {
      const allItems = await this.db.audioHistory.orderBy('createdAt').reverse().toArray();

      // Keep audio blobs for the most recent 10 items
      const KEEP_AUDIO_COUNT = 10;

      if (allItems.length > KEEP_AUDIO_COUNT) {
        const itemsToCleanup = allItems.slice(KEEP_AUDIO_COUNT);

        for (const item of itemsToCleanup) {
          if (item.audioBlob) {
            // Remove audioBlob but keep the text data
            await this.db.audioHistory.update(item.id, { audioBlob: undefined });
            console.log(
              `[IndexedDBStorage] Removed audio blob from item ${item.id} (${item.fileName})`
            );
          }
        }

        console.log(`[IndexedDBStorage] Cleaned up ${itemsToCleanup.length} old audio blobs`);
      }
    } catch (error) {
      console.error('[IndexedDBStorage] Error cleaning up old audio blobs:', error);
      // Don't throw - this is a background cleanup operation
    }
  }

  /**
   * Get all audio history items with optional filtering
   */
  async getAll(filter?: AudioHistoryFilter): Promise<AudioHistoryItem[]> {
    try {
      let query = this.db.audioHistory.orderBy('createdAt').reverse();

      // Apply search query filter
      if (filter?.searchQuery) {
        const searchTerm = filter.searchQuery.toLowerCase();
        query = query.filter(
          (item) =>
            item.title.toLowerCase().includes(searchTerm) ||
            item.fileName.toLowerCase().includes(searchTerm) ||
            item.transcriptionText?.toLowerCase().includes(searchTerm) ||
            item.translationText?.toLowerCase().includes(searchTerm) ||
            item.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
        );
      }

      // Apply date range filter
      if (filter?.dateRange) {
        query = query.filter(
          (item) =>
            item.createdAt >= filter.dateRange!.start && item.createdAt <= filter.dateRange!.end
        );
      }

      // Apply tags filter
      if (filter?.tags && filter.tags.length > 0) {
        query = query.filter((item) => filter.tags!.some((tag) => item.tags.includes(tag)));
      }

      // Apply status filter
      if (filter?.status && filter.status.length > 0) {
        query = query.filter((item) => filter.status!.includes(item.processingStatus));
      }

      const items = await query.toArray();
      return items.map((item) => this.deserializeItem(item));
    } catch (error) {
      throw new Error(
        `Failed to get audio history items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update an existing audio history item
   */
  async update(id: string, updates: Partial<AudioHistoryItem>): Promise<AudioHistoryItem> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      // Validate updates
      const existingItem = await this.getById(id);
      if (existingItem) {
        const updatedItem = { ...existingItem, ...updateData };
        const validation = validateAudioHistoryItem(updatedItem);

        if (!validation.isValid) {
          console.warn('[IndexedDBStorage] Validation warnings on update:', validation.errors);

          // Apply repairs if available
          if (validation.repairs) {
            Object.assign(updateData, validation.repairs);
          }
        }
      }

      await this.db.audioHistory.update(id, updateData);

      const updated = await this.getById(id);
      if (!updated) {
        throw new Error(`Item with id ${id} not found after update`);
      }

      return updated;
    } catch (error) {
      throw new Error(
        `Failed to update audio history item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete an audio history item by ID
   */
  async delete(id: string): Promise<void> {
    try {
      const deleteCount = await this.db.audioHistory.where('id').equals(id).delete();
      if (deleteCount === 0) {
        throw new Error(`Item with id ${id} not found`);
      }
    } catch (error) {
      throw new Error(
        `Failed to delete audio history item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete multiple audio history items by IDs
   */
  async deleteMany(ids: string[]): Promise<void> {
    try {
      await this.db.audioHistory.where('id').anyOf(ids).delete();
    } catch (error) {
      throw new Error(
        `Failed to delete multiple audio history items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Search audio history items by query
   */
  async search(query: string): Promise<AudioHistoryItem[]> {
    return this.getAll({ searchQuery: query });
  }

  /**
   * Get audio history items by date range
   */
  async getByDateRange(start: Date, end: Date): Promise<AudioHistoryItem[]> {
    return this.getAll({ dateRange: { start, end } });
  }

  /**
   * Get audio history items by tags
   */
  async getByTags(tags: string[]): Promise<AudioHistoryItem[]> {
    return this.getAll({ tags });
  }

  /**
   * Get statistics about audio history items
   */
  async getStats(): Promise<AudioHistoryStats> {
    try {
      const allItems = await this.db.audioHistory.toArray();

      return {
        totalItems: allItems.length,
        totalSize: allItems.reduce((sum, item) => sum + item.fileSize, 0),
        completedItems: allItems.filter((item) => item.processingStatus === 'completed').length,
        errorItems: allItems.filter((item) => item.processingStatus === 'error').length,
      };
    } catch (error) {
      throw new Error(
        `Failed to get audio history stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear all audio history items
   */
  async clear(): Promise<void> {
    try {
      await this.db.audioHistory.clear();
    } catch (error) {
      throw new Error(
        `Failed to clear audio history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<StorageInfo> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          available: (estimate.quota || 0) - (estimate.usage || 0),
          total: estimate.quota || 0,
        };
      }

      // Fallback for browsers that don't support storage estimation
      return {
        used: 0,
        available: 100 * 1024 * 1024, // Assume 100MB available
        total: 100 * 1024 * 1024,
      };
    } catch (error) {
      // Return fallback values if storage estimation fails
      return {
        used: 0,
        available: 100 * 1024 * 1024,
        total: 100 * 1024 * 1024,
      };
    }
  }

  /**
   * Deserialize item from database (convert date strings back to Date objects)
   */
  private deserializeItem(item: any): AudioHistoryItem {
    return {
      ...item,
      uploadTime: item.uploadTime instanceof Date ? item.uploadTime : new Date(item.uploadTime),
      createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
    };
  }
}

/**
 * Factory function to create IndexedDB storage instance
 */
export function createIndexedDBStorage(dbName?: string): IndexedDBStorage {
  return new IndexedDBStorage(dbName);
}

/**
 * Check if IndexedDB is supported in the current browser
 */
export function isIndexedDBSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (!('indexedDB' in window)) {
    return false;
  }

  // Additional check: try to open a test database
  try {
    const testDbName = '__indexeddb_test__';
    const request = window.indexedDB.open(testDbName);

    request.onsuccess = () => {
      // Clean up test database
      window.indexedDB.deleteDatabase(testDbName);
    };

    request.onerror = () => {
      // IndexedDB is blocked or unavailable
      return false;
    };

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clean old records by date or size
 */
export async function cleanOldRecords(
  storage: IndexedDBStorage,
  options: {
    olderThanDays?: number;
    keepCount?: number;
    targetSizeBytes?: number;
  }
): Promise<number> {
  try {
    const allItems = await storage.getAll();

    let itemsToDelete: AudioHistoryItem[] = [];

    // Clean by date
    if (options.olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.olderThanDays);

      itemsToDelete = allItems.filter((item) => item.createdAt < cutoffDate);
    }

    // Clean by count (keep only the most recent N items)
    if (options.keepCount && allItems.length > options.keepCount) {
      const sortedItems = [...allItems].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      itemsToDelete = sortedItems.slice(options.keepCount);
    }

    // Clean by size (remove oldest items until under target size)
    if (options.targetSizeBytes) {
      const sortedItems = [...allItems].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      let totalSize = allItems.reduce((sum, item) => sum + item.fileSize, 0);

      for (const item of sortedItems) {
        if (totalSize <= options.targetSizeBytes) {
          break;
        }
        itemsToDelete.push(item);
        totalSize -= item.fileSize;
      }
    }

    // Remove duplicates
    const uniqueIds = new Set(itemsToDelete.map((item) => item.id));
    const idsToDelete = Array.from(uniqueIds);

    if (idsToDelete.length > 0) {
      await storage.deleteMany(idsToDelete);
    }

    return idsToDelete.length;
  } catch (error) {
    console.error('[cleanOldRecords] Error cleaning old records:', error);
    throw new Error(
      `Failed to clean old records: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate and repair corrupted data
 */
export async function validateAndRepairData(storage: IndexedDBStorage): Promise<{
  totalItems: number;
  corruptedItems: number;
  repairedItems: number;
  deletedItems: number;
}> {
  try {
    const { validateAllItems } = await import('./data-validation');
    const allItems = await storage.getAll();

    const validationResult = validateAllItems(allItems);

    let repairedItems = 0;
    let deletedItems = 0;

    for (const [itemId, result] of validationResult.results.entries()) {
      if (!result.isValid) {
        if (result.canRepair && result.repairs) {
          // Attempt to repair
          try {
            await storage.update(itemId, result.repairs);
            repairedItems++;
            console.log(`[validateAndRepairData] Repaired item ${itemId}`);
          } catch (repairError) {
            // If repair fails, delete the item
            try {
              await storage.delete(itemId);
              deletedItems++;
              console.log(`[validateAndRepairData] Deleted unrepairable item ${itemId}`);
            } catch (deleteError) {
              console.error(
                `[validateAndRepairData] Failed to delete item ${itemId}:`,
                deleteError
              );
            }
          }
        } else {
          // Cannot repair, delete the item
          try {
            await storage.delete(itemId);
            deletedItems++;
            console.log(`[validateAndRepairData] Deleted corrupted item ${itemId}`);
          } catch (deleteError) {
            console.error(`[validateAndRepairData] Failed to delete item ${itemId}:`, deleteError);
          }
        }
      }
    }

    return {
      totalItems: validationResult.totalItems,
      corruptedItems: validationResult.invalidItems,
      repairedItems,
      deletedItems,
    };
  } catch (error) {
    console.error('[validateAndRepairData] Error validating data:', error);
    throw new Error(
      `Failed to validate and repair data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Reset database to clean state
 */
export async function resetDatabase(dbName: string = 'AudioHistoryDB'): Promise<void> {
  try {
    // Delete the database
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(dbName);

      request.onsuccess = () => {
        console.log(`[resetDatabase] Database ${dbName} deleted successfully`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[resetDatabase] Error deleting database ${dbName}`);
        reject(new Error(`Failed to delete database: ${request.error?.message}`));
      };

      request.onblocked = () => {
        console.warn(
          `[resetDatabase] Database deletion blocked. Close all tabs using this database.`
        );
        reject(new Error('Database deletion blocked. Please close all tabs using this database.'));
      };
    });

    // Wait a bit for the deletion to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error('[resetDatabase] Error resetting database:', error);
    throw new Error(
      `Failed to reset database: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
