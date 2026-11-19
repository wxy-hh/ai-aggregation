/**
 * RAG 文档层级大纲树提取器 (ADR-0036)
 *
 * 核心机制：
 * 1. 纯规则确定性解析：通过 AST/正则扫描 Markdown 各级标题（# 至 ######），构建自顶向下的多叉大纲树。
 * 2. 切片区间与 Token 绑定：遍历底层 ParsedChunk 列表，根据 headingPath 严格前缀将底层切片索引区间
 *    [startChunkIndex, endChunkIndex] 与 Token 规模回填绑定到各章节节点。
 * 3. 健壮容错与优雅退化：无标题文本退化为空大纲，跳级标题（如 h1 紧跟 h3）安全挂载至最近上级祖先。
 */

import type { DocumentOutline, DocumentOutlineNode } from '@repo/shared';
import type { ParsedChunk } from './parser';

interface NodeBuilder {
  id: string;
  title: string;
  level: number;
  headingPath: string;
  chunkIndices: number[];
  tokenCount: number;
  children: NodeBuilder[];
}

/**
 * 从 Markdown 文本中提取多叉大纲树骨架（自动跳过围栏代码块中的 # 注释，S-J4）
 */
function extractOutlineSkeleton(markdown: string): { roots: NodeBuilder[]; allNodes: NodeBuilder[] } {
  const lines = markdown.split(/\r?\n/);
  const roots: NodeBuilder[] = [];
  const stack: NodeBuilder[] = [];
  const allNodes: NodeBuilder[] = [];
  let nodeIdCounter = 1;
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const title = match[2].trim();
    if (!title) continue;

    // 弹出层级大于等于当前标题的栈顶节点
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const headingPath = parent ? `${parent.headingPath} > ${title}` : title;

    const node: NodeBuilder = {
      id: `node_${nodeIdCounter++}`,
      title,
      level,
      headingPath,
      chunkIndices: [],
      tokenCount: 0,
      children: [],
    };

    allNodes.push(node);

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return { roots, allNodes };
}

/**
 * 递归计算节点及其子树的总切片区间与 Token 规模，仅聚合有效子区间以防 0 序号污染父节点 (P-W1)
 */
function finalizeNode(builder: NodeBuilder, fallbackChunkIndex: number): DocumentOutlineNode {
  // 递归处理子节点
  const children = builder.children.map((child) => finalizeNode(child, fallbackChunkIndex));

  const selfIndices = builder.chunkIndices.filter((idx) => typeof idx === 'number' && !isNaN(idx));
  let subTreeTokens = builder.tokenCount;

  const validChildMins: number[] = [];
  const validChildMaxs: number[] = [];
  for (const child of children) {
    subTreeTokens += child.tokenCount;
    if (child.tokenCount > 0 && child.chunkRange[0] >= 0) {
      validChildMins.push(child.chunkRange[0]);
      validChildMaxs.push(child.chunkRange[1]);
    }
  }

  let minIdx: number;
  let maxIdx: number;
  if (selfIndices.length > 0) {
    const allMins = [...selfIndices, ...validChildMins];
    const allMaxs = [...selfIndices, ...validChildMaxs];
    minIdx = Math.min(...allMins);
    maxIdx = Math.max(...allMaxs);
  } else if (validChildMins.length > 0) {
    minIdx = Math.min(...validChildMins);
    maxIdx = Math.max(...validChildMaxs);
  } else {
    minIdx = fallbackChunkIndex;
    maxIdx = fallbackChunkIndex;
  }

  return {
    id: builder.id,
    title: builder.title,
    level: builder.level,
    headingPath: builder.headingPath,
    chunkRange: [minIdx, maxIdx],
    tokenCount: subTreeTokens,
    children,
  };
}

/**
 * 根据 Markdown 文本与切片列表生成完整的 DocumentOutline
 */
export function buildDocumentOutline(
  markdown: string,
  chunks: ParsedChunk[]
): DocumentOutline {
  const { roots, allNodes } = extractOutlineSkeleton(markdown);

  if (allNodes.length === 0) {
    return {
      version: 1,
      totalNodes: 0,
      maxDepth: 0,
      tree: [],
    };
  }

  // 构建 headingPath 到对应 NodeBuilder 的精确映射
  const pathToNodeMap = new Map<string, NodeBuilder>();
  for (const node of allNodes) {
    pathToNodeMap.set(node.headingPath, node);
  }

  // 遍历所有切片，将切片序号与 Token 累积到最匹配的直接章节节点
  for (const chunk of chunks) {
    if (!chunk.headingPath) continue;

    const matchedNode = pathToNodeMap.get(chunk.headingPath);
    if (matchedNode) {
      matchedNode.chunkIndices.push(chunk.chunkIndex);
      matchedNode.tokenCount += chunk.tokenCount || 0;
    } else {
      // 容错：若未完全精确匹配，寻找最长前缀节点
      let bestMatch: NodeBuilder | null = null;
      for (const node of allNodes) {
        if (
          chunk.headingPath === node.headingPath ||
          chunk.headingPath.startsWith(`${node.headingPath} > `)
        ) {
          if (!bestMatch || node.headingPath.length > bestMatch.headingPath.length) {
            bestMatch = node;
          }
        }
      }
      if (bestMatch) {
        bestMatch.chunkIndices.push(chunk.chunkIndex);
        bestMatch.tokenCount += chunk.tokenCount || 0;
      }
    }
  }

  // 递归生成最终结构并确定各节点完整 chunkRange
  const fallbackIndex = chunks.length > 0 ? chunks[0].chunkIndex : 0;
  const tree = roots.map((root) => finalizeNode(root, fallbackIndex));

  // 计算最大深度
  let maxDepth = 0;
  for (const node of allNodes) {
    if (node.level > maxDepth) {
      maxDepth = node.level;
    }
  }

  return {
    version: 1,
    totalNodes: allNodes.length,
    maxDepth,
    tree,
  };
}
