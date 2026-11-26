import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

// 仓库级薄浏览器辅助模块的公开接口测试：只验证通用机制，不绑定任何业务选择器
const HELPER = new URL('../qa-browser-helper.mjs', import.meta.url);

function geometry(target = '#target', overrides = {}) {
  return {
    target,
    rect: { x: 10, y: 20, width: 120, height: 80 },
    hit: target,
    ...overrides,
  };
}

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

test('TC03 显式目标在硬断言后按同一目标执行元素截图', async () => {
  const { captureTargetGeometry } = await import(HELPER.href);
  const calls = [];
  const page = {
    evaluate: async (probe, target) => {
      calls.push(['evaluate', target]);
      return probe(target);
    },
    locator: () => ({
      screenshot: async (options) => calls.push(['screenshot', options]),
    }),
  };
  const result = await captureTargetGeometry(page, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => geometry(target),
    assert: (value) => assert.equal(value.rect.width, 120),
  });
  assert.equal(result.target, '#target');
  assert.deepEqual(calls, [
    ['evaluate', '#target'],
    ['screenshot', { path: 'shot.png' }],
  ]);
});

test('TC03 目标不一致、矩形无效或硬断言失败均不截图', async () => {
  const { captureTargetGeometry } = await import(HELPER.href);
  for (const mode of ['mismatch', 'invalid', 'assert']) {
    const calls = [];
    const page = {
      evaluate: async () => mode === 'mismatch'
        ? geometry('#other')
        : geometry('#target', mode === 'invalid' ? { rect: { x: 0, y: 0, width: 0, height: 80 } } : {}),
      screenshot: async () => calls.push(['screenshot']),
    };
    await assert.rejects(captureTargetGeometry(page, {
      target: '#target',
      screenshotPath: 'shot.png',
      probe: () => {},
      assert: () => {
        if (mode === 'assert') throw new Error('几何未通过');
      },
    }));
    assert.deepEqual(calls, [], mode);
  }
});

test('TC03 缺少 target、probe 或 assert 时立即拒绝', async () => {
  const { captureTargetGeometry, captureMobileGeometry } = await import(HELPER.href);
  for (const options of [
    { screenshotPath: 'shot.png', probe: () => {}, assert: () => {} },
    { target: '#target', screenshotPath: 'shot.png', assert: () => {} },
    { target: '#target', screenshotPath: 'shot.png', probe: () => {} },
  ]) {
    await assert.rejects(captureTargetGeometry({}, options), /视觉目标|probe|几何硬断言/);
  }
  const calls = [];
  await assert.rejects(captureMobileGeometry({
    cdp: async () => calls.push(['cdp']),
  }, { screenshotPath: 'shot.png', probe: () => {}, assert: () => {} }), /视觉目标/);
  assert.deepEqual(calls, []);
});

test('TC05-3 移动视口复用显式目标截图并在失败后复位', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const log = [];
  const page = {
    cdp: async (method, params) => log.push(['cdp', method, params.width]),
    evaluate: async (probe, target) => {
      log.push(['evaluate', target]);
      return { ...geometry(target), scrollWidth: 375 };
    },
    locator: () => ({
      screenshot: async (options) => log.push(['screenshot', options]),
    }),
  };

  const result = await captureMobileGeometry(page, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => geometry(target),
    assert: (value) => assert.equal(value.scrollWidth, 375),
  });
  assert.equal(result.target, '#target');
  assert.deepEqual(log.map((item) => item[0]), ['cdp', 'evaluate', 'screenshot', 'cdp']);
  assert.equal(log[0][2], 375);
  assert.equal(log[1][1], '#target');
  assert.deepEqual(log[2][1], { path: 'shot.png' });
  assert.equal(log[3][2], 0);

  const failedLog = [];
  const failingPage = {
    cdp: async (method, params) => failedLog.push(['cdp', params.width]),
    evaluate: async () => {
      failedLog.push(['evaluate']);
      return { ...geometry(), scrollWidth: 500 };
    },
    screenshot: async () => failedLog.push(['screenshot']),
  };
  await assert.rejects(captureMobileGeometry(failingPage, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => geometry(target),
    assert: (value) => assert.equal(value.scrollWidth, 375),
  }));
  assert.deepEqual(failedLog.map((item) => item[0]), ['cdp', 'evaluate', 'cdp']);
  assert.equal(failedLog.at(-1)[1], 0);

  const screenshotFailureLog = [];
  const screenshotFailingPage = {
    cdp: async (method, params) => screenshotFailureLog.push(['cdp', params.width]),
    evaluate: async (probe, target) => {
      screenshotFailureLog.push(['evaluate']);
      return probe(target);
    },
    screenshot: async () => {
      screenshotFailureLog.push(['screenshot']);
      throw new Error('截图失败');
    },
  };
  await assert.rejects(captureMobileGeometry(screenshotFailingPage, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => geometry(target),
    assert: () => {},
  }), /截图失败/);
  assert.deepEqual(screenshotFailureLog.map((item) => item[0]), ['cdp', 'evaluate', 'screenshot', 'cdp']);
  assert.equal(screenshotFailureLog.at(-1)[1], 0);
});

test('TC09-1 QA 过程脚本可解析根级 Playwright 直接依赖', async () => {
  const { resolveRepoRoot } = await import(HELPER.href);
  const scriptRequire = createRequire(path.join(resolveRepoRoot(), '.scratch/feature/scripts/probe.mjs'));
  const { chromium } = scriptRequire('playwright');
  assert.equal(typeof chromium.launch, 'function');
});

