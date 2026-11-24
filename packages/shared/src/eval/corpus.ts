import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface EvalCorpusChunk {
  chunkId: string;
  docTitle: string;
  content: string;
  fingerprint: string;
}

export interface EvalCorpusData {
  version: string;
  embeddingModel: string;
  dimensions: number;
  chunks: EvalCorpusChunk[];
}

export const EVAL_SANDBOX_TENANT_ID = 'eval-sandbox-tenant-sys';

export function getEvalSandboxTenantId(): string {
  return EVAL_SANDBOX_TENANT_ID;
}

export function computeCorpusFingerprint(content: string, model: string, dimensions: number): string {
  const payload = `${content}|${model}|${dimensions}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function loadEvalCorpus(): EvalCorpusData {
  const corpusPath = path.resolve(__dirname, './datasets/eval-kb-corpus.json');
  const raw = fs.readFileSync(corpusPath, 'utf-8');
  return JSON.parse(raw) as EvalCorpusData;
}

export function validateCorpusFingerprint(corpus: EvalCorpusData): {
  valid: boolean;
  mismatches: Array<{ chunkId: string; expected: string; actual: string; error: string }>;
} {
  const mismatches: Array<{ chunkId: string; expected: string; actual: string; error: string }> = [];

  for (const chunk of corpus.chunks) {
    const computed = computeCorpusFingerprint(chunk.content, corpus.embeddingModel, corpus.dimensions);
    if (chunk.fingerprint !== computed) {
      mismatches.push({
        chunkId: chunk.chunkId,
        expected: chunk.fingerprint,
        actual: computed,
        error: `切片 [${chunk.chunkId}] 指纹不匹配：预期 ${chunk.fingerprint}，计算得到 ${computed}`,
      });
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}
