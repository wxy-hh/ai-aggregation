/**
 * 知识库 FAQ 标准问答对存储与检索访问模块 (FAQStore / ADR-0027)
 *
 * 核心机制：
 * 1. 实体分层：主实体 KnowledgeFaq 管理问答生命周期与启停；子表 KnowledgeFaqQuestion
 *    扁平化独立存储标准原问与每个相似问（Sentence-to-Sentence），最大化向量锐度。
 * 2. 严格的 SQL 前置 ACL 隔离：所有检索与写入强制绑定 userId，跨用户越权绝对无法查阅。
 * 3. 极速同步向量化：单条 FAQ 增改在事务内同步计算 1024 维向量与分词，即改即生效。
 */

import { prisma } from '../client';
import type { Prisma } from '@prisma/client';
import { RAG_FAQ_CONFIG } from '@repo/shared';

export interface InsertFaqParams {
  userId: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  similarQuestions?: string[];
  enabled?: boolean;
  embedFn: (text: string) => Promise<number[]>;
  tokenizeFn?: (text: string) => string;
}

export interface UpdateFaqParams {
  userId: string;
  faqId: string;
  question?: string;
  answer?: string;
  similarQuestions?: string[];
  enabled?: boolean;
  embedFn?: (text: string) => Promise<number[]>;
  tokenizeFn?: (text: string) => string;
}

export interface FaqDenseMatch {
  faqId: string;
  knowledgeBaseId: string;
  userId: string;
  question: string;
  answer: string;
  matchedQuestionText: string;
  similarity: number;
}

