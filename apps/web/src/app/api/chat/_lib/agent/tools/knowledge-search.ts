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
 * 5. 统一二次语义精排政策 (ADR-0030 / ARCH-CK-01)：多库粗排召回后，外层统一调用 applyCrossEncoderRerank，
 *    享受统一的截断、阈值过滤、响应合法性防越界保护与弹性降级。
 */

import { z } from 'zod';
import { prisma } from '@repo/db';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';
import { hybridRetrieval } from '@/lib/rag/hybrid-retrieval';
import { formatRetrievedChunksWithCitations } from '@/lib/rag/citation';
import { detectChatSensitiveTopic } from '../../chat-safety';
import { knowledgeFaqMatchPolicy } from '../../faq-match-policy-defaults';
import type {
  KnowledgeFaqMatchDecision,
  KnowledgeFaqMatchInput,
} from '../../faq-match-policy';
import type { RerankProvider } from '@repo/providers';
import { RAG_RERANK_CONFIG, type RetrievedChunk, type CitationAnchor } from '@repo/shared';
import { applyCrossEncoderRerank } from '@/lib/rag/rerank-policy';

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
  matchFaqFn?: (input: KnowledgeFaqMatchInput) => Promise<KnowledgeFaqMatchDecision>;
  rerankProvider?: RerankProvider;
}

