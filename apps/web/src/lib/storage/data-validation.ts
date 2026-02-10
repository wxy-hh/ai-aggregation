/**
 * Data Validation and Migration Utilities
 *
 * This module provides utilities for validating audio history data integrity
 * and migrating data between different schema versions.
 */

import { AudioHistoryItem, ProcessingStatus, isProcessingStatus } from '../../types/audio-history';
import { generateUUID } from '../utils/uuid';

/**
 * Validation result for a single item
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canRepair: boolean;
  repairs?: Partial<AudioHistoryItem>;
}

/**
 * Data migration log entry
 */
export interface MigrationLogEntry {
  timestamp: Date;
  fromVersion: number;
  toVersion: number;
  itemsProcessed: number;
  itemsMigrated: number;
  errors: string[];
}

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Validate a single audio history item
 */
export function validateAudioHistoryItem(item: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let canRepair = true;
  const repairs: Partial<AudioHistoryItem> = {};

  // Check required fields
  if (!item.id || typeof item.id !== 'string') {
    errors.push('Missing or invalid id');
    canRepair = false;
  }

  if (!item.fileName || typeof item.fileName !== 'string') {
    errors.push('Missing or invalid fileName');
    canRepair = false;
  }

  if (typeof item.fileSize !== 'number' || item.fileSize < 0) {
    errors.push('Missing or invalid fileSize');
    canRepair = false;
  }

  if (!item.fileMimeType || typeof item.fileMimeType !== 'string') {
    errors.push('Missing or invalid fileMimeType');
    canRepair = false;
  }

  // Check date fields
  if (!item.uploadTime) {
    errors.push('Missing uploadTime');
    repairs.uploadTime = new Date();
  } else if (!(item.uploadTime instanceof Date)) {
    try {
      const date = new Date(item.uploadTime);
      if (isNaN(date.getTime())) {
        errors.push('Invalid uploadTime');
        repairs.uploadTime = new Date();
      } else {
        repairs.uploadTime = date;
      }
    } catch {
      errors.push('Invalid uploadTime');
      repairs.uploadTime = new Date();
    }
  }

  if (!item.createdAt) {
    errors.push('Missing createdAt');
    repairs.createdAt = new Date();
  } else if (!(item.createdAt instanceof Date)) {
    try {
      const date = new Date(item.createdAt);
      if (isNaN(date.getTime())) {
        errors.push('Invalid createdAt');
        repairs.createdAt = new Date();
      } else {
        repairs.createdAt = date;
      }
    } catch {
      errors.push('Invalid createdAt');
      repairs.createdAt = new Date();
    }
  }

  if (!item.updatedAt) {
    errors.push('Missing updatedAt');
    repairs.updatedAt = new Date();
  } else if (!(item.updatedAt instanceof Date)) {
    try {
      const date = new Date(item.updatedAt);
      if (isNaN(date.getTime())) {
        errors.push('Invalid updatedAt');
        repairs.updatedAt = new Date();
      } else {
        repairs.updatedAt = date;
      }
    } catch {
      errors.push('Invalid updatedAt');
      repairs.updatedAt = new Date();
    }
  }

  // Check processing status
  if (!item.processingStatus) {
    errors.push('Missing processingStatus');
    repairs.processingStatus = 'error' as ProcessingStatus;
  } else if (!isProcessingStatus(item.processingStatus)) {
    errors.push(`Invalid processingStatus: ${item.processingStatus}`);
    repairs.processingStatus = 'error' as ProcessingStatus;
  }

  // Check tags array
  if (!item.tags) {
    errors.push('Missing tags');
    repairs.tags = [];
  } else if (!Array.isArray(item.tags)) {
    errors.push('Invalid tags (not an array)');
    repairs.tags = [];
  } else if (!item.tags.every((tag: any) => typeof tag === 'string')) {
    warnings.push('Some tags are not strings');
    repairs.tags = item.tags.filter((tag: any) => typeof tag === 'string');
  }

  // Check title
  if (!item.title || typeof item.title !== 'string') {
    errors.push('Missing or invalid title');
    repairs.title = item.fileName || 'Untitled';
  } else if (item.title.length > 100) {
    warnings.push('Title exceeds 100 characters');
    repairs.title = item.title.substring(0, 100);
  }

  // Check optional fields
  if (item.transcriptionText !== undefined && typeof item.transcriptionText !== 'string') {
    warnings.push('Invalid transcriptionText type');
    repairs.transcriptionText = undefined;
  }

  if (item.translationText !== undefined && typeof item.translationText !== 'string') {
    warnings.push('Invalid translationText type');
    repairs.translationText = undefined;
  }

  if (item.duration !== undefined && (typeof item.duration !== 'number' || item.duration < 0)) {
    warnings.push('Invalid duration');
    repairs.duration = undefined;
  }

  if (item.errorMessage !== undefined && typeof item.errorMessage !== 'string') {
    warnings.push('Invalid errorMessage type');
    repairs.errorMessage = undefined;
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    canRepair: canRepair && errors.length > 0,
    repairs: Object.keys(repairs).length > 0 ? repairs : undefined,
  };
}

/**
 * Validate all items in a collection
 */
