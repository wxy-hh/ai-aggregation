/**
 * 简历数据版本管理工具
 *
 * 本文件提供简历数据的版本管理功能，包括：
 * - 版本常量定义
 * - 版本检查
 * - 数据迁移逻辑
 * - 向后兼容性支持
 *
 * 设计原则：
 * 1. 每个版本都有明确的 schema 定义
 * 2. 支持从旧版本自动迁移到新版本
 * 3. 迁移过程不丢失用户数据
 * 4. 无法识别的版本拒绝导入
 */

import type { ResumeDocument } from '@/types/resume-editor';
import { ResumeDocumentSchema } from '@/schemas/resume-editor.schema';

/**
 * 当前支持的 schema 版本
 */
export const CURRENT_SCHEMA_VERSION = 'v1' as const;

/**
 * 所有支持的 schema 版本列表（按时间顺序）
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['v1'] as const;

/**
 * Schema 版本类型
 */
export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

/**
 * 版本检查结果
 */
export interface VersionCheckResult {
  /** 是否为有效版本 */
  isValid: boolean;
  /** 是否为当前版本 */
  isCurrent: boolean;
  /** 是否需要迁移 */
  needsMigration: boolean;
  /** 检测到的版本 */
  detectedVersion?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移后的数据 */
  data?: ResumeDocument;
  /** 错误信息 */
  error?: string;
  /** 迁移路径（如 v1 -> v2 -> v3） */
  migrationPath?: string[];
}

/**
 * 检查数据版本
 *
 * @param data - 待检查的数据对象
 * @returns 版本检查结果
 */
