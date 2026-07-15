import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

let cleanupInProgress = false;
let ownedRedisProcess = null;
let ownedDockerRedis = false;

const PROJECT_ROOT = process.cwd();
/** Web 首选端口 + next-dev 可能漂移到的邻近端口，以及 rtasr 网关端口 */
const DEV_PORTS = [3030, 3031, 3032, 3033, 3034, 3035, 8787];

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
    path.resolve(PROJECT_ROOT, 'apps/web/.env.local'),
    path.resolve(PROJECT_ROOT, 'apps/worker/.env.local'),
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
      // 与 dotenv 一致：已有环境变量（含 shell 注入）不被覆盖
      if (!key || process.env[key] !== undefined) continue;

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
        cwd: PROJECT_ROOT,
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
  await assertDevPortsAvailable();

  // stream 模式便于在终端直接看到 web/worker/rtasr 的交错日志，避免 TUI 吞掉告警
  await runCommand('pnpm', [
    'turbo',
    'run',
    'dev',
    '--filter=@repo/web',
    '--filter=@repo/worker',
    '--filter=@repo/worker-rtasr',
    '--ui=stream',
    '--output-logs=full',
  ]);
}

/**
 * 列出本机进程。使用 ps 而非 pgrep：
 * macOS 上 `pgrep -af` 的 -a 表示 include ancestors，且只输出 PID，
 * 旧实现用 /^(\d+)\s+(.*)$/ 解析会导致清理逻辑 100% 失效。
 */
async function listProcesses() {
  const result = await execCapture('ps -ax -o pid= -o command=');
  const processes = [];

  for (const rawLine of result.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;

    processes.push({
      pid: match[1],
      command: match[2],
    });
  }

  return processes;
}

function isProjectDevProcess(command) {
  const inProject =
    command.includes(PROJECT_ROOT) ||
    // next-dev 以相对路径启动时命令行不含绝对路径
    command.includes('tooling/scripts/next-dev.mjs') ||
    command.includes('tooling/scripts/dev.mjs');

  if (!inProject) {
    // turbo/pnpm 入口可能不带项目绝对路径，用 monorepo filter 特征识别
    if (
      command.includes('turbo run dev') &&
      command.includes('@repo/web') &&
      command.includes('@repo/worker')
    ) {
      return true;
    }
    return false;
  }

  return (
    command.includes('turbo run dev') ||
    command.includes('tooling/scripts/dev.mjs') ||
    command.includes('tooling/scripts/next-dev.mjs') ||
    command.includes('next dev') ||
    command.includes('next-server') ||
    (command.includes('tsx') && command.includes('src/index.ts')) ||
    command.includes('wrangler') ||
    command.includes('workerd')
  );
}

async function listPidsListeningOnDevPorts() {
  const pids = new Set();

  for (const port of DEV_PORTS) {
    try {
      const output = await execCapture(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null || true`);
      for (const line of output.split('\n')) {
        const pid = line.trim();
        if (pid) pids.add(pid);
      }
    } catch {
      // lsof 不可用或端口无监听时忽略
    }
  }

  return pids;
}

async function collectDevProcessTargets(currentPid) {
  const processes = await listProcesses();
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const targets = new Map();

  for (const item of processes) {
    if (item.pid === currentPid) continue;
    if (isProjectDevProcess(item.command)) {
      targets.set(item.pid, item);
    }
  }

  // next-server 命令行通常不含项目路径，通过开发端口反查补齐
  const listeningPids = await listPidsListeningOnDevPorts();
  for (const pid of listeningPids) {
    if (pid === currentPid || targets.has(pid)) continue;
    const item = byPid.get(pid);
    if (!item) continue;

    const command = item.command;
    if (
      command.includes('next') ||
      command.includes('workerd') ||
      command.includes('wrangler') ||
      command.includes(PROJECT_ROOT)
    ) {
      targets.set(pid, item);
    }
  }

  return [...targets.values()];
}

async function cleanupExistingDevProcesses() {
  const currentPid = String(process.pid);
  const targets = await collectDevProcessTargets(currentPid);

  if (targets.length === 0) {
    return;
  }

  console.log(`检测到 ${targets.length} 个旧的开发进程，准备清理...`);
  for (const { pid, command } of targets) {
    const short = command.length > 120 ? `${command.slice(0, 117)}...` : command;
    console.log(`  - PID ${pid}: ${short}`);
  }

  const pids = targets.map(({ pid }) => pid);
  await signalPids(pids, 'TERM');
  await delay(800);

  // 仍存活的进程再强杀，避免 next/worker/workerd 成为孤儿继续占端口
  const stillAlive = (await collectDevProcessTargets(currentPid)).map(({ pid }) => pid);

  if (stillAlive.length > 0) {
    console.log(`以下进程未响应 SIGTERM，改为 SIGKILL: ${stillAlive.join(', ')}`);
    await signalPids(stillAlive, 'KILL');
    await delay(300);
  }

  const leftovers = await collectDevProcessTargets(currentPid);
  if (leftovers.length > 0) {
    console.log(`仍有 ${leftovers.length} 个残留开发进程，再次清理...`);
    await signalPids(
      leftovers.map(({ pid }) => pid),
      'KILL'
    );
    await delay(300);
  }
}

async function signalPids(pids, signal) {
  if (pids.length === 0) return;

  const flag = signal === 'KILL' ? '-KILL' : '-TERM';
  await runCommand('kill', [flag, ...pids], { allowNonZeroExit: true });
}

async function assertDevPortsAvailable() {
  const criticalPorts = [3030, 8787];
  const busy = [];

  for (const port of criticalPorts) {
    if (await isPortOpen('127.0.0.1', port)) {
      busy.push(port);
    }
  }

  if (busy.length === 0) {
    return;
  }

  console.warn(
    `警告：关键开发端口仍被占用（${busy.join(', ')}）。next-dev 可能会自动换端口，导致与 worker-rtasr 的 BILLING_API_URL 不一致。`
  );
  console.warn('可手动检查: lsof -nP -iTCP:3030,8787 -sTCP:LISTEN');
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
    // 避免连接挂起导致启动卡住
    socket.setTimeout(500);

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
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
      cwd: PROJECT_ROOT,
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
      cwd: PROJECT_ROOT,
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
