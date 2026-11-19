/**
 * CrossEncoderRerank 统一精排政策深模块 (ADR-0030 / ARCH-CK-01)
 *
 * 核心职责：
 * 1. 统一管理 CrossEncoderRerank 候选集上限截断 (maxCandidates=30)；
 * 2. 统一管理相关性置信度阈值过滤 (minRelevanceScore=0.20) 与低分切片计数；
 * 3. 严格校验模型返回结果的完整性与下标合法性（下标越界、负数、非整、重复或空值判定为不可信响应）；
 * 4. 统一处理模型服务异常与不可信响应之弹性降级 (RerankFallback)，输出标准结构化告警日志；
 * 5. 统一开关判定优先级（入参显式覆盖 > 系统环境变量）。
 */

import { logger as defaultLogger, type Logger } from '@repo/logger';
import {
  RAG_RERANK_CONFIG,
  isRagRerankEnabled,
  type RetrievedChunk,
} from '@repo/shared';
import {
  SiliconFlowRerankProvider,
  type RerankProvider,
  type RerankResult,
} from '@repo/providers';

/**
 * 精排政策执行选项
 */
export interface ApplyCrossEncoderRerankOptions {
  /** 检索查询词 */
  query: string;
  /** 候选切片列表（通常已按 RRF 融合分数降序排列） */
  candidates: RetrievedChunk[];
  /** 最终目标返回数量 */
  topK: number;
  /** 显式控制是否开启 Rerank（未提供时回退至系统环境变量） */
  enableRerank?: boolean;
  /** 可选注入的 Rerank 服务供应方实例 */
  rerankProvider?: RerankProvider;
  /** 可选注入的日志记录器 */
  logger?: Logger;
}

/**
 * 精排政策执行产物
 */
export interface ApplyCrossEncoderRerankResult {
  /** 经过精排或降级重排后的切片数组 */
  chunks: RetrievedChunk[];
  /** 是否真实执行了精排打分重排 */
  isReranked: boolean;
  /** 是否发生异常降级回退至 RRF 排名 */
  isDegraded: boolean;
  /** 低于 0.20 阈值被过滤的切片总数 */
  filteredLowScoreCount: number;
  /** 精排阶段执行耗时 (ms) */
  rerankDurationMs: number;
}

/**
 * 校验 Rerank 返回结果的合法性与可信度
 *
 * 当满足以下任一情形时判定为不可信响应：
 * 1. 返回结果为 null、undefined 或非数组；
 * 2. 存在非整数或负数下标；
 * 3. 存在越界下标（index >= candidatePoolSize）；
 * 4. 存在 NaN 得分；
 * 5. 存在重复下标。
 */
function validateRerankResults(
  results: unknown,
  candidatePoolSize: number
): { valid: true; data: RerankResult[] } | { valid: false; reason: string } {
  if (!results || !Array.isArray(results)) {
    return { valid: false, reason: 'Rerank 服务返回结果为空或非数组结构' };
  }

  const seenIndices = new Set<number>();

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, reason: `下标 #${i} 元素不是合法对象` };
    }

    const { index, relevanceScore } = item as Record<string, unknown>;

    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      return { valid: false, reason: `检测到非法切片索引（非正整数或负数）: ${String(index)}` };
    }

    if (index >= candidatePoolSize) {
      return {
        valid: false,
        reason: `检测到越界切片索引: ${index}，超出候选集规模 ${candidatePoolSize}`,
      };
    }

    if (typeof relevanceScore !== 'number' || Number.isNaN(relevanceScore)) {
      return { valid: false, reason: `切片索引 ${index} 相关性得分为 NaN 或非数字` };
    }

    if (seenIndices.has(index)) {
      return { valid: false, reason: `检测到重复返回的切片索引: ${index}` };
    }
    seenIndices.add(index);
  }

  return { valid: true, data: results as RerankResult[] };
}

/**
 * 执行 Cross-Encoder 二次语义精排并应用统一容灾与过滤政策
 */
export async function applyCrossEncoderRerank(
  options: ApplyCrossEncoderRerankOptions
): Promise<ApplyCrossEncoderRerankResult> {
  const { query, candidates, topK } = options;
  const log = options.logger || defaultLogger;

  // 1. 开关判定：显式入参优先，缺省回退环境变量
  const isRerankActive =
    options.enableRerank !== undefined
      ? options.enableRerank
      : isRagRerankEnabled();

  // 若未开启精排或无有效候选切片，直接按原粗排截断返回
  if (!isRerankActive || candidates.length === 0) {
    return {
      chunks: candidates.slice(0, topK),
      isReranked: false,
      isDegraded: false,
      filteredLowScoreCount: 0,
      rerankDurationMs: 0,
    };
  }

  // 2. 候选池上限硬截断 (ADR-0030: 最多 30 条)
  const candidateLimit = Math.min(candidates.length, RAG_RERANK_CONFIG.maxCandidates);
  const candidatePool = candidates.slice(0, candidateLimit);
  const candidateDocuments = candidatePool.map((c) => c.content);

  const startTime = performance.now();

  try {
    const provider = options.rerankProvider || new SiliconFlowRerankProvider();
    const rawResponse = await provider.rerank(query, candidateDocuments, candidateLimit);
    const rerankDurationMs = Math.round(performance.now() - startTime);

    // 3. 校验响应可信性
    const validation = validateRerankResults(rawResponse, candidatePool.length);

    if (!validation.valid) {
      log.warn('[rerank-policy] Rerank 二次精排异常，平滑降级为原 RRF 排名结果', {
        feature: 'rag-rerank',
        degradation: 'rrf-fallback',
        query,
        candidateCount: candidatePool.length,
        durationMs: rerankDurationMs,
        error: validation.reason,
      });

      return {
        chunks: candidates.slice(0, topK),
        isReranked: false,
        isDegraded: true,
        filteredLowScoreCount: 0,
        rerankDurationMs,
      };
    }

    const rerankResults = validation.data;

    // 4. 应用最低安全置信度过滤 (RelevanceScoreCutoff: 0.20)
    const minScore = RAG_RERANK_CONFIG.minRelevanceScore;
    const validResults = rerankResults.filter((res) => res.relevanceScore >= minScore);
    const filteredLowScoreCount = rerankResults.length - validResults.length;

    // 5. 截取 topK 并映射回 RetrievedChunk
    const targetResults = validResults.slice(0, topK);

    const reorderedChunks: RetrievedChunk[] = targetResults.map((res) => {
      const original = candidatePool[res.index];
      return {
        ...original,
        score: res.relevanceScore,
        rerankScore: res.relevanceScore,
      };
    });

    return {
      chunks: reorderedChunks,
      isReranked: true,
      isDegraded: false,
      filteredLowScoreCount,
      rerankDurationMs,
    };
  } catch (err: unknown) {
    const rerankDurationMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : String(err);

    log.warn('[rerank-policy] Rerank 二次精排异常，平滑降级为原 RRF 排名结果', {
      feature: 'rag-rerank',
      degradation: 'rrf-fallback',
      query,
      candidateCount: candidatePool.length,
      durationMs: rerankDurationMs,
      error: errorMessage,
    });

    return {
      chunks: candidates.slice(0, topK),
      isReranked: false,
      isDegraded: true,
      filteredLowScoreCount: 0,
      rerankDurationMs,
    };
  }
}
