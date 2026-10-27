/**
 * RAG 混合检索深模块 (Hybrid Retrieval Deep Module)
 *
 * 核心设计契约：
 * 1. 双路并行检索：
 *    - 稠密向量路 (Dense)：基于余弦距离 (<=>) Top-20 召回
 *    - 词法全文路 (Lexical)：基于 jieba 应用层分词与 ts_rank_cd Top-20 召回
 * 2. 倒数排名融合 (RRF)：
 *    - 调用手写自研标准 RRF 算法 (k=60)，绝不跨路比较原始分数，依据位次确定性融合。
 * 3. 结构化输出：
 *    - 每条检索切片必须统一携带来源锚点 (CitationAnchor)：文档 ID、文档名称、版本号、页码/标题路径、切片序号。
 * 4. 可观测性：
 *    - 统计并输出各阶段耗时（向量化耗时、向量检索耗时、全文检索耗时、融合耗时、总耗时）。
 * 5. 依赖注入：
 *    - 支持注入 mock 的向量化函数与检索访问层，供单元测试 100% 独立于真实数据库与外部 API 执行。
 */

import { embed } from 'ai';
import {
  searchDocumentChunksDense,
  searchDocumentChunksLexical,
  type DocumentChunkDenseMatch,
  type DocumentChunkLexicalMatch,
} from '@repo/db';
import { createEmbeddingModel } from '@repo/providers';
import { RAG_RETRIEVAL_CONFIG, RAG_RERANK_CONFIG, isRagRerankEnabled } from '@repo/shared';
import { logger } from '@repo/logger';
import { reciprocalRankFusion, type RrfFusedResult } from './rrf';
import {
  SiliconFlowRerankProvider,
  type RerankProvider,
  type RerankResult,
} from '@repo/providers';
import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';

/**
 * 来源定位锚点（用于前端跳转高亮、核验溯源）
 */
export interface CitationAnchor {
  knowledgeBaseId?: string;
  documentId: string;
  documentName: string;
  documentVersion: number;
  pageNumber: number | null;
  headingPath: string | null;
  chunkIndex: number;
  snippet?: string;
}

/**
 * 融合召回的切片条目
 */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  documentVersion: number;
  content: string;
  contentSegmented: string;
  score: number; // 最终排序得分（若开启 Rerank 则为 Rerank 分数，否则为 RRF 分数）
  denseRank: number | null; // 稠密路排名 (1-based)，未命中为 null
  lexicalRank: number | null; // 词法路排名 (1-based)，未命中为 null
  similarity?: number; // 稠密路原始余弦相似度（仅用于观测调试）
  lexicalScore?: number; // 词法路原始全文 rank 分数（仅用于观测调试）
  rerankScore?: number; // Rerank 精排打分（仅在开启精排且成功时存在）
  rrfScore?: number; // 原 RRF 融合得分（用于对照与观测）
  citationAnchor: CitationAnchor;
}

/**
 * 阶段耗时统计
 */
export interface RetrievalStats {
  embeddingDurationMs: number;
  denseDurationMs: number;
  lexicalDurationMs: number;
  fusionDurationMs: number;
  rerankDurationMs?: number; // Rerank 精排耗时（未启用或降级时记录）
  totalDurationMs: number;
}

/**
 * 混合检索完整结果
 */
export interface HybridRetrievalResult {
  query: string;
  preparedLexicalQuery: string;
  topK: number;
  chunks: RetrievedChunk[];
  denseMatches: Array<DocumentChunkDenseMatch & { rank: number }>;
  lexicalMatches: Array<DocumentChunkLexicalMatch & { rank: number }>;
  durationMs: number;
  stats: RetrievalStats;
  isReranked?: boolean; // 标识是否成功经过 Rerank 二次精排
  isDegraded?: boolean; // 标识是否发生 Rerank 异常弹性降级
  filteredLowScoreCount?: number; // 标识因低于 minRelevanceScore 被过滤的切片数量
}

/**
 * 混合检索入参
 */
export interface HybridRetrievalOptions {
  userId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  enableRerank?: boolean; // 显式开关覆盖（默认回退至 isRagRerankEnabled()）
}

/**
 * 可选注入的依赖接口（供单测使用）
 */
export interface HybridRetrievalDeps {
  embedQueryFn?: (query: string) => Promise<number[]>;
  searchDenseFn?: typeof searchDocumentChunksDense;
  searchLexicalFn?: typeof searchDocumentChunksLexical;
  tokenizeFn?: (text: string) => string;
  rerankProvider?: RerankProvider;
  isRerankEnabledFn?: () => boolean;
}


// 结巴分词单例
let jiebaInstance: Jieba | null = null;

function getJieba(): Jieba {
  if (!jiebaInstance) {
    jiebaInstance = Jieba.withDict(dict);
  }
  return jiebaInstance;
}

/**
 * 为 simple 字典的 tsquery 预处理查询词
 * 中文按词切分并以空格隔开，保留专有技术代号与英数字符串
 */
export function prepareLexicalQuery(query: string): string {
  if (!query || !query.trim()) {
    return '';
  }

  try {
    const jieba = getJieba();
    const words = jieba.cut(query.trim(), false);
    const cleaned = words
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (cleaned.length > 0) {
      return cleaned.join(' ');
    }
  } catch (err) {
    console.warn('[hybrid-retrieval] jieba 分词异常，降级为正则分词:', err);
  }

  // 降级正则分词：连续汉字与字母数字连词
  const fallbackTokens = query.match(/[一-龥]+|[a-zA-Z0-9_\-\.]+/g);
  if (fallbackTokens && fallbackTokens.length > 0) {
    return fallbackTokens.join(' ');
  }

  return query.trim();
}

