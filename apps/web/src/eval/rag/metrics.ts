/**
 * RAG 评测指标计算核心模块 (RAG Evaluation Metrics Module)
 *
 * 核心指标与数学契约：
 * 1. HitRate@K (Hit@1, Hit@3, Hit@5 等)：
 *    - 检索结果列表前 K 个切片中，是否存在至少一个切片匹配金标锚点集合。
 *    - 批次 HitRate@K = (命中金标的 Query 数量) / (包含金标的总 Query 数量)。
 * 2. MRR (Mean Reciprocal Rank 平均倒数排名)：
 *    - 对每个 Query，首个命中金标的切片在检索列表中的排名为 r (1-based)，其倒数排名为 RR = 1 / r；若未命中则 RR = 0。
 *    - 批次 MRR = (所有 Query 的 RR 之和) / (总 Query 数量)。
 * 3. CitationAccuracy (引用准确率)：
 *    - 正文中所有 [^n] 引用标记是否均合法映射至已检索到的真实有效切片锚点。
 *    - 引用准确率 = (合法有效引用编号数) / (正文出现的唯一引用编号总数)；无引用时为 1.0。
 * 4. RejectionRate (拒答率)：
 *    - 针对不可回答 (unanswerable) 与未提及知识库的样本，统计系统正确识别并给出如实拒答的比例。
 *    - 拒答率 = (正确判定并表达拒答的样本数) / (不可回答样本总数)。
 */

import { validateCitations, extractCitationIndices } from '@/lib/rag/citation';
import type { CitationAnchor } from '@/lib/rag/hybrid-retrieval';

/**
 * 金标定位锚点（三元组或二元组格式）
 */
export interface GoldenAnchor {
  /** 文档名称（如 0001-quota-stream-explicit-finish.md） */
  documentName: string;
  /** 单调版本号（可选，省略时匹配任意版本） */
  documentVersion?: number;
  /** 切片序号（0-based，可选，省略时匹配文档内任意切片） */
  chunkIndex?: number;
}

/**
 * 召回切片项的匹配元信息
 */
export interface RetrievedItem {
  documentName: string;
  documentVersion?: number;
  chunkIndex?: number;
  [key: string]: unknown;
}

/**
 * 检索评测单条样本输入
 */
export interface RetrievalEvalSample {
  query?: string;
  retrievedList: RetrievedItem[];
  goldenList: GoldenAnchor[];
}

/**
 * 拒答评测单条样本输入
 */
export interface RejectionEvalSample {
  question: string;
  answer: string;
  category?: string;
  isUnanswerable?: boolean;
}

/**
 * 规范化文档名称（去除前导路径并转为小写）
 */
function normalizeDocName(name: string): string {
  if (!name) return '';
  const parts = name.split(/[/\\]/);
  return (parts[parts.length - 1] || '').trim().toLowerCase();
}

/**
 * 判断召回切片是否命中给定的金标锚点
 *
 * 匹配规则：
 * 1. documentName 规范化后必须完全一致；
 * 2. 若 goldenAnchor 明确指定了 documentVersion，则必须完全一致；
 * 3. 若 goldenAnchor 明确指定了 chunkIndex，则必须完全一致。
 */
export function isAnchorMatch(
  retrieved: RetrievedItem,
  golden: GoldenAnchor
): boolean {
  if (!retrieved || !golden) return false;

  const retDoc = normalizeDocName(retrieved.documentName);
  const goldDoc = normalizeDocName(golden.documentName);
  if (retDoc !== goldDoc) {
    return false;
  }

  if (
    typeof golden.documentVersion === 'number' &&
    typeof retrieved.documentVersion === 'number' &&
    retrieved.documentVersion !== golden.documentVersion
  ) {
    return false;
  }

  if (
    typeof golden.chunkIndex === 'number' &&
    typeof retrieved.chunkIndex === 'number' &&
    retrieved.chunkIndex !== golden.chunkIndex
  ) {
    return false;
  }

  return true;
}

/**
 * 单题判定：在召回列表前 K 位中是否命中至少一个金标
 */
