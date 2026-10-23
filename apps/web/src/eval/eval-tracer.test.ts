/**
 * 评测与可观测性 Trace 关联模块单测 (apps/web/src/eval/eval-tracer.test.ts)
 *
 * 验证目标：
 * 1. 验证 createEvalTrace 正确生成 traceId、eval/mock 标签与环境元数据；
 * 2. 验证在未配置 Langfuse 时天然降级为 No-op，不向外部发送误导性请求；
 * 3. 验证 evalTraceRecorder 收集记录并导出「用例名 → traceId」映射字典；
 * 4. 验证 formatReport 格式化文本输出与 dumpArtifact 产物落盘能力。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createEvalTrace,
  evalTraceRecorder,
  type EvalCaseRecord,
} from './eval-tracer';
import { _setLangfuseClientForTesting, _resetClientForTesting } from '@/lib/observability/langfuse-client';

describe('eval-tracer (评测与 Trace 关联模块)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    _resetClientForTesting();
    evalTraceRecorder.clear();
    process.env = { ...originalEnv };
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetClientForTesting();
    evalTraceRecorder.clear();
  });

  describe('1. createEvalTrace 在无环境变量时的隔离与防护（No-op 降级）', () => {
    it('在未配置 Langfuse 环境变量时，产生安全的 eval traceId 且 trace 对象为 no-op', () => {
      const { trace, traceId } = createEvalTrace({
        caseName: 'Case 1: 纯文本问答',
        isMock: true,
      });

      expect(traceId).toMatch(/^eval-trace-/);
      expect(trace.traceId).toBe(traceId);

      // 调用 generation / span，确保不产生报错与副作用
      expect(() => {
        const gen = trace.generation({
          name: 'mock_generation',
          model: 'doubao-pro',
          input: '你好',
          output: '你好',
        });
        gen.end();
      }).not.toThrow();
    });
  });

  describe('2. createEvalTrace 在配置环境变量时的隔离标签与元数据', () => {
    it('当有 Langfuse 客户端时，注入 eval/mock 标签与环境变量标记，杜绝脏数据污染看板', () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';

      const mockTraceFn = vi.fn((opts) => ({
        id: opts.id,
        generation: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
        span: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
        update: vi.fn(),
      }));

      _setLangfuseClientForTesting({
        trace: mockTraceFn,
      });

      const { trace, traceId } = createEvalTrace({
        caseName: 'Case 2: 正常工具调用',
        isMock: true,
        extraTags: ['baseline-smoke'],
        metadata: { scenario: 'tool-call' },
      });

      expect(traceId).toMatch(/^eval-trace-/);
      expect(mockTraceFn).toHaveBeenCalledTimes(1);

      const passedOpts = mockTraceFn.mock.calls[0][0];
      expect(passedOpts.id).toBe(traceId);
      expect(passedOpts.tags).toContain('eval');
      expect(passedOpts.tags).toContain('mock');
      expect(passedOpts.tags).toContain('baseline-smoke');
      expect(passedOpts.metadata.environment).toBe('eval');
      expect(passedOpts.metadata.mock).toBe(true);
      expect(passedOpts.metadata.caseName).toBe('Case 2: 正常工具调用');
      expect(passedOpts.metadata.scenario).toBe('tool-call');
    });

    it('真实链路模式下 (isMock: false)，正确标记 mock: false 且 tags 包含 live 标签', () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';

      const mockTraceFn = vi.fn((opts) => ({
        id: opts.id,
        generation: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
        span: vi.fn(() => ({ update: vi.fn(), end: vi.fn() })),
        update: vi.fn(),
      }));

      _setLangfuseClientForTesting({
        trace: mockTraceFn,
      });

      createEvalTrace({
        caseName: 'Case 6: 真实链路端到端',
        isMock: false,
      });

      const passedOpts = mockTraceFn.mock.calls[0][0];
      expect(passedOpts.tags).toContain('eval');
      expect(passedOpts.tags).toContain('live');
      expect(passedOpts.tags).not.toContain('mock');
      expect(passedOpts.metadata.mock).toBe(false);
    });
  });

  describe('3. evalTraceRecorder 收集、汇总与报告产出', () => {
    it('能够准确收集用例结果，并生成「用例名 → traceId」映射字典', () => {
      evalTraceRecorder.recordCase({
        caseName: 'Case 1: 纯文本问答',
        traceId: 'eval-trace-1',
        outcome: 'passed',
        isMock: true,
        durationMs: 45,
      });

      evalTraceRecorder.recordCase({
        caseName: 'Case 2: 工具调用',
        traceId: 'eval-trace-2',
        outcome: 'passed',
        isMock: true,
        durationMs: 120,
      });

      const map = evalTraceRecorder.getTraceMap();
      expect(map).toEqual({
        'Case 1: 纯文本问答': 'eval-trace-1',
        'Case 2: 工具调用': 'eval-trace-2',
      });

      expect(evalTraceRecorder.getAllRecords()).toHaveLength(2);
    });

    it('formatReport 应输出格式整齐且包含用例名与 traceId 的可视化文本', () => {
      evalTraceRecorder.recordCase({
        caseName: 'Case 1: 纯文本问答',
        traceId: 'eval-trace-case-1',
        outcome: 'passed',
        isMock: true,
        durationMs: 50,
      });

      const report = evalTraceRecorder.formatReport();
      expect(report).toContain('Eval Trace Linkage');
      expect(report).toContain('Case 1: 纯文本问答');
      expect(report).toContain('eval-trace-case-1');
      expect(report).toContain('passed');
      expect(report).toContain('mock');
    });

    it('dumpArtifact 能够将结果落盘到指定 JSON 文件', async () => {
      evalTraceRecorder.recordCase({
        caseName: 'Case 1: 纯文本问答',
        traceId: 'eval-trace-artifact',
        outcome: 'passed',
        isMock: true,
        durationMs: 30,
      });

      const testArtifactPath = path.resolve(process.cwd(), '.test-eval-traces.json');
      try {
        const writtenPath = await evalTraceRecorder.dumpArtifact(testArtifactPath);
        expect(fs.existsSync(writtenPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(writtenPath, 'utf-8'));
        expect(content.traces['Case 1: 纯文本问答']).toBe('eval-trace-artifact');
        expect(content.records).toHaveLength(1);
        expect(content.records[0].caseName).toBe('Case 1: 纯文本问答');
      } finally {
        if (fs.existsSync(testArtifactPath)) {
          fs.unlinkSync(testArtifactPath);
        }
      }
    });
  });
});
