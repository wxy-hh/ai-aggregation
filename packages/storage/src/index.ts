export interface StorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string, expiresIn?: number): Promise<string>;
}

export class OSSProvider implements StorageProvider {
  constructor(private config: {
    endpoint: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
  }) {}

  async upload(key: string, data: Buffer, contentType?: string): Promise<string> {
    // TODO: 实现阿里云 OSS 上传
    throw new Error('Not implemented');
  }

  async download(key: string): Promise<Buffer> {
    // TODO: 实现下载
    throw new Error('Not implemented');
  }

  async delete(key: string): Promise<void> {
    // TODO: 实现删除
    throw new Error('Not implemented');
  }

  async getUrl(key: string, expiresIn = 3600): Promise<string> {
    // TODO: 实现获取签名 URL
    throw new Error('Not implemented');
  }
}
