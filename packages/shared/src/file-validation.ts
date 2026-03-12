/**
 * 文件验证工具
 */

/**
 * 支持的 MIME 类型
 */
export const ALLOWED_MIME_TYPES = {
  // 图片类型
  IMAGES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],

  // 文档类型
  DOCUMENTS: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],

  // 音频类型
  AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'],

  // 视频类型
  VIDEO: ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'],
};

/**
 * 文件大小限制 (字节)
 */
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
  AUDIO: 100 * 1024 * 1024, // 100MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  DEFAULT: 10 * 1024 * 1024, // 10MB
};

/**
 * 文件验证结果
 */
export interface FileValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息 (如果有) */
  error?: string;
  /** 文件类型分类 */
  category?: 'image' | 'document' | 'audio' | 'video' | 'other';
  /** 建议的文件名 */
  suggestedName?: string;
}

/**
 * 文件验证选项
 */
export interface FileValidationOptions {
  /** 允许的 MIME 类型数组 */
  allowedMimeTypes?: string[];
  /** 最大文件大小 (字节) */
  maxSize?: number;
  /** 是否验证文件名 */
  validateFileName?: boolean;
  /** 是否生成安全文件名 */
  generateSafeName?: boolean;
}

/**
 * 验证文件
 * @param file - 文件对象
 * @param options - 验证选项
 * @returns 验证结果
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): FileValidationResult {
  const {
    allowedMimeTypes = [
      ...ALLOWED_MIME_TYPES.IMAGES,
      ...ALLOWED_MIME_TYPES.DOCUMENTS,
      ...ALLOWED_MIME_TYPES.AUDIO,
    ],
    maxSize = FILE_SIZE_LIMITS.DEFAULT,
    validateFileName = true,
    generateSafeName = true,
  } = options;

  // 1. 检查文件大小
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);

    return {
      valid: false,
      error: `文件大小超过限制 (${fileSizeMB}MB > ${maxSizeMB}MB)`,
    };
  }

  // 2. 检查 MIME 类型
  if (!allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${file.type || '未知类型'}`,
    };
  }

  // 3. 验证文件名 (可选)
  if (validateFileName) {
    const fileNameValidation = validateFileNameSafe(file.name);
    if (!fileNameValidation.valid) {
      return {
        valid: false,
        error: fileNameValidation.error,
      };
    }
  }

  // 4. 确定文件分类
  const category = getFileCategory(file.type);

  // 5. 生成安全文件名 (可选)
  let suggestedName = file.name;
  if (generateSafeName) {
    suggestedName = generateSafeFileName(file.name);
  }

  return {
    valid: true,
    category,
    suggestedName,
  };
}

/**
 * 验证文件名安全性
 * @param fileName - 文件名
 * @returns 验证结果
 */
export function validateFileNameSafe(fileName: string): FileValidationResult {
  // 检查文件名长度
  if (fileName.length > 255) {
    return {
      valid: false,
      error: '文件名过长 (最大 255 字符)',
    };
  }

  // 检查非法字符
  const illegalChars = /[<>:"/\\|?*\x00-\x1F]/g;
  if (illegalChars.test(fileName)) {
    return {
      valid: false,
      error: '文件名包含非法字符',
    };
  }

  // 检查保留文件名
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];

  const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');
  if (reservedNames.includes(fileNameWithoutExt.toUpperCase())) {
    return {
      valid: false,
      error: '文件名是系统保留名称',
    };
  }

  // 检查文件扩展名
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'php', 'py', 'js', 'html', 'htm'];

  if (dangerousExtensions.includes(extension)) {
    return {
      valid: false,
      error: '不支持的可执行文件类型',
    };
  }

  return {
    valid: true,
  };
}

/**
 * 生成安全文件名
 * @param fileName - 原始文件名
 * @returns 安全文件名
 */
export function generateSafeFileName(fileName: string): string {
  // 移除路径信息
  const basename = fileName.split('/').pop()?.split('\\').pop() || fileName;

  // 替换非法字符
  let safeName = basename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  // 移除首尾空格和点
  safeName = safeName.trim().replace(/^\.+|\.+$/g, '');

  // 如果文件名为空，使用默认名称
  if (!safeName) {
    const timestamp = Date.now();
    safeName = `file_${timestamp}`;
  }

  // 限制长度
  if (safeName.length > 200) {
    const extension = safeName.split('.').pop() || '';
    const nameWithoutExt = safeName.slice(0, safeName.length - extension.length - 1);
    const truncatedName = nameWithoutExt.slice(0, 200 - extension.length - 1);
    safeName = `${truncatedName}.${extension}`;
  }

  return safeName;
}

/**
 * 获取文件分类
 * @param mimeType - MIME 类型
 * @returns 文件分类
 */
export function getFileCategory(
  mimeType: string
): 'image' | 'document' | 'audio' | 'video' | 'other' {
  if (ALLOWED_MIME_TYPES.IMAGES.includes(mimeType)) {
    return 'image';
  }

  if (ALLOWED_MIME_TYPES.DOCUMENTS.includes(mimeType)) {
    return 'document';
  }

  if (ALLOWED_MIME_TYPES.AUDIO.includes(mimeType)) {
    return 'audio';
  }

  if (ALLOWED_MIME_TYPES.VIDEO.includes(mimeType)) {
    return 'video';
  }

  return 'other';
}

/**
 * 获取文件大小限制
 * @param category - 文件分类
 * @returns 大小限制 (字节)
 */
export function getSizeLimitForCategory(category: string): number {
  switch (category) {
    case 'image':
      return FILE_SIZE_LIMITS.IMAGE;
    case 'document':
      return FILE_SIZE_LIMITS.DOCUMENT;
    case 'audio':
      return FILE_SIZE_LIMITS.AUDIO;
    case 'video':
      return FILE_SIZE_LIMITS.VIDEO;
    default:
      return FILE_SIZE_LIMITS.DEFAULT;
  }
}

/**
 * 验证多个文件
 * @param files - 文件数组
 * @param options - 验证选项
 * @returns 验证结果数组
 */
export function validateFiles(
  files: File[],
  options: FileValidationOptions = {}
): FileValidationResult[] {
  return files.map((file) => validateFile(file, options));
}

/**
 * 检查是否所有文件都有效
 * @param results - 验证结果数组
 * @returns 是否全部有效
 */
export function allFilesValid(results: FileValidationResult[]): boolean {
  return results.every((result) => result.valid);
}

/**
 * 获取验证错误信息
 * @param results - 验证结果数组
 * @returns 错误信息数组
 */
export function getValidationErrors(results: FileValidationResult[]): string[] {
  return results.filter((result) => !result.valid && result.error).map((result) => result.error!);
}
