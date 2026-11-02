import type { CitationAnchor } from '@repo/shared';

import type { MatchedCitationAnchor } from '@/types/citation';

/** 聚合输入：只依赖消息的引用字段 */
export interface CitationCarrier {
  citations?: Record<number, CitationAnchor> | null;
}

/**
 * 聚合当前消息列表中与目标引用同文档的全部切片：
 * 文档 id 存在时按 id 匹配，id 缺失时退化为文档名匹配；
 * 按切片序号去重、升序排列；没有其他切片时回退为被点击锚点本身，保证预览不空白。
 */
export function collectDocumentAnchors(
  messages: ReadonlyArray<CitationCarrier>,
  anchor: Pick<
    CitationAnchor,
    'documentId' | 'documentName' | 'chunkIndex' | 'headingPath' | 'pageNumber'
  >
): MatchedCitationAnchor[] {
  const seen = new Set<number>();
  const anchors: MatchedCitationAnchor[] = [];

  for (const message of messages) {
    if (!message.citations) continue;
    for (const citation of Object.values(message.citations)) {
      const sameDocument = anchor.documentId
        ? citation.documentId === anchor.documentId
        : citation.documentName === anchor.documentName;
      if (!sameDocument || seen.has(citation.chunkIndex)) continue;
      seen.add(citation.chunkIndex);
      anchors.push({
        chunkIndex: citation.chunkIndex,
        headingPath: citation.headingPath,
        pageNumber: citation.pageNumber,
      });
    }
  }

  anchors.sort((left, right) => left.chunkIndex - right.chunkIndex);

  if (anchors.length > 0) return anchors;

  return [
    {
      chunkIndex: anchor.chunkIndex,
      headingPath: anchor.headingPath,
      pageNumber: anchor.pageNumber,
    },
  ];
}
