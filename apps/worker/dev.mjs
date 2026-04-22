import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function loadSharedEnv() {
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const envFiles = [
    path.join(rootDir, 'apps/web/.env.local'),
    path.join(rootDir, 'apps/worker/.env.local'),
  ];

  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

function run(command, args) {
  const child = spawn(command, args, {
    cwd: import.meta.dirname,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

loadSharedEnv();
console.log(
  `Worker 共享环境加载完成：ARK_API_KEY=${process.env.ARK_API_KEY ? 'SET' : 'UNSET'}，REDIS_HOST=${process.env.REDIS_HOST || '127.0.0.1'}`
);

const mode = process.argv[2] || 'dev';

if (mode === 'start') {
  run('node', ['dist/index.js']);
} else {
  run('tsx', ['watch', 'src/index.ts']);
}
