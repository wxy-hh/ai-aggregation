/**
 * 文档预览服务端读取投影 (ADR-0053, C7)
 *
 * 本票只收拢非 ready 状态门控与源资产下载边界：
 * - pending/processing/failed 返回真实状态事实、空正文与空切片，不查询正文或当前版本切片；
 * - file 来源在所有非 ready 状态 best-effort 签名当前版本原件，签名失败只令链接为空；
 * - URL/Artifact 非 ready 不猜测尚未存在的 Markdown 快照，只保留外部来源地址。
 *
 * ready 正文矩阵与最终 DTO 字段由后续工单迁入；内容路由仍负责认证、知识库/文档归属校验与 HTTP 映射。
 */

import { deriveSourceFormat, type SourceFormat } from '@repo/shared';
import type { StorageProvider } from '@repo/storage';

/** 当前版本切片的最小预览字段 */
export interface DocumentPreviewChunk {
  chunkIndex: number;
  content: string;
  headingPath: string | null;
  pageNumber: number | null;
}

/** 投影所需的文档事实；格式只从 sourceType 与 storageKey 派生 */
export interface DocumentPreviewDocumentFacts {
  id: string;
  name: string;
  version: number;
  status: string;
  storageKey: string;
  sourceType: string;
  sourceUrl: string | null;
  errorMessage: string | null;
  chunkCount: number;
}

/**
 * 过渡期 HTTP DTO：保留既有 fileType 字段与事实字段。
 * sourceFormat/renderMode 的最终收口不在此票范围内。
 */
export interface DocumentPreviewData {
  id: string;
  name: string;
  version: number;
  chunkCount: number | null;
  status: string;
  errorMessage: string | null;
  fileType: string;
  content: string;
  chunks: DocumentPreviewChunk[];
  originalUrl: string | null;
  sourceType: string;
  sourceUrl: string | null;
}

/** 非 ready 投影结果；sourceFormat 仅作服务端内部事实，本票不进入 HTTP DTO */
export interface NonReadyDocumentPreviewProjection {
  sourceFormat: SourceFormat;
  data: DocumentPreviewData;
}

export interface DocumentPreviewProjectionDeps {
  /** 存储访问器；构造或签名失败都由投影按 best-effort 处理 */
  getStorage: () => Pick<StorageProvider, 'download' | 'getUrl'>;
  /** 当前版本切片查询；ready 投影使用，非 ready 路径不得调用 */
  loadCurrentVersionChunks?: (
    document: DocumentPreviewDocumentFacts
  ) => Promise<DocumentPreviewChunk[]>;
}

/** 过渡期 fileType 映射；unknown 暂时保持既有 DTO 的 Markdown 默认值 */
const LEGACY_FILE_TYPES: Record<SourceFormat, string> = {
  pdf: 'pdf',
  md: 'markdown',
  txt: 'text',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  unknown: 'markdown',
};

const FAILED_FALLBACK_MESSAGE = '文档解析索引失败';

export class DocumentPreviewProjection {
  constructor(private readonly deps: DocumentPreviewProjectionDeps) {}

  /**
   * 投影非 ready 文档：只返回状态事实，不读取正文或当前版本切片。
   * ready 文档不进入此方法，避免在状态门控之外产生正文来源语义。
   */
  async projectNonReady(
    document: DocumentPreviewDocumentFacts
  ): Promise<NonReadyDocumentPreviewProjection> {
    if (document.status === 'ready') {
      throw new Error('ready 文档不进入非 ready 投影');
    }

    const sourceFormat = deriveSourceFormat({
      sourceType: document.sourceType,
      storageKey: document.storageKey,
    });
    const originalUrl = await this.resolveOriginalUrl(document);

    return {
      sourceFormat,
      data: {
        id: document.id,
        name: document.name,
        version: document.version,
        chunkCount: null,
        status: document.status,
        errorMessage:
          document.status === 'failed'
            ? document.errorMessage || FAILED_FALLBACK_MESSAGE
            : document.errorMessage,
        fileType: LEGACY_FILE_TYPES[sourceFormat],
        content: '',
        chunks: [],
        originalUrl,
        sourceType: document.sourceType,
        sourceUrl: document.sourceUrl,
      },
    };
  }

  /**
   * 仅为 file 来源生成当前版本原件签名 URL。
   * URL/Artifact 的源资产在非 ready 时不一定存在，不能产生坏链。
   */
  private async resolveOriginalUrl(
    document: DocumentPreviewDocumentFacts
  ): Promise<string | null> {
    if (document.sourceType !== 'file') {
      return null;
    }

    try {
      const storage = this.deps.getStorage();
      return (await storage.getUrl(document.storageKey, 3600)) || null;
    } catch (error) {
      console.warn('[document-preview-projection] 获取源资产签名 URL 失败:', error);
      return null;
    }
  }
}
