import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

let cleanupInProgress = false;
let ownedRedisProcess = null;
let ownedDockerRedis = false;

function getRedisConfig() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || '6379');

  return {
    host,
    port,
    url: `redis://${host}:${port}`,
  };
}

async function main() {
  console.log('启动本地开发环境...');
  loadSharedEnv();
  logEnvStatus();
  await ensureRedis();
  registerCleanupHandlers();
  await runTurboDev();
}

function loadSharedEnv() {
  const envFiles = [
    path.resolve(process.cwd(), 'apps/web/.env.local'),
    path.resolve(process.cwd(), 'apps/worker/.env.local'),
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
      if (!key) continue;

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

function logEnvStatus() {
  console.log(
    `共享环境加载完成：ARK_API_KEY=${process.env.ARK_API_KEY ? 'SET' : 'UNSET'}，REDIS_HOST=${process.env.REDIS_HOST || '127.0.0.1'}`
  );
}

async function ensureRedis() {
  const { host, port, url } = getRedisConfig();

  if (await isPortOpen(host, port)) {
    console.log(`Redis 已就绪: ${url}`);
    return;
  }

  if (await hasCommand('redis-server')) {
    console.log('检测到本地 redis-server，尝试为当前 pnpm dev 会话启动临时 Redis...');
    ownedRedisProcess = spawn(
      'redis-server',
      [
        '--port',
        String(port),
        '--bind',
        host,
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      {
        stdio: 'inherit',
        env: process.env,
        cwd: process.cwd(),
      }
    );

    const exitedEarly = await Promise.race([
      waitForRedis().then((ready) => !ready),
      onceExit(ownedRedisProcess).then(() => true),
    ]);

    if (!exitedEarly && (await isPortOpen(host, port))) {
      console.log(`临时 Redis 启动完成: ${url}`);
      return;
    }
    if (ownedRedisProcess?.pid) {
      ownedRedisProcess.kill('SIGTERM');
    }
    ownedRedisProcess = null;
  }

  if (await hasCommand('brew')) {
    const hasRedisFormula = await hasBrewFormula('redis');
    if (hasRedisFormula) {
      console.log('检测到 Homebrew 已安装 Redis，但未找到可执行启动结果，继续尝试其他方式...');
    }
  }

  if (!(await hasCommand('docker'))) {
    throw new Error(
      `Redis 未运行，且当前环境没有可用的 Docker。请先安装并启动本地 Redis，或安装 Docker 后再执行 pnpm dev。`
    );
  }

  console.log('Redis 未运行，尝试通过 docker compose 启动 redis 服务...');
  await runCommand('docker', ['compose', '-f', 'infra/docker/docker-compose.yml', 'up', '-d', 'redis']);
  ownedDockerRedis = true;

  if (await waitForRedis()) {
    console.log(`Docker Redis 启动完成: ${url}`);
    return;
  }

  throw new Error('Redis 启动超时，请检查 docker compose 与 redis 容器状态。');
}

async function runTurboDev() {
  await cleanupExistingDevProcesses();
  await runCommand('pnpm', [
    'turbo',
    'run',
    'dev',
    '--filter=@repo/web',
    '--filter=@repo/worker',
    '--filter=@repo/worker-rtasr',
    '--output-logs=full',
  ]);
}

async function cleanupExistingDevProcesses() {
  const currentPid = process.pid;
  const result = await execCapture(
    `pgrep -af "turbo run dev --filter=@repo/web --filter=@repo/worker --filter=@repo/worker-rtasr|turbo run dev --filter=@repo/web --filter=@repo/worker|tsx.*src/index.ts|wrangler dev" || true`
  );
  const lines = result
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes(` ${currentPid} `) && !line.startsWith(`${currentPid} `));

  if (lines.length === 0) {
    return;
  }

  console.log('检测到旧的开发进程，准备清理...');

  const turboPids = [];
  const workerPids = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;

    const pid = match[1];
    const command = match[2];

    if (
      command.includes(
        'turbo run dev --filter=@repo/web --filter=@repo/worker --filter=@repo/worker-rtasr'
      ) ||
      command.includes('turbo run dev --filter=@repo/web --filter=@repo/worker')
    ) {
      turboPids.push(pid);
      continue;
    }

    if (
      (command.includes('tsx') && command.includes('src/index.ts')) ||
      command.includes('wrangler dev')
    ) {
      workerPids.push(pid);
    }
  }

  if (turboPids.length > 0) {
    console.log(`清理旧 turbo 进程: ${turboPids.join(', ')}`);
    await runCommand('kill', ['-TERM', ...turboPids], { allowNonZeroExit: true });
  }

  if (workerPids.length > 0) {
    console.log(`清理旧 worker 进程: ${workerPids.join(', ')}`);
    await runCommand('kill', ['-TERM', ...workerPids], { allowNonZeroExit: true });
  }

  await delay(500);
}

function registerCleanupHandlers() {
  const handleSignal = async (signal) => {
    await cleanup(signal);
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('exit', () => {
    void cleanup('exit');
  });
}

async function cleanup(reason) {
  if (cleanupInProgress) return;
  cleanupInProgress = true;

  try {
    if (ownedRedisProcess && !ownedRedisProcess.killed) {
      console.log(`准备关闭当前会话临时 Redis（原因: ${reason}）...`);
      ownedRedisProcess.kill('SIGTERM');
      await Promise.race([onceExit(ownedRedisProcess), delay(2000)]);
      ownedRedisProcess = null;
    }

    if (ownedDockerRedis) {
      console.log(`准备停止当前会话拉起的 Docker Redis（原因: ${reason}）...`);
      try {
        await runCommand('docker', [
          'compose',
          '-f',
          'infra/docker/docker-compose.yml',
          'stop',
          'redis',
        ]);
      } catch {
        // 退出清理阶段忽略停止失败
      }
      ownedDockerRedis = false;
    }
  } finally {
    cleanupInProgress = false;
  }
}

async function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function hasCommand(command) {
  try {
    await runCommand('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function hasBrewFormula(name) {
  try {
    await runCommand('brew', ['list', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForRedis() {
  const { host, port } = getRedisConfig();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortOpen(host, port)) {
      return true;
    }
    await delay(500);
  }

  return false;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { allowNonZeroExit = false, ...spawnOptions } = options;
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
      ...spawnOptions,
    });

    child.on('exit', (code) => {
      if (code === 0 || allowNonZeroExit) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} 执行失败，退出码 ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

async function execCapture(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      env: process.env,
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `${command} 执行失败，退出码 ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

function onceExit(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
