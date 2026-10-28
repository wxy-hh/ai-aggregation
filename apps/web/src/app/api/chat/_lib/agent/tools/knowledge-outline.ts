/**
 * knowledge_outline 知识库只读大纲检索工具 (ADR-0036 / AGENT-DOC-TREE)
 *
 * 核心机制：
 * 1. 只读安全性与宏观全貌感知：获取文档的自顶向下章节目录树（Tree of Summaries），支持 maxDepth 深度截断。
 * 2. 强边界多租户隔离 (QA-010)：强制基于 ctx.userId 与知识库/文档归属校验，跨租户越权坚决拦截。
 * 3. 优雅降级契约：针对无标题文档或存量未索引大纲的文档，返回友好降级提示，引导模型平滑回退至全局检索。
 * 4. 依赖注入与测试接缝：支持注入 mock 查询函数，保障单测 100% 独立于真实数据库。
 */

import { prisma } from '@repo/db';
import {
  knowledgeOutlineParametersSchema,
  formatOutlineTreeToMarkdown,
  type DocumentOutline,
} from '@repo/shared';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';

export interface DocumentOutlineRecord {
  id: string;
  name: string;
  knowledgeBaseId: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeOutlineDeps {
  findDocumentFn?: (userId: string, docId: string) => Promise<DocumentOutlineRecord | null>;
  findDocumentsWithOutlinesFn?: (
    userId: string,
    knowledgeBaseId?: string
  ) => Promise<DocumentOutlineRecord[]>;
}

/** 默认查询指定归属用户的单篇文档 */
async function defaultFindDocument(
  userId: string,
  docId: string
): Promise<DocumentOutlineRecord | null> {
  const doc = await prisma.document.findFirst({
    where: {
      id: docId,
      userId,
      deletedAt: null,
      status: 'ready',
    },
    select: {
      id: true,
      name: true,
      knowledgeBaseId: true,
      metadata: true,
    },
  });

  if (!doc) return null;

  return {
    id: doc.id,
    name: doc.name,
    knowledgeBaseId: doc.knowledgeBaseId,
    metadata: (doc.metadata as Record<string, unknown>) || {},
  };
}

/** 默认查询用户可用知识库下的文档列表 */
async function defaultFindDocumentsWithOutlines(
  userId: string,
  knowledgeBaseId?: string
): Promise<DocumentOutlineRecord[]> {
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: null,
      status: 'ready',
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
    },
    select: {
      id: true,
      name: true,
      knowledgeBaseId: true,
      metadata: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    knowledgeBaseId: d.knowledgeBaseId,
    metadata: (d.metadata as Record<string, unknown>) || {},
  }));
}

/**
 * 创建 knowledge_outline Agent 只读工具实例
 */
export function createKnowledgeOutlineTool(deps: KnowledgeOutlineDeps = {}): AgentToolSpec {
  const findDocFn = deps.findDocumentFn || defaultFindDocument;
  const findDocsFn = deps.findDocumentsWithOutlinesFn || defaultFindDocumentsWithOutlines;

  return {
    name: 'knowledge_outline',
    description:
      '获取知识库或指定长文档的章节层级目录大纲树。当用户询问“文档由哪些章节构成”、“系统的架构全貌”、“有哪些核心模块”等宏观框架问题时，必须先调用本工具查阅目录树并锁定相关章节，以便后续通过 knowledge_search 进行定向下钻检索。输入可选的 documentId、knowledgeBaseId 与展开深度 maxDepth，返回紧凑的章节大纲。',
    parameters: knowledgeOutlineParametersSchema,
    timeoutMs: 10_000,
    async execute(args, ctx): Promise<ToolExecutionResult> {
      const parsed = knowledgeOutlineParametersSchema.safeParse(args);
      if (!parsed.success) {
        const errorMsg = parsed.error.errors[0]?.message || '大纲检索参数错误';
        throw new ToolError(errorMsg);
      }

      const { documentId, knowledgeBaseId, maxDepth = 2 } = parsed.data;
      const userId = ctx.userId;
      if (!userId) {
        throw new ToolError('未获取到当前用户信息');
      }

      // 场景 1：精准查询指定单篇文档的大纲树
      if (documentId && documentId.trim()) {
        const doc = await findDocFn(userId, documentId.trim());
        if (!doc) {
          // 越权或不存在时物理拦截抛错，严禁模型产生错觉 (P-W3 / QA-010)
          throw new ToolError('指定的文档不存在或无权访问');
        }

        const outline = doc.metadata?.outline as DocumentOutline | undefined;
        if (!outline || !outline.tree || outline.tree.length === 0) {
          return {
            ok: true,
            contentForModel:
              `【知识库大纲提示】：文档《${doc.name}》(ID: ${doc.id}) 暂无多级章节大纲（hasOutline: false，属于扁平纯文本或存量文档）。\n` +
              `建议直接调用 knowledge_search 工具输入具体关键词进行全局混合检索。`,
            summaryForDisplay: `文档《${doc.name}》暂无多级大纲`,
          };
        }

        const markdownOutline = formatOutlineTreeToMarkdown(outline, {
          maxDepth,
          docTitle: doc.name,
          docId: doc.id,
        });

        return {
          ok: true,
          contentForModel:
            `【知识库文档层级大纲】：\n${markdownOutline}\n\n` +
            `提示：请根据大纲中的章节名称或 headingPath，若需深入某章节细节，可调用 knowledge_search 并传入参数 headingPath 进行定向下钻。`,
          summaryForDisplay: `已获取《${doc.name}》大纲 (${outline.totalNodes} 个章节)`,
        };
      }

      // 场景 2：汇总查询知识库内文档列表的大纲总览
      const docs = await findDocsFn(userId, knowledgeBaseId?.trim());
      if (!docs || docs.length === 0) {
        return {
          ok: true,
          contentForModel: '【知识库大纲提示】：当前知识库下暂无可阅读的就绪文档。',
          summaryForDisplay: '知识库下暂无就绪文档',
        };
      }

      const outlinesSummary: string[] = [];
      let totalNodesCount = 0;

      for (const d of docs) {
        const outline = d.metadata?.outline as DocumentOutline | undefined;
        if (outline && outline.tree && outline.tree.length > 0) {
          totalNodesCount += outline.totalNodes;
          const formatted = formatOutlineTreeToMarkdown(outline, {
            maxDepth,
            docTitle: d.name,
            docId: d.id,
          });
          outlinesSummary.push(formatted);
        } else {
          outlinesSummary.push(`# 《${d.name}》 (文档 ID: ${d.id})\n(暂无多级章节大纲)`);
        }
      }

      return {
        ok: true,
        contentForModel:
          `【知识库可用文档大纲总览】：\n\n${outlinesSummary.join('\n\n---\n\n')}\n\n` +
          `提示：您可以针对特定文档 ID 查看更深入层级的大纲，或直接携带目标的 headingPath 调用 knowledge_search 进行定向下钻。`,
        summaryForDisplay: `已获取 ${docs.length} 篇文档大纲总览`,
      };
    },
  };
}
