/**
 * knowledge_search 知识库只读检索工具（ADR-0021 / 工单 08）
 *
 * 核心机制：
 * 1. 只读安全性：仅提供知识库切片混合检索（稠密向量 + 词法分词 + RRF 融合），无写操作。
 * 2. 强边界多租户隔离 (QA-010)：强制绑定当前请求用户 ctx.userId，SQL 层前置 ACL 过滤；
 *    若入参指定了 knowledgeBaseId，严格校验该库归属，跨用户越权一律拦截。
 * 3. 来源锚点与 [^n] 编号契约 (QA-004)：将切片包装为带稳定锚点（文档名称、版本号、页码/标题）
 *    的不可信检索上下文，强指令约束模型在正文中显式引用 [^n] 编号。
 * 4. 恶意注入防御 (QA-012)：检索内容统一标记为不可信数据，显式屏蔽越权调用与指令篡改。
 * 5. 依赖注入与测试接缝：支持注入 mock 检索实现与知识库查找函数，保障单测独立稳定。
 */

import { z } from 'zod';
import { prisma, findBestFaqMatch, incrementFaqHitCount } from '@repo/db';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';
import { hybridRetrieval, isSequentialChapterQuery, type RetrievedChunk } from '@/lib/rag/hybrid-retrieval';
import { formatRetrievedChunksWithCitations } from '@/lib/rag/citation';
import { embedFaqText } from '@/lib/rag/faq-service';
import { detectChatSensitiveTopic } from '../../chat-safety';
import {
  SiliconFlowRerankProvider,
  type RerankProvider,
} from '@repo/providers';
import { RAG_RERANK_CONFIG, isRagRerankEnabled } from '@repo/shared';

export const knowledgeSearchParametersSchema = z.object({
  query: z
    .string()
    .optional()
    .default('')
    .describe('要在知识库私有文档中检索的具体问题、关键词或术语。如果指定了 headingPath 进行章节连续通读，query 可传空字符串或 "*"'),
  knowledgeBaseId: z
    .string()
    .optional()
    .describe('可选指定的知识库 ID；若未指定则自动在当前用户的所有可用知识库中检索'),
  headingPath: z
    .string()
    .max(300, '章节路径最多 300 字符')
    .optional()
    .describe('可选的章节目录路径（例如：“3. 系统架构 > 3.2 权限控制”），用于将检索定向收敛到特定章节子树内'),
  documentId: z
    .string()
    .max(100, '文档 ID 最多 100 字符')
    .optional()
    .describe('可选指定的单篇文档 ID，配合 headingPath 进行精准定向下钻'),
  topK: z
    .number()
    .int('topK 必须为整数')
    .min(1, 'topK 至少为 1')
    .max(100, 'topK 单次最多 100 条')
    .optional()
    .describe('返回的最相关切片数量（普通问答默认 5 条，最多 100 条；章节通读模式默认 100 条）'),
  filter: z
    .object({
      tags: z.array(z.string()).optional().describe('要过滤的文档标签列表，例如：["财务", "2026"]'),
      year: z.union([z.number(), z.string()]).optional().describe('年份过滤，例如：2026'),
    })
    .passthrough()
    .optional()
    .describe('可选的前置元数据与多维标签过滤器，用于精准收敛检索空间（如过滤特定年份、部门或标签）'),
});

export type KnowledgeSearchParams = z.infer<typeof knowledgeSearchParametersSchema>;

/** 可选注入的依赖接口（供单测使用） */
export interface KnowledgeSearchDeps {
  hybridRetrievalFn?: typeof hybridRetrieval;
  findKnowledgeBasesFn?: (userId: string) => Promise<Array<{ id: string; name: string }>>;
  verifyKnowledgeBaseFn?: (
    userId: string,
    knowledgeBaseId: string
  ) => Promise<{ id: string; name: string } | null>;
  findBestFaqMatchFn?: typeof findBestFaqMatch;
  embedFaqFn?: typeof embedFaqText;
  rerankProvider?: RerankProvider;
  isRerankEnabledFn?: () => boolean;
}

