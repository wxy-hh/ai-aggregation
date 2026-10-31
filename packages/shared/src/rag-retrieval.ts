/**
 * RAG 知识检索传输与视图契约 (ADR-0030 / ARCH-CK-01)
 *
 * 规范服务端向客户端、Agent 工具及调试台透出的标准数据结构：
 * 1. 规范来源物理锚点 CitationAnchor；
 * 2. 规范检索融合切片 RetrievedChunk 与耗时指标 RetrievalStats；
 * 3. 规范两路召回明细展示投影（去除存储层私有字段，词法明细同时输出名次与原始分）；
 * 4. 彻底阻断客户端越过 Transport Seam 对服务器内部实现类型的直接依赖。
 */

/**
 * 结构化引用来源物理锚点 (ADR-0025 / KB-CHAT-CITE)
 */
export interface CitationAnchor {
  /** 知识库唯一标识（可选，历史消息可能缺失） */
  knowledgeBaseId?: string;
  /** 文档唯一标识 */
  documentId: string;
  /** 文档名称 */
  documentName: string;
  /** 文档版本号 */
  documentVersion: number;
  /** 页码（PDF/扫描件有效，无则为 null） */
  pageNumber: number | null;
  /** 章节层级路径（Markdown 标题路径，无则为 null） */
  headingPath: string | null;
  /** 切片在文档中的全局序号 (0-based) */
  chunkIndex: number;
  /** 切片上下文纯文本摘要快照（按场景截取：普通检索 300 字符，通读模式 100 字符） */
  snippet?: string;
}

/**
 * 混合检索融合切片展示契约
 */
export interface RetrievedChunk {
  /** 切片唯一标识 */
  chunkId: string;
  /** 所属文档 ID */
  documentId: string;
  /** 所属文档名称 */
  documentName: string;
  /** 所属文档版本号 */
  documentVersion: number;
  /** 切片纯文本内容 */
  content: string;
  /** 预分词切片文本（jieba 切分，供词法与高亮复用） */
  contentSegmented: string;
  /** 最终综合排序得分（开启 Rerank 时为精排得分，降级或未开启时为 RRF 融合分） */
  score: number;
  /** 稠密向量路召回名次 (1-based，未在向量路命中为 null) */
  denseRank: number | null;
  /** 词法全文路召回名次 (1-based，未在词法路命中为 null) */
  lexicalRank: number | null;
  /** 稠密向量余弦相似度得分 [0, 1] */
  similarity?: number;
  /** 词法检索 PostgreSQL ts_rank 原始匹配分 */
  lexicalScore?: number;
  /** Cross-Encoder 二次语义精排置信度得分 [0, 1] */
  rerankScore?: number;
  /** 倒数排名融合 (RRF) 综合得分 */
  rrfScore?: number;
  /** 结构化切片物理来源锚点 */
  citationAnchor: CitationAnchor;
}

/**
 * 各检索阶段执行耗时统计
 */
export interface RetrievalStats {
  /** 查询词向量化耗时 (ms) */
  embeddingDurationMs: number;
  /** pgvector 稠密向量检索耗时 (ms) */
  denseDurationMs: number;
  /** 词法全文检索耗时 (ms) */
  lexicalDurationMs: number;
  /** RRF 倒数排名融合计算耗时 (ms) */
  fusionDurationMs: number;
  /** Cross-Encoder 二次语义精排耗时 (ms，未开启时为 0 或 undefined) */
  rerankDurationMs?: number;
  /** 混合检索管道全链路总耗时 (ms) */
  totalDurationMs: number;
}

/**
 * 稠密向量路切片召回明细展示投影（剥离数据库存储私有字段）
 */
export interface DocumentChunkDenseMatchView {
  id: string;
  documentId: string;
  documentName: string;
  documentVersion: number;
  chunkIndex: number;
  content: string;
  contentSegmented?: string;
  headingPath: string | null;
  pageNumber: number | null;
  similarity: number;
  rank: number;
}

/**
 * 词法全文路切片召回明细展示投影（剥离数据库存储私有字段，保留名次与原始分）
 */
export interface DocumentChunkLexicalMatchView {
  id: string;
  documentId: string;
  documentName: string;
  documentVersion: number;
  chunkIndex: number;
  content: string;
  contentSegmented?: string;
  headingPath: string | null;
  pageNumber: number | null;
  rank: number;
  rankScore?: number;
}

/**
 * 传输层通用元数据过滤器宽松类型定义（解耦对 @repo/db 内部模型的依赖）
 */
export type MetadataFilterLoose = Record<string, unknown>;

/**
 * 混合检索完整结果集契约
 */
export interface HybridRetrievalResult {
  /** 原始检索查询词 */
  query: string;
  /** 经结巴分词预处理后的词法检索查询串 */
  preparedLexicalQuery: string;
  /** 实际请求与采纳的目标召回数量 */
  topK: number;
  /** 经过 RRF 融合与可选 Cross-Encoder 精排后的切片列表 */
  chunks: RetrievedChunk[];
  /** 稠密向量检索路 Top 命中明细 */
  denseMatches: DocumentChunkDenseMatchView[];
  /** 词法全文检索路 Top 命中明细 */
  lexicalMatches: DocumentChunkLexicalMatchView[];
  /** 全流程总耗时 (ms) */
  durationMs: number;
  /** 各阶段细分耗时指标 */
  stats: RetrievalStats;
  /** 是否真实执行了 Cross-Encoder 精排 */
  isReranked?: boolean;
  /** 是否因异常、超时或不可信响应平滑降级为原 RRF 排名 */
  isDegraded?: boolean;
  /** 因低于最低安全阈值 (0.20) 而被剔除的低置信度切片总数 */
  filteredLowScoreCount?: number;
  /** 是否因前置标签零命中而触发自动放宽兜底召回 */
  isFilterRelaxed?: boolean;
  /** 实际生效的过滤条件（放宽后为 undefined） */
  appliedFilter?: MetadataFilterLoose;
}
