/**
 * 评测套件与可观测性 Trace 关联深模块 (apps/web/src/eval/eval-tracer.ts)
 *
 * 职责：
 * 1. 封装评测专用的 Trace 创建逻辑，统一样式化 eval traceId；
 * 2. 隔离 Mock 模式与真实模式，注入明确的环境标识与标签（eval/mock/live），防止脏数据污染看板；
 * 3. 收集并记录各个评测用例的执行状态、耗时与 traceId；
 * 4. 产出整洁直观的「用例名 → traceId」映射报表并在测试结束时落盘为 .eval-traces.json 产物。
 */

import fs from 'fs/promises';
import path from 'path';
import {
  createRootTrace,
  type ObservabilityTrace,
} from '@/lib/observability/langfuse-client';

/** 单个评测用例执行记录 */
export interface EvalCaseRecord {
  caseName: string;
  traceId: string;
  outcome: 'passed' | 'failed' | 'skipped';
  isMock: boolean;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** 创建评测 Trace 参数 */
export interface CreateEvalTraceOptions {
  caseName: string;
  isMock?: boolean;
  traceId?: string;
  extraTags?: string[];
  metadata?: Record<string, unknown>;
}

/** 获取独立于 Date.now mock 的真实当前毫秒时间戳 */
function getSafeTimestamp(): number {
  if (typeof performance !== 'undefined' && performance.timeOrigin) {
    return Math.round(performance.timeOrigin + performance.now());
  }
  return Date.now();
}

/** 格式化清理用例名为合法的 traceId 片段 */
function sanitizeCaseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'case';
}

/**
 * 为评测用例创建专用的 Root Trace。
 * 注入明确的 eval/mock 标签与元数据，未配置 Langfuse 时天然降级为 No-op。
 */
export function createEvalTrace(options: CreateEvalTraceOptions): {
  trace: ObservabilityTrace;
  traceId: string;
} {
  const isMock = options.isMock !== false;
  const slug = sanitizeCaseSlug(options.caseName);
  const traceId =
    options.traceId ||
    `eval-trace-${slug}-${getSafeTimestamp()}-${Math.random().toString(36).slice(2, 6)}`;

  const tags = [
    'eval',
    isMock ? 'mock' : 'live',
    ...(options.extraTags || []),
  ];

  const trace = createRootTrace({
    traceId,
    name: `eval:${options.caseName}`,
    tags,
    metadata: {
      environment: 'eval',
      mock: isMock,
      caseName: options.caseName,
      ...(options.metadata || {}),
    },
  });

  return { trace, traceId };
}

/**
 * 评测 Trace 记录器单例
 */
class EvalTraceRecorder {
  private records: Map<string, EvalCaseRecord> = new Map();

  /** 记录单条用例执行情况 */
  recordCase(record: EvalCaseRecord): void {
    this.records.set(record.caseName, record);
  }

  /** 获取「用例名 → traceId」映射字典 */
  getTraceMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [caseName, record] of this.records.entries()) {
      map[caseName] = record.traceId;
    }
    return map;
  }

  /** 获取全部记录数组 */
  getAllRecords(): EvalCaseRecord[] {
    return Array.from(this.records.values());
  }

  /** 清空记录（主要用于测试复位） */
  clear(): void {
    this.records.clear();
  }

  /** 格式化为控制台直观文本报表 */
  formatReport(): string {
    const records = this.getAllRecords();
    const divider = '─'.repeat(88);
    const doubleDivider = '═'.repeat(88);

    const lines: string[] = [
      '',
      doubleDivider,
      '  🔍 [Eval Trace Linkage] 评测用例与 Langfuse Trace 关联清单',
      divider,
      `  ${'用例名称'.padEnd(36)} │ ${'状态'.padEnd(6)} │ ${'模式'.padEnd(6)} │ Trace ID`,
      divider,
    ];

    if (records.length === 0) {
      lines.push('  (暂无评测记录)');
    } else {
      for (const r of records) {
        const shortName = r.caseName.length > 34 ? `${r.caseName.slice(0, 31)}...` : r.caseName;
        const nameCol = shortName.padEnd(36);
        const statusCol = r.outcome.padEnd(6);
        const modeCol = (r.isMock ? 'mock' : 'live').padEnd(6);
        lines.push(`  ${nameCol} │ ${statusCol} │ ${modeCol} │ ${r.traceId}`);
      }
    }

    lines.push(doubleDivider, '');
    return lines.join('\n');
  }

  /** 控制台打印可视化汇总 */
  printSummary(): void {
    console.log(this.formatReport());
  }

  /**
   * 将映射清单与用例记录落盘为 JSON 产物
   * 默认写入项目根目录或指定目录下的 .eval-traces.json
   */
  async dumpArtifact(targetPath?: string): Promise<string> {
    const finalPath = targetPath || path.resolve(process.cwd(), '.eval-traces.json');
    const artifact = {
      timestamp: new Date().toISOString(),
      traces: this.getTraceMap(),
      summary: {
        total: this.records.size,
        passed: this.getAllRecords().filter((r) => r.outcome === 'passed').length,
        failed: this.getAllRecords().filter((r) => r.outcome === 'failed').length,
      },
      records: this.getAllRecords(),
    };

    await fs.writeFile(finalPath, JSON.stringify(artifact, null, 2), 'utf-8');
    return finalPath;
  }
}

export const evalTraceRecorder = new EvalTraceRecorder();
