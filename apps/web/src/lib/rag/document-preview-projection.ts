/**
 * 文档预览服务端读取投影 (ADR-0053, C7)
 *
 * 本模块拥有预览的状态门控、正文来源与回退、当前版本切片查询时机、
 * 源资产签名以及 DTO 组装；内容路由只保留认证、归属校验、依赖装配与 HTTP 映射。
 *
 * - pending/processing/failed 返回真实状态事实、空正文与空切片，不读取正文或切片；
 * - ready 正文按 SourceFormat 选择：MD/TXT 读源资产，DOCX/XLSX/CSV 读共享布局
 *   派生的提纯 Markdown，PDF/unknown 只使用当前版本切片；
 * - 首选正文不可用或 trim 后为空时回退当前版本切片；正文与切片均不可用时抛出读取失败；
 * - 源资产签名始终 best-effort，签名失败只令链接为空，不阻断可用正文。
 */

import {
  deriveParsedContentKey,
  deriveSourceFormat,
  requiresDerivedContent,
  type DocumentStatus,
  type SourceFormat,
} from '@repo/shared';
import type { StorageProvider } from '@repo/storage';
import type {
  DocumentPreviewChunk,
  DocumentPreviewData,
  DocumentRenderMode,
} from './document-preview-contract';

/** 投影所需的文档事实；格式只从 sourceType 与 storageKey 派生 */
export interface DocumentPreviewDocumentFacts {
  id: string;
  /** 文档所属知识库，用于生成同源认证下载路由 */
  knowledgeBaseId: string;
  name: string;
  version: number;
  status: DocumentStatus;
  storageKey: string;
  sourceType: string;
  sourceUrl: string | null;
  errorMessage: string | null;
}

/** 正文来源只留在服务端与测试，不进入 HTTP DTO */
export type DocumentBodySource = 'stored' | 'derived' | 'chunks';

export interface DocumentPreviewProjectionResult {
  data: DocumentPreviewData;
  /** 仅 ready 产生；内容路由不得把它放进 HTTP 响应 */
  bodySource?: DocumentBodySource;
}

export interface DocumentPreviewProjectionDeps {
  /** 存储访问器；构造或签名失败都由投影按 best-effort 处理 */
  getStorage: () => Pick<StorageProvider, 'download' | 'getUrl'>;
  /** 当前版本切片查询；只有 ready 投影会调用 */
  loadCurrentVersionChunks: (
    document: DocumentPreviewDocumentFacts
  ) => Promise<DocumentPreviewChunk[]>;
}

/** ready 无正文可读时的统一读取失败，由内容路由映射为既有中文 500 */
export class DocumentPreviewReadError extends Error {
  constructor(message = '文档正文读取失败') {
    super(message);
    this.name = 'DocumentPreviewReadError';
  }
}

type PreviewStorage = Pick<StorageProvider, 'download' | 'getUrl'>;

/** 首选正文定位：key 全部来自共享布局规则 */
interface PrimaryBodySource {
  bodySource: 'stored' | 'derived';
  key: string;
}

const FAILED_FALLBACK_MESSAGE = '文档解析索引失败';
const SIGNED_URL_EXPIRES_IN = 3600;

/** 绝对 HTTP(S) 签名地址原样保留；其余相对地址视为本地存储路径 */
function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 本地存储只返回 `/docs/...` 相对路径，不能直接作为浏览器下载地址。
 * 映射到当前知识库与文档的同源认证下载路由，由下载路由按数据库中的
 * storageKey 读取对象，避免把请求路径当作文件路径。
 */
function buildAuthenticatedDownloadUrl(document: DocumentPreviewDocumentFacts): string {
  return `/api/knowledge-bases/${encodeURIComponent(
    document.knowledgeBaseId
  )}/documents/${encodeURIComponent(document.id)}/download`;
}

/**
 * 选择 ready 文档的首选正文来源。
 * derived 判定与 key 派生均消费共享布局规则，不在此重复格式列表或 key 正则。
 */
function resolvePrimaryBodySource(
  sourceFormat: SourceFormat,
  storageKey: string
): PrimaryBodySource | null {
  if (requiresDerivedContent(sourceFormat)) {
    return { bodySource: 'derived', key: deriveParsedContentKey(storageKey) };
  }
  if (sourceFormat === 'md' || sourceFormat === 'txt') {
    return { bodySource: 'stored', key: storageKey };
  }
  return null;
}

export class DocumentPreviewProjection {
  constructor(private readonly deps: DocumentPreviewProjectionDeps) {}

  /** 投影任意状态：ready 进入正文矩阵，其余复用非 ready 状态门控 */
  async project(
    document: DocumentPreviewDocumentFacts
  ): Promise<DocumentPreviewProjectionResult> {
    if (document.status === 'ready') {
      return this.projectReady(document);
    }
    return this.projectNonReady(document);
  }

  /**
   * 投影非 ready 文档：只返回状态事实，不读取正文或当前版本切片。
   * 只有 file 来源 best-effort 签名当前版本原件；URL/Artifact 不猜测尚未存在的快照。
   */
  async projectNonReady(
    document: DocumentPreviewDocumentFacts
  ): Promise<DocumentPreviewProjectionResult> {
    if (document.status === 'ready') {
      throw new Error('ready 文档不进入非 ready 投影');
    }

    const sourceFormat = deriveSourceFormat({
      sourceType: document.sourceType,
      storageKey: document.storageKey,
    });
    const originalUrl = await this.resolveNonReadyOriginalUrl(document);

    return {
      data: this.toPreviewData(document, sourceFormat, {
        chunkCount: null,
        content: '',
        chunks: [],
        originalUrl,
      }),
    };
  }

