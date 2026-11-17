import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../dev-port.mjs', import.meta.url));

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

async function cliCopy(t, port) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dev-port-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = await readFile(SCRIPT, 'utf8');
  const copy = source
    .replace('PREFERRED_WEB_PORT = 3030', `PREFERRED_WEB_PORT = ${port}`)
    .replace('MAX_PORT_ATTEMPTS = 30', 'MAX_PORT_ATTEMPTS = 1');
  const file = path.join(dir, 'dev-port.mjs');
  await writeFile(file, copy);
  return realpath(file);
}

function execute(file, args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [file, ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(error);
        return;
      }
      resolve({ status: error?.code ?? 0, stdout, stderr });
    });
  });
}

test('TC04-1 首页标题匹配且静态 JS chunk 返回 200 时判定就绪', async (t) => {
  const port = await serve(t, (request, response) => {
    if (request.url === '/_next/static/chunks/main.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('console.log(1)');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>AI 聚合平台</title><link rel="stylesheet" href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script></head><body>应用</body></html>');
  });
  const { probeWebApp } = await import(new URL('../dev-port.mjs', import.meta.url).href);
  const result = await probeWebApp({ ports: [port], timeoutMs: 2000 });
  assert.deepEqual(result, { url: `http://localhost:${port}`, port });
});

test('TC04-2 首页标题匹配但静态 JS chunk 404 时不判定就绪', async (t) => {
  const port = await serve(t, (request, response) => {
    if (request.url === '/_next/static/chunks/main.js') {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>AI 聚合平台</title><script src="/_next/static/chunks/main.js"></script></head><body>半死</body></html>');
  });
  const { probeWebApp } = await import(new URL('../dev-port.mjs', import.meta.url).href);
  const result = await probeWebApp({ ports: [port], timeoutMs: 2000 });
  assert.equal(result.url, null);
  assert.match(result.others[0]?.reason ?? '', /静态资源不可用.*404/);
});

test('TC04-3 首页不含静态 chunk 引用时保持向后兼容', async (t) => {
  const port = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>AI 聚合平台</title></head><body>极简页面</body></html>');
  });
  const { probeWebApp } = await import(new URL('../dev-port.mjs', import.meta.url).href);
  const result = await probeWebApp({ ports: [port], timeoutMs: 2000 });
  assert.deepEqual(result, { url: `http://localhost:${port}`, port });
});

test('探活按给定端口跟随重定向并识别本应用标题（TC10）', async (t) => {
  const otherPort = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<title>其他服务</title>');
  });
  let requestedPath = '';
  const appPort = await serve(t, (request, response) => {
    requestedPath = request.url;
    if (request.url === '/login') {
      response.writeHead(302, { location: '/session' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>登录 - AI 聚合平台</title></head><body>应用</body></html>');
  });
  const { probeWebApp, isAppHtml, APP_TITLE_PATTERN } = await import(new URL('../dev-port.mjs', import.meta.url).href);

  const found = await probeWebApp({ ports: [otherPort, appPort], timeoutMs: 2000 });
  assert.deepEqual(found, { url: `http://localhost:${appPort}`, port: appPort });
  assert.equal(requestedPath, '/session');
  assert.equal(isAppHtml('<title>AI 聚合平台管理台</title>'), true);
  assert.equal(isAppHtml('<title>其他应用</title>'), false);
  assert.equal(APP_TITLE_PATTERN.source, '<title>[^<]*AI 聚合平台[^<]*<\\/title>');
});

test('只有其他服务时返回标题不匹配原因（TC10）', async (t) => {
  const port = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<title>不是本应用</title>');
  });
  const { probeWebApp } = await import(new URL('../dev-port.mjs', import.meta.url).href);
  const result = await probeWebApp({ ports: [port], timeoutMs: 1000 });
  assert.equal(result.url, null);
  assert.deepEqual(result.others, [{ port, reason: '标题不匹配' }]);
});

test('探活 CLI 找到服务时输出 WEB_URL 并以 0 退出（TC10）', async (t) => {
  const port = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<title>AI 聚合平台</title>');
  });
  const file = await cliCopy(t, port);
  const result = await execute(file, ['--', '--probe', '--wait', '0']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`WEB_URL=http://localhost:${port}`));
  assert.match(result.stdout, /已找到/);
});

test('探活 CLI 未识别本应用时以 1 退出并给出安全下一步（TC10）', async (t) => {
  const port = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<title>占用端口的其他进程</title>');
  });
  const file = await cliCopy(t, port);
  const result = await execute(file, ['--probe', '--wait', '0']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /标题不匹配/);
  assert.match(result.stdout, /不要关闭该进程/);
  assert.match(result.stdout, /后台运行 pnpm dev:web 后执行 node tooling\/scripts\/dev-port\.mjs --probe --wait 90/);
});

test('探活 CLI 兼容任意位置的分隔符且非法参数仍报错（TC10）', async (t) => {
  const port = await serve(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<title>AI 聚合平台</title>');
  });
  const file = await cliCopy(t, port);
  const actual = await execute(file, ['--probe', '--', '--wait', '0']);
  assert.equal(actual.status, 0, actual.stderr);
  assert.match(actual.stdout, new RegExp(`WEB_URL=http://localhost:${port}`));
  const betweenWaitAndValue = await execute(file, ['--probe', '--wait', '--', '0']);
  assert.equal(betweenWaitAndValue.status, 0, betweenWaitAndValue.stderr);
  const invalid = await execute(file, ['--probe', '--', '--unknown']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /用法/);
});
