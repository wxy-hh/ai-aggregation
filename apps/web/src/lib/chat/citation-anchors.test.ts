import { describe, expect, it } from 'vitest';
import type { CitationAnchor } from '@repo/shared';

import { collectDocumentAnchors } from './citation-anchors';

/** 构造一条引用锚点：默认属于同一文档 */
const createAnchor = (overrides: Partial<CitationAnchor> = {}): CitationAnchor => ({
  documentId: 'doc-1',
  documentName: '制度.pdf',
  documentVersion: 1,
  pageNumber: null,
  headingPath: null,
  chunkIndex: 0,
  ...overrides,
});

/** 构造一条只含引用的消息 */
const createMessage = (...citations: CitationAnchor[]) => ({
  citations: Object.fromEntries(citations.map((citation, index) => [index, citation])),
});

describe('collectDocumentAnchors', () => {
  it('跨消息聚合同一文档的切片并按序号升序', () => {
    const messages = [
      createMessage(createAnchor({ chunkIndex: 3 })),
      createMessage(createAnchor({ chunkIndex: 1 })),
    ];

    expect(
      collectDocumentAnchors(messages, createAnchor({ chunkIndex: 3 })).map(
        (anchor) => anchor.chunkIndex
      )
    ).toEqual([1, 3]);
  });

  it('同一切片在多条消息中重复出现时只保留一次', () => {
    const messages = [
      createMessage(createAnchor({ chunkIndex: 2 })),
      createMessage(createAnchor({ chunkIndex: 2 })),
    ];

    expect(
      collectDocumentAnchors(messages, createAnchor({ chunkIndex: 2 })).map(
        (anchor) => anchor.chunkIndex
      )
    ).toEqual([2]);
  });

  it('被点击引用缺少文档 id 时按文档名聚合', () => {
    const messages = [
      createMessage(createAnchor({ documentId: 'doc-old', chunkIndex: 4 })),
    ];

    expect(
      collectDocumentAnchors(
        messages,
        createAnchor({ documentId: '', chunkIndex: 4 })
      ).map((anchor) => anchor.chunkIndex)
    ).toEqual([4]);
  });

  it('文档 id 都存在且不同时即使同名也不合并', () => {
    const messages = [
      createMessage(createAnchor({ documentId: 'doc-other', chunkIndex: 5 })),
    ];

    expect(
      collectDocumentAnchors(
        messages,
        createAnchor({ documentId: 'doc-1', chunkIndex: 7 })
      ).map((anchor) => anchor.chunkIndex)
    ).toEqual([7]);
  });

  it('没有其他同文档切片时回退为被点击锚点', () => {
    expect(
      collectDocumentAnchors([], createAnchor({ chunkIndex: 7 })).map(
        (anchor) => anchor.chunkIndex
      )
    ).toEqual([7]);
  });

  it('其他文档的切片不进入结果', () => {
    const messages = [
      createMessage(createAnchor({ chunkIndex: 5 })),
      createMessage(
        createAnchor({ documentId: 'doc-2', documentName: '其他.pdf', chunkIndex: 6 })
      ),
    ];

    expect(
      collectDocumentAnchors(messages, createAnchor({ chunkIndex: 5 })).map(
        (anchor) => anchor.chunkIndex
      )
    ).toEqual([5]);
  });

  it('返回结果严格按切片序号升序排列', () => {
    const messages = [
      createMessage(createAnchor({ chunkIndex: 9 })),
      createMessage(createAnchor({ chunkIndex: 0 })),
      createMessage(createAnchor({ chunkIndex: 4 })),
    ];

    expect(
      collectDocumentAnchors(messages, createAnchor({ chunkIndex: 4 })).map(
        (anchor) => anchor.chunkIndex
      )
    ).toEqual([0, 4, 9]);
  });
});
