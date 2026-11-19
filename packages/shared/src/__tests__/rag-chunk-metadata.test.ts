import { describe, expect, it } from 'vitest';
import {
  buildChunkInheritedMetadata,
  deriveParsedContentKey,
  estimateTokenCount,
  EXCLUDED_CHUNK_METADATA_KEYS,
  isProtectedMetadataKey,
  SYSTEM_DERIVED_KEYS,
  SYSTEM_PROVENANCE_KEYS,
  type ChunkInheritanceFacts,
} from '../rag-chunk-metadata';

describe('rag-chunk-metadata 切片元数据键分层契约 (ADR-0032 修订)', () => {
  const fileFacts: ChunkInheritanceFacts = {
    sourceType: 'file',
    name: 'architecture-guide.md',
    storageKey: 'docs/u1/kb1/v1/architecture-guide.md',
    tags: ['架构', '2026'],
    metadata: { department: 'rd', year: 2026 },
  };

  it('断言 1: 普通文件事实派生完整 B 层系统字段', () => {
    const metadata = buildChunkInheritedMetadata(fileFacts);
    expect(metadata.sourceType).toBe('file');
    expect(metadata.fileName).toBe('architecture-guide.md');
    expect(metadata.storageKey).toBe('docs/u1/kb1/v1/architecture-guide.md');
    expect(metadata.parsedContentKey).toBe('docs/u1/kb1/v1/content.md');
    expect(metadata.tags).toEqual(['架构', '2026']);
    expect(metadata.department).toBe('rd');
  });

  it('断言 2: UrlDocument 事实 B 层四键完整且 sourceType 为 url', () => {
    const metadata = buildChunkInheritedMetadata({
      ...fileFacts,
      sourceType: 'url',
      name: '示例文章',
      storageKey: 'docs/u1/kb1/url-abc/v1/raw.html',
    });
    expect(metadata.sourceType).toBe('url');
    expect(metadata.fileName).toBe('示例文章');
    expect(metadata.storageKey).toBe('docs/u1/kb1/url-abc/v1/raw.html');
    expect(metadata.parsedContentKey).toBe('docs/u1/kb1/url-abc/v1/content.md');
  });

  it('断言 3: outline 键被显式剔除，不含 outline 时不产生该键', () => {
    const withOutline = buildChunkInheritedMetadata({
      ...fileFacts,
      metadata: { outline: { title: '根' }, department: 'rd' },
    });
    expect(withOutline).not.toHaveProperty('outline');
    expect(withOutline.department).toBe('rd');

    const withoutOutline = buildChunkInheritedMetadata(fileFacts);
    expect(withoutOutline).not.toHaveProperty('outline');
  });

  it('断言 4: 溯源键（C 层）原样继承', () => {
    const metadata = buildChunkInheritedMetadata({
      ...fileFacts,
      metadata: { sourceSessionId: 'sess_1', sourceArtifactId: 'art_1', depositedAt: '2026-11-10T00:00:00.000Z' },
    });
    expect(metadata.sourceSessionId).toBe('sess_1');
    expect(metadata.sourceArtifactId).toBe('art_1');
    expect(metadata.depositedAt).toBe('2026-11-10T00:00:00.000Z');
  });

  it('断言 5: 空 tags 构造为 []，非空 tags 原样打平', () => {
    expect(buildChunkInheritedMetadata({ ...fileFacts, tags: [] }).tags).toEqual([]);
    expect(buildChunkInheritedMetadata(fileFacts).tags).toEqual(['架构', '2026']);
  });

  it('键分层枚举完整且守门正确', () => {
    expect(SYSTEM_DERIVED_KEYS).toEqual(['sourceType', 'fileName', 'storageKey', 'parsedContentKey']);
    expect(SYSTEM_PROVENANCE_KEYS).toEqual(['sourceSessionId', 'sourceArtifactId', 'depositedAt', 'artifactType']);
    expect(EXCLUDED_CHUNK_METADATA_KEYS).toEqual(['outline']);
    for (const key of [...SYSTEM_DERIVED_KEYS, ...SYSTEM_PROVENANCE_KEYS, ...EXCLUDED_CHUNK_METADATA_KEYS]) {
      expect(isProtectedMetadataKey(key)).toBe(true);
    }
    expect(isProtectedMetadataKey('department')).toBe(false);
    expect(isProtectedMetadataKey('year')).toBe(false);
  });

  it('deriveParsedContentKey 派生规则', () => {
    expect(deriveParsedContentKey('a/b/c.md')).toBe('a/b/content.md');
    expect(deriveParsedContentKey('docs/u/v1/raw.html')).toBe('docs/u/v1/content.md');
  });

  it('estimateTokenCount 中英混合启发式（自 worker parser 迁移）', () => {
    expect(estimateTokenCount('')).toBe(0);
    // 4 个西文字符 ≈ 1 token
    expect(estimateTokenCount('abcd')).toBe(1);
    // 中文字符 1 字 ≈ 1 token
    expect(estimateTokenCount('报销政策')).toBe(4);
    expect(estimateTokenCount('报销政策abcd')).toBe(5);
  });
});
