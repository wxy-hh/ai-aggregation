/**
 * RAG 混合检索深模块 (Hybrid Retrieval Deep Module)
 *
 * 核心设计契约：
 * 1. 双路并行检索：
 *    - 稠密向量路 (Dense)：基于余弦距离 (<=>) Top-20 召回
 *    - 词法全文路 (Lexical)：基于应用层分词与 ts_rank_cd Top-20 召回
 * 2. 倒数排名融合 (RRF)：
 *    - 调用手写自研标准 RRF 算法 (k=60)，绝不跨路比较原始分数，依据位次确定性融合。
 * 3. 结构化输出：
 *    - 每条检索切片必须统一携带来源锚点 (CitationAnchor)：文档 ID、文档名称、版本号、页码/标题路径、切片序号。
 * 4. 可观测性：
 *    - 统计并输出各阶段耗时（向量化耗时、向量检索耗时、全文检索耗时、融合耗时、总耗时）。
 * 5. 失败策略：
 *    - 查询端分词不可用时跳过词法路并退化为纯向量，不以正则词法查询同一索引。
 * 6. 依赖注入：
 *    - 支持注入 mock 的向量化函数、查询分词函数与检索访问层，供单元测试 100% 独立于真实数据库与外部 API 执行。
 */

import {
  searchDocumentChunksDense,
  searchDocumentChunksLexical,
  getSequentialChapterChunks,
  type DocumentChunkDenseMatch,
  type DocumentChunkLexicalMatch,
  type MetadataFilter,
} from '@repo/db';
import {
  RAG_RETRIEVAL_CONFIG,
  type CitationAnchor,
  type RetrievedChunk,
  type RetrievalStats,
  type HybridRetrievalResult,
  type DocumentChunkDenseMatchView,
  type DocumentChunkLexicalMatchView,
  type MetadataFilterLoose,
} from '@repo/shared';
import { logger } from '@repo/logger';
import { embedText, segmentForQuery } from '@repo/text';
import { reciprocalRankFusion } from './rrf';
import type { RerankProvider } from '@repo/providers';
import { applyCrossEncoderRerank } from './rerank-policy';

// 导出共享传输契约类型供平滑迁移过渡
export type {
  CitationAnchor,
  RetrievedChunk,
  RetrievalStats,
  HybridRetrievalResult,
  DocumentChunkDenseMatchView,
  DocumentChunkLexicalMatchView,
};

/**
 * 混合检索入参
 */
export interface HybridRetrievalOptions {
  userId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  enableRerank?: boolean; // 显式开关覆盖（默认回退至 isRagRerankEnabled()）
  filter?: MetadataFilter; // 前置元数据与标签过滤条件 (ADR-0032)
  headingPath?: string | null; // 章节目录路径前缀收敛 (ADR-0036)
  documentId?: string | null; // 特定文档 ID 下钻 (ADR-0036)
}

/**
 * 可选注入的依赖接口（供单测使用）
 */
export interface HybridRetrievalDeps {
  embedQueryFn?: (query: string) => Promise<number[]>;
  segmentQueryFn?: typeof segmentForQuery;
  searchDenseFn?: typeof searchDocumentChunksDense;
  searchLexicalFn?: typeof searchDocumentChunksLexical;
  getSequentialChunksFn?: typeof getSequentialChapterChunks;
  rerankProvider?: RerankProvider;
}

/**
 * 默认查询词向量化实现（统一向量化政策）
 */
async function defaultEmbedQuery(query: string): Promise<number[]> {
  return embedText(query);
}

/**
 * 判断当前是否属于“章节连续通读模式”
 *
 * 触发条件 (ADR-0036)：
 * 1. 提供了特定章节 headingPath；
 * 2. query 为空串、空白符或通配符 '*'（表示用户不需要关键词匹配，而是请求全文通读）。
 */
function isSequentialChapterQuery(query: string, headingPath?: string | null): boolean {
  if (!headingPath || !headingPath.trim()) {
    return false;
  }
  const q = query.trim();
  return q === '' || q === '*';
}

/**
 * RAG 混合检索执行主入口
 */
