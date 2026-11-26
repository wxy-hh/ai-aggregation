import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFLIGHT = fileURLToPath(new URL('../qa-preflight.mjs', import.meta.url));
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function writeDeep(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function runCli(script, cwd, args, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

async function setupRepo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-v22-phase2-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeDeep(path.join(dir, 'DESIGN.md'), [
    '## 10. 功能面设计简报',
    '',
    '| 域 | 模式 | 一句话基调 | 标志装置 |',
    '| --- | --- | --- | --- |',
    '| 对话 chat | Operate | 通透工作台 | 玻璃主壳 |',
    '',
    '## 11. 其他',
    '',
  ].join('\n'));
  await writeDeep(path.join(dir, 'apps/web/src/app/chat/page.tsx'), 'export default function ChatPage() { return null; }\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  return { dir, feature };
}

test('[v2.2-P2-TC02-1] qa-preflight 检查新独立路由的 DESIGN §10 登记', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/app/tools/page.tsx'), 'export default function ToolsPage() { return null; }\n');
  await writeFile(path.join(dir, 'apps/web/src/app/chat/page.tsx'), 'export default function ChatPage() { return <main>更新</main>; }\n');

  const warned = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(warned.status, 0, warned.stdout + warned.stderr);
  assert.match(warned.stdout, /DESIGN_ROUTE_UNREGISTERED/);
  assert.match(warned.stdout, /apps\/web\/src\/app\/tools\/page\.tsx:1/);
  assert.doesNotMatch(warned.stdout, /DESIGN_ROUTE_UNREGISTERED[^\n]*chat/);

  const strict = runCli(PREFLIGHT, dir, [feature, '--strict']);
  assert.equal(strict.status, 1, strict.stdout + strict.stderr);

  const designPath = path.join(dir, 'DESIGN.md');
  const design = await readFile(designPath, 'utf8');
  await writeFile(designPath, design.replace('| 对话 chat |', '| 工具 tools | Operate | 工具台 | 玻璃壳 |\n| 对话 chat |'));
  const registered = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(registered.status, 0, registered.stdout + registered.stderr);
  assert.doesNotMatch(registered.stdout, /DESIGN_ROUTE_UNREGISTERED/);
});

test('[v2.2-P2-TC02-2] qa-preflight 只告警新增 font var 任意值类', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/components/LegacyFont.tsx'), [
    'export function LegacyFont({ label = "旧标题" }) {',
    '  return <h2 className="font-[var(--font-heading)]">{label}</h2>;',
    '}',
    '',
  ].join('\n'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '加入存量字体用法']);
  await writeFile(path.join(dir, 'apps/web/src/components/LegacyFont.tsx'), [
    'export function LegacyFont({ label = "更新标题" }) {',
    '  return <h2 className="font-[var(--font-heading)]">{label}</h2>;',
    '}',
    '',
  ].join('\n'));
  await writeDeep(path.join(dir, 'apps/web/src/components/NewFont.tsx'), [
    'export function NewFont() {',
    '  return <h2 className="font-[var(--font-heading)]">新标题</h2>;',
    '}',
    '',
  ].join('\n'));

  const result = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ARBITRARY_FONT_VAR/);
  assert.match(result.stdout, /NewFont\.tsx:2/);
  assert.doesNotMatch(result.stdout, /ARBITRARY_FONT_VAR[^\n]*LegacyFont/);
});

test('[v2.2-P2-TC02-3] qa-preflight 告警与 surface-styles 重名的新增常量', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/lib/constants/surface-styles.ts'), [
    "export const GLASS_CARD = 'glass';",
    "export const PANEL_SURFACE = 'panel';",
    '',
  ].join('\n'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '加入共享表面样式']);
  await writeDeep(path.join(dir, 'apps/web/src/components/NewSurface.tsx'), [
    "const GLASS_CARD = 'local-override';",
    "const UNIQUE_SURFACE = 'unique';",
    'export function NewSurface() {',
    '  return <div data-style={GLASS_CARD} data-unique={UNIQUE_SURFACE} />;',
    '}',
    '',
  ].join('\n'));

  const result = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /DUPLICATE_SURFACE_CONSTANT/);
  assert.match(result.stdout, /NewSurface\.tsx:1/);
  assert.match(result.stdout, /GLASS_CARD/);
  assert.doesNotMatch(result.stdout, /DUPLICATE_SURFACE_CONSTANT[^\n]*UNIQUE_SURFACE/);
});

