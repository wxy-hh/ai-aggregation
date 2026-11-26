/**
 * QA 阶段 5 浏览器验收的仓库级薄辅助模块。
 *
 * 只封装跨特性通用机制，不封装任何业务路由或页面选择器：
 * - `resolveRepoRoot()`：从模块自身位置解析仓库根，摆脱 `ego-browser nodejs` 的 `cwd=/` 与不继承环境变量；
 * - `resolveBaseUrl()`：优先使用 `QA_WEB_URL`，否则通过 dev-port 实测地址；
 * - `acquireQaPage()`：按 TaskSpace ownership 接管或新建页面；
 * - `createMarker()` / `assertNoRateLimit()`：统一断言标记、退出码与 429 限流拦截；
 * - `captureTargetGeometry()`：硬断言后优先元素 `locator.screenshot()`，失败才按实际 DPR 退化裁剪视口；
 * - `captureMobileGeometry()`：在显式目标截图外增加移动视口设置与复位。
 * - 精确 390px 且含真实点击时优先原生 Playwright；仅复用桌面登录态时使用 ego-browser。
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

/** 仓库根绝对路径；不依赖 process.cwd() */
export function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('协议必须是 http 或 https');
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    throw new Error(`QA_WEB_URL 非法：${error.message}`);
  }
}

/** 优先读取 QA_WEB_URL，否则通过 dev-port 的实际探活结果解析地址 */
export async function resolveBaseUrl({ root = resolveRepoRoot(), env = process.env } = {}) {
  if (env.QA_WEB_URL) return normalizeBaseUrl(env.QA_WEB_URL);
  const result = spawnSync(process.execPath, [path.join(root, 'tooling/scripts/dev-port.mjs'), '--probe'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const matched = result.stdout?.match(/^WEB_URL=(.+)$/m)?.[1];
  if (result.error || result.status !== 0 || !matched) {
    throw new Error(`开发服务探活失败：${output || result.error?.message || '未返回 WEB_URL'}`);
  }
  return normalizeBaseUrl(matched);
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
    async assertNoRateLimit(page, { response = null } = {}) {
      const status = typeof response?.status === 'function' ? response.status() : response?.status;
      const body = typeof page?.evaluate === 'function'
        ? await page.evaluate(() => document.body?.innerText ?? '')
        : '';
      if (status !== 429 && !String(body).includes('请求过于频繁')) return;
      failed = true;
      const reason = status === 429 ? 'HTTP 429 限流' : '页面显示「请求过于频繁」';
      console.error(`[${tcId}] FAIL ${reason}；停止验收，不得关闭生产限流或注入假响应。`);
      throw new Error(reason);
    },
    finish() {
      setTimeout(() => process.exit(failed ? 1 : 0), 100);
    },
    get failed() {
      return failed;
    },
  };
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

/** 解码非隔行、8 位 RGBA PNG，返回未滤波的逐像素字节 */
export function decodePngRgba(input) {
  const png = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG 签名无效');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > png.length) throw new Error('PNG 数据块不完整');
    const data = png.subarray(start, end);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') idat.push(data);
    offset = end + 4;
    if (type === 'IEND') break;
  }
  if (!header || header.length !== 13 || !idat.length) throw new Error('PNG 缺少 IHDR 或 IDAT');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = header[9] === 6 ? 4 : header[9] === 2 ? 3 : 0;
  if (header[8] !== 8 || !channels) throw new Error('仅支持 8 位 RGB/RGBA PNG');
  if (header[10] !== 0 || header[11] !== 0 || header[12] !== 0) throw new Error('仅支持非隔行的标准压缩 PNG');
  if (!width || !height) throw new Error('PNG 尺寸无效');
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw new Error(`PNG IDAT 解压失败：${error.message}`);
  }
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('PNG 像素数据长度不匹配');
  const filtered = Buffer.alloc(stride * height);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[cursor];
      cursor += 1;
      const left = x >= channels ? filtered[rowStart + x - channels] : 0;
      const up = y > 0 ? filtered[rowStart - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? filtered[rowStart - stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`PNG 不支持的行过滤器：${filter}`);
      filtered[rowStart + x] = (encoded + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, pixels: filtered };
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = filtered[index * 3];
    pixels[index * 4 + 1] = filtered[index * 3 + 1];
    pixels[index * 4 + 2] = filtered[index * 3 + 2];
    pixels[index * 4 + 3] = 255;
  }
  return { width, height, pixels };
}

