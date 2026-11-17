/**
 * 文档存储布局纯契约 (ADR-0053, C7)
 *
 * 唯一拥有三类现有物理 key 构造、SourceFormat 派生、parsedContentKey 派生
 * 与“是否需要衍生正文”的共享规则。本模块不得依赖数据库、对象存储、
 * Node SDK、Buffer 或环境变量；时间戳与随机 token 一律由调用方传入。
 */

/** 源资产格式：与 Document.sourceType（来源渠道）和 RenderMode（渲染方式）相互独立 */
export type SourceFormat = 'pdf' | 'md' | 'txt' | 'docx' | 'xlsx' | 'csv' | 'unknown';

/** SourceFormat 派生的最小文档事实 */
export interface DocumentSourceFormatFacts {
  /** 文档来源类型（Document.sourceType）；无法识别时按 file-like 处理 */
  sourceType: string;
  /** 对象存储定位（Document.storageKey），格式只从这里派生 */
  storageKey: string;
}

/** file 源资产 key 的构造事实 */
export interface FileStorageKeyFacts {
  userId: string;
  documentId: string;
  version: number;
  safeFileName: string;
}

/** URL / Artifact 源资产 key 的构造事实；时间与随机段由调用方提供 */
export interface TimestampedStorageKeyFacts {
  userId: string;
  timestamp: number;
  randomToken: string;
}

const EXTENSION_SOURCE_FORMATS: Readonly<Record<string, SourceFormat>> = {
  '.pdf': 'pdf',
  '.md': 'md',
  // Markdown 的历史扩展名归一为 md
  '.markdown': 'md',
  '.txt': 'txt',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
};

/** 取 key 的文件名段（不含目录） */
function basename(storageKey: string): string {
  const segments = storageKey.split('/');
  return segments[segments.length - 1] ?? '';
}

/**
 * 从 storageKey 文件名段的扩展名派生格式；大小写不敏感，无法识别时为 unknown。
 * 绝不读取 Document.name 或展示标题。
 */
function deriveFileLikeSourceFormat(storageKey: string): SourceFormat {
  const fileName = basename(storageKey);
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return 'unknown';
  }
  const extension = fileName.slice(lastDotIndex).toLowerCase();
  return EXTENSION_SOURCE_FORMATS[extension] ?? 'unknown';
}

/**
 * 派生源资产格式：URL 与对话产物的源资产是归一化 Markdown；
 * 其余来源按 file-like 从 storageKey 扩展名派生，不做 Markdown 默认。
 */
export function deriveSourceFormat(facts: DocumentSourceFormatFacts): SourceFormat {
  const sourceType = facts.sourceType.toLowerCase();
  if (sourceType === 'url' || sourceType === 'chat_artifact') {
    return 'md';
  }
  return deriveFileLikeSourceFormat(facts.storageKey);
}

/** 构造 file 源资产 key：docs/{userId}/{documentId}/v{version}/{safeFileName} */
export function buildFileStorageKey(facts: FileStorageKeyFacts): string {
  return `docs/${facts.userId}/${facts.documentId}/v${facts.version}/${facts.safeFileName}`;
}

/** 构造 URL 源资产 key：docs/{userId}/url-{timestamp}-{random}/v1/content.md */
export function buildUrlStorageKey(facts: TimestampedStorageKeyFacts): string {
  return `docs/${facts.userId}/url-${facts.timestamp}-${facts.randomToken}/v1/content.md`;
}

/** 构造 Artifact 源资产 key：docs/{userId}/artifact-{timestamp}-{random}/v1/content.md */
export function buildArtifactStorageKey(facts: TimestampedStorageKeyFacts): string {
  return `docs/${facts.userId}/artifact-${facts.timestamp}-${facts.randomToken}/v1/content.md`;
}

/**
 * 该 SourceFormat 是否需要额外写入衍生 Markdown 正文。
 * 当前只有 DOCX/XLSX/CSV 为真；MD/TXT 的 parsedContentKey 仍无条件派生，
 * 但它只是缓存位置，不表示需要或存在衍生对象。
 */
export function requiresDerivedContent(sourceFormat: SourceFormat): boolean {
  return sourceFormat === 'docx' || sourceFormat === 'xlsx' || sourceFormat === 'csv';
}

/**
 * 由存储定位派生提纯内容键（去掉尾段文件名，固定替换为 content.md）。
 * 该键只表示衍生缓存位置，不承诺对象存在，也不表示该格式应读取衍生件。
 */
export function deriveParsedContentKey(storageKey: string): string {
  return storageKey.replace(/\/[^/]+$/, '/content.md');
}