test('[v2.2-P2-TC02-4] qa-preflight 秒级校验三档分流列与枚举', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Kimi Code；双轴独立审查',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- |',
    '| P-M1 | 稍后修 | 基本修好 | `evidence/fix.log` | 待定 |',
    '',
  ].join('\n'));

  const invalid = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /INVALID_TRIAGE_SCHEMA/);
  assert.match(invalid.stdout, /review-report\.md:4/);
  assert.match(invalid.stdout, /INVALID_TRIAGE/);
  assert.match(invalid.stdout, /review-report\.md:6/);
  assert.match(invalid.stdout, /INVALID_DISPOSITION/);

  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Kimi Code；双轴独立审查',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| P-M1 | 本次修 | 已修 | r1 → r2 已修 | `evidence/fix.log` | |',
    '',
  ].join('\n'));
  const valid = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.doesNotMatch(valid.stdout, /INVALID_TRIAGE|INVALID_DISPOSITION/);
});

test('[v2.2-P2-TC06-1] resolveBaseUrl 使用环境变量或 dev-port 实测地址', async (t) => {
  const { resolveBaseUrl } = await import('../qa-browser-helper.mjs');
  const { dir } = await setupRepo(t);
  assert.equal(await resolveBaseUrl({ root: dir, env: { QA_WEB_URL: 'http://127.0.0.1:3901/' } }), 'http://127.0.0.1:3901');

  await writeDeep(path.join(dir, 'tooling/scripts/dev-port.mjs'), "console.log('WEB_URL=http://localhost:3902');\n");
  assert.equal(await resolveBaseUrl({ root: dir, env: {} }), 'http://localhost:3902');
  await assert.rejects(resolveBaseUrl({ root: dir, env: { QA_WEB_URL: 'not-a-url' } }), /QA_WEB_URL 非法/);

  await writeFile(path.join(dir, 'tooling/scripts/dev-port.mjs'), "console.error('探活失败'); process.exit(1);\n");
  await assert.rejects(resolveBaseUrl({ root: dir, env: {} }), /探活失败/);

  for (const file of ['tooling/scripts/qa-browser-helper.mjs', '.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs']) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /(?:localhost|127\.0\.0\.1):\d{4}/, file);
  }
});

test('[v2.2-P2-TC06-2] qa-run 在 Node 22 以下拒绝启动目标命令并记录真实版本', async (t) => {
  const { dir, feature } = await setupRepo(t);
  const marker = path.join(dir, 'target-started');
  const override = "Object.defineProperty(process.versions,'node',{value:'18.20.0'});Object.defineProperty(process,'version',{value:'v18.20.0'});";
  const oldNode = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(override)}`,
    QA_RUN, feature, 'node-too-old', '--', process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
  ], { cwd: dir, encoding: 'utf8' });
  assert.equal(oldNode.status, 1, oldNode.stdout + oldNode.stderr);
  assert.match(oldNode.stdout + oldNode.stderr, /Node\.js >=22/);
  await assert.rejects(readFile(marker, 'utf8'));

  const current = runCli(QA_RUN, dir, [feature, 'node-current', '--', process.execPath, '-e', "console.log('目标命令已执行')"]);
  assert.equal(current.status, 0, current.stdout + current.stderr);
  const log = await readFile(path.join(feature, 'evidence/node-current.log'), 'utf8');
  assert.ok(log.includes(`# node: ${process.version}\n`), log);
});

test('[v2.2-P2-TC06-3] createMarker 默认拦截 429 页面并保留正常标记', async () => {
  const { createMarker } = await import('../qa-browser-helper.mjs');
  for (const scenario of ['status', 'body']) {
    const marker = createMarker('TC06');
    const page = { evaluate: async (read) => read() };
    const response = scenario === 'status' ? { status: () => 429 } : null;
    const originalRead = page.evaluate;
    page.evaluate = async () => scenario === 'body' ? '请求过于频繁，请稍后重试' : '正常页面';
    assert.equal(typeof originalRead, 'function');
    await assert.rejects(marker.assertNoRateLimit(page, { response }), /429|请求过于频繁/);
    assert.equal(marker.failed, true);
  }

  const normal = createMarker('TC06');
  await normal.assertNoRateLimit({ evaluate: async () => '正常内容' }, { response: { status: () => 200 } });
  normal.pass('1', '页面正常');
  assert.equal(normal.failed, false);

  for (const file of ['docs/agents/qa-workflow-guide.md', 'docs/project-guide.md', 'tooling/scripts/qa-browser-helper.mjs']) {
    const content = await readFile(file, 'utf8');
    assert.match(content, /390px|390×844|width:\s*390/, file);
    assert.match(content, /Playwright/, file);
    assert.match(content, /ego-browser/, file);
  }
  const guide = await readFile('docs/agents/qa-workflow-guide.md', 'utf8');
  assert.match(guide, /串行/);
  assert.match(guide, /可清理本地 QA 夹具/);
  assert.match(guide, /不得关闭生产限流|绝不为验收关闭生产限流/);
  assert.match(guide, /不得注入假响应|绝不为验收注入假响应/);
});

