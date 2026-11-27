/**
 * 知识库层级大纲树与定向下钻检索契约定义 (ADR-0036)
 */

import { z } from 'zod';

/**
 * 文档大纲单个章节节点
 */
export interface DocumentOutlineNode {
  /** 节点唯一稳定标识（如 node_h1_1） */
  id: string;
  /** 章节标题文本 */
  title: string;
  /** 标题层级（1 ~ 6） */
  level: number;
  /** 完整层级路径标识（如 "3. 架构设计 > 3.2 权限控制"） */
  headingPath: string;
  /** 该章节对应的底层切片序号闭区间 [startChunkIndex, endChunkIndex] */
  chunkRange: [number, number];
  /** 该章节及其子章节估算的总 Token 数 */
  tokenCount: number;
  /** 子章节多叉树节点数组 */
  children: DocumentOutlineNode[];
}

/**
 * 完整文档大纲结构（持久化于 Document.metadata.outline）
 */
export interface DocumentOutline {
  version: 1;
  totalNodes: number;
  maxDepth: number;
  tree: DocumentOutlineNode[];
}

/**
 * knowledge_outline 工具入参 Schema
 */
export const knowledgeOutlineParametersSchema = z.object({
  knowledgeBaseId: z
    .string()
    .optional()
    .describe('可选指定的知识库 ID；若未提供则检索当前用户所有可用知识库中的文档大纲'),
  documentId: z
    .string()
    .optional()
    .describe('可选指定的单篇长文档 ID；若提供则精准返回该文档的完整大纲树'),
  maxDepth: z
    .number()
    .int('maxDepth 必须为整数')
    .min(1, 'maxDepth 至少为 1')
    .max(6, 'maxDepth 最多支持 6 级')
    .optional()
    .default(2)
    .describe('目录树最大展开层级深度（默认 2 级，展开至二级标题）'),
});

export type KnowledgeOutlineParams = z.infer<typeof knowledgeOutlineParametersSchema>;

/**
 * 将 DocumentOutline 多叉树格式化为易于大模型消费的紧凑 Markdown 目录文本
 */
export function formatOutlineTreeToMarkdown(
  outline: DocumentOutline,
  options: { maxDepth?: number; docTitle?: string; docId?: string } = {}
): string {
  const maxDepth = options.maxDepth ?? outline.maxDepth ?? 2;
  const lines: string[] = [];

  if (options.docTitle) {
    const docMeta = options.docId ? ` (文档 ID: ${options.docId})` : '';
    lines.push(`# 《${options.docTitle}》大纲${docMeta}`);
  }

  function renderNodes(nodes: DocumentOutlineNode[], currentDepth: number) {
    // 统一按大纲树结构深度截断，确保跳级标题或非一级标题起头时不会误吞子节点
    if (currentDepth > maxDepth) return;
    for (const node of nodes) {
      const indent = '  '.repeat(Math.max(0, currentDepth - 1));
      const chunkRangeText =
        node.chunkRange[0] === node.chunkRange[1]
          ? `切片 #${node.chunkRange[0]}`
          : `切片 #${node.chunkRange[0]}~#${node.chunkRange[1]}`;
      const tokenText = node.tokenCount > 0 ? `约 ${node.tokenCount} tokens, ` : '';
      lines.push(`${indent}- ${node.title} (${tokenText}${chunkRangeText})`);

      if (node.children && node.children.length > 0 && currentDepth < maxDepth) {
        renderNodes(node.children, currentDepth + 1);
      }
    }
  }

  if (!outline.tree || outline.tree.length === 0) {
    return options.docTitle ? `${lines.join('\n')}\n(该文档未识别出多级章节，为扁平结构)` : '(暂无章节大纲)';
  }

  renderNodes(outline.tree, 1);
  return lines.join('\n');
}
