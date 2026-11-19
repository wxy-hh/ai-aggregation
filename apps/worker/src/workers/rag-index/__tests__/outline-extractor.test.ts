import { describe, expect, it } from 'vitest';
import { buildDocumentOutline } from '../outline-extractor';
import { parseMarkdownString, parseDocument } from '../parser';
import type { ParsedChunk } from '../parser';

describe('RAG 文档层级大纲树抽取器单元测试 (outline-extractor - TC04)', () => {
  it('TC04-1 & TC04-2: 输入包含 1~4 级 Markdown 标题的长文本，正确构建完整的父子多叉大纲树', async () => {
    const markdown = `
# 1. 架构总览
系统总体由前端接入层、核心编排层与数据持久层组成。

## 1.1 前端接入层
提供 Next.js 15 服务端渲染与客户端水合。

### 1.1.1 路由架构
基于 App Router 目录体系。

#### 1.1.1.1 动态路由
支持 [id] 动态路由匹配。

## 1.2 核心编排层
提供 ReAct Agent 运行环境。

# 2. 权限体系
基于 RBAC 的统一鉴权。
`;

    const chunks = await parseMarkdownString(markdown);
    const outline = buildDocumentOutline(markdown, chunks);

    expect(outline.version).toBe(1);
    expect(outline.totalNodes).toBe(6);
    expect(outline.maxDepth).toBe(4);
    expect(outline.tree.length).toBe(2);

    // 根节点 1
    const root1 = outline.tree[0];
    expect(root1.title).toBe('1. 架构总览');
    expect(root1.level).toBe(1);
    expect(root1.headingPath).toBe('1. 架构总览');
    expect(root1.children.length).toBe(2);

    // 二级子节点 1.1
    const sub1 = root1.children[0];
    expect(sub1.title).toBe('1.1 前端接入层');
    expect(sub1.level).toBe(2);
    expect(sub1.headingPath).toBe('1. 架构总览 > 1.1 前端接入层');
    expect(sub1.children.length).toBe(1);

    // 三级子节点 1.1.1
    const sub11 = sub1.children[0];
    expect(sub11.title).toBe('1.1.1 路由架构');
    expect(sub11.level).toBe(3);
    expect(sub11.headingPath).toBe('1. 架构总览 > 1.1 前端接入层 > 1.1.1 路由架构');
    expect(sub11.children.length).toBe(1);

    // 四级子节点 1.1.1.1
    const sub111 = sub11.children[0];
    expect(sub111.title).toBe('1.1.1.1 动态路由');
    expect(sub111.level).toBe(4);
    expect(sub111.headingPath).toBe('1. 架构总览 > 1.1 前端接入层 > 1.1.1 路由架构 > 1.1.1.1 动态路由');
    expect(sub111.children.length).toBe(0);

    // 二级子节点 1.2
    const sub2 = root1.children[1];
    expect(sub2.title).toBe('1.2 核心编排层');
    expect(sub2.level).toBe(2);
    expect(sub2.headingPath).toBe('1. 架构总览 > 1.2 核心编排层');

    // 根节点 2
    const root2 = outline.tree[1];
    expect(root2.title).toBe('2. 权限体系');
    expect(root2.level).toBe(1);
    expect(root2.headingPath).toBe('2. 权限体系');
  });

  it('TC04-3: 每个大纲节点准确反向绑定底层切片序号闭区间 chunkRange 与 Token 预估', () => {
    const markdown = `
# 第一章 引言
引言正文第一段。

## 1.1 背景
背景介绍内容。

## 1.2 目的
目的说明内容。

# 第二章 设计
架构设计内容。
`;

    // 构造模拟切片集合
    const mockChunks: ParsedChunk[] = [
      {
        chunkIndex: 0,
        content: '引言正文第一段',
        contentSegmented: '引言 正文 第一段',
        headingPath: '第一章 引言',
        pageNumber: null,
        tokenCount: 100,
      },
      {
        chunkIndex: 1,
        content: '背景介绍内容',
        contentSegmented: '背景 介绍 内容',
        headingPath: '第一章 引言 > 1.1 背景',
        pageNumber: null,
        tokenCount: 150,
      },
      {
        chunkIndex: 2,
        content: '目的说明内容',
        contentSegmented: '目的 说明 内容',
        headingPath: '第一章 引言 > 1.2 目的',
        pageNumber: null,
        tokenCount: 200,
      },
      {
        chunkIndex: 3,
        content: '架构设计内容',
        contentSegmented: '架构 设计 内容',
        headingPath: '第二章 设计',
        pageNumber: null,
        tokenCount: 300,
      },
    ];

    const outline = buildDocumentOutline(markdown, mockChunks);

    const chapter1 = outline.tree[0];
    expect(chapter1.title).toBe('第一章 引言');
    // 第一章包含它自身及两个子节，切片覆盖 0 ~ 2
    expect(chapter1.chunkRange).toEqual([0, 2]);
    expect(chapter1.tokenCount).toBe(450); // 100 + 150 + 200

    const section11 = chapter1.children[0];
    expect(section11.title).toBe('1.1 背景');
    expect(section11.chunkRange).toEqual([1, 1]);
    expect(section11.tokenCount).toBe(150);

    const section12 = chapter1.children[1];
    expect(section12.title).toBe('1.2 目的');
    expect(section12.chunkRange).toEqual([2, 2]);
    expect(section12.tokenCount).toBe(200);

    const chapter2 = outline.tree[1];
    expect(chapter2.title).toBe('第二章 设计');
    expect(chapter2.chunkRange).toEqual([3, 3]);
    expect(chapter2.tokenCount).toBe(300);
  });

  it('TC04-4: 输入纯文本（全篇无 Markdown 标题）时，优雅退化为空树，不抛错', () => {
    const plainText = `
这是一篇纯文本格式的日志文件或者流水账报告。
没有任何井号开头的 Markdown 标题。
系统应当优雅退化，不能崩溃抛错。
`;

    const mockChunks: ParsedChunk[] = [
      {
        chunkIndex: 0,
        content: plainText,
        contentSegmented: '这是 纯文本',
        headingPath: null,
        pageNumber: null,
        tokenCount: 50,
      },
    ];

    const outline = buildDocumentOutline(plainText, mockChunks);
    expect(outline.version).toBe(1);
    expect(outline.totalNodes).toBe(0);
    expect(outline.maxDepth).toBe(0);
    expect(outline.tree).toEqual([]);
  });

  it('容错性：遇到畸形跳级标题（如 h1 紧跟 h3）时安全挂载至最近上级祖先', () => {
    const markdown = `
# 根标题 1
根内容

### 越级三级标题
直接跳过二级标题的内容

## 二级标题
后续二级标题
`;
    const mockChunks: ParsedChunk[] = [
      {
        chunkIndex: 0,
        content: '内容',
        contentSegmented: '内容',
        headingPath: '根标题 1',
        pageNumber: null,
        tokenCount: 50,
      },
      {
        chunkIndex: 1,
        content: '越级内容',
        contentSegmented: '越级 内容',
        headingPath: '根标题 1 > 越级三级标题',
        pageNumber: null,
        tokenCount: 80,
      },
    ];

    const outline = buildDocumentOutline(markdown, mockChunks);
    expect(outline.totalNodes).toBe(3);
    const root = outline.tree[0];
    expect(root.children.length).toBe(2);
    expect(root.children[0].title).toBe('越级三级标题');
    expect(root.children[0].level).toBe(3);
  });

  it('集成端：parseDocument 处理 Markdown 文件时输出完整的 outline 快照', async () => {
    const md = `
# 系统规范
系统规范描述

## 模块清单
- 模块 A
- 模块 B
`;
    const buffer = Buffer.from(md, 'utf-8');
    const result = await parseDocument(buffer, 'spec.md', 'md');

    expect(result.outline).toBeDefined();
    expect(result.outline?.totalNodes).toBe(2);
    expect(result.outline?.tree[0].title).toBe('系统规范');
    expect(result.outline?.tree[0].children[0].title).toBe('模块清单');
  });
});
