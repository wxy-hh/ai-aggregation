/**
 * memory_search 只读会话记忆检索工具 (ADR-0021 / ADR-0022 / 工单 09)
 *
 * 核心设计契约：
 * 1. 严格的用户 ACL 隔离：所有检索强制在 SQL 层前置绑定 ctx.userId，模型参数无论如何构造绝不可越权
 * 2. 混合检索与 RRF 融合：复用稠密向量 (BAAI/bge-m3) 与词法全文 (ts_rank_cd) 两路召回，通过自研标准 RRF(k=60) 融合
 * 3. 来源安全声明：检索结果使用「不可信检索内容」标签包裹，明确标注来源为历史会话记忆
 * 4. 依赖注入：支持注入 mock 向量化函数与检索数据访问层，供单测 100% 独立验证
 */

import { z } from 'zod';
import {
  searchMemoryChunksDense,
  searchMemoryChunksLexical,
  type ConversationMemoryChunkDenseMatch,
  type ConversationMemoryChunkLexicalMatch,
  type ConversationMemoryChunkRow,
} from '@repo/db';
import { RAG_RETRIEVAL_CONFIG } from '@repo/shared';
import { logger } from '@repo/logger';
import { embedText, segmentForQuery } from '@repo/text';
import { ToolError, type AgentToolSpec, type ToolExecutionContext, type ToolExecutionResult } from '@/lib/agent/registry';
import { reciprocalRankFusion } from '@/lib/rag/rrf';

const memorySearchParameters = z.object({
  query: z
    .string()
    .min(1, '检索查询不能为空')
    .max(500, '检索查询过长')
    .describe('要在历史会话记忆中查找的内容描述或关键词'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('最多返回的记忆片段数量，缺省为 5'),
});

export type MemorySearchInput = z.infer<typeof memorySearchParameters>;

export interface MemorySearchDependencies {
  embedQueryFn?: (query: string) => Promise<number[]>;
  segmentQueryFn?: typeof segmentForQuery;
  searchDenseFn?: typeof searchMemoryChunksDense;
  searchLexicalFn?: typeof searchMemoryChunksLexical;
}

/**
 * 创建只读会话记忆检索工具
 */
export function createMemorySearchTool(deps: MemorySearchDependencies = {}): AgentToolSpec {
  return {
    name: 'memory_search',
    description:
      '只读检索用户历史对话记忆。当用户询问过去讨论过的话题、之前提到的设定、偏好、暗号或历史结论时调用本工具。仅能检索当前用户自身且已开启记忆索引的历史会话。',
    parameters: memorySearchParameters,
    timeoutMs: 8_000,
    async execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      // 0. 运行时校验与用户上下文断言
      const parsed = memorySearchParameters.safeParse(args);
      if (!parsed.success) {
        throw new ToolError(
          'INVALID_ARGUMENT',
          `会话记忆检索参数无效: ${parsed.error.issues.map((i) => i.message).join('; ')}`
        );
      }

      const { query, topK } = parsed.data;
      const userId = ctx.userId;
      if (!userId) {
        throw new ToolError('PERMISSION_DENIED', '未获取到当前有效登录用户，无法检索会话记忆');
      }

      try {
        // 1. 双路并行召回准备：向量化与分词
        const embedFn = deps.embedQueryFn || embedText;
        const segmentQuery = deps.segmentQueryFn || segmentForQuery;

        const denseSearch = deps.searchDenseFn || searchMemoryChunksDense;
        const lexicalSearch = deps.searchLexicalFn || searchMemoryChunksLexical;

        const preparedLexicalQuery = segmentQuery(query);
        if (preparedLexicalQuery === null) {
          logger.warn('[memory-search] 分词不可用，跳过词法召回并降级为纯向量检索', {
            feature: 'memory-lexical-degraded',
            userId,
            errorId: ctx.errorId,
          });
        }

        const [queryVector] = await Promise.all([
          embedFn(query),
        ]);

        // 并行发起稠密检索与词法检索（SQL 层强制带入 userId ACL）
        const [denseMatches, lexicalMatches] = await Promise.all([
          denseSearch({
            userId,
            queryVector,
            topK: RAG_RETRIEVAL_CONFIG.denseTopK,
          }),
          preparedLexicalQuery
            ? lexicalSearch({
                userId,
                query: preparedLexicalQuery,
                topK: RAG_RETRIEVAL_CONFIG.lexicalTopK,
              })
            : Promise.resolve([]),
        ]);

        // 2. 倒数排名融合 (RRF, k=60)
        const denseList = denseMatches.map((m) => ({
          id: m.id,
          item: m,
          score: m.similarity,
        }));

        const lexicalList = lexicalMatches.map((m) => ({
          id: m.id,
          item: m,
          score: m.rank,
        }));

        const fusedResults = reciprocalRankFusion<ConversationMemoryChunkRow>({
          denseList,
          lexicalList,
          k: RAG_RETRIEVAL_CONFIG.rrfK,
        });

        // 取 Top-K 融合结果
        const topChunks = fusedResults.slice(0, topK);

        // 3. 构造给模型与前端的输出格式（遵循不可信检索内容安全边界）
        if (topChunks.length === 0) {
          return {
            ok: true,
            contentForModel: '未检索到相关的历史会话记忆。请据此如实告知用户，无需编造。',
            summaryForDisplay: '未检索到相关历史记忆',
          };
        }

        const formattedEntries = topChunks.map((entry, index) => {
          const chunk = entry.item;
          const createdDate = chunk.createdAt instanceof Date ? chunk.createdAt.toISOString().slice(0, 10) : '';
          return `[记忆片段 ${index + 1}] (时间: ${createdDate || '未知'})\n${chunk.content}`;
        });

        const contentForModel = [
          '<不可信检索内容 来源="会话记忆">',
          '以下是系统检索到的该用户真实历史会话记忆片段（按相关度从高到低排序，请审慎采纳作为上下文）：',
          '',
          formattedEntries.join('\n\n'),
          '</不可信检索内容>',
        ].join('\n');

        return {
          ok: true,
          contentForModel,
          summaryForDisplay: `检索到 ${topChunks.length} 条历史会话记忆`,
        };
      } catch (error) {
        if (error instanceof ToolError) {
          throw error;
        }
        const errorMsg = error instanceof Error ? error.message : '未知检索错误';
        return {
          ok: false,
          contentForModel: `会话记忆检索暂时不可用: ${errorMsg}`,
          summaryForDisplay: '会话记忆检索异常',
        };
      }
    },
  };
}
