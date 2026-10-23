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
 * 对应火山引擎 doubao-embedding-large 标称与推荐维度（1024 维）
 * 数据库 vector(1024) 列与所有相关索引以此维度为硬约束
 */
export const RAG_EMBEDDING_DIM = 1024 as const;

/**
 * 默认 Embedding 模型标识符
 */
export const RAG_EMBEDDING_MODEL = 'doubao-embedding-large' as const;

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
