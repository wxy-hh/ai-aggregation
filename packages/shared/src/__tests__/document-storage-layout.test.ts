/**
 * DocumentStorageLayout 共享布局契约测试 (C7 工单 01 / ADR-0053)
 *
 * 覆盖三类现有物理 key 构造、SourceFormat 派生、parsedContentKey 派生、
 * derived 正文规则与 C1 导出兼容；不触碰存储、数据库或环境。
 */
import { describe, expect, it } from 'vitest';
import {
  buildArtifactStorageKey,
  buildFileStorageKey,
  buildUrlStorageKey,
  deriveParsedContentKey,
  deriveSourceFormat,
  requiresDerivedContent,
  SOURCE_FORMATS,
} from '../document-storage-layout';
import { deriveParsedContentKey as deriveParsedContentKeyFromC1 } from '../rag-chunk-metadata';
import { deriveParsedContentKey as deriveParsedContentKeyFromRoot } from '../index';

describe('document-storage-layout 文档存储布局纯契约 (C7 工单 01)', () => {
  it('TC01-1 file Markdown 构造与派生往返', () => {
    const storageKey = buildFileStorageKey({
      userId: 'user-1',
      documentId: 'doc-1',
      version: 2,
      safeFileName: '架构说明.markdown',
    });

    expect(storageKey).toBe('docs/user-1/doc-1/v2/架构说明.markdown');
    expect(deriveSourceFormat({ sourceType: 'file', storageKey })).toBe('md');
    expect(deriveParsedContentKey(storageKey)).toBe('docs/user-1/doc-1/v2/content.md');

    // 全格式往返：构造 key → SourceFormat 派生 → parsedContentKey 均落在同版本目录
    const roundTripCases = [
      ['pdf', 'pdf'],
      ['md', 'md'],
      ['markdown', 'md'],
      ['txt', 'txt'],
      ['docx', 'docx'],
      ['xlsx', 'xlsx'],
      ['csv', 'csv'],
    ] as const;
    for (const [extension, sourceFormat] of roundTripCases) {
      const key = buildFileStorageKey({
        userId: 'user-1',
        documentId: 'doc-1',
        version: 2,
        safeFileName: `报告.${extension}`,
      });
      expect(key).toBe(`docs/user-1/doc-1/v2/报告.${extension}`);
      expect(deriveSourceFormat({ sourceType: 'file', storageKey: key })).toBe(sourceFormat);
      expect(deriveParsedContentKey(key)).toBe('docs/user-1/doc-1/v2/content.md');
    }
  });

  it('TC01-2 URL 构造形状与 Markdown 派生', () => {
    const storageKey = buildUrlStorageKey({
      userId: 'user-1',
      timestamp: 1760000000000,
      randomToken: 'abc12345',
    });

    expect(storageKey).toBe('docs/user-1/url-1760000000000-abc12345/v1/content.md');
    expect(deriveSourceFormat({ sourceType: 'url', storageKey })).toBe('md');
    // content.md 自身就是源资产，派生位置与构造结果重合
    expect(deriveParsedContentKey(storageKey)).toBe(storageKey);
  });

  it('TC01-3 Artifact 构造形状与 Markdown 派生', () => {
    const storageKey = buildArtifactStorageKey({
      userId: 'user-1',
      timestamp: 1760000000000,
      randomToken: 'def67890',
    });

    expect(storageKey).toBe('docs/user-1/artifact-1760000000000-def67890/v1/content.md');
    expect(deriveSourceFormat({ sourceType: 'chat_artifact', storageKey })).toBe('md');
    expect(deriveParsedContentKey(storageKey)).toBe(storageKey);
  });

  it('TC01-4 展示名称不参与 SourceFormat 派生', () => {
    // 展示名称故意给出相反格式，派生仍以 storageKey 的扩展名为准
    const mismatched = {
      sourceType: 'file',
      name: '季度报告.pdf',
      storageKey: 'docs/user-1/doc-1/v1/季度报告.DOCX',
    };
    expect(deriveSourceFormat(mismatched)).toBe('docx');

    // 大小写归一，.markdown 归一为 md
    expect(
      deriveSourceFormat({ sourceType: 'file', storageKey: 'docs/user-1/doc-1/v1/说明.MARKDOWN' })
    ).toBe('md');

    // 名称再像 CSV 也不能救回无法识别的 key 扩展名
    const misleadingName = {
      sourceType: 'file',
      name: '数据.csv',
      storageKey: 'docs/user-1/doc-1/v1/数据.zip',
    };
    expect(deriveSourceFormat(misleadingName)).toBe('unknown');
  });

  it('TC01-5 未知来源与扩展名返回 unknown', () => {
    // 无法识别的来源按 file-like 处理，扩展名无法识别时为 unknown
    expect(
      deriveSourceFormat({ sourceType: 'external_feed', storageKey: 'docs/u1/d1/v1/archive.bin' })
    ).toBe('unknown');
    expect(
      deriveSourceFormat({ sourceType: 'external_feed', storageKey: 'docs/u1/d1/v1/README' })
    ).toBe('unknown');
    expect(deriveSourceFormat({ sourceType: 'file', storageKey: '' })).toBe('unknown');

    // file-like 回退仍遵循扩展名，不因来源未知而强制 unknown
    expect(
      deriveSourceFormat({ sourceType: 'external_feed', storageKey: 'docs/u1/d1/v1/notes.MD' })
    ).toBe('md');
  });

  it('TC01-6 derived 规则格式矩阵', () => {
    // 只有 DOCX/XLSX/CSV 需要额外写入衍生 Markdown 正文；
    // 遍历运行时清单而非手写数组，新增格式未进策略矩阵时本用例直接红灯
    const derivedFormats = new Set(['docx', 'xlsx', 'csv']);

    for (const sourceFormat of SOURCE_FORMATS) {
      expect(requiresDerivedContent(sourceFormat), sourceFormat).toBe(
        derivedFormats.has(sourceFormat)
      );
    }
  });

  it('TC01-7 C1 导出函数引用兼容', () => {
    // 新布局入口、C1 原导入位置与根入口必须暴露同一个函数定义
    expect(deriveParsedContentKeyFromC1).toBe(deriveParsedContentKey);
    expect(deriveParsedContentKeyFromRoot).toBe(deriveParsedContentKey);
    expect(deriveParsedContentKeyFromC1('docs/u1/d1/v1/raw.html')).toBe('docs/u1/d1/v1/content.md');
  });

  it('TC01-8 MD/TXT 缓存位置派生不代表对象存在', () => {
    for (const [extension, sourceFormat] of [
      ['md', 'md'],
      ['txt', 'txt'],
    ] as const) {
      const storageKey = `docs/u1/doc-${sourceFormat}/v1/source.${extension}`;
      const parsedContentKey = deriveParsedContentKey(storageKey);

      expect(deriveSourceFormat({ sourceType: 'file', storageKey })).toBe(sourceFormat);
      // 位置仍无条件派生，且非空
      expect(parsedContentKey).toBe(`docs/u1/doc-${sourceFormat}/v1/content.md`);
      expect(parsedContentKey).not.toBe(storageKey);
      expect(parsedContentKey.length).toBeGreaterThan(0);
      // 但该格式不写衍生正文：键存在只表示缓存位置，不是对象存在证明
      expect(requiresDerivedContent(sourceFormat)).toBe(false);
    }

    // 历史 URL 源资产本身就叫 content.md，也不因此变成 derived 格式
    const historicalUrlKey = buildUrlStorageKey({
      userId: 'u1',
      timestamp: 1,
      randomToken: 'x',
    });
    expect(deriveParsedContentKey(historicalUrlKey)).toBe(historicalUrlKey);
    expect(
      requiresDerivedContent(
        deriveSourceFormat({ sourceType: 'url', storageKey: historicalUrlKey })
      )
    ).toBe(false);
  });
});