test('TC08 安装模板与浏览器辅助模块保持逐字一致', async () => {
  const [tool, template] = await Promise.all([
    readFile(HELPER, 'utf8'),
    readFile(new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(tool, template);
});

test('TC09-3 几何断言必填且等待异步断言成功后才截图', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const asyncAssertLog = [];
  const asyncPage = {
    cdp: async (method, params) => asyncAssertLog.push(['cdp', params.width]),
    evaluate: async () => {
      asyncAssertLog.push(['evaluate']);
      return { ...geometry(), scrollWidth: 500 };
    },
    screenshot: async () => asyncAssertLog.push(['screenshot']),
  };
  await assert.rejects(captureMobileGeometry(asyncPage, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => geometry(target),
    assert: async (value) => {
      await Promise.resolve();
      assert.equal(value.scrollWidth, 375);
    },
  }));
  assert.deepEqual(asyncAssertLog.map((item) => item[0]), ['cdp', 'evaluate', 'cdp']);
});

test('P1-TC01-1 captureMobileGeometry 兼容仅提供 setViewportSize 的 Playwright Page 并在成功与异常时复位视口', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const events = [];
  let currentViewport = { width: 1280, height: 720 };
  const playwrightPage = {
    viewportSize: () => currentViewport,
    setViewportSize: async (size) => {
      events.push(['setViewportSize', size]);
      currentViewport = size;
    },
    evaluate: async (probe, target) => {
      events.push(['evaluate', target, currentViewport.width]);
      return probe(target);
    },
    locator: () => ({
      screenshot: async (options) => {
        events.push(['screenshot', options]);
      },
    }),
  };

  const result = await captureMobileGeometry(playwrightPage, {
    target: '#mobile-card',
    screenshotPath: 'mobile.png',
    probe: (target) => ({ ...geometry(target), scrollWidth: currentViewport.width }),
    assert: (value) => assert.equal(value.scrollWidth, 375),
  });
  assert.equal(result.target, '#mobile-card');
  assert.deepEqual(events[0], ['setViewportSize', { width: 375, height: 667 }]);
  assert.deepEqual(events[1], ['evaluate', '#mobile-card', 375]);
  assert.equal(events[2][0], 'screenshot');
  assert.deepEqual(events[3], ['setViewportSize', { width: 1280, height: 720 }]);
  assert.deepEqual(currentViewport, { width: 1280, height: 720 });

  // 断言失败时 finally 同样恢复原始视口且不截图
  const failEvents = [];
  let failViewport = { width: 1440, height: 900 };
  const failingPlaywrightPage = {
    viewportSize: () => failViewport,
    setViewportSize: async (size) => {
      failEvents.push(['setViewportSize', size]);
      failViewport = size;
    },
    evaluate: async () => {
      failEvents.push(['evaluate']);
      return { ...geometry('#mobile-card'), scrollWidth: 500 };
    },
    screenshot: async () => failEvents.push(['screenshot']),
  };
  await assert.rejects(captureMobileGeometry(failingPlaywrightPage, {
    target: '#mobile-card',
    screenshotPath: 'mobile.png',
    probe: (target) => geometry(target),
    assert: (value) => assert.equal(value.scrollWidth, 375),
  }));
  assert.deepEqual(failEvents.map((item) => item[0]), ['setViewportSize', 'evaluate', 'setViewportSize']);
  assert.deepEqual(failViewport, { width: 1440, height: 900 });

  // 截图抛错时 finally 同样恢复原始视口
  const shotFailEvents = [];
  let shotViewport = { width: 1366, height: 768 };
  const shotFailingPage = {
    viewportSize: () => shotViewport,
    setViewportSize: async (size) => {
      shotFailEvents.push(['setViewportSize', size]);
      shotViewport = size;
    },
    evaluate: async (probe, target) => {
      shotFailEvents.push(['evaluate']);
      return probe(target);
    },
    screenshot: async () => {
      shotFailEvents.push(['screenshot']);
      throw new Error('Playwright 截图失败');
    },
  };
  await assert.rejects(captureMobileGeometry(shotFailingPage, {
    target: '#mobile-card',
    screenshotPath: 'mobile.png',
    probe: (target) => geometry(target),
    assert: () => {},
  }), /Playwright 截图失败/);
  assert.deepEqual(shotFailEvents.map((item) => item[0]), ['setViewportSize', 'evaluate', 'screenshot', 'setViewportSize']);
  assert.deepEqual(shotViewport, { width: 1366, height: 768 });
});

test('P1-TC01-2 captureMobileGeometry 在缺少 cdp 与 setViewportSize 时抛 TypeError 且模板保持一致', async () => {
  const { captureMobileGeometry } = await import(HELPER.href);
  const unsupportedPage = {
    evaluate: async (probe, target) => probe(target),
    screenshot: async () => {},
  };
  await assert.rejects(
    captureMobileGeometry(unsupportedPage, {
      target: '#mobile-card',
      screenshotPath: 'mobile.png',
      probe: (target) => geometry(target),
      assert: () => {},
    }),
    (err) => err instanceof TypeError && /page\.cdp/.test(err.message) && /setViewportSize/.test(err.message),
  );
  const [tool, template] = await Promise.all([
    readFile(HELPER, 'utf8'),
    readFile(new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(tool, template);
});
