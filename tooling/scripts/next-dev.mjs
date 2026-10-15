import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyWebPortConfig, resolveWebPort } from './dev-port.mjs';

/**
 * Next.js 开发服务器启动器
 *
 * 端口决议是单点的（见 dev-port.mjs）：
 * - 父进程（dev.mjs）已注入 PORT / WEB_PORT 时，直接信任并透传，不再重复探测；
 *   若注入端口在绑定前被抢，Next 内置重试会兜底，dev.mjs 侧的启动后校验负责报警
 * - 无注入时（如 pnpm dev:web 独立运行），自行决议端口并完成同样的全链路同步
 */
const injectedPort = process.env.PORT || process.env.WEB_PORT;

let port;
if (injectedPort) {
  port = Number(injectedPort);
} else {
  port = await resolveWebPort();
  applyWebPortConfig(port);
}

// 自动定位 Next.js 可执行文件路径，兼容独立运行或子进程运行场景
const webBinPath = path.resolve(import.meta.dirname, '../../apps/web/node_modules/.bin/next');
const nextCommand = fs.existsSync(webBinPath) ? webBinPath : 'next';

// 确保执行环境中包含 node_modules/.bin 路径
const extraBinDirs = [
  path.resolve(import.meta.dirname, '../../apps/web/node_modules/.bin'),
  path.resolve(import.meta.dirname, '../../node_modules/.bin'),
];
const updatedPath = [...extraBinDirs, process.env.PATH || ''].join(path.delimiter);

// 不使用 shell:true，避免 Node 警告并防止参数注入安全隐患
const child = spawn(nextCommand, ['dev', '-p', String(port)], {
  stdio: 'inherit',
  cwd: path.resolve(import.meta.dirname, '../../apps/web'),
  env: {
    ...process.env,
    PATH: updatedPath,
    PORT: String(port),
    WEB_PORT: String(port),
  },
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
