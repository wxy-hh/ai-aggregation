/**
 * 章节补丁离线评测：单次运行分析与指标聚合（ADR-0037 / 工单 10）
 *
 * 纯函数、无模型依赖：输入「用例 + 一次运行里模型输出的产物流式事件」，
 * 用与客户端同一个版本引擎（applyArtifactEvent）折叠出最终产物池，再按固定口径计数。
 * 因此给定固定的模拟输出，数值可手算核对。
 *
 * 四项指标的口径（分母均为参与统计的有效运行，模型调用失败的运行单独计数、不进分母）：
 * 1. 补丁应用成功率 = 期望章节中被成功应用的个数 / 期望章节总数（仅「应改章节」用例）；
 *    补丁指向了期望之外的章节、或标题抄错判失败，均不计入分子。
 * 2. 未改章节字节级保持率 = 最终正文里逐字节原样保留的「未改块」数 / 未改块总数。
 *    未改块：原文按标题切块（每个标题行到下一个任意级标题之前为一块，首个标题前的前言单独一块），
 *    不落在任何期望章节区间内的块；「该新建」用例把整篇原文视为 1 个未改块。
 * 3. 误用整篇替换比例 = 应改章节用例中、模型对原 identifier 输出了不带 section 的整篇产物的运行数 / 应改章节用例的有效运行数。
 * 4. 误并入数 = 「该新建」用例中，模型沿用原 identifier（把独立文档并入原产物）的运行数。
 */

import {
  applyArtifactEvent,
  findSectionRange,
  parseMarkdownHeadings,
  type Artifact,
  type ChatStreamEvent,
} from '@repo/shared';
import type { PatchEvalCase } from './cases';

/** 单次运行的分析结果 */
export interface RunAnalysis {
  caseId: string;
  category: PatchEvalCase['category'];
  runIndex: number;
  expectKind: PatchEvalCase['expect']['kind'];
  /** 本次运行是否因模型调用失败而作废（作废的运行不进任何分母） */
  failed: boolean;
  failureReason?: string;
  /** 模型输出的产物个数（artifact_start 帧数），0 表示模型没有输出任何产物 */
  artifactOutputs: number;
  /** 应改章节用例：期望章节数与成功应用数 */
  expectedSections: number;
  appliedSections: number;
  /** 补丁失败明细（章节标题 + 原因），仅供报告展示 */
  patchFailures: Array<{ section: string; reason: string }>;
  /** 应改章节用例：是否对原 identifier 输出了不带 section 的整篇产物 */
  usedFullReplacement: boolean;
  /** 本次运行是否收到「回答被截断」警告（输出触达单步 / 收尾步上限），仅供报告展示，不进四项指标 */
  truncated: boolean;
  /** 该新建用例：是否沿用了原 identifier（误并入） */
  mergedIntoOriginal: boolean;
  /** 未改块总数与逐字节保持数 */
  unchangedTotal: number;
  unchangedPreserved: number;
}