export function validateAllItems(items: any[]): {
  totalItems: number;
  validItems: number;
  invalidItems: number;
  repairableItems: number;
  results: Map<string, ValidationResult>;
} {
  const results = new Map<string, ValidationResult>();
  let validItems = 0;
  let invalidItems = 0;
  let repairableItems = 0;

  for (const item of items) {
    const result = validateAudioHistoryItem(item);
    results.set(item.id || 'unknown', result);

    if (result.isValid) {
      validItems++;
    } else {
      invalidItems++;
      if (result.canRepair) {
        repairableItems++;
      }
    }
  }

  return {
    totalItems: items.length,
    validItems,
    invalidItems,
    repairableItems,
    results,
  };
}

/**
 * Detect schema version of data
 */
export function detectSchemaVersion(item: any): number {
  // Version 1: Current schema with all required fields
  if (
    item.id &&
    item.fileName &&
    item.fileSize !== undefined &&
    item.fileMimeType &&
    item.uploadTime &&
    item.processingStatus &&
    item.tags !== undefined &&
    item.title &&
    item.createdAt &&
    item.updatedAt
  ) {
    return 1;
  }

  // Version 0: Legacy or unknown schema
  return 0;
}

/**
 * Migrate item from old schema to current schema
 */
export function migrateItem(item: any, fromVersion: number): AudioHistoryItem | null {
  if (fromVersion === CURRENT_SCHEMA_VERSION) {
    return item as AudioHistoryItem;
  }

  // Migration from version 0 to version 1
  if (fromVersion === 0) {
    try {
      const now = new Date();

      return {
        id: item.id || generateUUID(),
        fileName: item.fileName || 'unknown.mp3',
        fileSize: item.fileSize || 0,
        fileMimeType: item.fileMimeType || 'audio/mpeg',
        uploadTime: item.uploadTime ? new Date(item.uploadTime) : now,
        transcriptionText: item.transcriptionText,
        translationText: item.translationText,
        processingStatus: isProcessingStatus(item.processingStatus)
          ? item.processingStatus
          : 'error',
        tags: Array.isArray(item.tags) ? item.tags : [],
        title: item.title || item.fileName || 'Untitled',
        duration: typeof item.duration === 'number' ? item.duration : undefined,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt ? new Date(item.createdAt) : now,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : now,
      };
    } catch (error) {
      console.error('[migrateItem] Migration failed:', error);
      return null;
    }
  }

  console.error(`[migrateItem] Unknown schema version: ${fromVersion}`);
  return null;
}

/**
 * Migrate all items in a collection
 */
export function migrateAllItems(items: any[]): {
  itemsProcessed: number;
  itemsMigrated: number;
  itemsFailed: number;
  migratedItems: AudioHistoryItem[];
  errors: string[];
} {
  const migratedItems: AudioHistoryItem[] = [];
  const errors: string[] = [];
  let itemsMigrated = 0;
  let itemsFailed = 0;

  for (const item of items) {
    try {
      const version = detectSchemaVersion(item);

      if (version === CURRENT_SCHEMA_VERSION) {
        migratedItems.push(item as AudioHistoryItem);
      } else {
        const migrated = migrateItem(item, version);

        if (migrated) {
          migratedItems.push(migrated);
          itemsMigrated++;
        } else {
          itemsFailed++;
          errors.push(`Failed to migrate item: ${item.id || 'unknown'}`);
        }
      }
    } catch (error) {
      itemsFailed++;
      errors.push(
        `Error migrating item ${item.id || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return {
    itemsProcessed: items.length,
    itemsMigrated,
    itemsFailed,
    migratedItems,
    errors,
  };
}

/**
 * Create migration log entry
 */
export function createMigrationLog(
  fromVersion: number,
  toVersion: number,
  result: {
    itemsProcessed: number;
    itemsMigrated: number;
    errors: string[];
  }
): MigrationLogEntry {
  return {
    timestamp: new Date(),
    fromVersion,
    toVersion,
    itemsProcessed: result.itemsProcessed,
    itemsMigrated: result.itemsMigrated,
    errors: result.errors,
  };
}

/**
 * Save migration log to localStorage
 */
export function saveMigrationLog(log: MigrationLogEntry): void {
  try {
    const logs = getMigrationLogs();
    logs.push(log);

    // Keep only last 10 logs
    const recentLogs = logs.slice(-10);

    localStorage.setItem('audio-history-migration-logs', JSON.stringify(recentLogs));
  } catch (error) {
    console.error('[saveMigrationLog] Failed to save migration log:', error);
  }
}

/**
 * Get migration logs from localStorage
 */
export function getMigrationLogs(): MigrationLogEntry[] {
  try {
    const logsJson = localStorage.getItem('audio-history-migration-logs');
    if (!logsJson) {
      return [];
    }

    const logs = JSON.parse(logsJson);
    return logs.map((log: any) => ({
      ...log,
      timestamp: new Date(log.timestamp),
    }));
  } catch (error) {
    console.error('[getMigrationLogs] Failed to get migration logs:', error);
    return [];
  }
}

/**
 * Clear migration logs
 */
export function clearMigrationLogs(): void {
  try {
    localStorage.removeItem('audio-history-migration-logs');
  } catch (error) {
    console.error('[clearMigrationLogs] Failed to clear migration logs:', error);
  }
}
