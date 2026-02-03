/**
 * Migration Script for Audio Storage
 *
 * This script helps migrate existing history records to the new audio storage format.
 * It's safe to run multiple times - it will only process records that need migration.
 */

import { IndexedDBStorage } from './indexeddb-storage';

export interface MigrationResult {
  totalRecords: number;
  recordsWithAudio: number;
  recordsWithoutAudio: number;
  errors: string[];
}

/**
 * Migrate existing history records to new audio storage format
 *
 * This function:
 * 1. Checks all existing records
 * 2. Ensures the most recent 10 have proper audioBlob handling
 * 3. Removes audioBlob from older records
 */
export async function migrateAudioStorage(
  dbName: string = 'AudioHistoryDB'
): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalRecords: 0,
    recordsWithAudio: 0,
    recordsWithoutAudio: 0,
    errors: [],
  };

  try {
    const storage = new IndexedDBStorage(dbName);

    // Get all records sorted by creation date (newest first)
    const allRecords = await storage.getAll();
    result.totalRecords = allRecords.length;

    console.log(`[Migration] Found ${result.totalRecords} records to process`);

    // Sort by creation date (newest first)
    const sortedRecords = allRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const KEEP_AUDIO_COUNT = 10;

    // Process each record
    for (let i = 0; i < sortedRecords.length; i++) {
      const record = sortedRecords[i];

      try {
        if (i < KEEP_AUDIO_COUNT) {
          // Recent records: should have audio (if available)
          if (record.audioBlob) {
            result.recordsWithAudio++;
            console.log(`[Migration] Record ${i + 1}: Has audio ✓`);
          } else {
            result.recordsWithoutAudio++;
            console.log(`[Migration] Record ${i + 1}: No audio (expected for old records)`);
          }
        } else {
          // Older records: should NOT have audio
          if (record.audioBlob) {
            // Remove audio blob from old record
            await storage.update(record.id, { audioBlob: undefined });
            result.recordsWithoutAudio++;
            console.log(`[Migration] Record ${i + 1}: Removed audio blob ✓`);
          } else {
            result.recordsWithoutAudio++;
            console.log(`[Migration] Record ${i + 1}: Already without audio ✓`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to process record ${record.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        result.errors.push(errorMsg);
        console.error(`[Migration] ${errorMsg}`);
      }
    }

    console.log('[Migration] Complete!');
    console.log(`  Total records: ${result.totalRecords}`);
    console.log(`  With audio: ${result.recordsWithAudio}`);
    console.log(`  Without audio: ${result.recordsWithoutAudio}`);
    console.log(`  Errors: ${result.errors.length}`);

    return result;
  } catch (error) {
    const errorMsg = `Migration failed: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
    result.errors.push(errorMsg);
    console.error(`[Migration] ${errorMsg}`);
    throw error;
  }
}

/**
 * Check if migration is needed
 */
export async function checkMigrationNeeded(dbName: string = 'AudioHistoryDB'): Promise<boolean> {
  try {
    const storage = new IndexedDBStorage(dbName);
    const allRecords = await storage.getAll();

    if (allRecords.length === 0) {
      return false; // No records, no migration needed
    }

    // Sort by creation date (newest first)
    const sortedRecords = allRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const KEEP_AUDIO_COUNT = 10;

    // Check if any old records (beyond the first 10) have audio blobs
    for (let i = KEEP_AUDIO_COUNT; i < sortedRecords.length; i++) {
      if (sortedRecords[i].audioBlob) {
        return true; // Found old record with audio, migration needed
      }
    }

    return false; // All records are in correct state
  } catch (error) {
    console.error('[Migration Check] Error:', error);
    return false;
  }
}

/**
 * Get migration status report
 */
export async function getMigrationStatus(dbName: string = 'AudioHistoryDB'): Promise<{
  needsMigration: boolean;
  totalRecords: number;
  recentWithAudio: number;
  oldWithAudio: number;
  recommendation: string;
}> {
  try {
    const storage = new IndexedDBStorage(dbName);
    const allRecords = await storage.getAll();

    const sortedRecords = allRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const KEEP_AUDIO_COUNT = 10;

    let recentWithAudio = 0;
    let oldWithAudio = 0;

    for (let i = 0; i < sortedRecords.length; i++) {
      if (sortedRecords[i].audioBlob) {
        if (i < KEEP_AUDIO_COUNT) {
          recentWithAudio++;
        } else {
          oldWithAudio++;
        }
      }
    }

    const needsMigration = oldWithAudio > 0;

    let recommendation = '';
    if (needsMigration) {
      recommendation = `发现 ${oldWithAudio} 条旧记录仍保留音频文件，建议运行迁移以释放存储空间。`;
    } else if (allRecords.length === 0) {
      recommendation = '没有历史记录，无需迁移。';
    } else {
      recommendation = '所有记录已符合新的存储策略，无需迁移。';
    }

    return {
      needsMigration,
      totalRecords: allRecords.length,
      recentWithAudio,
      oldWithAudio,
      recommendation,
    };
  } catch (error) {
    console.error('[Migration Status] Error:', error);
    throw error;
  }
}

/**
 * Run migration with user confirmation (for use in browser console)
 */
export async function runMigrationWithConfirmation(): Promise<void> {
  try {
    const status = await getMigrationStatus();

    console.log('=== 音频存储迁移状态 ===');
    console.log(`总记录数: ${status.totalRecords}`);
    console.log(`最近10条有音频: ${status.recentWithAudio}`);
    console.log(`旧记录有音频: ${status.oldWithAudio}`);
    console.log(`建议: ${status.recommendation}`);
    console.log('========================');

    if (!status.needsMigration) {
      console.log('✓ 无需迁移');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `发现 ${status.oldWithAudio} 条旧记录需要清理音频文件。\n\n` +
          `这将释放约 ${(status.oldWithAudio * 5).toFixed(0)} MB 存储空间。\n\n` +
          `文本数据（转录和翻译）将被保留。\n\n` +
          `是否继续？`
      );

      if (!confirmed) {
        console.log('迁移已取消');
        return;
      }
    }

    console.log('开始迁移...');
    const result = await migrateAudioStorage();

    console.log('=== 迁移完成 ===');
    console.log(`处理记录: ${result.totalRecords}`);
    console.log(`保留音频: ${result.recordsWithAudio}`);
    console.log(`清理音频: ${result.recordsWithoutAudio}`);

    if (result.errors.length > 0) {
      console.error(`错误数量: ${result.errors.length}`);
      result.errors.forEach((err) => console.error(`  - ${err}`));
    } else {
      console.log('✓ 迁移成功，无错误');
    }
    console.log('================');
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).audioStorageMigration = {
    checkStatus: getMigrationStatus,
    runMigration: runMigrationWithConfirmation,
    checkNeeded: checkMigrationNeeded,
  };

  console.log('音频存储迁移工具已加载。使用方法：');
  console.log('  - audioStorageMigration.checkStatus() - 查看迁移状态');
  console.log('  - audioStorageMigration.runMigration() - 运行迁移');
  console.log('  - audioStorageMigration.checkNeeded() - 检查是否需要迁移');
}
