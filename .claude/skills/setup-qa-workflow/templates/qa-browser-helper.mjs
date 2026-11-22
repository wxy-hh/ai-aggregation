/**
 * QA 阶段 5 浏览器验收的仓库级薄辅助模块。
 *
 * 只封装跨特性通用机制，不封装任何业务路由或页面选择器：
 * - `resolveRepoRoot()`：从模块自身位置解析仓库根，摆脱 `ego-browser nodejs` 的 `cwd=/` 与不继承环境变量；
 * - `acquireQaPage()`：按 TaskSpace ownership 接管或新建页面；
 * - `createMarker()`：统一的 `[TCxx-n] PASS 实测：<值>` / `FAIL <原因>` 标记与退出码；
 * - `captureTargetGeometry()`：显式目标经几何硬断言后按同一矩形裁剪截图；
 * - `captureMobileGeometry()`：在显式目标截图外增加移动视口设置与复位。
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
 * 显式视觉目标：probe 与截图共用 target，硬断言成功后按目标矩形裁剪。
 * @param {object} page 支持 evaluate(probe, target) 与 screenshot({ path, clip }) 的页面
 * @param {{ target: string, screenshotPath: string, probe: Function, assert: Function }} options
 */
export async function captureTargetGeometry(page, {
  target,
  screenshotPath,
  probe,
  assert: verify,
}) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('必须提供非空视觉目标');
  if (typeof probe !== 'function') throw new TypeError('必须提供视觉目标 probe');
  if (typeof verify !== 'function') throw new TypeError('必须提供几何硬断言');
  const geometry = await page.evaluate(probe, target);
  await verify(geometry);
  if (geometry?.target !== target) throw new Error('几何目标与截图目标不一致');
  const clip = geometry.rect;
  if (![clip?.x, clip?.y, clip?.width, clip?.height].every(Number.isFinite)
    || clip.width <= 0 || clip.height <= 0) {
    throw new Error('视觉目标矩形无效');
  }
  await page.screenshot({ path: screenshotPath, clip });
  return geometry;
}

/**
 * 移动视口几何截图：按能力探测兼容 ego-browser（CDP）与 Playwright（setViewportSize）→ 显式目标几何断言与截图 → 复位视口。
 * @param {object} page 浏览器页面
 * @param {{ target: string, screenshotPath: string, width?: number, height?: number, probe: Function, assert: Function }} options
 */
export async function captureMobileGeometry(page, {
  target,
  screenshotPath,
  width = 375,
  height = 667,
  probe,
  assert: verify,
}) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('必须提供非空视觉目标');
  if (typeof probe !== 'function') throw new TypeError('必须提供视觉目标 probe');
  if (typeof verify !== 'function') throw new TypeError('必须提供几何硬断言');
  if (typeof page?.cdp === 'function') {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
    });
    try {
      return await captureTargetGeometry(page, { target, screenshotPath, probe, assert: verify });
    } finally {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width: 0,
        height: 0,
        deviceScaleFactor: 0,
        mobile: false,
      });
    }
  }
  if (typeof page?.setViewportSize === 'function') {
    const previousViewport = typeof page.viewportSize === 'function' ? page.viewportSize() : null;
    await page.setViewportSize({ width, height });
    try {
      return await captureTargetGeometry(page, { target, screenshotPath, probe, assert: verify });
    } finally {
      if (previousViewport && Number.isFinite(previousViewport.width) && Number.isFinite(previousViewport.height)) {
        await page.setViewportSize(previousViewport);
      }
    }
  }
  throw new TypeError('页面对象既不支持 page.cdp 也不支持 page.setViewportSize，无法切换移动视口');
}
