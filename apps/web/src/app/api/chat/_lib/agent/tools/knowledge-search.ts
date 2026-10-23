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
import { prisma } from '@repo/db';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';
import { hybridRetrieval, type RetrievedChunk } from '@/lib/rag/hybrid-retrieval';
import { formatRetrievedChunksWithCitations } from '@/lib/rag/citation';
import { detectChatSensitiveTopic } from '../../chat-safety';

export const knowledgeSearchParametersSchema = z.object({
  query: z
    .string()
    .min(1, '检索查询词不能为空')
    .describe('要在知识库私有文档中检索的具体问题、关键词或术语，例如：“连败熔断的触发条件”或“珀金协议修订版”'),
  knowledgeBaseId: z
    .string()
    .optional()
    .describe('可选指定的知识库 ID；若未指定则自动在当前用户的所有可用知识库中检索'),
  topK: z
    .number()
    .int('topK 必须为整数')
    .min(1, 'topK 至少为 1')
    .max(20, 'topK 单次最多 20 条')
    .optional()
    .default(5)
    .describe('返回的最相关切片数量（默认 5 条，最多 20 条）'),
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

      const { query, knowledgeBaseId, topK } = parsed.data;
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        throw new ToolError('检索查询词不能为空');
      }

      // 安全合规预检
      if (detectChatSensitiveTopic(trimmedQuery)) {
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

      // 2. 并发执行混合检索
      try {
        const results = await Promise.all(
          targetKnowledgeBaseIds.map(async (kb) => {
            try {
              const res = await retrievalFn({
                userId,
                knowledgeBaseId: kb.id,
                query: trimmedQuery,
                topK,
              });
              return res.chunks;
            } catch (error) {
              console.warn(`[knowledge_search] 知识库 ${kb.id} 检索失败:`, error);
              return [] as RetrievedChunk[];
            }
          })
        );

        // 合并切片并按 RRF 分数重新排序截取 topK
        const fusedChunks: RetrievedChunk[] = results
          .flat()
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        // 3. 结果包装为不可信上下文并附带防御声明 (QA-011 / QA-012)
        const contentForModel = formatRetrievedChunksWithCitations(fusedChunks, trimmedQuery);

        const shortQuery = trimmedQuery.length > 20 ? `${trimmedQuery.slice(0, 18)}…` : trimmedQuery;

        if (fusedChunks.length === 0) {
          return {
            ok: true,
            contentForModel,
            summaryForDisplay: `已检索知识库“${shortQuery}” · 未命中相关内容`,
          };
        }

        const uniqueDocs = Array.from(new Set(fusedChunks.map((c) => c.documentName)));
        const docNamesSummary = uniqueDocs.length > 2
          ? `${uniqueDocs.slice(0, 2).join('、')}等`
          : uniqueDocs.join('、');

        return {
          ok: true,
          contentForModel,
          summaryForDisplay: `已检索知识库“${shortQuery}” · 命中 ${fusedChunks.length} 条切片（${docNamesSummary}）`,
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