export function checkVersion(data: unknown): VersionCheckResult {
  // 检查数据是否为对象
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      isCurrent: false,
      needsMigration: false,
      error: '数据格式无效：必须是对象类型',
    };
  }

  // 检查是否包含 schemaVersion 字段
  const dataObj = data as Record<string, unknown>;
  if (!('schemaVersion' in dataObj)) {
    return {
      isValid: false,
      isCurrent: false,
      needsMigration: false,
      error: '数据格式无效：缺少 schemaVersion 字段',
    };
  }

  const version = dataObj.schemaVersion;

  // 检查版本是否为字符串
  if (typeof version !== 'string') {
    return {
      isValid: false,
      isCurrent: false,
      needsMigration: false,
      detectedVersion: String(version),
      error: '版本格式无效：schemaVersion 必须是字符串',
    };
  }

  // 检查是否为支持的版本
  const isSupported = SUPPORTED_SCHEMA_VERSIONS.includes(version as SchemaVersion);
  if (!isSupported) {
    return {
      isValid: false,
      isCurrent: false,
      needsMigration: false,
      detectedVersion: version,
      error: `不支持的版本：${version}。支持的版本：${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
    };
  }

  // 检查是否为当前版本
  const isCurrent = version === CURRENT_SCHEMA_VERSION;

  return {
    isValid: true,
    isCurrent,
    needsMigration: !isCurrent,
    detectedVersion: version,
  };
}

/**
 * 迁移数据到当前版本
 *
 * @param data - 待迁移的数据
 * @returns 迁移结果
 */
export function migrateToCurrentVersion(data: unknown): MigrationResult {
  // 先检查版本
  const versionCheck = checkVersion(data);

  if (!versionCheck.isValid) {
    return {
      success: false,
      error: versionCheck.error,
    };
  }

  // 如果已经是当前版本，直接返回
  if (versionCheck.isCurrent) {
    // 验证数据结构
    const parseResult = ResumeDocumentSchema.safeParse(data);
    if (!parseResult.success) {
      return {
        success: false,
        error: `数据结构验证失败：${parseResult.error.message}`,
      };
    }

    return {
      success: true,
      data: parseResult.data,
      migrationPath: [CURRENT_SCHEMA_VERSION],
    };
  }

  // 执行迁移（当前只有 v1，未来版本在这里添加迁移逻辑）
  const migrationPath: string[] = [];
  let currentData = data;

  // 示例：未来如果有 v2，迁移逻辑如下
  // if (versionCheck.detectedVersion === 'v1') {
  //   currentData = migrateV1ToV2(currentData);
  //   migrationPath.push('v1', 'v2');
  // }

  // 验证最终数据
  const parseResult = ResumeDocumentSchema.safeParse(currentData);
  if (!parseResult.success) {
    return {
      success: false,
      error: `迁移后数据验证失败：${parseResult.error.message}`,
    };
  }

  return {
    success: true,
    data: parseResult.data,
    migrationPath: migrationPath.length > 0 ? migrationPath : [versionCheck.detectedVersion!],
  };
}

/**
 * 创建默认的简历文档
 *
 * @param templateId - 模板 ID，默认为 'default'
 * @returns 默认简历文档
 */
export function createDefaultResumeDocument(templateId = 'default'): ResumeDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    templateId,
    personalInfo: {
      name: '未命名',
      title: '求职者',
      email: '',
      phone: '',
      location: '',
      summary: '',
    },
    workExperiences: [],
    educations: [],
    projects: [],
    skills: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 验证并规范化简历文档
 *
 * 用于导入数据时的最终验证和规范化
 *
 * @param data - 待验证的数据
 * @returns 验证结果
 */
export function validateAndNormalizeResumeDocument(data: unknown): {
  success: boolean;
  data?: ResumeDocument;
  error?: string;
} {
  // 先进行版本检查和迁移
  const migrationResult = migrateToCurrentVersion(data);

  if (!migrationResult.success) {
    return {
      success: false,
      error: migrationResult.error,
    };
  }

  // 确保 updatedAt 是最新的
  const normalizedData: ResumeDocument = {
    ...migrationResult.data!,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    data: normalizedData,
  };
}

/**
 * 获取本地存储的版本化 key
 *
 * @param version - Schema 版本，默认为当前版本
 * @returns 本地存储 key
 */
export function getStorageKey(version: SchemaVersion = CURRENT_SCHEMA_VERSION): string {
  return `resume-editor:${version}`;
}

/**
 * 从本地存储加载简历数据
 *
 * 自动处理版本检查和迁移
 *
 * @returns 加载结果
 */
export function loadFromLocalStorage(): {
  success: boolean;
  data?: ResumeDocument;
  error?: string;
  migrated?: boolean;
} {
  try {
    // 尝试从当前版本的 key 加载
    const currentKey = getStorageKey(CURRENT_SCHEMA_VERSION);
    const storedData = localStorage.getItem(currentKey);

    if (!storedData) {
      // 尝试从旧版本加载（未来如果有多个版本）
      // 当前只有 v1，所以直接返回
      return {
        success: false,
        error: '未找到保存的数据',
      };
    }

    // 解析 JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(storedData);
    } catch (parseError) {
      return {
        success: false,
        error: 'JSON 解析失败：数据格式损坏',
      };
    }

    // 验证和迁移
    const result = validateAndNormalizeResumeDocument(parsedData);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: result.data,
      migrated: false, // 当前版本不需要迁移
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '加载数据时发生未知错误',
    };
  }
}

/**
 * 保存简历数据到本地存储
 *
 * @param data - 简历文档
 * @returns 保存结果
 */
export function saveToLocalStorage(data: ResumeDocument): {
  success: boolean;
  error?: string;
} {
  try {
    // 验证数据
    const parseResult = ResumeDocumentSchema.safeParse(data);
    if (!parseResult.success) {
      return {
        success: false,
        error: `数据验证失败：${parseResult.error.message}`,
      };
    }

    // 更新时间戳
    const dataToSave: ResumeDocument = {
      ...parseResult.data,
      updatedAt: new Date().toISOString(),
    };

    // 保存到本地存储
    const key = getStorageKey(CURRENT_SCHEMA_VERSION);
    localStorage.setItem(key, JSON.stringify(dataToSave));

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '保存数据时发生未知错误',
    };
  }
}

/**
 * 清除本地存储的简历数据
 *
 * @returns 清除结果
 */
export function clearLocalStorage(): {
  success: boolean;
  error?: string;
} {
  try {
    // 清除所有版本的数据
    SUPPORTED_SCHEMA_VERSIONS.forEach((version) => {
      const key = getStorageKey(version);
      localStorage.removeItem(key);
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '清除数据时发生未知错误',
    };
  }
}

// ============================================================================
// 未来版本迁移函数示例（当有新版本时取消注释并实现）
// ============================================================================

/**
 * 从 v1 迁移到 v2（示例）
 *
 * @param data - v1 版本的数据
 * @returns v2 版本的数据
 */
// function migrateV1ToV2(data: unknown): unknown {
//   const v1Data = data as any;
//
//   // 执行迁移逻辑
//   const v2Data = {
//     ...v1Data,
//     schemaVersion: 'v2',
//     // 添加新字段或转换现有字段
//     newField: 'default value',
//   };
//
//   return v2Data;
// }

/**
 * 从 v2 迁移到 v3（示例）
 *
 * @param data - v2 版本的数据
 * @returns v3 版本的数据
 */
// function migrateV2ToV3(data: unknown): unknown {
//   const v2Data = data as any;
//
//   // 执行迁移逻辑
//   const v3Data = {
//     ...v2Data,
//     schemaVersion: 'v3',
//     // 添加新字段或转换现有字段
//   };
//
//   return v3Data;
// }
