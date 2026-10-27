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
 * 支持文本型 PDF/Markdown/TXT，以及 Office OpenXML Word (.docx) 与表格 (.xlsx / .csv)
 */
export const RAG_FILE_CONFIG = {
  /** 单个文档最大大小（字节）：20MB */
  maxFileSize: 20 * 1024 * 1024,
  /** 允许的文件扩展名 */
  allowedExtensions: [
    '.pdf',
    '.md',
    '.markdown',
    '.txt',
    '.docx',
    '.xlsx',
    '.csv',
  ] as const,
  /** 常见的允许 MIME 类型 */
  allowedMimeTypes: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ] as const,
} as const;

/**
 * 结构化表格切块与防御规格配置 (ADR-0029)
 */
export const RAG_TABLE_CONFIG = {
  /** 单个工作表最大允许解析的有效数据行数 */
  maxRowsPerSheet: 500,
  /** 单个表格文件跨 Sheet 生成切片数量上限 */
  maxChunksPerDocument: 50,
  /** 宽表最多保留的列数（多余列被修剪） */
  maxColumns: 15,
  /** 单个表格切片目标 Token 数 */
  chunkTargetTokens: 600,
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

  // 3. 老旧格式前置拦截并友好提示 (ADR-0029)
  if (ext === '.doc' || ext === '.xls') {
    return {
      valid: false,
      error: '暂不支持老旧的 .doc/.xls 格式，请在 Office 或 WPS 中另存为 .docx/.xlsx 后重新上传',
    };
  }

  const isAllowedExt = (RAG_FILE_CONFIG.allowedExtensions as readonly string[]).includes(ext);
  if (!isAllowedExt) {
    return {
      valid: false,
      error: '不支持的文件类型，仅支持 PDF、Markdown、TXT、Word 与表格文件',
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

/**
 * Rerank 二次精排可插拔段默认开关（严格默认 false）
 *
 * 规范依据：
 * - spec.md「检索与双源路由（Phase B）」：
 *   Rerank 为可插拔第三段，默认关闭，仅当对照实验证明净收益后按配置开启。
 * - 工单 10 验收标准 1：默认配置下检索链路与 06 完全一致（无 rerank 调用，零网络请求、零延迟开销）
 */
export const RAG_RERANK_ENABLED = false as const;

/**
 * Rerank 默认模型与接口配置
 * 复用硅基流动 BAAI/bge-reranker-v2-m3 端点与既有密钥 SILICONFLOW_API_KEY
 */
export const RAG_RERANK_CONFIG = {
  /** 默认模型标识符（硅基流动 BAAI/bge-reranker-v2-m3） */
  model: 'BAAI/bge-reranker-v2-m3',
  /** 硅基流动 Rerank 官方 API 端点 */
  endpoint: 'https://api.siliconflow.cn/v1/rerank',
  /** 网络请求默认超时时间（毫秒） */
  timeoutMs: 8000,
  /** 默认候选切片送入 Rerank 精排的上限数量 */
  defaultTopN: 20,
} as const;

/**
 * 运行时判定 Rerank 二次精排是否开启
 * 优先读取环境变量 RAG_RERANK_ENABLED，未显式配置时严格遵循默认值 false
 */
export function isRagRerankEnabled(): boolean {
  const envVal = process.env.RAG_RERANK_ENABLED;
  if (envVal !== undefined && envVal.trim() !== '') {
    const normalized = envVal.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return RAG_RERANK_ENABLED;
}

/**
 * 知识库 FAQ 检索与短路判定阈值配置 (ADR-0027)
 */
export const RAG_FAQ_CONFIG = {
  /** 极高置信度强短路阈值（Cosine >= 0.92） */
  shortCircuitThreshold: 0.92,
  /** 官方权威口径强参考阈值（0.78 <= Cosine < 0.92） */
  groundTruthThreshold: 0.78,
  /** 相似问单个上限 */
  maxSimilarQuestionsPerFaq: 20,
  /** 单个问题最大字符数 */
  maxQuestionLength: 500,
  /** 单个答案最大字符数 */
  maxAnswerLength: 5000,
  /** 单次批量 CSV 导入最大行数 */
  maxBatchImportSize: 100,
} as const;