/**
 * 默认的查询向量化实现（调用硅基流动 BAAI/bge-m3）
 */
async function defaultEmbedQuery(query: string): Promise<number[]> {
  const model = createEmbeddingModel('siliconflow');
  const { embedding } = await embed({
    model,
    value: query,
  });
  return embedding;
}

/**
 * 执行混合检索核心流程
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

  if (!query || !query.trim()) {
    throw new Error('检索查询词不能为空');
  }

  const embedFn = deps.embedQueryFn || defaultEmbedQuery;
  const searchDense = deps.searchDenseFn || searchDocumentChunksDense;
  const searchLexical = deps.searchLexicalFn || searchDocumentChunksLexical;
  const tokenize = deps.tokenizeFn || prepareLexicalQuery;

  // 1. 生成词法检索查询词
  const preparedLexicalQuery = tokenize(query);

  let embeddingDurationMs = 0;
  let denseDurationMs = 0;
  let lexicalDurationMs = 0;
  let fusionDurationMs = 0;

  // 2. 向量化查询词
  const embedStartTime = performance.now();
  const queryVector = await embedFn(query);
  embeddingDurationMs = Math.round(performance.now() - embedStartTime);

  // 3. 并行调用稠密向量检索与词法全文检索
  const [denseResults, lexicalResults] = await Promise.all([
    (async () => {
      const start = performance.now();
      const res = await searchDense({
        userId,
        knowledgeBaseId,
        queryVector,
        topK,
      });
      denseDurationMs = Math.round(performance.now() - start);
      return res;
    })(),
    (async () => {
      const start = performance.now();
      const res = await searchLexical({
        userId,
        knowledgeBaseId,
        query: preparedLexicalQuery,
        topK,
      });
      lexicalDurationMs = Math.round(performance.now() - start);
      return res;
    })(),
  ]);

  // 为两路各自附加原始排名 (1-based)
  const denseMatchesWithRank = denseResults.map((m, idx) => ({
    ...m,
    rank: idx + 1,
  }));

  const lexicalMatchesWithRank = lexicalResults.map((m, idx) => ({
    ...m,
    rank: idx + 1,
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

  // 5. Rerank 可插拔精排阶段（默认开启，配置驱动，弹性降级）
  const checkRerankEnabled = deps.isRerankEnabledFn || isRagRerankEnabled;
  const isRerankActive = options.enableRerank !== undefined ? options.enableRerank : checkRerankEnabled();

  let rerankDurationMs = 0;
  let isReranked = false;
  let isDegraded = false;
  let filteredLowScoreCount = 0;
  let chunks: RetrievedChunk[] = [];

  if (isRerankActive && fusedList.length > 0) {
    // 选取 RRF 融合候选（最多送入 maxCandidates = 30 条切片入 Rerank 模型二次排序，ADR-0030）
    const candidateLimit = Math.min(fusedList.length, RAG_RERANK_CONFIG.maxCandidates);
    const candidateList = fusedList.slice(0, candidateLimit);
    const candidateDocuments = candidateList.map((f) => f.item.content);

    const rerankStartTime = performance.now();
    try {
      const provider = deps.rerankProvider || new SiliconFlowRerankProvider();
      const rerankResults = await provider.rerank(query, candidateDocuments, candidateLimit);
      rerankDurationMs = Math.round(performance.now() - rerankStartTime);

      if (rerankResults) {
        // ADR-0030: 依据 minRelevanceScore = 0.20 过滤低相关度长尾切片
        const minScore = RAG_RERANK_CONFIG.minRelevanceScore;
        const validResults = rerankResults.filter((res) => res.relevanceScore >= minScore);
        filteredLowScoreCount = rerankResults.length - validResults.length;

        const targetResults = validResults.slice(0, topK);

        chunks = targetResults.map((res) => {
          const fused = candidateList[res.index] ?? candidateList[0];
          const raw = fused.item;
          return {
            chunkId: fused.id,
            documentId: raw.documentId,
            documentName: raw.documentName,
            documentVersion: raw.documentVersion,
            content: raw.content,
            contentSegmented: raw.contentSegmented,
            score: res.relevanceScore, // 排序得分使用 Rerank 精排打分
            rerankScore: res.relevanceScore,
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

        isReranked = true;
      }
    } catch (err: unknown) {
      rerankDurationMs = Math.round(performance.now() - rerankStartTime);
      logger.warn('[hybrid-retrieval] Rerank 二次精排异常，平滑降级为原 RRF 排名结果', {
        feature: 'rag-rerank',
        degradation: 'rrf-fallback',
        query,
        candidateCount: candidateList.length,
        durationMs: rerankDurationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      // 容灾平滑降级：标记 isDegraded = true，进入后续 RRF 融合降级组装
      isDegraded = true;
    }
  }

  // 6. 若未开启 Rerank 或 Rerank 发生异常降级：按原 RRF 融合位次装配
  if (!isReranked) {
    const targetChunks = fusedList.slice(0, topK);
    chunks = targetChunks.map((fused) => {
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
  }

  const totalDurationMs = Math.round(performance.now() - totalStartTime);

  return {
    query,
    preparedLexicalQuery,
    topK,
    chunks,
    denseMatches: denseMatchesWithRank,
    lexicalMatches: lexicalMatchesWithRank,
    durationMs: totalDurationMs,
    isReranked,
    isDegraded,
    filteredLowScoreCount,
    stats: {
      embeddingDurationMs,
      denseDurationMs,
      lexicalDurationMs,
      fusionDurationMs,
      rerankDurationMs,
      totalDurationMs,
    },
  };

}
