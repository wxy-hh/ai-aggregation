// 星座寰宇设计稿截图脚本
// 用法: node shoot.mjs <页面编号或html文件名> [theme] [out名称] [宽度x高度]
// 示例: node shoot.mjs 01-entry dark            → ../01-entry-dark-desktop.png
//       node shoot.mjs 01-entry light           → ../01-entry-light-desktop.png
//       node shoot.mjs m01-entry dark x mobile  → ../m01-entry-dark-mobile.png (390x844)
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/weixiaoyu/Desktop/practice/AI-aggregation-other/ai-aggregation/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright'
);

const dir = path.dirname(fileURLToPath(import.meta.url));
const [, , pageArg, theme = 'light', mode = 'desktop'] = process.argv;

if (!pageArg) {
  console.error('用法: node shoot.mjs <页面名> [light|dark] [desktop|mobile]');
  process.exit(1);
}

const base = pageArg.replace(/\.html$/, '');
const isMobile = mode === 'mobile';
const width = isMobile ? 390 : 1600;
const height = isMobile ? 844 : 1000;
const out = path.join(dir, '..', `${base}-${theme}-${isMobile ? 'mobile' : 'desktop'}.png`);

const browser = await chromium.launch();
// 桌面稿：URL scale=2 让 1600×1000 舞台 zoom 填满 3200×2000 视口，输出 2x 静帧
// 移动稿：页面自身为 390×844 舞台，用 deviceScaleFactor 2 输出 2x 静帧
const page = await browser.newPage(
  isMobile
    ? { viewport: { width, height }, deviceScaleFactor: 2 }
    : { viewport: { width: 3200, height: 2000 }, deviceScaleFactor: 1 }
);
const scaleParam = isMobile ? '' : '&scale=2';
await page.goto(`file://${path.join(dir, base + '.html')}?theme=${theme}${scaleParam}`);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
await browser.close();
console.log('已生成:', out);