export interface FaqWithQuestionsResult {
  id: string;
  knowledgeBaseId: string;
  userId: string;
  question: string;
  answer: string;
  enabled: boolean;
  hitCount: number;
  similarQuestions: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 格式化向量数组为 PostgreSQL vector 文本格式
 */
function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * 默认分词降级（若未注入分词器）
 */
function defaultTokenize(text: string): string {
  const tokens = text.match(/[一-龥]+|[a-zA-Z0-9_\-\.]+/g);
  return tokens ? tokens.join(' ') : text.trim();
}

/**
 * 插入问答对及其扁平化问法向量索引
 */
export async function insertFaqWithQuestions(
  params: InsertFaqParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<FaqWithQuestionsResult> {
  const {
    userId,
    knowledgeBaseId,
    question,
    answer,
    similarQuestions = [],
    enabled = true,
    embedFn,
    tokenizeFn = defaultTokenize,
  } = params;

  // 1. 整理去重所有问法（主标准问 + 相似问）
  const cleanQuestion = question.trim();
  const cleanSimilar = Array.from(
    new Set(
      similarQuestions
        .map((q) => q.trim())
        .filter((q) => q.length > 0 && q !== cleanQuestion)
    )
  ).slice(0, RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq);

  const allQuestionsToEmbed: Array<{ text: string; isPrimary: boolean }> = [
    { text: cleanQuestion, isPrimary: true },
    ...cleanSimilar.map((text) => ({ text, isPrimary: false })),
  ];

  // 2. 并发计算各问法的向量与分词
  const embeddedQuestions = await Promise.all(
    allQuestionsToEmbed.map(async (item) => {
      const vector = await embedFn(item.text);
      const segmented = tokenizeFn(item.text);
      return {
        ...item,
        vector,
        segmented,
      };
    })
  );

  // 3. 在事务中写入主表与问法表
  return await prisma.$transaction(async (tx) => {
    // 写入主表
    const faq = await tx.knowledgeFaq.create({
      data: {
        userId,
        knowledgeBaseId,
        question: cleanQuestion,
        answer: answer.trim(),
        enabled,
      },
    });

    // 批量写入子表向量
    for (const q of embeddedQuestions) {
      const vectorStr = formatVector(q.vector);
      await tx.$executeRawUnsafe(
        `
        INSERT INTO "knowledge_faq_questions" (
          "id", "faq_id", "knowledge_base_id", "user_id",
          "question_text", "question_segmented", "is_primary",
          "embedding", "created_at"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6,
          $7::vector, CURRENT_TIMESTAMP
        );
        `,
        faq.id,
        knowledgeBaseId,
        userId,
        q.text,
        q.segmented,
        q.isPrimary,
        vectorStr
      );
    }

    return {
      id: faq.id,
      knowledgeBaseId: faq.knowledgeBaseId,
      userId: faq.userId,
      question: faq.question,
      answer: faq.answer,
      enabled: faq.enabled,
      hitCount: faq.hitCount,
      similarQuestions: cleanSimilar,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt,
    };
  });
}

/**
 * 更新问答对并重新计算问法索引
 */
export async function updateFaqWithQuestions(
  params: UpdateFaqParams
): Promise<FaqWithQuestionsResult | null> {
  const { userId, faqId, question, answer, similarQuestions, enabled, embedFn, tokenizeFn = defaultTokenize } = params;

  // 1. 鉴权与获取原实体
  const existing = await prisma.knowledgeFaq.findUnique({
    where: { id: faqId },
    include: { questions: true },
  });

  if (!existing || existing.userId !== userId) {
    return null;
  }

  const finalQuestion = question !== undefined ? question.trim() : existing.question;
  const finalAnswer = answer !== undefined ? answer.trim() : existing.answer;
  const finalEnabled = enabled !== undefined ? enabled : existing.enabled;

  // 检查是否需要重新向量化
  const needReindex = question !== undefined || similarQuestions !== undefined;

  let cleanSimilar: string[] = [];
  if (similarQuestions !== undefined) {
    cleanSimilar = Array.from(
      new Set(
        similarQuestions
          .map((q) => q.trim())
          .filter((q) => q.length > 0 && q !== finalQuestion)
      )
    ).slice(0, RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq);
  } else {
    cleanSimilar = existing.questions
      .filter((q) => !q.isPrimary)
      .map((q) => q.questionText);
  }

  return await prisma.$transaction(async (tx) => {
    // 更新主表
    const updated = await tx.knowledgeFaq.update({
      where: { id: faqId },
      data: {
        question: finalQuestion,
        answer: finalAnswer,
        enabled: finalEnabled,
      },
    });

    if (needReindex && embedFn) {
      // 清空旧问法
      await tx.knowledgeFaqQuestion.deleteMany({
        where: { faqId },
      });

      const allQuestionsToEmbed: Array<{ text: string; isPrimary: boolean }> = [
        { text: finalQuestion, isPrimary: true },
        ...cleanSimilar.map((text) => ({ text, isPrimary: false })),
      ];

      const embeddedQuestions = await Promise.all(
        allQuestionsToEmbed.map(async (item) => {
          const vector = await embedFn(item.text);
          const segmented = tokenizeFn(item.text);
          return {
            ...item,
            vector,
            segmented,
          };
        })
      );

      for (const q of embeddedQuestions) {
        const vectorStr = formatVector(q.vector);
        await tx.$executeRawUnsafe(
          `
          INSERT INTO "knowledge_faq_questions" (
            "id", "faq_id", "knowledge_base_id", "user_id",
            "question_text", "question_segmented", "is_primary",
            "embedding", "created_at"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3,
            $4, $5, $6,
            $7::vector, CURRENT_TIMESTAMP
          );
          `,
          faqId,
          existing.knowledgeBaseId,
          userId,
          q.text,
          q.segmented,
          q.isPrimary,
          vectorStr
        );
      }
    }

    return {
      id: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      userId: updated.userId,
      question: updated.question,
      answer: updated.answer,
      enabled: updated.enabled,
      hitCount: updated.hitCount,
      similarQuestions: cleanSimilar,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  });
}

/**
 * 切换 FAQ 启用停用状态
 */
export async function toggleFaqStatus(
  userId: string,
  faqId: string,
  enabled?: boolean
): Promise<boolean> {
  const existing = await prisma.knowledgeFaq.findUnique({
    where: { id: faqId },
    select: { userId: true, enabled: true },
  });

  if (!existing || existing.userId !== userId) {
    return false;
  }

  const nextStatus = enabled !== undefined ? enabled : !existing.enabled;
  await prisma.knowledgeFaq.update({
    where: { id: faqId },
    data: { enabled: nextStatus },
  });
  return true;
}

/**
 * 删除指定 FAQ 及其关联问法
 */
export async function deleteFaq(userId: string, faqId: string): Promise<boolean> {
  const existing = await prisma.knowledgeFaq.findUnique({
    where: { id: faqId },
    select: { userId: true },
  });

  if (!existing || existing.userId !== userId) {
    return false;
  }

  await prisma.knowledgeFaq.delete({
    where: { id: faqId },
  });
  return true;
}

/**
 * 增加 FAQ 命中计数
 */
export async function incrementFaqHitCount(faqId: string): Promise<void> {
  try {
    await prisma.knowledgeFaq.update({
      where: { id: faqId },
      data: { hitCount: { increment: 1 } },
    });
  } catch {
    // 忽略审计计数递增异常
  }
}

/**
 * 稠密向量检索匹配的 FAQ（SQL 层前置 ACL 隔离与启用状态过滤）
 */
export async function searchFaqsDense(params: {
  userId: string;
  knowledgeBaseIds: string[];
  queryVector: number[];
  topK?: number;
}): Promise<FaqDenseMatch[]> {
  const { userId, knowledgeBaseIds, queryVector, topK = 5 } = params;

  if (knowledgeBaseIds.length === 0) {
    return [];
  }

  const vectorStr = formatVector(queryVector);

  interface RawFaqMatch {
    faq_id: string;
    knowledge_base_id: string;
    user_id: string;
    question: string;
    answer: string;
    matched_question_text: string;
    similarity: number;
  }

  const rows = await prisma.$queryRawUnsafe<RawFaqMatch[]>(
    `
    SELECT
      f."id" AS "faq_id",
      f."knowledge_base_id",
      f."user_id",
      f."question",
      f."answer",
      q."question_text" AS "matched_question_text",
      (1 - (q."embedding" <=> $1::vector)) AS "similarity"
    FROM "knowledge_faq_questions" q
    INNER JOIN "knowledge_faqs" f ON q."faq_id" = f."id"
    WHERE q."user_id" = $2
      AND q."knowledge_base_id" = ANY($3::text[])
      AND f."enabled" = true
      AND q."embedding" IS NOT NULL
    ORDER BY q."embedding" <=> $1::vector ASC
    LIMIT $4;
    `,
    vectorStr,
    userId,
    knowledgeBaseIds,
    topK
  );

  return rows.map((row) => ({
    faqId: row.faq_id,
    knowledgeBaseId: row.knowledge_base_id,
    userId: row.user_id,
    question: row.question,
    answer: row.answer,
    matchedQuestionText: row.matched_question_text,
    similarity: Number(row.similarity),
  }));
}

/**
 * 寻找最相关的 FAQ 并执行短路与权威口径决策判定 (ADR-0027)
 */
export async function findBestFaqMatch(params: {
  userId: string;
  knowledgeBaseIds: string[];
  query: string;
  embedFn: (text: string) => Promise<number[]>;
}): Promise<{
  faqId: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  matchedQuestionText: string;
  similarity: number;
  isShortCircuit: boolean;
  isGroundTruth: boolean;
} | null> {
  const { userId, knowledgeBaseIds, query, embedFn } = params;
  if (!query || !query.trim() || knowledgeBaseIds.length === 0) {
    return null;
  }

  const queryVector = await embedFn(query.trim());
  const matches = await searchFaqsDense({
    userId,
    knowledgeBaseIds,
    queryVector,
    topK: 1,
  });

  const best = matches[0];
  if (!best) return null;

  const isGroundTruth = best.similarity >= RAG_FAQ_CONFIG.groundTruthThreshold;
  const isShortCircuit = best.similarity >= RAG_FAQ_CONFIG.shortCircuitThreshold;

  if (!isGroundTruth) {
    return null;
  }

  return {
    ...best,
    isShortCircuit,
    isGroundTruth,
  };
}

/**
 * 查询指定知识库下的所有 FAQ（管理端列表使用）
 */
export async function getFaqsByKnowledgeBase(
  userId: string,
  knowledgeBaseId: string,
  options: {
    search?: string;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<FaqWithQuestionsResult[]> {
  const { search, enabled, page = 1, pageSize = 50 } = options;

  const where: Prisma.KnowledgeFaqWhereInput = {
    userId,
    knowledgeBaseId,
    ...(enabled !== undefined ? { enabled } : {}),
    ...(search
      ? {
          OR: [
            { question: { contains: search, mode: 'insensitive' } },
            { answer: { contains: search, mode: 'insensitive' } },
            {
              questions: {
                some: { questionText: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {}),
  };

  const faqs = await prisma.knowledgeFaq.findMany({
    where,
    include: {
      questions: {
        where: { isPrimary: false },
        select: { questionText: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return faqs.map((f) => ({
    id: f.id,
    knowledgeBaseId: f.knowledgeBaseId,
    userId: f.userId,
    question: f.question,
    answer: f.answer,
    enabled: f.enabled,
    hitCount: f.hitCount,
    similarQuestions: f.questions.map((q) => q.questionText),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}
