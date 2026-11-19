/**
 * 章节补丁离线评测：用例集、度量、报告与命令行的单元测试（TC14 / ADR-0037 / 工单 10）
 *
 * 全部为纯函数 / 注入替身测试：不调用模型、不读环境密钥。
 * 真实运行函数 runRealOnce 不在本文件任何用例里被调用。
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findSectionRange,
  parseMarkdownHeadings,
  type ChatStreamEvent,
} from '@repo/shared';
import {
  LONG_DOC_CHARS,
  PATCH_EVAL_CASES,
  PATCH_EVAL_CATEGORIES,
  type PatchEvalCase,
} from './cases';
import {
  aggregateMetrics,
  analyzeRun,
  collectUnchangedBlocks,
  failedRun,
  splitIntoBlocks,
} from './metrics';
import { buildConclusion, buildReport } from './report';
import { MIN_RUNS_FULL_SET, parseArgs, runCli, type CliDeps } from './cli';
import { buildEvalArtifactPrompt, simulateModelEvents } from './runner';

const caseById = (id: string): PatchEvalCase => {
  const found = PATCH_EVAL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`测试用例 ${id} 不存在`);
  return found;
};

/** 构造「对 identifier 输出一个补丁」的事件序列 */
function patchEvents(id: string, title: string, section: string, body: string): ChatStreamEvent[] {
  return [
    { type: 'artifact_start', artifact: { id, type: 'markdown', title, section } },
    { type: 'artifact_delta', id, delta: body },
    { type: 'artifact_end', id, status: 'complete' },
  ];
}

