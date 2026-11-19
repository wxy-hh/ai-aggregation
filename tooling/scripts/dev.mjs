import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  applyWebPortConfig,
  isPortOpen,
  PROJECT_ROOT,
  resolveWebPort,
  RTASR_GATEWAY_PORT,
  WEB_PORT_RANGE,
} from './dev-port.mjs';

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
  process.env.WRANGLER_SEND_METRICS = process.env.WRANGLER_SEND_METRICS || 'false';
  logEnvStatus();
  registerCleanupHandlers();

  // 清理当前项目历史残留的孤儿进程
  // 必须先于 ensureRedis：旧 dev.mjs 退出时会顺带停掉它拥有的临时 Redis，
  // 若顺序颠倒，已通过可用性检查的 Redis 会在清理后被杀死，Worker 启动即失败
  await cleanupExistingDevProcesses();

  await ensureRedis();

  // 端口决议单点：此处选定端口并完成全链路同步，next-dev.mjs 仅透传消费
  const activeWebPort = await resolveWebPort();
  applyWebPortConfig(activeWebPort);

  await warnIfGatewayPortBusy();

  // 竞态兜底：决议后若端口被抢，Next 内置重试会静默漂移，轮询校验把静默失败变响亮
  void verifyWebPortStarted(activeWebPort);

  await runTurboDev();
}

/**
 * 加载各应用的本地共享环境变量文件
 */
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
      // 保持与 dotenv 一致：已存在的环境变量（含外部注入）不进行覆盖
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
    `共享环境加载完成：ARK_API_KEY=${process.env.ARK_API_KEY ? '已设置' : '未设置'}，REDIS_HOST=${process.env.REDIS_HOST || '127.0.0.1'}`
  );
}

/**
 * 确保 Redis 服务正常可用，若未运行则依次尝试本地服务与 Docker 容器
 */