function encodePngRgba({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 按 CSS 矩形与 DPR 从完整视口 PNG 裁出同一目标区域 */
export function cropPngViewport(input, rect, { deviceScaleFactor = 1 } = {}) {
  if (![rect?.x, rect?.y, rect?.width, rect?.height, deviceScaleFactor].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || deviceScaleFactor <= 0) {
    throw new Error('PNG 裁剪矩形或 DPR 无效');
  }
  const source = decodePngRgba(input);
  const x = Math.round(rect.x * deviceScaleFactor);
  const y = Math.round(rect.y * deviceScaleFactor);
  const width = Math.round(rect.width * deviceScaleFactor);
  const height = Math.round(rect.height * deviceScaleFactor);
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > source.width || y + height > source.height) {
    throw new Error(`PNG 裁剪区域越界：目标 ${width}×${height}+${x}+${y}，视口 ${source.width}×${source.height}`);
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    source.pixels.copy(pixels, row * width * 4, start, start + width * 4);
  }
  return encodePngRgba({ width, height, pixels });
}

/** 校验目标 PNG 的尺寸、非透明像素方差与可选像素哈希 */
export function assertValidTargetPng(input, { width, height, expectedPixelHash } = {}) {
  const decoded = decodePngRgba(input);
  if ((width !== undefined && decoded.width !== width) || (height !== undefined && decoded.height !== height)) {
    throw new Error(`目标 PNG 尺寸不匹配：实测 ${decoded.width}×${decoded.height}，预期 ${width}×${height}`);
  }
  let count = 0;
  let sum = 0;
  let squaredSum = 0;
  for (let index = 0; index < decoded.pixels.length; index += 4) {
    if (decoded.pixels[index + 3] === 0) continue;
    const luminance = (decoded.pixels[index] * 299 + decoded.pixels[index + 1] * 587 + decoded.pixels[index + 2] * 114) / 1000;
    count += 1;
    sum += luminance;
    squaredSum += luminance * luminance;
  }
  const variance = count ? squaredSum / count - (sum / count) ** 2 : 0;
  if (!count || variance <= 0) throw new Error('目标 PNG 空白：非透明像素方差必须大于零');
  const pixelHash = createHash('sha256').update(decoded.pixels).digest('hex');
  if (expectedPixelHash && pixelHash !== expectedPixelHash) throw new Error('目标像素内容不匹配，疑似截到错误目标');
  return { width: decoded.width, height: decoded.height, nonTransparentPixels: count, variance, pixelHash };
}

/**
 * 显式视觉目标：probe 与截图共用 target，硬断言成功后按同一目标截图。
 * @param {object} page 支持元素截图或完整视口截图的页面
 * @param {{ target: string, screenshotPath: string, probe: Function, assert: Function, preclean?: Function, deviceScaleFactor?: number }} options
 */
export async function captureTargetGeometry(page, {
  target,
  screenshotPath,
  probe,
  assert: verify,
  preclean,
  deviceScaleFactor = null,
}) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('必须提供非空视觉目标');
  if (typeof probe !== 'function') throw new TypeError('必须提供视觉目标 probe');
  if (typeof verify !== 'function') throw new TypeError('必须提供几何硬断言');
  if (typeof page?.keyboard?.press === 'function') await page.keyboard.press('Escape');
  if (typeof preclean === 'function') await preclean(page);
  const geometry = await page.evaluate(probe, target);
  await verify(geometry);
  if (geometry?.target !== target) throw new Error('几何目标与截图目标不一致');
  const rect = geometry.rect;
  if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) {
    throw new Error('视觉目标矩形无效');
  }
  if (typeof page?.locator === 'function') {
    try {
      await page.locator(target).screenshot({ path: screenshotPath });
      return geometry;
    } catch {
      // 元素截图不可用时退化为完整视口截图后的本地裁剪
    }
  }
  await page.screenshot({ path: screenshotPath });
  const viewport = await readFile(screenshotPath);
  const cssWidth = typeof page.viewportSize === 'function' ? page.viewportSize()?.width : null;
  const actualScale = deviceScaleFactor ?? (cssWidth > 0 ? decodePngRgba(viewport).width / cssWidth : 1);
  await writeFile(screenshotPath, cropPngViewport(viewport, rect, { deviceScaleFactor: actualScale }));
  return geometry;
}

/**
 * 移动视口几何截图：按能力探测兼容 ego-browser（CDP）与 Playwright（setViewportSize）→ 显式目标几何断言与截图 → 复位视口。
 * @param {object} page 浏览器页面
 * @param {{ target: string, screenshotPath: string, width?: number, height?: number, probe: Function, assert: Function, deviceScaleFactor?: number }} options CDP 默认 DPR=2，其他分支按实际视口位图推断
 */
export async function captureMobileGeometry(page, {
  target,
  screenshotPath,
  width = 375,
  height = 667,
  deviceScaleFactor,
  probe,
  assert: verify,
}) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('必须提供非空视觉目标');
  if (typeof probe !== 'function') throw new TypeError('必须提供视觉目标 probe');
  if (typeof verify !== 'function') throw new TypeError('必须提供几何硬断言');
  if (typeof page?.cdp === 'function') {
    const cdpScale = deviceScaleFactor ?? 2;
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: cdpScale,
      mobile: true,
    });
    try {
      return await captureTargetGeometry(page, { target, screenshotPath, probe, assert: verify, deviceScaleFactor: cdpScale });
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
      return await captureTargetGeometry(page, { target, screenshotPath, probe, assert: verify, deviceScaleFactor });
    } finally {
      if (previousViewport && Number.isFinite(previousViewport.width) && Number.isFinite(previousViewport.height)) {
        await page.setViewportSize(previousViewport);
      }
    }
  }
  throw new TypeError('页面对象既不支持 page.cdp 也不支持 page.setViewportSize，无法切换移动视口');
}
