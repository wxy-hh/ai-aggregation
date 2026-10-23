/**
 * 倒数排名融合算法模块 (Reciprocal Rank Fusion, RRF)
 *
 * 核心设计契约：
 * 1. 标准 RRF 公式：RRF(d) = \sum_{m \in M} \frac{1}{k + rank_m(d)}
 *    其中 rank_m(d) 为候选切片在第 m 路检索结果中的名次（1-based 计数，第 1 名为 1）。
 * 2. 默认常数 k = 60（符合 RAG 规范与学术界标准定值，消除极端位次对总分的支配效应）。
 * 3. 算法为纯自研手写实现，严格禁止引入第三方库。
 * 4. 融合过程严格不跨路比较原始分数（cosine 相似度 vs ts_rank_cd），纯粹基于名次（Rank）。
 * 5. 排序确定性：按融合得分降序排列；得分相同时按首出现路（dense 先行）稳定排序。
 */

import { RAG_RETRIEVAL_CONFIG } from '@repo/shared';

/**
 * 单路输入条目泛型定义
 */
export interface RrfInputItem<T> {
  id: string;
  item: T;
  score?: number; // 原始单路分数（仅用于透传，不参与 RRF 计算）
}

/**
 * RRF 融合入参配置
 */
export interface RrfFusionOptions<T> {
  /** 稠密向量路排序列表（按相似度降序排列） */
  denseList: RrfInputItem<T>[];
  /** 词法全文路排序列表（按全文 rank 降序排列） */
  lexicalList: RrfInputItem<T>[];
  /** 平滑常数 k（默认 60） */
  k?: number;
}

/**
 * 融合后的切片条目泛型定义
 */
export interface RrfFusedResult<T> {
  id: string;
  item: T;
  /** RRF 融合得分：RRF(d) = \sum \frac{1}{k + rank} */
  score: number;
  /** 稠密向量路的名次（1-based），未命中时为 null */
  denseRank: number | null;
  /** 词法全文路的名次（1-based），未命中时为 null */
  lexicalRank: number | null;
  /** 稠密向量路透传的原始相似度 */
  denseScore?: number;
  /** 词法全文路透传的原始 rank */
  lexicalScore?: number;
}

/**
 * 手写标准倒数排名融合算法 (RRF)
 *
 * @param options 输入的双路列表与平滑参数 k
 * @returns 经 RRF 得分降序排序的融合条目列表
 */
export function reciprocalRankFusion<T>(
  options: RrfFusionOptions<T>
): RrfFusedResult<T>[] {
  const { denseList, lexicalList, k = RAG_RETRIEVAL_CONFIG.rrfK } = options;

  if (k <= 0) {
    throw new Error(`RRF 平滑常数 k 必须为正数，当前为: ${k}`);
  }

  // 聚合 Map：id -> 融合中间状态
  interface ItemAggregate {
    id: string;
    item: T;
    denseRank: number | null;
    lexicalRank: number | null;
    denseScore?: number;
    lexicalScore?: number;
    firstSeenOrder: number;
  }

  const map = new Map<string, ItemAggregate>();
  let orderCounter = 0;

  // 1. 处理稠密向量路排名（1-based）
  for (let i = 0; i < denseList.length; i++) {
    const entry = denseList[i];
    const rank = i + 1;
    const existing = map.get(entry.id);
    if (!existing) {
      map.set(entry.id, {
        id: entry.id,
        item: entry.item,
        denseRank: rank,
        lexicalRank: null,
        denseScore: entry.score,
        firstSeenOrder: orderCounter++,
      });
    } else {
      existing.denseRank = rank;
      existing.denseScore = entry.score;
    }
  }

  // 2. 处理词法全文路排名（1-based）
  for (let i = 0; i < lexicalList.length; i++) {
    const entry = lexicalList[i];
    const rank = i + 1;
    const existing = map.get(entry.id);
    if (!existing) {
      map.set(entry.id, {
        id: entry.id,
        item: entry.item,
        denseRank: null,
        lexicalRank: rank,
        lexicalScore: entry.score,
        firstSeenOrder: orderCounter++,
      });
    } else {
      existing.lexicalRank = rank;
      existing.lexicalScore = entry.score;
    }
  }

  // 3. 计算各条目的 RRF 得分：1 / (k + rank)
  const results: RrfFusedResult<T>[] = [];
  for (const agg of map.values()) {
    let score = 0;
    if (agg.denseRank !== null) {
      score += 1 / (k + agg.denseRank);
    }
    if (agg.lexicalRank !== null) {
      score += 1 / (k + agg.lexicalRank);
    }

    results.push({
      id: agg.id,
      item: agg.item,
      score,
      denseRank: agg.denseRank,
      lexicalRank: agg.lexicalRank,
      denseScore: agg.denseScore,
      lexicalScore: agg.lexicalScore,
    });
  }

  // 4. 排序：按 score 降序，得分相同时按出现顺序稳定排序
  results.sort((a, b) => {
    const diff = b.score - a.score;
    // 浮点数极微小差异视作相等
    if (Math.abs(diff) > 1e-12) {
      return diff;
    }
    const orderA = map.get(a.id)?.firstSeenOrder ?? 0;
    const orderB = map.get(b.id)?.firstSeenOrder ?? 0;
    return orderA - orderB;
  });

  return results;
}