describe('[TC14-1] 评测用例集', () => {
  it('共 12 条用例，ID 唯一', () => {
    expect(PATCH_EVAL_CASES).toHaveLength(12);
    expect(new Set(PATCH_EVAL_CASES.map((c) => c.id)).size).toBe(12);
  });

  it('覆盖单章、相邻两章、含子章节、全角标点标题、重复标题、围栏内 #、长文、该新建八类场景，每类至少 1 条', () => {
    expect([...PATCH_EVAL_CATEGORIES].sort()).toEqual(
      [
        'single',
        'adjacent',
        'subsections',
        'fullwidth-title',
        'duplicate-title',
        'fence-hash',
        'long-doc',
        'new-document',
      ].sort()
    );
    for (const category of PATCH_EVAL_CATEGORIES) {
      expect(PATCH_EVAL_CASES.filter((c) => c.category === category).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('应改章节用例的期望章节在原文中都能精确定位（唯一匹配）', () => {
    for (const testCase of PATCH_EVAL_CASES) {
      if (testCase.expect.kind !== 'patch') continue;
      for (const section of testCase.expect.sections) {
        expect(findSectionRange(testCase.document, section), `${testCase.id}: ${section}`).not.toBeNull();
      }
    }
  });

  it('相邻两章用例的期望章节在原文中确实相邻', () => {
    const adjacent = caseById('adjacent-01');
    if (adjacent.expect.kind !== 'patch') throw new Error('应为补丁用例');
    const [first, second] = adjacent.expect.sections.map((s) => findSectionRange(adjacent.document, s)!);
    expect(first.end).toBe(second.start);
  });

  it('含子章节用例：二级章节的区间包含其下三级小节', () => {
    const doc = caseById('subsections-01').document;
    const range = findSectionRange(doc, '## 第二章 技术方案')!;
    const inside = doc.slice(range.start, range.end);
    expect(inside).toContain('### 2.1 架构设计');
    expect(inside).toContain('### 2.3 风险控制');
    expect(inside).not.toContain('## 第三章 实施计划');
  });

  it('全角标点用例：标题确实含全角冒号、括号与破折号', () => {
    const testCase = caseById('fullwidth-01');
    if (testCase.expect.kind !== 'patch') throw new Error('应为补丁用例');
    const section = testCase.expect.sections[0];
    expect(section).toMatch(/：/);
    expect(section).toMatch(/（.*）/);
    expect(section).toMatch(/——/);
  });

  it('重复标题用例：「### 小结」出现两次，直接用它作 section 无法唯一定位', () => {
    const doc = caseById('duplicate-01').document;
    expect(doc.match(/^### 小结$/gm)).toHaveLength(2);
    expect(findSectionRange(doc, '### 小结')).toBeNull();
  });

  it('围栏内 # 用例：代码块里的 # 开头行不会被当成标题', () => {
    const doc = caseById('fence-hash-01').document;
    expect(doc).toContain('# 安装依赖');
    const lines = parseMarkdownHeadings(doc).map((h) => h.line);
    expect(lines).not.toContain('# 安装依赖');
    expect(lines).not.toContain('# 启动服务');
  });

  it('长文用例接近但不超过 30,000 字符的全文注入上限', () => {
    expect(LONG_DOC_CHARS).toBeLessThanOrEqual(30_000);
    expect(LONG_DOC_CHARS).toBeGreaterThanOrEqual(28_000);
    expect(caseById('long-01').document.length).toBe(LONG_DOC_CHARS);
  });

  it('每条用例经服务端复核都以「全文注入」生效，且包含标题目录与原文', () => {
    for (const testCase of PATCH_EVAL_CASES) {
      const prompt = buildEvalArtifactPrompt(testCase);
      expect(prompt, testCase.id).toContain('标题目录');
      expect(prompt, testCase.id).toContain(`identifier=${testCase.artifactId}`);
      expect(prompt, testCase.id).toContain(testCase.document);
    }
  });
});

describe('[TC14-2] 度量函数与手算一致', () => {
  const single = caseById('single-01');
  const newDoc = caseById('new-01');
  const SECTION = '## 第三章 竞争格局';

  it('单章用例按标题切块：6 个标题块，期望章节之外为 5 个未改块', () => {
    expect(splitIntoBlocks(single.document)).toHaveLength(6);
    expect(collectUnchangedBlocks(single.document, [SECTION])).toHaveLength(5);
  });

  it('围栏用例：代码块不引入额外的块边界（4 个标题块，改第二章后未改块为 3）', () => {
    const fence = caseById('fence-hash-01');
    expect(splitIntoBlocks(fence.document)).toHaveLength(4);
    expect(collectUnchangedBlocks(fence.document, ['## 第二章 安装步骤'])).toHaveLength(3);
  });

  it('A 正确补丁：应用 1/1、未改块 5/5、未用整篇替换', () => {
    const run = analyzeRun(single, 0, [
      ...patchEvents('report', single.title, SECTION, `${SECTION}\n改写后的竞争格局。\n`),
      { type: 'done' },
    ]);
    expect(run).toMatchObject({
      expectedSections: 1,
      appliedSections: 1,
      unchangedTotal: 5,
      unchangedPreserved: 5,
      usedFullReplacement: false,
      truncated: false,
    });
  });

  it('B 标题抄错：应用 0/1、记录 not-found 失败，当前版不变所以未改块仍 5/5', () => {
    const run = analyzeRun(single, 1, [
      ...patchEvents('report', single.title, '## 第三章 竞争态势', '## 第三章 竞争态势\n新内容\n'),
      { type: 'done' },
    ]);
    expect(run.appliedSections).toBe(0);
    expect(run.patchFailures).toEqual([{ section: '## 第三章 竞争态势', reason: 'not-found' }]);
    expect(run.unchangedPreserved).toBe(5);
  });

  it('C 误用整篇替换：对原 identifier 输出不带 section 的整篇，未改块 0/5', () => {
    const run = analyzeRun(single, 2, [
      { type: 'artifact_start', artifact: { id: 'report', type: 'markdown', title: single.title } },
      { type: 'artifact_delta', id: 'report', delta: '# 新能源汽车行业研究\n\n只剩一句话。\n' },
      { type: 'artifact_end', id: 'report', status: 'complete' },
      { type: 'done' },
    ]);
    expect(run.usedFullReplacement).toBe(true);
    expect(run.appliedSections).toBe(0);
    expect(run.unchangedPreserved).toBe(0);
  });

  it('D / E 该新建用例：沿用原 identifier 记为误并入且原文被改；用全新 identifier 则原文完整保持', () => {
    const merged = analyzeRun(newDoc, 0, [
      { type: 'artifact_start', artifact: { id: 'report', type: 'markdown', title: '摘要' } },
      { type: 'artifact_delta', id: 'report', delta: '# 摘要\n\n英文摘要\n' },
      { type: 'artifact_end', id: 'report', status: 'complete' },
    ]);
    expect(merged.mergedIntoOriginal).toBe(true);
    expect(merged.unchangedPreserved).toBe(0);

    const separate = analyzeRun(newDoc, 1, simulateModelEvents(newDoc));
    expect(separate.mergedIntoOriginal).toBe(false);
    expect(separate.unchangedPreserved).toBe(1);
  });

  it('五次有效运行 + 一次调用失败的聚合：四项指标与手算一致', () => {
    const A = analyzeRun(single, 0, patchEvents('report', single.title, SECTION, `${SECTION}\n新\n`));
    const B = analyzeRun(single, 1, patchEvents('report', single.title, '## 第三章 竞争态势', '## 第三章 竞争态势\n新\n'));
    const C = analyzeRun(single, 2, [
      { type: 'artifact_start', artifact: { id: 'report', type: 'markdown', title: single.title } },
      { type: 'artifact_delta', id: 'report', delta: '# 新能源汽车行业研究\n\n只剩一句话。\n' },
      { type: 'artifact_end', id: 'report', status: 'complete' },
    ]);
    const D = analyzeRun(newDoc, 0, [
      { type: 'artifact_start', artifact: { id: 'report', type: 'markdown', title: '摘要' } },
      { type: 'artifact_delta', id: 'report', delta: '# 摘要\n\n英文摘要\n' },
      { type: 'artifact_end', id: 'report', status: 'complete' },
    ]);
    const E = analyzeRun(newDoc, 1, simulateModelEvents(newDoc));
    const F = failedRun(single, 3, '上游 500');

    const m = aggregateMetrics([A, B, C, D, E, F]);
    // 手算：补丁应用 = (1+0+0) / (1+1+1)；未改块保持 = (5+5+0 + 0+1) / (5+5+5 + 1+1)
    // 误用整篇替换 = C / (A,B,C)；误并入 = D / (D,E)；F 作废不进任何分母
    expect(m.validRuns).toBe(5);
    expect(m.failedRuns).toBe(1);
    expect(m.patchApplyRate).toMatchObject({ numerator: 1, denominator: 3 });
    expect(m.patchApplyRate.rate).toBeCloseTo(1 / 3, 10);
    expect(m.unchangedPreservationRate).toMatchObject({ numerator: 11, denominator: 17 });
    expect(m.fullReplacementRate).toMatchObject({ numerator: 1, denominator: 3 });
    expect(m.mergedIntoOriginal).toEqual({ count: 1, newDocRuns: 2 });
  });

  it('同一轮两个补丁：相邻两章各自应用，计 2/2', () => {
    const adjacent = caseById('adjacent-01');
    const run = analyzeRun(adjacent, 0, [
      ...patchEvents('report', adjacent.title, '## 第二章 市场规模', '## 第二章 市场规模\n精简\n'),
      ...patchEvents('report', adjacent.title, '## 第三章 竞争格局', '## 第三章 竞争格局\n精简\n'),
    ]);
    expect(run.expectedSections).toBe(2);
    expect(run.appliedSections).toBe(2);
    expect(run.unchangedTotal).toBe(4);
    expect(run.unchangedPreserved).toBe(4);
  });

  it('补丁指向期望之外的章节：不计入应用成功数，且该章节原文被改后不算保持', () => {
    const run = analyzeRun(single, 0, patchEvents('report', single.title, '## 第二章 市场规模', '## 第二章 市场规模\n乱改\n'));
    expect(run.appliedSections).toBe(0);
    expect(run.unchangedTotal).toBe(5);
    expect(run.unchangedPreserved).toBe(4);
  });

  it('没有任何有效运行时比例为 null（显示无样本），不伪造 0% 或 100%', () => {
    const m = aggregateMetrics([failedRun(single, 0, 'x')]);
    expect(m.patchApplyRate.rate).toBeNull();
    expect(m.unchangedPreservationRate.rate).toBeNull();
    expect(m.fullReplacementRate.rate).toBeNull();
  });

  it('收到截断警告的运行被计数，不影响四项指标', () => {
    const run = analyzeRun(single, 0, [
      ...patchEvents('report', single.title, SECTION, `${SECTION}\n新\n`),
      { type: 'warning', warning: '回答在此处被截断，内容可能不完整' },
    ]);
    expect(run.truncated).toBe(true);
    expect(aggregateMetrics([run]).truncatedRuns).toBe(1);
  });
});

describe('[TC14-3] 报告措辞', () => {
  const runs = PATCH_EVAL_CASES.flatMap((testCase) =>
    [0, 1, 2].map((i) => analyzeRun(testCase, i, simulateModelEvents(testCase)))
  );
  const meta = {
    mode: 'real' as const,
    provider: 'deepseek',
    model: 'deepseek-flash',
    runsPerCase: 3,
    date: '2026-10-29',
    fullCaseSet: true,
  };

  it('结论段使用「小样本观察」，不含统计结论词，也不含通过门槛判定', () => {
    const conclusion = buildConclusion(runs, meta);
    expect(conclusion).toContain('小样本观察');
    for (const banned of ['已证实', '显著', '证明', '统计上', '置信']) {
      expect(conclusion, banned).not.toContain(banned);
    }
    expect(conclusion).not.toMatch(/达标|未达标|不达标|合格|及格|≥\s*\d+\s*%|>=\s*\d+\s*%/);
  });

  it('完整报告同样不含统计结论词与数字门槛，并包含四项指标与按场景分组', () => {
    const report = buildReport(runs, meta);
    for (const banned of ['已证实', '显著', '证明']) {
      expect(report, banned).not.toContain(banned);
    }
    expect(report).not.toMatch(/达标|未达标|不达标|≥\s*\d+\s*%|>=\s*\d+\s*%/);
    for (const label of ['补丁应用成功率', '未改章节字节级保持率', '误用整篇替换比例', '误并入数']) {
      expect(report).toContain(label);
    }
    for (const category of PATCH_EVAL_CATEGORIES) {
      expect(report).toContain(category);
    }
  });

  it('干跑报告明确声明模拟输出不是模型表现，不能作为基线', () => {
    const report = buildReport(runs, { ...meta, mode: 'dry-run' });
    expect(report).toContain('干跑');
    expect(report).toContain('不是模型表现');
  });
});

describe('[TC14-4] 命令行：干跑与真实调用确认', () => {
  function makeDeps(overrides: Partial<CliDeps> = {}) {
    const runReal = vi.fn(async () => [] as ChatStreamEvent[]);
    const writeReport = vi.fn();
    const logs: string[] = [];
    const errors: string[] = [];
    const deps: CliDeps = {
      runReal,
      simulate: simulateModelEvents,
      writeReport,
      log: (m) => logs.push(m),
      error: (m) => errors.push(m),
      now: () => new Date('2026-10-29T08:00:00Z'),
      model: { provider: 'deepseek', model: 'deepseek-flash' },
      ...overrides,
    };
    return { deps, runReal, writeReport, logs, errors };
  }

  it('干跑退出码为 0，不调用模型，也不落盘报告', async () => {
    const { deps, runReal, writeReport, logs } = makeDeps();
    const code = await runCli(['--dry-run'], deps);
    expect(code).toBe(0);
    expect(runReal).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('干跑');
  });

  it('未传确认参数时拒绝发起真实调用：退出码非 0、给出提示、不调用模型', async () => {
    const { deps, runReal, errors } = makeDeps();
    const code = await runCli([], deps);
    expect(code).toBe(2);
    expect(runReal).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('--confirm-real-run');
  });

  it('--cases 子集、--runs 等其它参数也不能绕过确认', async () => {
    const { deps, runReal } = makeDeps();
    expect(await runCli(['--cases', 'single-01', '--runs', '1'], deps)).toBe(2);
    expect(runReal).not.toHaveBeenCalled();
  });

  it('传入 --confirm-real-run 才会调用模型；全量用例每条至少运行 3 次', async () => {
    const { deps, runReal, writeReport } = makeDeps({
      runReal: vi.fn(async (testCase: PatchEvalCase) => simulateModelEvents(testCase)),
    });
    const code = await runCli(['--confirm-real-run'], deps);
    expect(code).toBe(0);
    expect(deps.runReal).toHaveBeenCalledTimes(PATCH_EVAL_CASES.length * MIN_RUNS_FULL_SET);
    // 全量真实运行才写入标准基线路径
    expect(writeReport).toHaveBeenCalledTimes(1);
    expect(writeReport.mock.calls[0][0]).toBe('docs/reports/artifact-patch-eval-report.md');
    void runReal;
  });

  it('全量用例运行次数少于 3 次被拒绝；子集试跑允许 1 次且默认不覆盖基线报告', async () => {
    const refused = makeDeps();
    expect(await runCli(['--confirm-real-run', '--runs', '2'], refused.deps)).toBe(2);

    const trial = makeDeps({
      runReal: vi.fn(async (testCase: PatchEvalCase) => simulateModelEvents(testCase)),
    });
    expect(await runCli(['--confirm-real-run', '--cases', 'single-01,new-01', '--runs', '1'], trial.deps)).toBe(0);
    expect(trial.deps.runReal).toHaveBeenCalledTimes(2);
    expect(trial.writeReport).not.toHaveBeenCalled();
  });

  it('模型调用失败的运行作废并留痕；全部作废时退出码为 1', async () => {
    const failing = makeDeps({
      runReal: vi.fn(async () => {
        throw new Error('上游 500');
      }),
    });
    expect(await runCli(['--confirm-real-run', '--cases', 'single-01', '--runs', '1'], failing.deps)).toBe(1);
  });

  it('未知参数与未知用例 ID 返回退出码 2', async () => {
    const { deps } = makeDeps();
    expect(parseArgs(['--nope']).ok).toBe(false);
    expect(await runCli(['--dry-run', '--cases', 'no-such-case'], deps)).toBe(2);
  });
});

describe('[TC14-5] 评测脚本不进入常规测试与构建管线', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const readJson = (path: string) => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf-8'));

  it('根与 web 的 test / test:eval / typecheck / lint 脚本都不调用 artifact-patch:eval', () => {
    const rootScripts = readJson('package.json').scripts as Record<string, string>;
    const webScripts = readJson('apps/web/package.json').scripts as Record<string, string>;
    for (const name of ['test', 'test:eval', 'typecheck', 'lint', 'build']) {
      expect(rootScripts[name] ?? '', `root ${name}`).not.toContain('artifact-patch');
      expect(webScripts[name] ?? '', `web ${name}`).not.toContain('artifact-patch');
    }
  });

  it('评测脚本只以独立命令注册，且不在 turbo 流水线里', () => {
    const rootScripts = readJson('package.json').scripts as Record<string, string>;
    expect(rootScripts['artifact-patch:eval']).toContain('eval-artifact-patch.mts');
    const turbo = readFileSync(resolve(repoRoot, 'turbo.json'), 'utf-8');
    expect(turbo).not.toContain('artifact-patch');
  });
});
