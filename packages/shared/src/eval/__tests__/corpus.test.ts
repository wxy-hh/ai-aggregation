import { describe, it, expect } from 'vitest';
import {
  computeCorpusFingerprint,
  validateCorpusFingerprint,
  loadEvalCorpus,
  getEvalSandboxTenantId,
} from '../corpus';

describe('TC07: 沙箱语料自包含指纹校验与隔离 (SandboxCorpusFingerprint)', () => {
  it('TC07-1: 沙箱语料内置文本与向量维度哈希指纹', () => {
    const corpus = loadEvalCorpus();
    expect(corpus.chunks.length).toBe(5);
    expect(corpus.embeddingModel).toBe('text-embedding-3-small');
    expect(corpus.dimensions).toBe(1024);

    for (const chunk of corpus.chunks) {
      expect(chunk.chunkId).toBeDefined();
      expect(chunk.content.length).toBeGreaterThan(10);
      expect(chunk.fingerprint).toBeDefined();

      const calculated = computeCorpusFingerprint(chunk.content, corpus.embeddingModel, corpus.dimensions);
      expect(chunk.fingerprint).toBe(calculated);
    }

    const overallValid = validateCorpusFingerprint(corpus);
    expect(overallValid.valid).toBe(true);
    expect(overallValid.mismatches).toHaveLength(0);
  });

  it('TC07-2: 语料被篡改时指纹校验异常阻断评测', () => {
    const corpus = loadEvalCorpus();
    // 篡改第 1 个切片内容
    const tampered = JSON.parse(JSON.stringify(corpus));
    tampered.chunks[0].content += '【恶意篡改内容】';

    const result = validateCorpusFingerprint(tampered);
    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
    expect(result.mismatches[0].chunkId).toBe(tampered.chunks[0].chunkId);
    expect(result.mismatches[0].error).toContain('指纹不匹配');
  });

  it('TC07-3: 语料注入专用测试租户命名空间保持隔离', () => {
    const tenantId = getEvalSandboxTenantId();
    expect(tenantId).toBe('eval-sandbox-tenant-sys');
    expect(tenantId).not.toBe('default');
    expect(tenantId).not.toBe('production');
  });
});
