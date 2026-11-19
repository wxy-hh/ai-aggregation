/**
 * 章节补丁离线评测：报告生成（ADR-0037 / 工单 10）
 *
 * 报告只陈述本次运行的计数与比例，结论段统一使用「小样本观察」措辞：
 * 不写统计结论词，不预设通过门槛（基线先跑出来，门槛之后再定）。
 */

import { PATCH_EVAL_CASES, PATCH_EVAL_CATEGORIES } from './cases';
import { aggregateMetrics, type Ratio, type RunAnalysis } from './metrics';

export interface ReportMeta {
  /** 评测模式：dry-run 使用内置模拟输出，real 为真实模型运行 */
  mode: 'dry-run' | 'real';
  provider: string;
  model: string;
  /** 每条用例的运行次数 */
  runsPerCase: number;
  /** 报告生成日期（YYYY-MM-DD），由调用方传入以便测试固定 */
  date: string;
  /** 是否为全量用例集（false 表示只跑了子集，如试跑） */
  fullCaseSet: boolean;
}

/** 比例展示：分母为 0 时显示「无样本」，不伪造 0% 或 100% */
export function formatRatio(r: Ratio): string {
  if (r.rate === null) return '无样本';
  return `${r.numerator}/${r.denominator}（${(r.rate * 100).toFixed(1)}%）`;
}

/** 结论段：只描述本次观察到的计数，措辞固定为「小样本观察」 */
export function buildConclusion(runs: RunAnalysis[], meta: ReportMeta): string {
  const m = aggregateMetrics(runs);
  const lines = [
    `小样本观察：本次共 ${m.validRuns} 次有效运行（每条用例 ${meta.runsPerCase} 次），另有 ${m.failedRuns} 次因调用失败作废。`,
    `- 补丁应用：${formatRatio(m.patchApplyRate)}`,
    `- 未改章节逐字节保持：${formatRatio(m.unchangedPreservationRate)}`,
    `- 应改章节用例中误用整篇替换：${formatRatio(m.fullReplacementRate)}`,
    `- 该新建用例中误并入原产物：${m.mergedIntoOriginal.count}/${m.mergedIntoOriginal.newDocRuns} 次`,
    `- 输出被截断：${m.truncatedRuns}/${m.validRuns} 次`,
    '',
    '以上只是本次提示词版本在小样本上的计数，用作后续改动的对照基线；样本量小、未做重复实验，不据此判断模型能力，也不预设任何通过门槛。',
  ];
  if (meta.mode === 'dry-run') {
    lines.push('', '注意：本报告来自干跑的模拟输出，不是模型表现，不能作为基线。');
  }
  return lines.join('\n');
}

