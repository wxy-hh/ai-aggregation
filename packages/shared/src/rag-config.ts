/**
 * RAG 检索增强系统全局配置与常量
 *
 * 规范依据：
 * - spec.md「数据模型（Phase A）」与「Embedding 与索引链路」
 * - 计划文件「已锁定决策 9」：删除 KnowledgeBase 表的 embeddingModel/embeddingDim 字段，
 *   维度全局收敛为常量 RAG_EMBEDDING_DIM（实测定值 1024）
 */

/**
 * 向量切片 Embedding 维度
 * 对应硅基流动 BAAI/bge-m3 标称与实测维度（1024 维）
 * 数据库 vector(1024) 列与所有相关索引以此维度为硬约束
 */
export const RAG_EMBEDDING_DIM = 1024 as const;

/**
 * 默认 Embedding 模型标识符（硅基流动 BAAI/bge-m3）
 */
export const RAG_EMBEDDING_MODEL = 'BAAI/bge-m3' as const;

/**
 * 备选 Embedding 模型标识符（火山方舟 doubao-embedding-large，保留备用）
 */
export const RAG_EMBEDDING_MODEL_DOUBAO = 'doubao-embedding-large' as const;

/**
 * 单批向量化处理切片上限（防超时与 API 批次限制）
 */
export const RAG_EMBEDDING_BATCH_SIZE = 64 as const;

/**
 * 用户知识库与切片容量配额限制
 * 超出时统一返回中文 429 提示
 */
export const RAG_CAPACITY_LIMITS = {
  /** 单个用户最大允许创建的知识库数量 */
  maxKnowledgeBasesPerUser: 5,
  /** 单个知识库最大允许上传的文档数量 */
  maxDocumentsPerKnowledgeBase: 50,
  /** 单个用户跨所有知识库的总切片数量上限 */
  maxChunksPerUser: 20000,
} as const;

/**
 * 容量超限时的标准中文提示文案（返回 429）
 */
export const RAG_CAPACITY_ERROR_MESSAGES = {
  maxKnowledgeBases: '知识库数量已达上限（最多 5 个），请归档或清理不需要的知识库',
  maxDocuments: '知识库文档数量已达上限（最多 50 个），请删除无用文档后再试',
  maxChunks: '切片总数已达上限（最多 20000 个），请清理文档释放切片额度',
} as const;

/**
 * RAG 文档文件格式与大小限制
 * v1 仅支持文本型 PDF/Markdown/TXT
 */
export const RAG_FILE_CONFIG = {
  /** 单个文档最大大小（字节）：20MB */
  maxFileSize: 20 * 1024 * 1024,
  /** 允许的文件扩展名 */
  allowedExtensions: ['.pdf', '.md', '.markdown', '.txt'] as const,
  /** 常见的允许 MIME 类型 */
  allowedMimeTypes: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
  ] as const,
} as const;

/**
 * 校验 RAG 上传文档的格式与大小
 * 非法类型与超限文件被中文文案拒绝且不产生数据行
 */
export interface RagDocumentValidationInput {
  name: string;
  size: number;
  type?: string;
}

export type RagDocumentValidationResult =
  | { valid: true; safeName: string; extension: string }
  | { valid: false; error: string };

export function validateRagDocument(
  input: RagDocumentValidationInput
): RagDocumentValidationResult {
  const { name, size } = input;

  // 1. 文件大小检查
  if (size > RAG_FILE_CONFIG.maxFileSize) {
    const maxSizeMB = (RAG_FILE_CONFIG.maxFileSize / 1024 / 1024).toFixed(0);
    const actualSizeMB = (size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `文件大小超过限制 (${actualSizeMB}MB > ${maxSizeMB}MB)，最大支持 20MB`,
    };
  }

  if (size <= 0) {
    return {
      valid: false,
      error: '不能上传空文件',
    };
  }

  // 2. 清洗文件名并提取扩展名
  const basename = name.split('/').pop()?.split('\\').pop() || name;
  let safeName = basename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().replace(/^\.+|\.+$/g, '');
  if (!safeName) {
    safeName = `doc_${Date.now()}`;
  }

  const lastDotIndex = safeName.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? safeName.slice(lastDotIndex).toLowerCase() : '';

  const isAllowedExt = (RAG_FILE_CONFIG.allowedExtensions as readonly string[]).includes(ext);
  if (!isAllowedExt) {
    return {
      valid: false,
      error: '不支持的文件类型，仅支持 PDF、Markdown、TXT 文本文件',
    };
  }

  return {
    valid: true,
    safeName,
    extension: ext,
  };
}

/**
 * 混合检索阶段召回与融合参数
 */
export const RAG_RETRIEVAL_CONFIG = {
  /** 稠密向量路召回数量 */
  denseTopK: 20,
  /** 词法全文检索路召回数量 */
  lexicalTopK: 20,
  /** 倒数排名融合 (RRF) 平滑常数 k（自研实现，禁用第三方库） */
  rrfK: 60,
} as const;

/**
 * 文本切块器默认参数（Token 估算口径）
 */
export const RAG_CHUNK_CONFIG = {
  /** 目标切块大小（Tokens） */
  chunkSize: 800,
  /** 相邻切块重叠大小（Tokens，约 10%） */
  chunkOverlap: 80,
} as const;

/**
 * 会话记忆索引防抖延迟毫秒数（30 秒去重合并）
 */
export const RAG_MEMORY_DEBOUNCE_DELAY_MS = 30000 as const;
