import { describe, expect, it } from 'vitest';
import { formatOutlineTreeToMarkdown, type DocumentOutline } from '../rag-outline';

describe('formatOutlineTreeToMarkdown', () => {
  it('TC01-1 H1 直挂 H3 再挂 H4 在 maxDepth 为 2 时保留 H1 与 H3 并截断 H4', () => {
    const skippedOutline: DocumentOutline = {
      version: 1,
      totalNodes: 3,
      maxDepth: 4,
      tree: [
        {
          id: 'node_1',
          title: '第一章 总览',
          level: 1,
          headingPath: '第一章 总览',
          chunkRange: [0, 5],
          tokenCount: 600,
          children: [
            {
              id: 'node_2',
              title: '1.1 跳级三级小节',
              level: 3,
              headingPath: '第一章 总览 > 1.1 跳级三级小节',
              chunkRange: [1, 5],
              tokenCount: 400,
              children: [
                {
                  id: 'node_3',
                  title: '1.1.1 四级细则',
                  level: 4,
                  headingPath: '第一章 总览 > 1.1 跳级三级小节 > 1.1.1 四级细则',
                  chunkRange: [3, 5],
                  tokenCount: 200,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const output = formatOutlineTreeToMarkdown(skippedOutline, { maxDepth: 2 });
    expect(output).toContain('第一章 总览');
    expect(output).toContain('1.1 跳级三级小节');
    expect(output).not.toContain('1.1.1 四级细则');
  });

  it('TC01-2 以 H3 起头的大纲在 maxDepth 为 2 时保留 H3 与 H5 并截断 H6', () => {
    const nonH1RootOutline: DocumentOutline = {
      version: 1,
      totalNodes: 3,
      maxDepth: 6,
      tree: [
        {
          id: 'node_1',
          title: '起始三级标题',
          level: 3,
          headingPath: '起始三级标题',
          chunkRange: [0, 4],
          tokenCount: 500,
          children: [
            {
              id: 'node_2',
              title: '跳级五级子节',
              level: 5,
              headingPath: '起始三级标题 > 跳级五级子节',
              chunkRange: [1, 4],
              tokenCount: 300,
              children: [
                {
                  id: 'node_3',
                  title: '六级末梢条款',
                  level: 6,
                  headingPath: '起始三级标题 > 跳级五级子节 > 六级末梢条款',
                  chunkRange: [2, 4],
                  tokenCount: 100,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const output = formatOutlineTreeToMarkdown(nonH1RootOutline, { maxDepth: 2 });
    expect(output).toContain('起始三级标题');
    expect(output).toContain('跳级五级子节');
    expect(output).not.toContain('六级末梢条款');
  });

  it('TC01-3 标准连续 H1 到 H3 大纲按 maxDepth 2 与 3 正常截断与展开', () => {
    const standardOutline: DocumentOutline = {
      version: 1,
      totalNodes: 3,
      maxDepth: 3,
      tree: [
        {
          id: 'node_1',
          title: '一级标题',
          level: 1,
          headingPath: '一级标题',
          chunkRange: [0, 2],
          tokenCount: 300,
          children: [
            {
              id: 'node_2',
              title: '二级标题',
              level: 2,
              headingPath: '一级标题 > 二级标题',
              chunkRange: [1, 2],
              tokenCount: 200,
              children: [
                {
                  id: 'node_3',
                  title: '三级标题',
                  level: 3,
                  headingPath: '一级标题 > 二级标题 > 三级标题',
                  chunkRange: [2, 2],
                  tokenCount: 100,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const depth2Output = formatOutlineTreeToMarkdown(standardOutline, { maxDepth: 2 });
    expect(depth2Output).toContain('一级标题');
    expect(depth2Output).toContain('二级标题');
    expect(depth2Output).not.toContain('三级标题');

    const depth3Output = formatOutlineTreeToMarkdown(standardOutline, { maxDepth: 3 });
    expect(depth3Output).toContain('一级标题');
    expect(depth3Output).toContain('二级标题');
    expect(depth3Output).toContain('三级标题');
  });

  it('TC02-1 H1 直挂 H3 再挂 H5 时三层缩进依次为 0、2、4 空格', () => {
    const deepSkippedOutline: DocumentOutline = {
      version: 1,
      totalNodes: 3,
      maxDepth: 5,
      tree: [
        {
          id: 'node_1',
          title: '第一层 H1',
          level: 1,
          headingPath: '第一层 H1',
          chunkRange: [0, 5],
          tokenCount: 500,
          children: [
            {
              id: 'node_2',
              title: '第二层 H3',
              level: 3,
              headingPath: '第一层 H1 > 第二层 H3',
              chunkRange: [1, 5],
              tokenCount: 300,
              children: [
                {
                  id: 'node_3',
                  title: '第三层 H5',
                  level: 5,
                  headingPath: '第一层 H1 > 第二层 H3 > 第三层 H5',
                  chunkRange: [3, 5],
                  tokenCount: 150,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const lines = formatOutlineTreeToMarkdown(deepSkippedOutline, { maxDepth: 3 }).split('\n');
    expect(lines).toEqual([
      '- 第一层 H1 (约 500 tokens, 切片 #0~#5)',
      '  - 第二层 H3 (约 300 tokens, 切片 #1~#5)',
      '    - 第三层 H5 (约 150 tokens, 切片 #3~#5)',
    ]);
  });

  it('TC02-2 以 H2 与 H3 起头的大纲根节点无前导缩进且子节点缩进 2 空格', () => {
    const nonH1MultiRootOutline: DocumentOutline = {
      version: 1,
      totalNodes: 4,
      maxDepth: 5,
      tree: [
        {
          id: 'node_1',
          title: 'H2 根章节',
          level: 2,
          headingPath: 'H2 根章节',
          chunkRange: [0, 1],
          tokenCount: 200,
          children: [
            {
              id: 'node_2',
              title: 'H4 子章节',
              level: 4,
              headingPath: 'H2 根章节 > H4 子章节',
              chunkRange: [1, 1],
              tokenCount: 100,
              children: [],
            },
          ],
        },
        {
          id: 'node_3',
          title: 'H3 根章节',
          level: 3,
          headingPath: 'H3 根章节',
          chunkRange: [2, 3],
          tokenCount: 250,
          children: [
            {
              id: 'node_4',
              title: 'H5 子章节',
              level: 5,
              headingPath: 'H3 根章节 > H5 子章节',
              chunkRange: [3, 3],
              tokenCount: 120,
              children: [],
            },
          ],
        },
      ],
    };

    const lines = formatOutlineTreeToMarkdown(nonH1MultiRootOutline, { maxDepth: 2 }).split('\n');
    expect(lines).toEqual([
      '- H2 根章节 (约 200 tokens, 切片 #0~#1)',
      '  - H4 子章节 (约 100 tokens, 切片 #1)',
      '- H3 根章节 (约 250 tokens, 切片 #2~#3)',
      '  - H5 子章节 (约 120 tokens, 切片 #3)',
    ]);
  });

  it('TC02-3 maxDepth 小于等于 0 时不渲染章节列表且空树保持降级文案', () => {
    const sampleOutline: DocumentOutline = {
      version: 1,
      totalNodes: 1,
      maxDepth: 1,
      tree: [
        {
          id: 'node_1',
          title: '唯一章节',
          level: 1,
          headingPath: '唯一章节',
          chunkRange: [0, 0],
          tokenCount: 100,
          children: [],
        },
      ],
    };

    expect(formatOutlineTreeToMarkdown(sampleOutline, { maxDepth: 0 })).toBe('');
    expect(formatOutlineTreeToMarkdown(sampleOutline, { maxDepth: -1 })).toBe('');
    expect(
      formatOutlineTreeToMarkdown(sampleOutline, { maxDepth: 0, docTitle: '设计文档', docId: 'doc_1' })
    ).toBe('# 《设计文档》大纲 (文档 ID: doc_1)');

    const emptyOutline: DocumentOutline = {
      version: 1,
      totalNodes: 0,
      maxDepth: 0,
      tree: [],
    };
    expect(formatOutlineTreeToMarkdown(emptyOutline)).toBe('(暂无章节大纲)');
    expect(formatOutlineTreeToMarkdown(emptyOutline, { docTitle: '设计文档' })).toBe(
      '# 《设计文档》大纲\n(该文档未识别出多级章节，为扁平结构)'
    );
  });
});
