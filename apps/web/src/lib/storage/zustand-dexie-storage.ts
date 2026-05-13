'use client';

/**
 * Zustand Persist 的 IndexedDB 存储适配器
 *
 * 基于 Dexie.js，替换 localStorage，解决 QuotaExceededError。
 * IndexedDB 存储上限远超 localStorage（~5MB），适合存储大量历史记录。
 *
 * 用法（配合 createJSONStorage）:
 *   import { persist, createJSONStorage } from 'zustand/middleware';
 *   import { createDexieStorage } from '@/lib/storage/zustand-dexie-storage';
 *
 *   persist(
 *     (set, get) => ({ ... }),
 *     {
 *       name: 'my-store',
 *       storage: createJSONStorage(() => createDexieStorage('my-db-name')),
 *     }
 *   )
 */

import Dexie, { type Table } from 'dexie';

// ==================== Dexie 数据库 ====================

class ZustandPersistDB extends Dexie {
  kv!: Table<{ id: string; value: string }>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      kv: 'id',
    });
  }
}

// ==================== 存储适配器 ====================

/**
 * zustand StateStorage 接口（字符串级别，由 createJSONStorage 负责 JSON 序列化）
 */
interface DexieStateStorage {
  getItem: (name: string) => Promise<string | null>;
  setItem: (name: string, value: string) => Promise<void>;
  removeItem: (name: string) => Promise<void>;
}

/**
 * 创建基于 Dexie 的 string-level 存储适配器
 * 需配合 zustand 的 createJSONStorage 使用
 *
 * @param dbName - IndexedDB 数据库名称
 * @param migrateFromLocalStorage - 是否自动从 localStorage 迁移旧数据（默认 true）
 */
export function createDexieStorage(
  dbName: string,
  migrateFromLocalStorage = true,
): DexieStateStorage {
  let db: ZustandPersistDB | null = null;

  const getDb = (): ZustandPersistDB => {
    if (!db) {
      db = new ZustandPersistDB(dbName);
    }
    return db;
  };

  return {
    getItem: async (name: string): Promise<string | null> => {
      // 一次性迁移：从 localStorage 读取旧数据并写入 IndexedDB
      if (migrateFromLocalStorage && typeof localStorage !== 'undefined') {
        try {
          const localValue = localStorage.getItem(name);
          if (localValue) {
            await getDb().kv.put({ id: name, value: localValue });
            localStorage.removeItem(name);
            return localValue;
          }
        } catch {
          // localStorage 不可用（SSR、隐私模式等），忽略
        }
      }

      try {
        const item = await getDb().kv.get(name);
        return item?.value ?? null;
      } catch {
        return null;
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      await getDb().kv.put({ id: name, value });
    },

    removeItem: async (name: string): Promise<void> => {
      await getDb().kv.delete(name);
    },
  };
}