/** 指标比例：分母为 0 时 rate 为 null（报告显示「无样本」，不伪造 0% 或 100%） */
export interface Ratio {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface PatchEvalMetrics {
  /** 参与统计的有效运行数 / 调用失败运行数 */
  validRuns: number;
  failedRuns: number;
  /** 有效运行中收到截断警告的次数 */
  truncatedRuns: number;
  patchApplyRate: Ratio;
  unchangedPreservationRate: Ratio;
  fullReplacementRate: Ratio;
  /** 误并入数：「该新建」用例中并入原产物的运行数，及该类有效运行总数 */
  mergedIntoOriginal: { count: number; newDocRuns: number };
}

/** 标题行比对键：与版本引擎一致，仅忽略首尾空白与连续空格 */
function normalizeHeading(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** 构造评测起点：已有一个完成态 v1 的 Markdown 产物（与线上工作台一致） */
export function buildInitialArtifact(testCase: PatchEvalCase): Artifact {
  return {
    id: testCase.artifactId,
    type: 'markdown',
    title: testCase.title,
    content: testCase.document,
    status: 'complete',
    createdAt: 1,
    versions: [
      { id: 'v1', seq: 1, content: testCase.document, createdAt: 1, source: { kind: 'generated' } },
    ],
  };
}

/** 把原文按标题切成块：前言（若非空）+ 每个标题行到下一个任意级标题之前 */
export function splitIntoBlocks(content: string): Array<{ start: number; end: number; text: string }> {
  const headings = parseMarkdownHeadings(content);
  const blocks: Array<{ start: number; end: number; text: string }> = [];
  const firstStart = headings[0]?.start ?? content.length;
  if (firstStart > 0) blocks.push({ start: 0, end: firstStart, text: content.slice(0, firstStart) });
  headings.forEach((h, index) => {
    const end = headings[index + 1]?.start ?? content.length;
    blocks.push({ start: h.start, end, text: content.slice(h.start, end) });
  });
  return blocks;
}

/** 应改章节用例的未改块：不落在任何期望章节区间内的块文本 */
export function collectUnchangedBlocks(document: string, sections: string[]): string[] {
  const ranges = sections
    .map((s) => findSectionRange(document, s))
    .filter((r): r is { start: number; end: number } => r !== null);
  return splitIntoBlocks(document)
    .filter((b) => !ranges.some((r) => b.start >= r.start && b.end <= r.end))
    .map((b) => b.text);
}

/**
 * 分析一次运行：折叠产物事件得到最终产物池并计数。
 * events 只需包含 artifact_* 事件，其余事件会被版本引擎忽略。
 */
export function analyzeRun(
  testCase: PatchEvalCase,
  runIndex: number,
  events: ChatStreamEvent[]
): RunAnalysis {
  const original = buildInitialArtifact(testCase);
  let pool: Artifact[] = [original];

  // 逐个补丁结果：与 chat-store 同一方式，在每个 artifact_end 后读取新增的 patchReport
  const appliedKeys = new Set<string>();
  const patchFailures: Array<{ section: string; reason: string }> = [];
  const seenReports = new Map<string, number>();
  const expectedSections = testCase.expect.kind === 'patch' ? testCase.expect.sections : [];
  const expectedKeys = new Set(expectedSections.map(normalizeHeading));

  let artifactOutputs = 0;
  let usedFullReplacement = false;
  let mergedIntoOriginal = false;

  for (const event of events) {
    if (event.type === 'artifact_start') {
      artifactOutputs++;
      if (event.artifact.id === testCase.artifactId) {
        if (testCase.expect.kind === 'patch' && !event.artifact.section) usedFullReplacement = true;
        if (testCase.expect.kind === 'new-artifact') mergedIntoOriginal = true;
      }
    }
    pool = applyArtifactEvent(pool, event, 2);
    if (event.type === 'artifact_end' && event.id === testCase.artifactId) {
      const report = pool.find((a) => a.id === event.id)?.patchReport ?? [];
      // 整篇替换会清空补丁结果：长度回落则从头计
      const before = Math.min(seenReports.get(event.id) ?? 0, report.length);
      for (const result of report.slice(before)) {
        if (result.status === 'applied') {
          const key = normalizeHeading(result.section);
          if (expectedKeys.has(key)) appliedKeys.add(key);
        } else {
          patchFailures.push({ section: result.section, reason: result.reason ?? 'unknown' });
        }
      }
      seenReports.set(event.id, report.length);
    }
  }

  const finalOriginal = pool.find((a) => a.id === testCase.artifactId);
  const finalContent = finalOriginal?.content ?? '';

  let unchangedTotal: number;
  let unchangedPreserved: number;
  if (testCase.expect.kind === 'patch') {
    const blocks = collectUnchangedBlocks(testCase.document, testCase.expect.sections);
    unchangedTotal = blocks.length;
    unchangedPreserved = blocks.filter((text) => finalContent.includes(text)).length;
  } else {
    // 该新建：原产物整篇不得有任何变化
    unchangedTotal = 1;
    unchangedPreserved = finalContent === testCase.document ? 1 : 0;
  }

  return {
    caseId: testCase.id,
    category: testCase.category,
    runIndex,
    expectKind: testCase.expect.kind,
    failed: false,
    artifactOutputs,
    expectedSections: expectedSections.length,
    appliedSections: appliedKeys.size,
    patchFailures,
    usedFullReplacement,
    truncated: events.some((e) => e.type === 'warning'),
    mergedIntoOriginal,
    unchangedTotal,
    unchangedPreserved,
  };
}

/** 模型调用失败的运行：留痕但不进任何分母 */
export function failedRun(
  testCase: PatchEvalCase,
  runIndex: number,
  reason: string
): RunAnalysis {
  return {
    caseId: testCase.id,
    category: testCase.category,
    runIndex,
    expectKind: testCase.expect.kind,
    failed: true,
    failureReason: reason,
    artifactOutputs: 0,
    expectedSections: 0,
    appliedSections: 0,
    patchFailures: [],
    usedFullReplacement: false,
    truncated: false,
    mergedIntoOriginal: false,
    unchangedTotal: 0,
    unchangedPreserved: 0,
  };
}

function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

/** 聚合多次运行为四项指标 */
export function aggregateMetrics(runs: RunAnalysis[]): PatchEvalMetrics {
  const valid = runs.filter((r) => !r.failed);
  const patchRuns = valid.filter((r) => r.expectKind === 'patch');
  const newDocRuns = valid.filter((r) => r.expectKind === 'new-artifact');

  const sum = (items: RunAnalysis[], pick: (r: RunAnalysis) => number) =>
    items.reduce((acc, r) => acc + pick(r), 0);

  return {
    validRuns: valid.length,
    failedRuns: runs.length - valid.length,
    truncatedRuns: valid.filter((r) => r.truncated).length,
    patchApplyRate: ratio(
      sum(patchRuns, (r) => r.appliedSections),
      sum(patchRuns, (r) => r.expectedSections)
    ),
    unchangedPreservationRate: ratio(
      sum(valid, (r) => r.unchangedPreserved),
      sum(valid, (r) => r.unchangedTotal)
    ),
    fullReplacementRate: ratio(patchRuns.filter((r) => r.usedFullReplacement).length, patchRuns.length),
    mergedIntoOriginal: {
      count: newDocRuns.filter((r) => r.mergedIntoOriginal).length,
      newDocRuns: newDocRuns.length,
    },
  };
}
