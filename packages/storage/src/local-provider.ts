import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { StorageProvider } from './index';

/**
 * 本地文件系统存储提供者
 * 适用于本地开发和不需要 S3 的部署环境
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(key: string, data: Buffer, _contentType?: string): Promise<string> {
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, data);
    return `/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);
    if (!existsSync(filePath)) {
      throw new Error(`文件不存在: ${key}`);
    }
    return readFileSync(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async getUrl(key: string, _expiresIn?: number): Promise<string> {
    return `/${key}`;
  }

  private getFilePath(key: string): string {
    return path.join(this.baseDir, key);
  }
}