/** 默认查询用户可用知识库列表 */
async function defaultFindKnowledgeBases(
  userId: string
): Promise<Array<{ id: string; name: string }>> {
  return prisma.knowledgeBase.findMany({
    where: { userId, status: 'active' },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/** 默认校验指定知识库是否存在且属于当前用户 */
async function defaultVerifyKnowledgeBase(
  userId: string,
  knowledgeBaseId: string
): Promise<{ id: string; name: string } | null> {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: { id: true, name: true, userId: true, status: true },
  });

  if (!kb || kb.userId !== userId || kb.status === 'archived') {
    return null;
  }

  return { id: kb.id, name: kb.name };
}

/**
 * 创建 knowledge_search Agent 只读工具实例
 */
export function createKnowledgeSearchTool(deps: KnowledgeSearchDeps = {}): AgentToolSpec {
  const retrievalFn = deps.hybridRetrievalFn || hybridRetrieval;
  const findKbsFn = deps.findKnowledgeBasesFn || defaultFindKnowledgeBases;
  const verifyKbFn = deps.verifyKnowledgeBaseFn || defaultVerifyKnowledgeBase;
  const findFaqFn = deps.findBestFaqMatchFn || findBestFaqMatch;
  const embedFn = deps.embedFaqFn || embedFaqText;
  const rerankProvider = deps.rerankProvider;
  const isRerankEnabledFn = deps.isRerankEnabledFn;

  return {
    name: 'knowledge_search',
    description:
      '检索当前用户的私有知识库文档。当用户询问私有文档细节、公司规范、内部方案、历史规约等知识时，必须优先调用本工具获取真实切片依据。输入检索关键词与可选知识库 ID，返回带有出处锚点编号 [^n] 的切片内容。',
    parameters: knowledgeSearchParametersSchema,
    timeoutMs: 15_000,
    async execute(args, ctx): Promise<ToolExecutionResult> {
      const parsed = knowledgeSearchParametersSchema.safeParse(args);
      if (!parsed.success) {
        const errorMsg = parsed.error.errors[0]?.message || '检索参数错误';
        throw new ToolError(errorMsg);
      }

      const { query, knowledgeBaseId, headingPath, documentId, topK: inputTopK, filter } = parsed.data;
      const trimmedQuery = (query || '').trim();
      const isSequentialChapterMode = isSequentialChapterQuery(trimmedQuery, headingPath);

      // 章节通读模式下默认 100 条，普通问答模式下默认 5 条；若调用方显式指定 topK 则遵守指定值 (P-W5 / ADR-0036)
      const effectiveTopK = inputTopK ?? (isSequentialChapterMode ? 100 : 5);

      if (!isSequentialChapterMode && !trimmedQuery) {
        throw new ToolError('检索查询词不能为空');
      }

      // 安全合规预检
      if (trimmedQuery && detectChatSensitiveTopic(trimmedQuery)) {
        throw new ToolError('检索关键词包含敏感内容，无法执行');
      }

      const userId = ctx.userId;
      if (!userId) {
        throw new ToolError('未获取到当前用户信息');
      }

      // 1. 确定目标检索知识库（QA-010：多租户隔离与越权防御）
      let targetKnowledgeBaseIds: Array<{ id: string; name: string }> = [];

      if (knowledgeBaseId && knowledgeBaseId.trim()) {
        const verifiedKb = await verifyKbFn(userId, knowledgeBaseId.trim());
        if (!verifiedKb) {
          // 越权或者不存在：绝对不返回任何数据 (QA-010)
          return {
            ok: false,
            contentForModel:
              '【知识库检索失败】：指定的知识库不存在或您无权访问该知识库。\n' +
              '请向用户明确说明无法访问该知识库，切勿凭空编造答案。',
            summaryForDisplay: '指定的知识库不存在或无权访问',
          };
        }
        targetKnowledgeBaseIds = [verifiedKb];
      } else {
        const userKbs = await findKbsFn(userId);
        if (!userKbs || userKbs.length === 0) {
          return {
            ok: true,
            contentForModel:
              '【知识库检索结果】：您当前名下暂无可用知识库。\n' +
              '请告知用户需先在知识库页面创建知识库并上传文档后才能进行问答。',
            summaryForDisplay: '暂无可用知识库',
          };
        }
        // 最多同时并发检索用户的前 3 个知识库，平衡性能与召回率
        targetKnowledgeBaseIds = userKbs.slice(0, 3);
      }

      // 2. 并发执行长文本切片混合检索与 FAQ 权威口径匹配 (ADR-0027 / ADR-0032)
      try {
        const kbIds = targetKnowledgeBaseIds.map((kb) => kb.id);
        let anyFilterRelaxed = false;

        const [results, bestFaq] = await Promise.all([
          Promise.all(
            targetKnowledgeBaseIds.map(async (kb) => {
              try {
                const res = await retrievalFn({
                  userId,
                  knowledgeBaseId: kb.id,
                  query: trimmedQuery,
                  topK: isSequentialChapterMode ? effectiveTopK : RAG_RERANK_CONFIG.defaultTopN,
                  enableRerank: false, // 各库仅执行粗排召回，由外层统一单次全局 Rerank (ADR-0030)
                  filter,
                  headingPath: headingPath?.trim(),
                  documentId: documentId?.trim(),
                });
                if (res.isFilterRelaxed) {
                  anyFilterRelaxed = true;
                }
                return res.chunks;
              } catch (error) {
                console.warn(`[knowledge_search] 知识库 ${kb.id} 检索失败:`, error);
                return [] as RetrievedChunk[];
              }
            })
          ),
          !isSequentialChapterMode && trimmedQuery
            ? findFaqFn({
                userId,
                knowledgeBaseIds: kbIds,
                query: trimmedQuery,
                embedFn,
              }).catch((err) => {
                console.warn('[knowledge_search] FAQ 检索降级:', err);
                return null;
              })
            : Promise.resolve(null),
        ]);

        // 若命中 FAQ 且属于强权威口径，异步增加命中统计
        if (bestFaq && bestFaq.isGroundTruth) {
          incrementFaqHitCount(bestFaq.faqId).catch(() => {});
        }

        // 跨库切片汇总并按 chunkId 去重
        const allCandidates = results.flat();
        const seenChunkIds = new Set<string>();
        const uniqueCandidates: RetrievedChunk[] = [];
        for (const chunk of allCandidates) {
          if (!seenChunkIds.has(chunk.chunkId)) {
            seenChunkIds.add(chunk.chunkId);
            uniqueCandidates.push(chunk);
          }
        }

        let fusedChunks: RetrievedChunk[] = [];

        // 章节顺序通读模式：直接按切片顺序返回，无需 Cross-Encoder 打乱 (ADR-0036)
        if (isSequentialChapterMode) {
          fusedChunks = uniqueCandidates.slice(0, effectiveTopK);
        } else {
          // 执行跨库统一 Cross-Encoder Rerank 二次精排 (ADR-0030)
          const checkRerank = isRerankEnabledFn || isRagRerankEnabled;
          const isRerankActive = checkRerank();

          if (isRerankActive && uniqueCandidates.length > 0) {
            const candidateLimit = Math.min(uniqueCandidates.length, RAG_RERANK_CONFIG.maxCandidates);
            // 按原 RRF 粗排得分截取前 maxCandidates (30) 条送入精排
            const candidatePool = uniqueCandidates
              .sort((a, b) => b.score - a.score)
              .slice(0, candidateLimit);
            const candidateDocs = candidatePool.map((c) => c.content);

            try {
              const provider = rerankProvider || new SiliconFlowRerankProvider();
              const rerankResults = await provider.rerank(trimmedQuery, candidateDocs, candidateLimit);

              // 过滤低于 minRelevanceScore (0.20) 的低相关长尾切片
              const minScore = RAG_RERANK_CONFIG.minRelevanceScore;
              const validResults = (rerankResults || []).filter((r) => r.relevanceScore >= minScore);
              const targetResults = validResults.slice(0, effectiveTopK);

              fusedChunks = targetResults.map((r) => {
                const original = candidatePool[r.index] ?? candidatePool[0];
                return {
                  ...original,
                  score: r.relevanceScore,
                  rerankScore: r.relevanceScore,
                };
              });
            } catch (rerankErr) {
              console.warn('[knowledge_search] 多库聚合 Rerank 异常，平滑降级为原 RRF 排名:', rerankErr);
              // 弹性容灾平滑降级：按原 RRF 分数排序截断
              fusedChunks = uniqueCandidates.sort((a, b) => b.score - a.score).slice(0, effectiveTopK);
            }
          } else {
            fusedChunks = uniqueCandidates.sort((a, b) => b.score - a.score).slice(0, effectiveTopK);
          }
        }

        // 3. 构建结构化切片引用映射字典与快照 (ADR-0025 / KB-CHAT-CITE)
        const citations: Record<number, import('@/lib/rag/hybrid-retrieval').CitationAnchor> = {};
        fusedChunks.forEach((chunk, index) => {
          const refNum = index + 1;
          citations[refNum] = {
            ...chunk.citationAnchor,
            knowledgeBaseId: chunk.citationAnchor.knowledgeBaseId || targetKnowledgeBaseIds[0]?.id || '',
            snippet: chunk.citationAnchor.snippet || (chunk.content ? chunk.content.slice(0, 300) : ''),
          };
        });

        // 结果包装为不可信上下文并附带防御声明 (QA-011 / QA-012)
        let contentForModel = formatRetrievedChunksWithCitations(fusedChunks, trimmedQuery);

        // 若触发过滤放宽兜底，注入明确引导提示 (ADR-0032 / FilterRelaxation)
        if (anyFilterRelaxed) {
          const relaxedHeader = [
            '【系统提示：过滤条件已自动放宽】',
            `未检索到完全匹配指定过滤条件的切片，系统已自动为您检索全库最相关的参考内容。`,
            '（请在回答用户时明确说明知识库中暂无完全符合该限制条件的专属文档，并基于以下放宽召回的资料提供参考。）',
            '',
          ].join('\n');
          contentForModel = relaxedHeader + contentForModel;
        }

        // 若命中 FAQ 权威口径，置顶注入模型提示词 (ADR-0027 / FaqGroundTruth)
        if (bestFaq && bestFaq.isGroundTruth) {
          const faqHeader = [
            '【官方权威标准口径 (Ground Truth)】',
            `标准问题：${bestFaq.question}`,
            `权威答案：${bestFaq.answer}`,
            '（系统提示：用户提问与该官方问答对高度匹配，请严格以该权威口径作答，避免事实偏差。）',
            '',
          ].join('\n');
          contentForModel = faqHeader + contentForModel;
        }

        const shortQuery = trimmedQuery.length > 20 ? `${trimmedQuery.slice(0, 18)}…` : trimmedQuery;

        if (fusedChunks.length === 0 && (!bestFaq || !bestFaq.isGroundTruth)) {
          return {
            ok: true,
            contentForModel,
            summaryForDisplay: `已检索知识库“${shortQuery}” · 未命中相关内容`,
            citations: {},
          };
        }

        const uniqueDocs = Array.from(new Set(fusedChunks.map((c) => c.documentName)));
        const docNamesSummary = uniqueDocs.length > 2
          ? `${uniqueDocs.slice(0, 2).join('、')}等`
          : uniqueDocs.join('、');

        const faqNotice = bestFaq && bestFaq.isGroundTruth ? '命中官方FAQ · ' : '';
        const relaxedNotice = anyFilterRelaxed ? '（已放宽过滤）' : '';
        const chunkNotice = fusedChunks.length > 0 ? `命中 ${fusedChunks.length} 条切片（${docNamesSummary}）` : '采用官方标准口径';

        return {
          ok: true,
          contentForModel,
          summaryForDisplay: `已检索知识库“${shortQuery}” · ${faqNotice}${chunkNotice}${relaxedNotice}`,
          citations,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (ctx.signal.aborted) {
          throw new ToolError('知识库检索已被中断');
        }
        throw new ToolError(`知识库检索执行失败: ${msg}`);
      }
    },
  };
}