  /** 投影 ready 文档：正文来源、切片回退、真实计数与渲染方式在此统一决定 */
  private async projectReady(
    document: DocumentPreviewDocumentFacts
  ): Promise<DocumentPreviewProjectionResult> {
    const sourceFormat = deriveSourceFormat({
      sourceType: document.sourceType,
      storageKey: document.storageKey,
    });
    const primary = resolvePrimaryBodySource(sourceFormat, document.storageKey);
    const storage = this.tryGetStorage();

    const [chunks, originalUrl, primaryText] = await Promise.all([
      this.deps.loadCurrentVersionChunks(document),
      this.resolveReadyOriginalUrl(document, storage),
      primary ? this.readPrimaryText(storage, primary.key) : Promise.resolve(null),
    ]);

    let bodySource: DocumentBodySource;
    let content = '';

    if (primary) {
      if (primaryText !== null) {
        bodySource = primary.bodySource;
        content = primaryText;
      } else if (chunks.length > 0) {
        bodySource = 'chunks';
      } else {
        throw new DocumentPreviewReadError();
      }
    } else {
      if (chunks.length === 0) {
        throw new DocumentPreviewReadError();
      }
      bodySource = 'chunks';
    }

    const renderMode: DocumentRenderMode =
      sourceFormat === 'pdf' ? 'pdf-chunks' : 'markdown';

    return {
      bodySource,
      data: this.toPreviewData(document, sourceFormat, {
        chunkCount: chunks.length,
        renderMode,
        content,
        chunks,
        originalUrl,
      }),
    };
  }

  /** 组装预览 DTO；ready 才有 renderMode，失败状态保留结构化中文原因 */
  private toPreviewData(
    document: DocumentPreviewDocumentFacts,
    sourceFormat: SourceFormat,
    fields: {
      chunkCount: number | null;
      renderMode?: DocumentRenderMode;
      content: string;
      chunks: DocumentPreviewChunk[];
      originalUrl: string | null;
    }
  ): DocumentPreviewData {
    return {
      id: document.id,
      name: document.name,
      version: document.version,
      chunkCount: fields.chunkCount,
      status: document.status,
      errorMessage:
        document.status === 'failed'
          ? document.errorMessage || FAILED_FALLBACK_MESSAGE
          : document.errorMessage,
      sourceFormat,
      ...(fields.renderMode ? { renderMode: fields.renderMode } : {}),
      content: fields.content,
      chunks: fields.chunks,
      originalUrl: fields.originalUrl,
      sourceType: document.sourceType,
      sourceUrl: document.sourceUrl,
    };
  }

  /** 读取首选正文；不可用或 trim 后为空都视为不可用，交给切片回退 */
  private async readPrimaryText(
    storage: PreviewStorage | null,
    key: string
  ): Promise<string | null> {
    if (!storage) {
      return null;
    }

    try {
      const buffer = await storage.download(key);
      const text = buffer.toString('utf-8');
      return text.trim().length > 0 ? text : null;
    } catch (error) {
      console.warn('[document-preview-projection] 读取正文源失败:', error);
      return null;
    }
  }

  /**
   * 非 ready 只给 file 来源签名当前版本原件；URL/Artifact 不猜测尚未存在的快照。
   * 签名失败只令 originalUrl 为空，不修改文档状态或阻断正文。
   */
  private async resolveNonReadyOriginalUrl(
    document: DocumentPreviewDocumentFacts
  ): Promise<string | null> {
    if (document.sourceType !== 'file') {
      return null;
    }
    return this.signOriginalUrl(document, this.tryGetStorage());
  }

  /** ready 覆盖 file/URL/Artifact 的源资产签名，策略差异只留在入口命名里 */
  private async resolveReadyOriginalUrl(
    document: DocumentPreviewDocumentFacts,
    storage: PreviewStorage | null
  ): Promise<string | null> {
    return this.signOriginalUrl(document, storage);
  }

  /** best-effort 签名源资产；相对地址映射到同源认证下载路由 */
  private async signOriginalUrl(
    document: DocumentPreviewDocumentFacts,
    storage: PreviewStorage | null
  ): Promise<string | null> {
    if (!storage) {
      return null;
    }

    try {
      const url = await storage.getUrl(document.storageKey, SIGNED_URL_EXPIRES_IN);
      if (!url) {
        return null;
      }
      return isAbsoluteHttpUrl(url) ? url : buildAuthenticatedDownloadUrl(document);
    } catch (error) {
      console.warn('[document-preview-projection] 获取源资产签名 URL 失败:', error);
      return null;
    }
  }

  /** 存储访问器构造失败按链接/正文源不可用处理，由调用方决定回退或读取失败 */
  private tryGetStorage(): PreviewStorage | null {
    try {
      return this.deps.getStorage();
    } catch (error) {
      console.warn('[document-preview-projection] 初始化存储访问器失败:', error);
      return null;
    }
  }
}
