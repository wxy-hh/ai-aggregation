import net from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';

const PREFERRED_PORT = Number(process.env.PORT || process.env.WEB_PORT || 3030);

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    // 仅绑定本机回环，与 Next 默认监听行为一致，避免误判
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort, maxAttempts = 20) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(
    `从端口 ${startPort} 起连续 ${maxAttempts} 个端口均被占用，无法启动 Next.js 开发服务器`
  );
}

const port = await findAvailablePort(PREFERRED_PORT);

if (port !== PREFERRED_PORT) {
  console.warn('');
  console.warn(`⚠️  首选端口 ${PREFERRED_PORT} 已被占用，自动改用 ${port}`);
  console.warn('   这通常表示旧的 next/dev 进程没有被清理干净。');
  console.warn(`   请检查: lsof -nP -iTCP:${PREFERRED_PORT} -sTCP:LISTEN`);
  console.warn('   worker-rtasr 的 BILLING_API_URL 默认仍指向 http://localhost:3030，');
  console.warn('   换端口后计费/回调整体链路可能异常。');
  console.warn('');
}

// 不使用 shell:true，避免 Node DEP0190，并防止参数拼接注入风险
const child = spawn('next', ['dev', '-p', String(port)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
  },
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
