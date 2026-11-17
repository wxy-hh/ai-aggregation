import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 开发端口决议共享模块
 *
 * 端口治理的单一事实来源，被 dev.mjs（pnpm dev）与 next-dev.mjs（pnpm dev:web）共用。
 * 核心规则：谁决议端口，谁负责同步——调用 resolveWebPort 选定端口后，
 * 必须紧跟 applyWebPortConfig 完成环境变量分发与微服务配置同步。
 */

/** 仓库根目录（由本文件位置派生，与调用方的 cwd 无关） */
export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

/** Web 首选端口与最大漂移探测次数——漂移空间与清理范围均从这两个常量派生 */
export const PREFERRED_WEB_PORT = 3030;
export const MAX_PORT_ATTEMPTS = 30;

/** rtasr 语音网关端口（固定，不随 Web 漂移） */
export const RTASR_GATEWAY_PORT = 8787;

/** Web 端口漂移空间闭区间 [start, end] */
export const WEB_PORT_RANGE = {
  start: PREFERRED_WEB_PORT,
  end: PREFERRED_WEB_PORT + MAX_PORT_ATTEMPTS - 1,
};

/**
 * 检测指定端口是否有服务在监听（TCP 可连通）
 * @param {string} host 主机地址
 * @param {number} port 端口号
 * @param {number} timeoutMs 超时毫秒数，避免连接挂起导致流程卡顿
 * @returns {Promise<boolean>} 是否有服务监听
 */
export async function isPortOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);

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

/**
 * 检测指定端口是否完全空闲可用（双重校验：连通性与服务绑定测试）
 * @param {number} port 待测试的端口
 * @returns {Promise<boolean>} 是否空闲
 */