async function ensureRedis() {
  const { host, port, url } = getRedisConfig();

  if (await isPortOpen(host, port)) {
    console.log(`Redis 已就绪: ${url}`);
    return;
  }

  if (await hasCommand('redis-server')) {
    console.log('检测到本地 redis-server，尝试为当前开发会话启动临时 Redis...');
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
  // 流式输出模式便于在控制台清晰查看各服务的交错日志
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
 * 列出本机正在运行的进程
 * 注：使用 ps 命令解析进程列表，保证在各类系统环境下稳定提取 PID 与执行命令
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

/**
 * 判断某个命令是否确属当前工程目录启动的开发进程
 */
function isProjectDevProcess(command) {
  const inProject =
    command.includes(PROJECT_ROOT) ||
    command.includes('tooling/scripts/next-dev.mjs') ||
    command.includes('tooling/scripts/dev.mjs');

  if (!inProject) {
    // 针对不包含绝对路径的 monorepo 过滤指令进行特征识别
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

/**
 * 列出当前在开发端口范围上进行监听的 PID
 * 端口范围与漂移空间同源派生（见 dev-port.mjs），lsof 区间查询一次完成
 */
async function listPidsListeningOnDevPorts() {
  const pids = new Set();

  try {
    const output = await execCapture(
      `lsof -nP -iTCP:${WEB_PORT_RANGE.start}-${WEB_PORT_RANGE.end} -iTCP:${RTASR_GATEWAY_PORT} -sTCP:LISTEN -t 2>/dev/null || true`
    );
    for (const line of output.split('\n')) {
      const pid = line.trim();
      if (pid) pids.add(pid);
    }
  } catch {
    // lsof 不可用或端口无监听时忽略
  }

  return pids;
}

/**
 * 收集确属当前工程需要清理的陈旧孤儿进程
 * 注意：非当前工程目录的外部进程不会被收集，避免暴力杀除其他正常运行的实例
 */
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

  // 针对监听端口的反查补齐，仅清理确属当前项目的孤儿子进程
  const listeningPids = await listPidsListeningOnDevPorts();
  for (const pid of listeningPids) {
    if (pid === currentPid || targets.has(pid)) continue;
    const item = byPid.get(pid);
    if (!item) continue;

    // 归属判据：argv 含项目路径，或进程工作目录位于项目内
    // （next-server 等 fork 子进程的 argv 可能只有 "next-server (vX)"，不含路径，
    //  此时以 cwd 为准，既能收回本项目孤儿，又不会误杀其他项目的同名服务）
    if (item.command.includes(PROJECT_ROOT) || (await isProcessInProject(pid))) {
      targets.set(pid, item);
    }
  }

  return [...targets.values()];
}

/**
 * 通过进程工作目录判断其是否归属于当前项目
 */
async function isProcessInProject(pid) {
  try {
    const output = await execCapture(`lsof -p ${pid} -a -d cwd -Fn 2>/dev/null || true`);
    const cwdLine = output.split('\n').find((line) => line.startsWith('n/'));
    return cwdLine ? cwdLine.slice(1).startsWith(PROJECT_ROOT) : false;
  } catch {
    return false;
  }
}

/**
 * 清理当前项目历史遗留的开发进程
 */
async function cleanupExistingDevProcesses() {
  const currentPid = String(process.pid);
  const targets = await collectDevProcessTargets(currentPid);

  if (targets.length === 0) {
    return;
  }

  console.log(`检测到 ${targets.length} 个历史残留的开发进程，准备清理...`);
  for (const { pid, command } of targets) {
    const short = command.length > 120 ? `${command.slice(0, 117)}...` : command;
    console.log(`  - 进程标识 ${pid}: ${short}`);
  }

  const pids = targets.map(({ pid }) => pid);
  await signalPids(pids, 'TERM');
  await delay(800);

  // 仍存活的孤儿进程发送强制结束信号
  const stillAlive = (await collectDevProcessTargets(currentPid)).map(({ pid }) => pid);

  if (stillAlive.length > 0) {
    console.log(`以下进程未响应终止信号，执行强制终止: ${stillAlive.join(', ')}`);
    await signalPids(stillAlive, 'KILL');
    await delay(300);
  }

  const leftovers = await collectDevProcessTargets(currentPid);
  if (leftovers.length > 0) {
    console.log(`仍有 ${leftovers.length} 个残留进程，再次清理...`);
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

/**
 * 检查 rtasr 语音网关端口可用性
 * 网关是可选子系统：被占时仅警告并说明后果边界，不阻断其余功能的开发
 */
async function warnIfGatewayPortBusy() {
  if (!(await isPortOpen('127.0.0.1', RTASR_GATEWAY_PORT))) {
    return;
  }

  console.warn(
    `⚠️  rtasr 语音网关端口 ${RTASR_GATEWAY_PORT} 被占用：语音转写功能将不可用，其余功能不受影响。`
  );
  console.warn(`   可手动检查占用进程: lsof -nP -iTCP:${RTASR_GATEWAY_PORT} -sTCP:LISTEN`);
}

/**
 * 启动后校验选定端口确实开始监听
 * 决议到 Next 实际绑定之间存在秒级窗口，若端口被抢 Next 会静默漂移（内置重试），
 * 而回调/计费配置已指向原端口——无法自动修复，因此超时时大声报警提示重启
 */
async function verifyWebPortStarted(webPort, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortOpen('127.0.0.1', webPort)) {
      return;
    }
    await delay(500);
  }

  console.warn('');
  console.warn(
    `⚠️  端口 ${webPort} 在 ${Math.round(timeoutMs / 1000)} 秒内未开始监听：Next 可能已被抢端口并静默漂移。`
  );
  console.warn('   回调/计费链路可能已断裂，建议 Ctrl+C 后重新执行 pnpm dev。');
  console.warn('');
}

function registerCleanupHandlers() {
  const handleSignal = async (signal) => {
    await cleanup(signal);
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('exit', () => {
    void cleanup('退出');
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

      reject(new Error(`${command} ${args.join(' ')} 执行失败，退出码 ${code ?? '未知'}`));
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

      reject(new Error(stderr.trim() || `${command} 执行失败，退出码 ${code ?? '未知'}`));
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