/** 默认查询用户可用知识库列表 */
async function defaultFindKnowledgeBases(
  userId: string
): Promise<Array<{ id: string; name: string }>> {
  return prisma.knowledgeBase.findMany({
    where: { userId, status: 'active' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** 默认校验特定知识库归属（防越权，QA-010） */
async function defaultVerifyKnowledgeBase(
  userId: string,
  knowledgeBaseId: string
): Promise<{ id: string; name: string } | null> {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: { id: true, name: true, userId: true, status: true },
  });

  if (!kb || kb.userId !== userId || kb.status !== 'active') {
    return null;
  }
  return { id: kb.id, name: kb.name };
}

/**
 * 创建 knowledge_search Agent 工具实例
 */
export function createKnowledgeSearchTool(deps: KnowledgeSearchDeps = {}): AgentToolSpec {
  const retrievalFn = deps.hybridRetrievalFn || hybridRetrieval;
  const findKbsFn = deps.findKnowledgeBasesFn || defaultFindKnowledgeBases;
  const verifyKbFn = deps.verifyKnowledgeBaseFn || defaultVerifyKnowledgeBase;
  const matchFaqFn = deps.matchFaqFn || knowledgeFaqMatchPolicy.match;
  const rerankProvider = deps.rerankProvider;

  return {
    name: 'knowledge_search',
    description: [
      '在知识库私有文档中检索最相关的切片内容以辅助回答事实性问题。',
      '注意：此工具为只读检索工具，不会修改任何知识库数据。',
      '当问题涉及特定专业领域、企业制度、历史知识或私有文档事实时，应优先调用此工具。',
      '支持指定 headingPath 章节路径进行精准定向检索或章节连续通读；支持传入 filter 进行标签与年份前置收敛。',
    ].join(''),
    parameters: knowledgeSearchParametersSchema,
    execute: async (params: Record<string, unknown>, context) => {
      const { userId } = context;
      const parsed = knowledgeSearchParametersSchema.parse(params);
      const { query = '', knowledgeBaseId, headingPath, documentId, topK: inputTopK, filter } = parsed;

      const trimmedQuery = query.trim();
      const isSequentialChapterMode = Boolean(headingPath && (trimmedQuery === '' || trimmedQuery === '*'));

      // 1. 基础参数防空校验（非通读模式下 query 必填）
      if (!isSequentialChapterMode && !trimmedQuery) {
        throw new ToolError('检索查询词不能为空，请输入要检索的具体问题或关键词', 'INVALID_PARAM');
      }

      // 安全合规预检
      if (trimmedQuery && detectChatSensitiveTopic(trimmedQuery)) {
        throw new ToolError('检索关键词包含敏感内容，无法执行');
      }

      // 2. 确定检索知识库目标范围
      let targetKnowledgeBaseIds: Array<{ id: string; name: string }> = [];

      if (knowledgeBaseId) {
        // 用户显式指定了知识库：执行强越权校验 (QA-010)
        const verified = await verifyKbFn(userId, knowledgeBaseId);
        if (!verified) {
          return {
            ok: false,
            contentForModel: `指定的知识库不存在或您无权访问（knowledgeBaseId: ${knowledgeBaseId}）。请勿继续重试此库。`,
            summaryForDisplay: '指定的知识库不存在或无权访问',
          };
        }
        targetKnowledgeBaseIds = [verified];
      } else {
        // 未指定知识库：检索当前用户名下所有可用库（最多 3 库并发，防过度扩散）
        const userKbs = await findKbsFn(userId);
        if (userKbs.length === 0) {
          return {
            ok: true,
            contentForModel: '您当前名下暂无可用知识库或未上传任何有效文档，无法检索私有知识。请提示用户先上传文档。',
            summaryForDisplay: '暂无可用知识库',
          };
        }
        targetKnowledgeBaseIds = userKbs.slice(0, 3);
      }

      // 通读模式默认放宽至 100 条 (ADR-0036 / P-W5)；普通问答模式默认 5 条
      const effectiveTopK = inputTopK ?? (isSequentialChapterMode ? 100 : 5);

      try {
        let anyFilterRelaxed = false;

        // 并发检索目标知识库，并在启用时并发探测 FAQ 权威库
        const [results, bestFaq] = await Promise.all([
          Promise.all(
            targetKnowledgeBaseIds.map(async (kb) => {
              try {
                const res = await retrievalFn({
                  userId,
                  knowledgeBaseId: kb.id,
                  query: trimmedQuery,
                  topK: isSequentialChapterMode ? effectiveTopK : RAG_RERANK_CONFIG.defaultTopN,
                  enableRerank: false,
                  filter,
                  headingPath,
                  documentId,
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
            ? matchFaqFn({
                userId,
                query: trimmedQuery,
                scene: 'agent-retrieval',
                ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
              }).catch((err) => {
                console.warn('[knowledge_search] FAQ 检索降级:', err);
                return null;
              })
            : Promise.resolve(null),
        ]);

        const groundTruthFaq = bestFaq?.kind === 'ground-truth' ? bestFaq.faq : null;

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

        // 按粗排 RRF 分数排序
        uniqueCandidates.sort((a, b) => b.score - a.score);

        let fusedChunks: RetrievedChunk[] = [];

        // 章节顺序通读模式：直接按切片顺序返回，无需 Cross-Encoder 打乱 (ADR-0036)
        if (isSequentialChapterMode) {
          fusedChunks = uniqueCandidates.slice(0, effectiveTopK);
        } else {
          // 执行跨库统一 Cross-Encoder Rerank 二次精排 (ADR-0030 / ARCH-CK-01)
          const rerankOutcome = await applyCrossEncoderRerank({
            query: trimmedQuery,
            candidates: uniqueCandidates,
            topK: effectiveTopK,
            rerankProvider,
          });
          fusedChunks = rerankOutcome.chunks;
        }

        // 3. 构建结构化切片引用映射字典与快照 (ADR-0025 / KB-CHAT-CITE)
        // 来源锚点已在粗排阶段单点权威装配完毕，此处直接消费
        const citations: Record<number, CitationAnchor> = {};
        fusedChunks.forEach((chunk, index) => {
          citations[index + 1] = chunk.citationAnchor;
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

        // 若命中官方权威 FAQ，置顶权威回答文本块 (ADR-0055)
        if (groundTruthFaq) {
          const faqHeader = [
            '【官方权威标准口径 (Ground Truth)】：',
            `标准问题：${groundTruthFaq.question}`,
            `权威答案：${groundTruthFaq.answer}`,
            '（注意：请优先基于上述官方标准口径回答用户，若检索到的普通文档切片与此冲突，以官方口径为准。）',
            '',
            '---',
            '',
          ].join('\n');
          contentForModel = faqHeader + contentForModel;
        }

        const matchCount = fusedChunks.length;
        let summaryText = matchCount > 0 ? `命中 ${matchCount} 条切片` : '未命中相关内容';
        if (groundTruthFaq) {
          summaryText = `命中官方FAQ${matchCount > 0 ? ` + ${matchCount}条切片` : ''}`;
        }
        if (anyFilterRelaxed) {
          summaryText += '（已放宽过滤）';
        }

        return {
          ok: true,
          contentForModel,
          summaryForDisplay: summaryText,
          citations,
        };
      } catch (err: unknown) {
        console.error('[knowledge_search] 检索执行异常:', err);
        throw new ToolError(
          `知识库检索执行失败: ${err instanceof Error ? err.message : String(err)}`,
          'SEARCH_FAILED'
        );
      }
    },
  };
}
