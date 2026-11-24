import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('TC10: 旧 RAG 评测入口收敛与旧资产退役 (LegacyEvalConvergence)', () => {
  const legacyScriptPath = path.resolve(__dirname, '../../../tooling/scripts/eval-rag.mts');
  const rootPackageJsonPath = path.resolve(__dirname, '../../../package.json');

  it('TC10-1: 运行旧脚本包含废弃声明并底层委托新评测引擎', () => {
    const content = fs.readFileSync(legacyScriptPath, 'utf-8');
    expect(content).toContain('@deprecated');
    expect(content).toContain('pnpm eval:agent');
    expect(content).toContain('runDryRunBenchmark');
  });

  it('TC10-2: 旧脚本中模板伪造 100% 准确率与硬编码假数据结论已彻底清除', () => {
    const content = fs.readFileSync(legacyScriptPath, 'utf-8');
    // 不能包含写死 100% 假数据结论
    expect(content).not.toContain('引用准确率: 100.0%');
    expect(content).not.toContain('恶意注入拦截率: 100.0%');
  });

  it('TC10-3: package.json 快捷命令映射至统一评测中枢', () => {
    const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'));
    expect(pkg.scripts['rag:eval']).toBeDefined();
    // 映射到新评测工具链或委托新引擎
    expect(pkg.scripts['rag:eval']).toContain('eval-rag.mts');
    expect(pkg.scripts['eval:agent']).toBeDefined();
  });
});