test('[v2.2-P2-TC04-1] captureTargetGeometry 预清理后优先元素截图且不用 clip 或 sips', async () => {
  const { captureTargetGeometry } = await import('../qa-browser-helper.mjs');
  const calls = [];
  const page = {
    keyboard: { press: async (key) => calls.push(['escape', key]) },
    evaluate: async (probe, target) => probe(target),
    locator: (target) => ({
      screenshot: async (options) => calls.push(['element', target, options]),
    }),
    screenshot: async () => { throw new Error('不应进入视口截图'); },
  };
  const geometry = await captureTargetGeometry(page, {
    target: '#target',
    screenshotPath: 'shot.png',
    probe: (target) => ({ target, rect: { x: 10, y: 20, width: 120, height: 80 } }),
    assert: (value) => assert.equal(value.rect.width, 120),
    preclean: async () => calls.push(['preclean']),
  });
  assert.equal(geometry.target, '#target');
  assert.deepEqual(calls, [
    ['escape', 'Escape'],
    ['preclean'],
    ['element', '#target', { path: 'shot.png' }],
  ]);
  for (const file of ['tooling/scripts/qa-browser-helper.mjs', '.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs']) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bsips\b|clip\s*:/, file);
  }
});

const PNG_RGBA_4X4 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVR4nGP4z8DwH4Sh1H8GDAGG/xD4H4oxBABmFiPdAFLoKQAAAABJRU5ErkJggg==',
  'base64',
);

test('[v2.2-P2-TC04-2] node:zlib PNG 视口裁剪按 DPR 保留逐像素内容', async (t) => {
  const { captureTargetGeometry, cropPngViewport, decodePngRgba } = await import('../qa-browser-helper.mjs');
  const rect = { x: 1, y: 0, width: 1, height: 2 };
  const cropped = cropPngViewport(PNG_RGBA_4X4, rect, { deviceScaleFactor: 2 });
  const decoded = decodePngRgba(cropped);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 4);
  const blue = [0, 0, 255, 255];
  const yellow = [255, 255, 0, 255];
  assert.deepEqual([...decoded.pixels], [...blue, ...blue, ...blue, ...blue, ...yellow, ...yellow, ...yellow, ...yellow]);
  const invalidBitDepth = Buffer.from(PNG_RGBA_4X4);
  invalidBitDepth[24] = 16;
  assert.throws(() => decodePngRgba(invalidBitDepth), /8 位.*RGBA/);
  assert.throws(() => cropPngViewport(PNG_RGBA_4X4, { ...rect, width: 2 }, { deviceScaleFactor: 2 }), /越界/);
  assert.throws(() => decodePngRgba(PNG_RGBA_4X4.subarray(0, 20)), /PNG/);

  const { dir } = await setupRepo(t);
  const screenshotPath = path.join(dir, 'fallback.png');
  const page = {
    evaluate: async (probe, target) => probe(target),
    locator: () => ({ screenshot: async () => { throw new Error('元素截图不可用'); } }),
    screenshot: async ({ path: output }) => writeFile(output, PNG_RGBA_4X4),
  };
  await captureTargetGeometry(page, {
    target: '#target',
    screenshotPath,
    deviceScaleFactor: 2,
    probe: (target) => ({ target, rect }),
    assert: () => {},
  });
  assert.deepEqual(await readFile(screenshotPath), cropped);
});

test('[v2.2-P2-TC04-3] 截图有效性检查拦截空白、错目标与非目标几何', async () => {
  const { assertValidTargetPng, cropPngViewport } = await import('../qa-browser-helper.mjs');
  const rect = { x: 1, y: 0, width: 1, height: 2 };
  const valid = cropPngViewport(PNG_RGBA_4X4, rect, { deviceScaleFactor: 2 });
  const stats = assertValidTargetPng(valid, { width: 2, height: 4 });
  assert.ok(stats.variance > 0);
  assert.match(stats.pixelHash, /^[0-9a-f]{64}$/);
  assert.equal(assertValidTargetPng(valid, { width: 2, height: 4, expectedPixelHash: stats.pixelHash }).pixelHash, stats.pixelHash);

  const transparent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  assert.throws(() => assertValidTargetPng(transparent, { width: 1, height: 1 }), /空白|非透明像素/);
  assert.throws(() => assertValidTargetPng(valid, { width: 1, height: 1 }), /尺寸/);
  const wrongTarget = cropPngViewport(PNG_RGBA_4X4, { ...rect, x: 0 }, { deviceScaleFactor: 2 });
  assert.throws(
    () => assertValidTargetPng(wrongTarget, { width: 2, height: 4, expectedPixelHash: stats.pixelHash }),
    /目标像素|内容不匹配/,
  );
});