export async function isPortFree(port) {
  if (await isPortOpen('127.0.0.1', port)) {
    return false;
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

/**
 * 探测并决议可用的 Web 端口，若首选端口被占用则自动递增
 * 外部环境变量 PORT / WEB_PORT 存在时作为探测起点，体现用户显式意图
 * @param {number} preferredPort 首选端口
 * @param {number} maxAttempts 最大探测次数
 * @returns {Promise<number>} 可用的端口
 */
export async function resolveWebPort(preferredPort = PREFERRED_WEB_PORT, maxAttempts = MAX_PORT_ATTEMPTS) {
  const basePort = Number(process.env.PORT || process.env.WEB_PORT || preferredPort);

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = basePort + offset;
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(`从端口 ${basePort} 起连续 ${maxAttempts} 个端口均被占用，无法启动开发服务器`);
}

/**
 * 将选定端口分发到环境变量并同步各微服务配置
 *
 * 变量分两类处理：
 * - 决策派生变量（PORT / WEB_PORT / BILLING_API_URL）：是端口决议的直接产物，必须始终一致
 * - 用户意图变量（NEXT_PUBLIC_APP_URL）：未设置才补默认值；已设置则尊重，
 *   与活动端口不匹配时打印警告（例如手机调试配置的局域网 IP）
 *
 * @param {number} webPort 选定的 Web 端口
 */
export function applyWebPortConfig(webPort) {
  const appUrl = `http://localhost:${webPort}`;

  process.env.PORT = String(webPort);
  process.env.WEB_PORT = String(webPort);
  process.env.BILLING_API_URL = appUrl;

  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredAppUrl === undefined) {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
  } else if (!configuredAppUrl.includes(`:${webPort}`)) {
    console.warn(
      `⚠️  NEXT_PUBLIC_APP_URL 已配置为 ${configuredAppUrl}，与活动端口 ${webPort} 不一致，按用户配置保留。`
    );
  }

  syncRtasrDevVars(webPort);

  if (webPort !== PREFERRED_WEB_PORT) {
    console.log('');
    console.log(`ℹ️  首选端口 ${PREFERRED_WEB_PORT} 已被占用，已自动切换至可用端口: ${webPort}`);
    console.log(`   Web 应用访问地址: ${appUrl}`);
    console.log(`   微服务回调地址已同步更新为: ${appUrl}`);
    console.log('');
  } else {
    console.log(`Web 应用将运行在端口: ${webPort} (${appUrl})`);
  }
}

/**
 * 同步更新 worker-rtasr 的 .dev.vars 配置文件中的回调地址
 * @param {number} webPort Web 应用端口
 */
export function syncRtasrDevVars(webPort) {
  const rtasrDevVarsPath = path.resolve(PROJECT_ROOT, 'infra/worker-rtasr/.dev.vars');
  try {
    let content = '';
    if (fs.existsSync(rtasrDevVarsPath)) {
      content = fs.readFileSync(rtasrDevVarsPath, 'utf8');
      if (/^BILLING_API_URL=.*$/m.test(content)) {
        content = content.replace(/^BILLING_API_URL=.*$/m, `BILLING_API_URL="http://localhost:${webPort}"`);
      } else {
        content = `${content.trim()}\nBILLING_API_URL="http://localhost:${webPort}"\n`;
      }
    } else {
      content = `# 本地开发自动生成的变量配置\nBILLING_API_URL="http://localhost:${webPort}"\n`;
    }
    fs.writeFileSync(rtasrDevVarsPath, content, 'utf8');
  } catch (error) {
    console.warn(`同步 worker-rtasr 环境变量配置时产生警告: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const APP_TITLE_PATTERN = /<title>[^<]*AI 聚合平台[^<]*<\/title>/;

export function isAppHtml(html) {
  return APP_TITLE_PATTERN.test(html);
}

/** 首页引用的首个 Next.js 静态 JS 脚本路径；CSS 等非脚本资源不参与判定，没有时返回 null */
export function firstStaticChunk(html) {
  const text = String(html);
  const fromScript = text.match(/<script[^>]+src=["'](\/_next\/static\/[^"']+\.js(?:\?[^"']*)?)["']/i)?.[1];
  if (fromScript) return fromScript;
  return text.match(/["'](\/_next\/static\/[^"']+\.js(?:\?[^"']*)?)["']/i)?.[1] ?? null;
}

export async function probeWebApp({
  ports = Array.from({ length: MAX_PORT_ATTEMPTS }, (_, index) => WEB_PORT_RANGE.start + index),
  path: requestPath = '/login',
  timeoutMs = 30000,
} = {}) {
  const others = [];
  for (const port of ports) {
    if (!(await isPortOpen('127.0.0.1', port))) continue;
    try {
      const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const html = await response.text();
      if (!isAppHtml(html)) {
        others.push({ port, reason: '标题不匹配' });
        continue;
      }
      // HTML 200 但静态 JS chunk 404 表示 Next.js 半死（未水合），不能判定就绪
      const chunk = firstStaticChunk(html);
      if (chunk) {
        const asset = await fetch(`http://127.0.0.1:${port}${chunk}`, {
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!asset.ok) {
          others.push({ port, reason: `静态资源不可用：${chunk}（HTTP ${asset.status}）` });
          continue;
        }
      }
      return { url: `http://localhost:${port}`, port };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      others.push({ port, reason: `请求失败：${message}` });
    }
  }
  return { url: null, others };
}

async function probeMain() {
  const args = process.argv.slice(2).filter((argument) => argument !== '--');
  let waitSeconds = 0;
  if (args[0] === '--probe') {
    for (let index = 1; index < args.length; index += 1) {
      if (args[index] === '--wait' && Number.isFinite(Number(args[index + 1])) && Number(args[index + 1]) >= 0) {
        waitSeconds = Number(args[index + 1]);
        index += 1;
      } else {
        console.error('用法: node tooling/scripts/dev-port.mjs --probe [--wait <秒>]');
        process.exitCode = 1;
        return;
      }
    }
  } else {
    console.error('用法: node tooling/scripts/dev-port.mjs --probe [--wait <秒>]');
    process.exitCode = 1;
    return;
  }

  const deadline = Date.now() + waitSeconds * 1000;
  let probed;
  do {
    probed = await probeWebApp();
    if (probed.url || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, deadline - Date.now())));
  } while (!probed.url);

  if (probed.url) {
    console.log(`WEB_URL=${probed.url}`);
    console.log(`已找到 AI 聚合平台开发服务（端口 ${probed.port}）。`);
    return;
  }
  for (const other of probed.others) {
    console.log(`端口 ${other.port}：${other.reason}；有服务但不是本应用，不要关闭该进程。`);
  }
  console.log('未找到已就绪的 AI 聚合平台开发服务。');
  console.log('请后台运行 pnpm dev:web 后执行 node tooling/scripts/dev-port.mjs --probe --wait 90');
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await probeMain();
