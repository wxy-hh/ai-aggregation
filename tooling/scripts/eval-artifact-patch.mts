/**
 * 章节补丁离线评测入口 (artifact-patch:eval)
 *
 * 参照 rag:eval 的形式：根目录 package.json 以 tsx 运行本文件。
 * 逻辑全部在 apps/web/src/eval/artifact-patch/（可单测），这里只做环境加载与依赖装配。
 *
 * 干跑（不调用模型，不需要任何密钥）：pnpm artifact-patch:eval --dry-run
 * 真实运行（消耗账户额度，须用户确认）：pnpm artifact-patch:eval --confirm-real-run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** 读取 .env.local（仅补齐未设置的变量，不打印取值） */
function loadEnv(): void {
  const cwd = process.cwd();
  for (const envPath of [resolve(cwd, 'apps/web/.env.local'), resolve(cwd, '.env.local')]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  // 干跑与参数错误不需要密钥；只有真实运行才加载环境变量
  if (argv.includes('--confirm-real-run')) loadEnv();

  const { runCli } = await import('../../apps/web/src/eval/artifact-patch/cli');
  const { runRealOnce, simulateModelEvents, EVAL_PROVIDER, EVAL_MODEL } = await import(
    '../../apps/web/src/eval/artifact-patch/runner'
  );

  return runCli(argv, {
    runReal: runRealOnce,
    simulate: simulateModelEvents,
    writeReport: (path, content) => {
      const target = resolve(process.cwd(), path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf-8');
    },
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    now: () => new Date(),
    model: { provider: EVAL_PROVIDER, model: EVAL_MODEL },
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('评测执行失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
