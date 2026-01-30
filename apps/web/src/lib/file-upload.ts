import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const TEMP_DIR = process.env.TEMP_UPLOAD_DIR || '/tmp/voice-uploads';
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.aac'];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  // 验证文件类型
  const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const isValidType =
    ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(fileExtension);

  if (!isValidType) {
    return {
      valid: false,
      error: `不支持的文件类型。支持的格式: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  // 验证文件大小
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `文件大小超过限制。最大允许: ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB`,
    };
  }

  return { valid: true };
}

export async function saveUploadedFile(file: File): Promise<string> {
  // 验证文件
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 创建临时目录
  if (!existsSync(TEMP_DIR)) {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }

  // 生成唯一文件名（清理文件名，防止路径遍历）
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${Date.now()}-${sanitizedFileName}`;
  const filePath = path.join(TEMP_DIR, uniqueFileName);

  // 保存文件
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch (error) {
    console.error('Failed to delete file:', filePath, error);
    // 不抛出错误，因为文件删除失败不应该影响主流程
  }
}

export async function cleanupOldFiles(maxAgeMs: number = 3600000): Promise<void> {
  try {
    if (!existsSync(TEMP_DIR)) {
      return;
    }

    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        await deleteFile(filePath);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old files:', error);
  }
}
