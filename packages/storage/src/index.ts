import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * 存储提供者接口
 */
export interface StorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string, expiresIn?: number): Promise<string>;
}

/**
 * S3 兼容存储配置
 */
export interface S3Config {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  forcePathStyle?: boolean;
}

/**
 * S3 兼容存储提供者 (支持阿里云 OSS、MinIO 等)
 */
export class S3Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.accessKeySecret,
      },
      forcePathStyle: config.forcePathStyle ?? true, // MinIO 需要
    });
  }

  /**
   * 上传文件
   * @param key - 对象键 (文件路径)
   * @param data - 文件数据
   * @param contentType - MIME 类型
   * @returns 文件 URL
   */
  async upload(key: string, data: Buffer, contentType?: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      });

      await this.client.send(command);

      // 返回公开访问 URL (如果存储桶是公开的)
      return `${this.client.config.endpoint}/${this.bucket}/${key}`;
    } catch (error) {
      throw new Error(`存储上传失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 下载文件
   * @param key - 对象键
   * @returns 文件数据
   */
  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error('响应体为空');
      }

      // 将流转换为 Buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      throw new Error(`存储下载失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 删除文件
   * @param key - 对象键
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      throw new Error(`存储删除失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取签名 URL (用于临时访问私有文件)
   * @param key - 对象键
   * @param expiresIn - 过期时间(秒), 默认 3600
   * @returns 签名 URL
   */
  async getUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      throw new Error(
        `生成签名 URL 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * 创建存储提供者实例
 */
export function createStorageProvider(): StorageProvider {
  const config: S3Config = {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    accessKeySecret: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || 'ai-aggregation',
    forcePathStyle: true,
  };

  if (!config.accessKeyId || !config.accessKeySecret) {
    throw new Error('缺少存储配置: S3_ACCESS_KEY 或 S3_SECRET_KEY 未设置');
  }

  return new S3Provider(config);
}

// 导出别名以保持向后兼容
export { S3Provider as OSSProvider };