export function isHitAtK(
  retrievedList: RetrievedItem[],
  goldenList: GoldenAnchor[],
  k: number
): boolean {
  if (!retrievedList || retrievedList.length === 0) return false;
  if (!goldenList || goldenList.length === 0) return false;
  if (k <= 0) return false;

  const topKCandidates = retrievedList.slice(0, k);
  for (const retrieved of topKCandidates) {
    for (const golden of goldenList) {
      if (isAnchorMatch(retrieved, golden)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 计算单条或批次 HitRate@K
 *
 * @param retrievedListOrSamples 单条召回列表或批次样本数组
 * @param goldenListOrK 金标列表（单条模式）或 K 值（批次模式）
 * @param maybeK K 值（单条模式）
 */
export function calculateHitRateAtK(
  samples: RetrievalEvalSample[],
  k: number
): number;
export function calculateHitRateAtK(
  retrievedList: RetrievedItem[],
  goldenList: GoldenAnchor[],
  k: number
): number;
export function calculateHitRateAtK(
  arg1: RetrievalEvalSample[] | RetrievedItem[],
  arg2: number | GoldenAnchor[],
  arg3?: number
): number {
  // 分支 1: 批次样本模式 calculateHitRateAtK(samples, k)
  if (Array.isArray(arg1) && typeof arg2 === 'number') {
    const samples = arg1 as RetrievalEvalSample[];
    const k = arg2;
    if (samples.length === 0) return 0;

    // 过滤出有金标的用例（排除不可答样本）
    const validSamples = samples.filter((s) => s.goldenList && s.goldenList.length > 0);
    if (validSamples.length === 0) return 0;

    let hitCount = 0;
    for (const sample of validSamples) {
      if (isHitAtK(sample.retrievedList, sample.goldenList, k)) {
        hitCount += 1;
      }
    }

    return Number((hitCount / validSamples.length).toFixed(4));
  }

  // 分支 2: 单条用例模式 calculateHitRateAtK(retrievedList, goldenList, k)
  const retrievedList = (arg1 as RetrievedItem[]) || [];
  const goldenList = (arg2 as GoldenAnchor[]) || [];
  const k = typeof arg3 === 'number' ? arg3 : 1;

  return isHitAtK(retrievedList, goldenList, k) ? 1.0 : 0.0;
}

/**
 * 计算单条检索结果的倒数排名 (Reciprocal Rank)
 * 若首个金标出现在位次 r (1-based)，返回 1 / r；未命中或无金标返回 0
 */
export function calculateReciprocalRank(
  retrievedList: RetrievedItem[],
  goldenList: GoldenAnchor[]
): number {
  if (!retrievedList || retrievedList.length === 0) return 0;
  if (!goldenList || goldenList.length === 0) return 0;

  for (let i = 0; i < retrievedList.length; i++) {
    const candidate = retrievedList[i]!;
    for (const golden of goldenList) {
      if (isAnchorMatch(candidate, golden)) {
        return Number((1 / (i + 1)).toFixed(6));
      }
    }
  }

  return 0;
}

/**
 * 计算 MRR (Mean Reciprocal Rank 平均倒数排名)
 *
 * 支持两种调用形态：
 * 1. 批次模式：calculateMRR(samples: RetrievalEvalSample[]): number
 * 2. 单条模式：calculateMRR(retrievedList: RetrievedItem[], goldenList: GoldenAnchor[]): number
 */
export function calculateMRR(samples: RetrievalEvalSample[]): number;
export function calculateMRR(
  retrievedList: RetrievedItem[],
  goldenList: GoldenAnchor[]
): number;
export function calculateMRR(
  arg1: RetrievalEvalSample[] | RetrievedItem[],
  arg2?: GoldenAnchor[]
): number {
  // 分支 1: 单条模式 calculateMRR(retrievedList, goldenList)
  if (Array.isArray(arg2)) {
    const retrievedList = (arg1 as RetrievedItem[]) || [];
    const goldenList = arg2;
    return calculateReciprocalRank(retrievedList, goldenList);
  }

  // 分支 2: 批次模式 calculateMRR(samples)
  const samples = (arg1 as RetrievalEvalSample[]) || [];
  if (samples.length === 0) return 0;

  const validSamples = samples.filter((s) => s.goldenList && s.goldenList.length > 0);
  if (validSamples.length === 0) return 0;

  let totalRR = 0;
  for (const sample of validSamples) {
    totalRR += calculateReciprocalRank(sample.retrievedList, sample.goldenList);
  }

  return Number((totalRR / validSamples.length).toFixed(4));
}

/**
 * 计算单文本或批次的引用准确率 (Citation Accuracy)
 *
 * @param text 模型回答文本
 * @param validAnchors 可用切片锚点列表或可用数量
 */
export function calculateCitationAccuracy(
  text: string,
  validAnchors: CitationAnchor[] | Map<number, CitationAnchor> | number
): number {
  if (!text || typeof text !== 'string') return 1.0;

  const extracted = extractCitationIndices(text);
  if (extracted.length === 0) {
    return 1.0;
  }

  let totalValid = 0;
  if (typeof validAnchors === 'number') {
    for (const idx of extracted) {
      if (idx >= 1 && idx <= validAnchors) {
        totalValid += 1;
      }
    }
  } else {
    const validation = validateCitations(text, validAnchors);
    return validation.faithfulnessRate;
  }

  return Number((totalValid / extracted.length).toFixed(4));
}

/**
 * 批次引用准确率计算
 */
export function calculateBatchCitationAccuracy(
  samples: Array<{ text: string; validAnchors: CitationAnchor[] | number }>
): number {
  if (!samples || samples.length === 0) return 1.0;

  let totalAccuracy = 0;
  for (const s of samples) {
    totalAccuracy += calculateCitationAccuracy(s.text, s.validAnchors);
  }

  return Number((totalAccuracy / samples.length).toFixed(4));
}

/**
 * 常见拒答核心语义关键词特征库
 */
export const REJECTION_KEYWORDS: readonly string[] = [
  '未检索到',
  '未找到',
  '没有找到',
  '未提及',
  '没有提及',
  '未涉及',
  '未包含',
  '知识库中未包含',
  '知识库中未提及',
  '无法回答',
  '没有相关信息',
  '无法从现有知识库',
  '未包含相关信息',
  '抱歉，未找到',
  '抱歉，在知识库',
  '无相关文档',
  '无法提供',
] as const;

/**
 * 常见拒答否定句式正则（支持中文字符隔断，如“未在现有文档中提及”）
 */
export const REJECTION_PATTERN =
  /(?:未|没有|无法|无|未曾).*(?:提及|包含|涉及|找到|检索到|收录|记录|相关信息|相关内容|回答|提供)/;

/**
 * 判断回答文本是否表现出如实拒答
 */
export function isRejectionResponse(answer: string): boolean {
  if (!answer || typeof answer !== 'string') return false;
  const trimmed = answer.trim();
  if (!trimmed) return true;

  for (const kw of REJECTION_KEYWORDS) {
    if (trimmed.includes(kw)) {
      return true;
    }
  }

  return REJECTION_PATTERN.test(trimmed);
}

/**
 * 计算针对不可答题目的拒答率 (Rejection Rate)
 *
 * @param results 评测输出结果集合
 * @param unanswerableCases 明确的不可答用例过滤集合（若未传则自动根据 category === 'unanswerable' 或 isUnanswerable 过滤）
 */
export function calculateRejectionRate(
  results: RejectionEvalSample[],
  unanswerableCases?: RejectionEvalSample[] | string[] | Set<string>
): number {
  if (!results || results.length === 0) return 0;

  let targetCases: RejectionEvalSample[] = [];

  if (unanswerableCases) {
    if (unanswerableCases instanceof Set) {
      targetCases = results.filter((r) => unanswerableCases.has(r.question));
    } else if (Array.isArray(unanswerableCases)) {
      if (typeof unanswerableCases[0] === 'string') {
        const qSet = new Set(unanswerableCases as string[]);
        targetCases = results.filter((r) => qSet.has(r.question));
      } else {
        const sampleSet = new Set((unanswerableCases as RejectionEvalSample[]).map((c) => c.question));
        targetCases = results.filter((r) => sampleSet.has(r.question));
      }
    }
  } else {
    // 自动筛选不可答样本
    targetCases = results.filter(
      (r) => r.category === 'unanswerable' || r.isUnanswerable === true
    );
  }

  // 若仍为空，且传入的全部用例本身就是未分类列表，则以全部用例为母集
  if (targetCases.length === 0 && results.some((r) => r.isUnanswerable !== false)) {
    targetCases = results;
  }

  if (targetCases.length === 0) return 0;

  let rejectedCount = 0;
  for (const item of targetCases) {
    if (isRejectionResponse(item.answer)) {
      rejectedCount += 1;
    }
  }

  return Number((rejectedCount / targetCases.length).toFixed(4));
}
