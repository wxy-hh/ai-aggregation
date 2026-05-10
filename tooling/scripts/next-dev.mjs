import net from 'node:net';
import { spawn } from 'node:child_process';

async function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.on('error', () => {
      // 端口被占用，尝试下一个
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, () => {
      server.close(() => resolve(startPort));
    });
  });
}

const port = await findAvailablePort(3030);

if (port !== 3030) {
  console.log(`端口 3030 已被占用，自动使用端口 ${port}`);
}

const child = spawn('next', ['dev', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code);
});
