/**
 * QA 阶段 5 浏览器验收的仓库级薄辅助模块。
 *
 * 只封装跨特性通用机制，不封装任何业务路由或页面选择器：
 * - `resolveRepoRoot()`：从模块自身位置解析仓库根，摆脱 `ego-browser nodejs` 的 `cwd=/` 与不继承环境变量；
 * - `acquireQaPage()`：按 TaskSpace ownership 接管或新建页面；
 * - `createMarker()`：统一的 `[TCxx-n] PASS 实测：<值>` / `FAIL <原因>` 标记与退出码；
 * - `captureMobileGeometry()`：固定「设置移动视口 → 几何断言 → 截图 → 复位视口」顺序。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根绝对路径；不依赖 process.cwd() */
export function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

/**
 * 复用或新建 QA TaskSpace 的页面。
 * @param {{ listTaskSpaces: Function, taskSpace: Function, claimTaskSpace: Function, takeOverTaskSpace: Function }} api
 * @param {{ spaceName?: string, spaceId?: number }} [options]
 */
export async function acquireQaPage(api, { spaceName = 'qa-visible', spaceId } = {}) {
  const spaces = await api.listTaskSpaces();
  const entry = spaceId === undefined
    ? spaces.find((space) => space.name === spaceName)
    : spaces.find((space) => space.id === spaceId);

  let task;
  if (!entry) {
    task = await api.taskSpace(spaceName);
  } else if (entry.ownership === 'agentDelegatedToUser') {
    task = await api.takeOverTaskSpace(entry.id);
  } else if (entry.ownership === 'user') {
    task = await api.claimTaskSpace(entry.id);
  } else {
    task = await api.taskSpace(entry.id);
  }

  const pages = await task.pages();
  const page = pages[0] ?? await task.newPage();
  return { task, page };
}

/** 断言标记：PASS 必须带非空实测值，失败设置非零退出码 */
export function createMarker(tcId) {
  let failed = false;
  return {
    pass(assertion, observed) {
      const value = String(observed ?? '').trim();
      if (!value) throw new Error(`[${tcId}-${assertion}] PASS 实测值不能为空`);
      console.log(`[${tcId}-${assertion}] PASS 实测：${value}`);
    },
    fail(assertion, reason) {
      failed = true;
      console.log(`[${tcId}-${assertion}] FAIL ${String(reason ?? '未提供原因')}`);
      throw new Error(`[${tcId}-${assertion}] 断言失败`);
    },
    error(error) {
      failed = true;
      console.error(error?.stack ?? error);
    },
    finish() {
      setTimeout(() => process.exit(failed ? 1 : 0), 100);
    },
    get failed() {
      return failed;
    },
  };
}

/**
 * 移动视口几何截图：设置视口 → 几何断言 → 截图 → 复位视口。
 * @param {object} page ego-browser 页面
 * @param {{ screenshotPath: string, width?: number, height?: number, probe: Function, assert: Function }} options
 */
export async function captureMobileGeometry(page, {
  screenshotPath,
  width = 375,
  height = 667,
  probe,
  assert: verify,
}) {
  if (typeof verify !== 'function') throw new TypeError('必须提供几何硬断言');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  try {
    const geometry = await page.evaluate(probe);
    // 几何硬断言必须先于截图；断言抛错时不截图，直接复位视口
    await verify(geometry);
    await page.screenshot({ path: screenshotPath });
    return geometry;
  } finally {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 0,
      height: 0,
      deviceScaleFactor: 0,
      mobile: false,
    });
  }
}