export async function hybridRetrieval(
  options: HybridRetrievalOptions,
  deps: HybridRetrievalDeps = {}
): Promise<HybridRetrievalResult> {
  const totalStartTime = performance.now();
  const {
    userId,
    knowledgeBaseId,
    query,
    topK = RAG_RETRIEVAL_CONFIG.denseTopK,
  } = options;

  const sequentialMode = isSequentialChapterQuery(query, options.headingPath);

  if (!sequentialMode && (!query || !query.trim())) {
    throw new Error('检索查询词不能为空');
  }

  // 章节顺序通读模式：直接按切片序号升序连续提取该章节全部内容 (ADR-0036)
  if (sequentialMode) {
    const fetchSequential = deps.getSequentialChunksFn || getSequentialChapterChunks;
    // 通读模式默认切片上限提升至 100，若调用方显式传入 topK 则尊重显式入参 (P-W5)
    const sequentialLimit = options.topK ?? 100;
    const rawChunks = await fetchSequential({
      userId,
      knowledgeBaseId,
      headingPath: options.headingPath,
      documentId: options.documentId,
      limit: sequentialLimit,
    });
    const totalDurationMs = Math.round(performance.now() - totalStartTime);

    // 采用稳定递减序列生成有序模拟分数，避免负数 (S-J2)
    const chunks: RetrievedChunk[] = rawChunks.map((c, idx) => {
      const orderScore = Number((1 / (1 + idx * 0.05)).toFixed(4));
      return {
        chunkId: c.id,
        documentId: c.documentId,
        documentName: c.documentName,
        documentVersion: c.documentVersion,
        content: c.content,
        contentSegmented: c.contentSegmented,
        score: orderScore,
        rrfScore: orderScore,
        denseRank: idx + 1,
        lexicalRank: idx + 1,
        similarity: 1.0,
        lexicalScore: 1.0,
        citationAnchor: {
          knowledgeBaseId,
          documentId: c.documentId,
          documentName: c.documentName,
          documentVersion: c.documentVersion,
          pageNumber: c.pageNumber,
          headingPath: c.headingPath,
          chunkIndex: c.chunkIndex,
          snippet: c.content.slice(0, 100),
        },
      };
    });

    return {
      query: query || '*',
      preparedLexicalQuery: '',
      topK: sequentialLimit,
      chunks,
      denseMatches: [],
      lexicalMatches: [],
      durationMs: totalDurationMs,
      stats: {
        embeddingDurationMs: 0,
        denseDurationMs: 0,
        lexicalDurationMs: 0,
        fusionDurationMs: 0,
        totalDurationMs,
      },
      appliedFilter: options.filter as MetadataFilterLoose | undefined,
    };
  }

  const embedFn = deps.embedQueryFn || defaultEmbedQuery;
  const segmentQuery = deps.segmentQueryFn || segmentForQuery;
  const searchDense = deps.searchDenseFn || searchDocumentChunksDense;
  const searchLexical = deps.searchLexicalFn || searchDocumentChunksLexical;

  // 1. 生成词法检索查询词；分词不可用时跳过词法路
  const preparedLexicalQuery = segmentQuery(query);
  if (preparedLexicalQuery === null) {
    logger.warn('[hybrid-retrieval] 分词不可用，跳过词法召回并降级为纯向量检索', {
      feature: 'rag-lexical-degraded',
      knowledgeBaseId,
    });
  }

  let embeddingDurationMs = 0;
  let denseDurationMs = 0;
  let lexicalDurationMs = 0;
  let fusionDurationMs = 0;

  // 2. 向量化查询词（支持外部向量化模型服务故障时平滑降级为纯词法检索）
  let queryVector: number[] | null = null;
  const embedStartTime = performance.now();
  try {
    queryVector = await embedFn(query);
    embeddingDurationMs = Math.round(performance.now() - embedStartTime);
  } catch (err: unknown) {
    embeddingDurationMs = Math.round(performance.now() - embedStartTime);
    logger.warn('[hybrid-retrieval] 向量化服务异常，自动降级为纯词法全文检索', {
      feature: 'rag-embedding-fallback',
      knowledgeBaseId,
      durationMs: embeddingDurationMs,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. 并行调用稠密向量检索与词法全文检索（支持前置 filter 与 headingPath 前缀收敛）
  let [denseResults, lexicalResults] = await Promise.all([
    (async () => {
      if (!queryVector) return [];
      const start = performance.now();
      const res = await searchDense({
        userId,
        knowledgeBaseId,
        queryVector,
        topK,
        filter: options.filter,
        headingPath: options.headingPath,
        documentId: options.documentId,
      });
      denseDurationMs = Math.round(performance.now() - start);
      return res;
    })(),
    (async () => {
      if (!preparedLexicalQuery) return [];
      const start = performance.now();
      const res = await searchLexical({
        userId,
        knowledgeBaseId,
        query: preparedLexicalQuery,
        topK,
        filter: options.filter,
        headingPath: options.headingPath,
        documentId: options.documentId,
      });
      lexicalDurationMs = Math.round(performance.now() - start);
      return res;
    })(),
  ]);

  // 3.1 零命中过滤放宽兜底 (Filter Relaxation Fallback, ADR-0032)
  let isFilterRelaxed = false;
  const hasFilter = options.filter && Object.keys(options.filter).length > 0;
  if (hasFilter && denseResults.length === 0 && lexicalResults.length === 0) {
    const [relaxedDense, relaxedLexical] = await Promise.all([
      (async () => {
        if (!queryVector) return [];
        const start = performance.now();
        const res = await searchDense({
          userId,
          knowledgeBaseId,
          queryVector,
          topK,
          headingPath: options.headingPath,
          documentId: options.documentId,
        });
        denseDurationMs += Math.round(performance.now() - start);
        return res;
      })(),
      (async () => {
        if (!preparedLexicalQuery) return [];
        const start = performance.now();
        const res = await searchLexical({
          userId,
          knowledgeBaseId,
          query: preparedLexicalQuery,
          topK,
          headingPath: options.headingPath,
          documentId: options.documentId,
        });
        lexicalDurationMs += Math.round(performance.now() - start);
        return res;
      })(),
    ]);

    if (relaxedDense.length > 0 || relaxedLexical.length > 0) {
      isFilterRelaxed = true;
      denseResults = relaxedDense;
      lexicalResults = relaxedLexical;
      logger.info('[hybrid-retrieval] 过滤条件零召回，自动触发全库放宽兜底检索', {
        feature: 'rag-metadata-filter',
        filter: options.filter,
        relaxedCount: relaxedDense.length + relaxedLexical.length,
      });
    }
  }

  // 为两路各自附加原始排名 (1-based) 并映射为纯净的展示投影（剔除存储私有字段）
  const denseMatchesWithRank: DocumentChunkDenseMatchView[] = denseResults.map((m, idx) => ({
    id: m.id,
    documentId: m.documentId,
    documentName: m.documentName,
    documentVersion: m.documentVersion,
    chunkIndex: m.chunkIndex,
    content: m.content,
    contentSegmented: m.contentSegmented,
    headingPath: m.headingPath,
    pageNumber: m.pageNumber,
    similarity: m.similarity,
    rank: idx + 1,
  }));

  const lexicalMatchesWithRank: DocumentChunkLexicalMatchView[] = lexicalResults.map((m, idx) => ({
    id: m.id,
    documentId: m.documentId,
    documentName: m.documentName,
    documentVersion: m.documentVersion,
    chunkIndex: m.chunkIndex,
    content: m.content,
    contentSegmented: m.contentSegmented,
    headingPath: m.headingPath,
    pageNumber: m.pageNumber,
    rank: idx + 1,
    rankScore: m.rank,
  }));

  // 4. 执行倒数排名融合 (RRF)
  const fusionStartTime = performance.now();
  const fusedList = reciprocalRankFusion<DocumentChunkDenseMatch | DocumentChunkLexicalMatch>({
    denseList: denseResults.map((m) => ({
      id: m.id,
      item: m,
      score: m.similarity,
    })),
    lexicalList: lexicalResults.map((m) => ({
      id: m.id,
      item: m,
      score: m.rank,
    })),
    k: RAG_RETRIEVAL_CONFIG.rrfK,
  });
  fusionDurationMs = Math.round(performance.now() - fusionStartTime);

  // 5. 粗排统一装配 RetrievedChunk 列表
  const candidateChunks: RetrievedChunk[] = fusedList.map((fused) => {
    const raw = fused.item;
    return {
      chunkId: fused.id,
      documentId: raw.documentId,
      documentName: raw.documentName,
      documentVersion: raw.documentVersion,
      content: raw.content,
      contentSegmented: raw.contentSegmented,
      score: fused.score,
      rrfScore: fused.score,
      denseRank: fused.denseRank,
      lexicalRank: fused.lexicalRank,
      similarity: fused.denseScore,
      lexicalScore: fused.lexicalScore,
      citationAnchor: {
        knowledgeBaseId: options.knowledgeBaseId,
        documentId: raw.documentId,
        documentName: raw.documentName,
        documentVersion: raw.documentVersion,
        pageNumber: raw.pageNumber,
        headingPath: raw.headingPath,
        chunkIndex: raw.chunkIndex,
        snippet: raw.content ? raw.content.slice(0, 300) : undefined,
      },
    };
  });

  // 6. 统一调用 Cross-Encoder 精排政策 Deep Module (ADR-0030)
  const rerankOutcome = await applyCrossEncoderRerank({
    query,
    candidates: candidateChunks,
    topK,
    enableRerank: options.enableRerank,
    rerankProvider: deps.rerankProvider,
  });

  const totalDurationMs = Math.round(performance.now() - totalStartTime);

  return {
    query,
    preparedLexicalQuery: preparedLexicalQuery ?? '',
    topK,
    chunks: rerankOutcome.chunks,
    denseMatches: denseMatchesWithRank,
    lexicalMatches: lexicalMatchesWithRank,
    durationMs: totalDurationMs,
    isReranked: rerankOutcome.isReranked,
    isDegraded: rerankOutcome.isDegraded || !queryVector,
    filteredLowScoreCount: rerankOutcome.filteredLowScoreCount,
    isFilterRelaxed,
    appliedFilter: options.filter as MetadataFilterLoose | undefined,
    stats: {
      embeddingDurationMs,
      denseDurationMs,
      lexicalDurationMs,
      fusionDurationMs,
      rerankDurationMs: rerankOutcome.rerankDurationMs,
      totalDurationMs,
    },
  };
}
