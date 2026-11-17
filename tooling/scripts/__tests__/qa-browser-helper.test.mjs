import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 仓库级薄浏览器辅助模块的公开接口测试：只验证通用机制，不绑定任何业务选择器
const HELPER = new URL('../qa-browser-helper.mjs', import.meta.url);

test('TC05-1 仓库根解析不受 cwd 影响', async () => {
  const { resolveRepoRoot } = await import(HELPER.href);
  const previous = process.cwd();
  try {
    process.chdir('/');
    const root = resolveRepoRoot();
    assert.equal(
      path.resolve(root, 'tooling/scripts/qa-browser-helper.mjs'),
      fileURLToPath(HELPER),
    );
  } finally {
    process.chdir(previous);
  }
});

test('TC05-2 acquireQaPage 按 ownership 接管或新建页面', async () => {
  const { acquireQaPage } = await import(HELPER.href);
  const page = { label: 'p1' };
  const calls = [];
  const makeApi = (spaces) => ({
    listTaskSpaces: async () => spaces,
    taskSpace: async (id) => {
      calls.push(['taskSpace', id]);
      return { pages: async () => [], newPage: async () => page };
    },
    claimTaskSpace: async (id) => {
      calls.push(['claimTaskSpace', id]);
      return { pages: async () => [page], newPage: async () => page };
    },
    takeOverTaskSpace: async (id) => {
      calls.push(['takeOverTaskSpace', id]);
      return { pages: async () => [page], newPage: async () => page };
    },
  });

  const created = await acquireQaPage(makeApi([]), { spaceName: 'qa' });
  assert.deepEqual(calls.at(-1), ['taskSpace', 'qa']);
  assert.equal(created.page, page);

  calls.length = 0;
  await acquireQaPage(makeApi([{ id: 1, name: 'qa', ownership: 'user' }]), { spaceName: 'qa' });
  assert.deepEqual(calls, [['claimTaskSpace', 1]]);

  calls.length = 0;
  await acquireQaPage(makeApi([{ id: 2, name: 'qa', ownership: 'agentDelegatedToUser' }]), { spaceName: 'qa' });
  assert.deepEqual(calls, [['takeOverTaskSpace', 2]]);
});

test('TC05-3 captureMobileGeometry 先几何断言再截图后复位视口', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const log = [];
  const page = {
    cdp: async (method, params) => {
      log.push(['cdp', method, params.width]);
    },
    evaluate: async () => {
      log.push(['evaluate']);
      return { scrollWidth: 375 };
    },
    screenshot: async ({ path: target }) => {
      log.push(['screenshot', target]);
    },
  };

  const result = await captureMobileGeometry(page, {
    screenshotPath: 'shot.png',
    assert: (geometry) => assert.equal(geometry.scrollWidth, 375),
  });
  assert.deepEqual(result, { scrollWidth: 375 });
  assert.deepEqual(log.map((item) => item[0]), ['cdp', 'evaluate', 'screenshot', 'cdp']);
  assert.equal(log[0][2], 375);
  assert.equal(log[3][2], 0);

  // 几何断言失败时不截图，但仍复位视口
  const failedLog = [];
  const failingPage = {
    cdp: async (method, params) => failedLog.push(['cdp', params.width]),
    evaluate: async () => {
      failedLog.push(['evaluate']);
      return { scrollWidth: 500 };
    },
    screenshot: async () => failedLog.push(['screenshot']),
  };
  await assert.rejects(
    captureMobileGeometry(failingPage, {
      screenshotPath: 'shot.png',
      assert: (geometry) => assert.equal(geometry.scrollWidth, 375),
    }),
  );
  assert.deepEqual(failedLog.map((item) => item[0]), ['cdp', 'evaluate', 'cdp']);
  assert.equal(failedLog.at(-1)[1], 0);
});

test('TC09-1 QA 过程脚本可解析根级 Playwright 直接依赖', async () => {
  const { resolveRepoRoot } = await import(HELPER.href);
  const scriptRequire = createRequire(path.join(resolveRepoRoot(), '.scratch/feature/scripts/probe.mjs'));
  const { chromium } = scriptRequire('playwright');
  assert.equal(typeof chromium.launch, 'function');
});

test('TC09-3 几何断言必填且等待异步断言成功后才截图', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const missingAssertLog = [];
  const page = {
    cdp: async (method, params) => missingAssertLog.push(['cdp', params.width]),
    evaluate: async () => missingAssertLog.push(['evaluate']),
    screenshot: async () => missingAssertLog.push(['screenshot']),
  };
  await assert.rejects(captureMobileGeometry(page, {
    screenshotPath: 'shot.png',
    probe: () => ({ scrollWidth: 375 }),
  }), /几何硬断言/);
  assert.deepEqual(missingAssertLog, []);

  const asyncAssertLog = [];
  const asyncPage = {
    cdp: async (method, params) => asyncAssertLog.push(['cdp', params.width]),
    evaluate: async () => {
      asyncAssertLog.push(['evaluate']);
      return { scrollWidth: 500 };
    },
    screenshot: async () => asyncAssertLog.push(['screenshot']),
  };
  await assert.rejects(captureMobileGeometry(asyncPage, {
    screenshotPath: 'shot.png',
    probe: () => ({ scrollWidth: 500 }),
    assert: async (geometry) => {
      await Promise.resolve();
      assert.equal(geometry.scrollWidth, 375);
    },
  }));
  assert.deepEqual(asyncAssertLog.map((item) => item[0]), ['cdp', 'evaluate', 'cdp']);
});
