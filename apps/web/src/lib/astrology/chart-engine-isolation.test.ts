/**
 * chart-engine-isolation.test.ts —— 客户端包隔离守卫（验收项：星历库不进客户端 bundle）
 *
 * 星历库 circular-natal-horoscope-js 及其依赖 moment / moment-timezone / tz-lookup 只能被
 * 服务端代码引用。本测试从 apps/web/src 下每个 'use client' 文件出发遍历 import 图
 * （含静态 import / export ... from / 动态 import()），一旦触达 chart-engine.ts 或星历库包名即失败，
 * 并在报错里给出完整引用链，便于定位是从哪个组件泄漏出去的。
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 只允许服务端引用的模块与包 */
const SERVER_ONLY_MODULES = ['chart-engine.ts'];
const SERVER_ONLY_PACKAGES = ['circular-natal-horoscope-js', 'moment', 'moment-timezone', 'tz-lookup'];

const IMPORT_PATTERN =
  /(?:^|[^\w$])(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function listSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) {
      files.push(full);
    }
  }
  return files;
}

function importSpecifiersOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

/** 把引用字面量解析为仓库内文件（相对路径与 @/ 别名）；包引用返回 null */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC_ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

describe('星历库隔离：客户端 import 图不得触达 chart-engine', () => {
  const allFiles = listSourceFiles(SRC_ROOT);
  const clientEntries = allFiles.filter((file) => /^['"]use client['"]/m.test(readFileSync(file, 'utf8').slice(0, 400)));

  it('至少能找到客户端组件（守卫本身有效）', () => {
    expect(clientEntries.length).toBeGreaterThan(10);
  });

  it('不存在从客户端组件到 chart-engine.ts 或星历库的引用链', () => {
    const violations: string[] = [];
    for (const entry of clientEntries) {
      const queue: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [path.relative(SRC_ROOT, entry)] }];
      const visited = new Set<string>([entry]);
      while (queue.length > 0) {
        const { file, chain } = queue.shift()!;
        const source = readFileSync(file, 'utf8');
        for (const specifier of importSpecifiersOf(source)) {
          if (SERVER_ONLY_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
            violations.push([...chain, specifier].join(' → '));
            continue;
          }
          const target = resolveSpecifier(file, specifier);
          if (!target || visited.has(target)) continue;
          const relative = path.relative(SRC_ROOT, target);
          if (SERVER_ONLY_MODULES.includes(path.basename(target))) {
            violations.push([...chain, relative].join(' → '));
            continue;
          }
          visited.add(target);
          queue.push({ file: target, chain: [...chain, relative] });
        }
      }
    }
    expect(violations, `客户端引用链：\n${violations.join('\n')}`).toEqual([]);
  });

  it('示例盘消费的是预冻结数据（不 import 计算引擎）', () => {
    const relative = 'lib/astrology/sample-chart.ts';
    const source = readFileSync(path.join(SRC_ROOT, relative), 'utf8');
    for (const specifier of importSpecifiersOf(source)) {
      expect(SERVER_ONLY_MODULES, `${relative} 不应 import ${specifier}`).not.toContain(path.basename(specifier));
      expect(SERVER_ONLY_PACKAGES, `${relative} 不应 import ${specifier}`).not.toContain(specifier);
    }
  });
});
