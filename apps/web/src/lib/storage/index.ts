/**
 * Storage Layer Exports
 *
 * This file exports all storage-related functionality for the audio history system.
 */

export {
  IndexedDBStorage,
  createIndexedDBStorage,
  isIndexedDBSupported,
  cleanOldRecords,
  validateAndRepairData,
  resetDatabase,
} from './indexeddb-storage';

export {
  validateAudioHistoryItem,
  validateAllItems,
  detectSchemaVersion,
  migrateItem,
  migrateAllItems,
  createMigrationLog,
  saveMigrationLog,
  getMigrationLogs,
  clearMigrationLogs,
  CURRENT_SCHEMA_VERSION,
} from './data-validation';

export type { ValidationResult, MigrationLogEntry } from './data-validation';

// Re-export types for convenience
export type {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  StorageAdapter,
  StorageInfo,
  ProcessingStatus,
  ErrorRecoveryStrategy,
  AudioHistoryServiceConfig,
} from '../../types/audio-history';

export { isProcessingStatus, isAudioHistoryItem } from '../../types/audio-history';