test('[v2.2-P2-TC09-2] qa-run 日志记录上下文字段与真实终态', async (t) => {
  const { parseRunLog } = await import('../qa-run.mjs');
  const { dir, feature } = await setupRepo(t);
  const snapshotHash = 'a'.repeat(64);
  await writeDeep(path.join(feature, '_qa/review-challenge.json'), `${JSON.stringify({
    schemaVersion: 1,
    nonce: 'obs-nonce',
    round: 'r2',
    snapshotHash,
    repairAndWaitMs: 137,
  }, null, 2)}\n`);
  const success = runCli(QA_RUN, dir, [feature, 'obs-success', '--', process.execPath, '-e', "setTimeout(() => console.log('完成'), 5)"]);
  assert.equal(success.status, 0, success.stdout + success.stderr);
  const successLog = parseRunLog(await readFile(path.join(feature, 'evidence/obs-success.log'), 'utf8'));
  assert.equal(successLog.complete, true);
  assert.equal(successLog.nonce, 'obs-nonce');
  assert.equal(successLog.round, 'r2');
  assert.equal(successLog.axis, 'none');
  assert.equal(successLog.snapshotHash, snapshotHash);
  assert.equal(successLog.terminalState, 'succeeded');
  assert.equal(successLog.errorClass, null);
  assert.equal(successLog.repairAndWaitMs, 137);
  assert.ok(Number.isInteger(successLog.durationMs) && successLog.durationMs >= 5);

  const failed = runCli(QA_RUN, dir, [feature, 'obs-failure', '--', process.execPath, '-e', 'process.exit(7)']);
  assert.equal(failed.status, 7, failed.stdout + failed.stderr);
  const failedLog = parseRunLog(await readFile(path.join(feature, 'evidence/obs-failure.log'), 'utf8'));
  assert.equal(failedLog.terminalState, 'failed');
  assert.equal(failedLog.errorClass, 'EXIT_NONZERO');
  assert.equal(failedLog.exit, 7);
  assert.equal(failedLog.dispatchedAt, null);
});


test('[v2.2-P2-TC02-5] 共享常量源缺失时明确提示重名检查不可用', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/components/NewSurface.tsx'), [
    "const LOCAL_SURFACE = 'local';",
    'export function NewSurface() {',
    '  return <div data-style={LOCAL_SURFACE} />;',
    '}',
    '',
  ].join('\n'));
  const result = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /SURFACE_CONSTANTS_UNAVAILABLE/);
  assert.match(result.stdout, /NewSurface\.tsx:1/);
});

test('[v2.2-P2-TC02-6] DESIGN 功能面公开示例路径可作为路由登记依据', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/app/destiny/bazi/page.tsx'), 'export default function BaziPage() { return null; }\n');
  await writeDeep(path.join(dir, 'DESIGN.md'), [
    '## 10. 功能面设计简报',
    '',
    '| 域 | 模式 | 一句话基调 | 标志装置 |',
    '| --- | --- | --- | --- |',
    '| 八字 | Experience | 五行命盘 | 五行角光斑 |',
    '',
    '### 10.1 八字盘面（`app/destiny/_components/bazi/bazi-chart.tsx`）',
    '',
  ].join('\n'));
  const result = runCli(PREFLIGHT, dir, [feature]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /DESIGN_ROUTE_UNREGISTERED/);
});

test('[v2.2-P2-TC04-5] Playwright 视口退化裁剪从实际 PNG 推断 DPR', async (t) => {
  const { captureMobileGeometry, cropPngViewport } = await import('../qa-browser-helper.mjs');
  const { dir } = await setupRepo(t);
  const screenshotPath = path.join(dir, 'mobile.png');
  const source = cropPngViewport(PNG_RGBA_4X4, { x: 0, y: 0, width: 4, height: 4 }, { deviceScaleFactor: 1 });
  let viewport = { width: 4, height: 4 };
  const page = {
    keyboard: { press: async () => {} },
    viewportSize: () => viewport,
    setViewportSize: async (next) => { viewport = next; },
    evaluate: async (probe, target) => probe(target),
    locator: () => ({ screenshot: async () => { throw new Error('强制视口退化'); } }),
    screenshot: async ({ path: output }) => { await writeFile(output, source); },
  };
  await captureMobileGeometry(page, {
    target: '#target',
    screenshotPath,
    width: 4,
    height: 4,
    probe: (target) => ({ target, rect: { x: 1, y: 0, width: 1, height: 2 } }),
    assert: () => {},
  });
  const expected = cropPngViewport(source, { x: 1, y: 0, width: 1, height: 2 }, { deviceScaleFactor: 1 });
  assert.deepEqual(await readFile(screenshotPath), expected);
});