/** 生成完整 Markdown 报告 */
export function buildReport(runs: RunAnalysis[], meta: ReportMeta): string {
  const overall = aggregateMetrics(runs);
  const out: string[] = [];

  out.push('# 章节补丁离线评测报告 (artifact-patch:eval)');
  out.push('');
  out.push(`- 日期：${meta.date}`);
  out.push(`- 模式：${meta.mode === 'real' ? '真实模型运行' : '干跑（模拟输出，未调用模型）'}`);
  out.push(`- 模型：${meta.provider} / ${meta.model}`);
  out.push(`- 用例范围：${meta.fullCaseSet ? `全量 ${PATCH_EVAL_CATEGORIES.length} 类场景` : '子集（试跑）'}，每条 ${meta.runsPerCase} 次`);
  out.push('- 编排：与线上同一 `runAgent`、同一系统提示词（含产物规范与产物上下文注入）、同一流式路径与收尾步输出上限');
  out.push('- 与线上的差异：评测的工具注册表为空（不挂联网、知识库等工具），避免评测触发外部调用；产物上下文按「工作台已展开并聚焦该产物」构造');
  out.push('');

  out.push('## 一、四项指标（总体）');
  out.push('');
  out.push('| 指标 | 数值 | 口径 |');
  out.push('| :--- | :--- | :--- |');
  out.push(`| 补丁应用成功率 | ${formatRatio(overall.patchApplyRate)} | 期望章节中被成功应用的个数 / 期望章节总数 |`);
  out.push(`| 未改章节字节级保持率 | ${formatRatio(overall.unchangedPreservationRate)} | 逐字节原样保留的未改块数 / 未改块总数 |`);
  out.push(`| 误用整篇替换比例 | ${formatRatio(overall.fullReplacementRate)} | 应改章节用例中，对原 identifier 输出不带 section 整篇产物的运行数 / 有效运行数 |`);
  out.push(`| 误并入数 | ${overall.mergedIntoOriginal.count}（共 ${overall.mergedIntoOriginal.newDocRuns} 次该新建运行） | 该新建用例中沿用原 identifier 的运行数 |`);
  out.push(`| 输出被截断的运行 | ${overall.truncatedRuns} / ${overall.validRuns} | 收到「回答被截断」警告的有效运行数，用于校准输出上限 |`);
  out.push(`| 有效运行 / 作废运行 | ${overall.validRuns} / ${overall.failedRuns} | 作废：模型调用失败，不进任何分母 |`);
  out.push('');

  out.push('## 二、按场景分组');
  out.push('');
  out.push('| 场景 | 补丁应用 | 未改章节保持 | 误用整篇替换 | 误并入 |');
  out.push('| :--- | :--- | :--- | :--- | :--- |');
  for (const category of PATCH_EVAL_CATEGORIES) {
    const ids = new Set(PATCH_EVAL_CASES.filter((c) => c.category === category).map((c) => c.id));
    const m = aggregateMetrics(runs.filter((r) => ids.has(r.caseId)));
    const merged = m.mergedIntoOriginal.newDocRuns === 0 ? '-' : `${m.mergedIntoOriginal.count}/${m.mergedIntoOriginal.newDocRuns}`;
    out.push(
      `| ${category} | ${formatRatio(m.patchApplyRate)} | ${formatRatio(m.unchangedPreservationRate)} | ${formatRatio(m.fullReplacementRate)} | ${merged} |`
    );
  }
  out.push('');

  out.push('## 三、逐用例明细');
  out.push('');
  out.push('| 用例 | 场景 | 有效运行 | 补丁应用 | 未改章节保持 | 误用整篇替换 | 误并入 |');
  out.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const testCase of PATCH_EVAL_CASES) {
    const caseRuns = runs.filter((r) => r.caseId === testCase.id);
    if (caseRuns.length === 0) continue;
    const m = aggregateMetrics(caseRuns);
    const merged = m.mergedIntoOriginal.newDocRuns === 0 ? '-' : `${m.mergedIntoOriginal.count}/${m.mergedIntoOriginal.newDocRuns}`;
    out.push(
      `| ${testCase.id} | ${testCase.category} | ${m.validRuns} | ${formatRatio(m.patchApplyRate)} | ${formatRatio(m.unchangedPreservationRate)} | ${formatRatio(m.fullReplacementRate)} | ${merged} |`
    );
  }
  out.push('');

  const failures = runs.flatMap((r) =>
    r.patchFailures.map((f) => `- ${r.caseId} 第 ${r.runIndex + 1} 次：章节「${f.section}」失败（${f.reason}）`)
  );
  const callFailures = runs.filter((r) => r.failed).map((r) => `- ${r.caseId} 第 ${r.runIndex + 1} 次：${r.failureReason ?? '未知原因'}`);
  out.push('## 四、失败明细');
  out.push('');
  out.push('补丁失败（标题抄错、重复、找不到等）：');
  out.push(...(failures.length > 0 ? failures : ['- 无']));
  out.push('');
  out.push('调用失败（作废的运行）：');
  out.push(...(callFailures.length > 0 ? callFailures : ['- 无']));
  out.push('');

  out.push('## 五、结论');
  out.push('');
  out.push(buildConclusion(runs, meta));
  out.push('');
  return out.join('\n');
}
