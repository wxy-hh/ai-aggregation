import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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
