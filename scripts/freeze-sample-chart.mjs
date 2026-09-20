#!/usr/bin/env node
/**
 * freeze-sample-chart.mjs —— 星座寰宇示例盘真值冻结脚本（真实计算域口径）
 *
 * 运行方式：
 *   node scripts/freeze-sample-chart.mjs            # 打印核对结果与对照表，不改文件
 *   node scripts/freeze-sample-chart.mjs --write    # 重新冻结并写入 sample-chart.ts
 *   node scripts/freeze-sample-chart.mjs --at=2026-09-20T00:00:00.000Z
 *
 * 做什么：
 * 1. 用真实计算域（apps/web/src/lib/astrology/chart-engine.ts）对三份固定虚拟档案
 *    （准确 1995-10-08 14:30 上海 / 约时 [13:00,16:00) 上海 / 未知 1995-10-10 上海民用日）
 *    重新计算事实层，并写入 apps/web/src/lib/astrology/sample-chart.ts 的「冻结数据块」。
 * 2. 人工核对锚点：示例盘的十星体黄经、四轴与 Placidus 宫头与 Swiss Ephemeris
 *    （Astrodienst 口径：地心视位置、回归黄道、当日分点）逐项比对，超容差直接失败退出。
 *    核对值由 pyswisseph（swe.calc_ut + houses_ex 'P'）产出，记录在 sample-chart.ts 的 ANCHOR 常量。
 * 3. 交叉验证：与旧冻结档案（2026-08-31 用 Paul Schlyter 低精度算法冻结）比对，
 *    按票面容差（行星 < 0.5°、ASC/MC < 1°）确认新引擎没有口径漂移。
 *
 * 环境要求：Node 22.6+（TS 类型剥离）。示例盘数据只有本脚本与测试会重算，运行时是纯数据。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SAMPLE_CHART_PATH = path.join(ROOT, 'apps/web/src/lib/astrology/sample-chart.ts');
const ENGINE_PATH = path.join(ROOT, 'apps/web/src/lib/astrology/chart-engine.ts');

const MARKER_START =
  '/* ======== 冻结数据块（由 scripts/freeze-sample-chart.mjs --write 生成，勿手改） ======== */';
const MARKER_END = '/* ======== 冻结数据块结束 ======== */';

// Node 的类型剥离开关（22.6+ 需显式开启，23.6+ 默认开启）
if (!process.features?.typescript) {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', cwd: ROOT }
  );
  process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const atArgument = args.find((arg) => arg.startsWith('--at='));
const frozenAt = atArgument ? new Date(atArgument.slice('--at='.length)) : new Date();
if (Number.isNaN(frozenAt.getTime())) {
  console.error('--at 参数不是合法时间');
  process.exit(1);
}

const engine = await import(pathToFileURL(ENGINE_PATH).href);
const sample = await import(pathToFileURL(SAMPLE_CHART_PATH).href);

const BODY_ORDER = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];
const SIGN_ORDER = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];

const anchor = sample.SAMPLE_CHART_ANCHOR;

/** 由「星座 + 星座内度数」还原黄经（只依赖对外可观察量） */
function absoluteLongitude(planet) {
  return SIGN_ORDER.indexOf(planet.sign) * 30 + planet.degree;
}

function planetOf(facts, body) {
  return facts.planets.find((planet) => planet.body === body);
}

const failures = [];
/** 自检输出：label 为核对项，detail 为实测值；不通过时记入失败清单 */
function check(ok, label, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `（${detail}）` : ''}`);
  if (!ok) failures.push(`${label}：${detail}`);
}

console.log('===== 星座寰宇示例盘冻结（真实计算域）=====');
console.log(`引擎版本 ${engine.ENGINE_VERSION}｜冻结时刻 ${frozenAt.toISOString()}`);
console.log(`类型剥离运行时：${process.features.typescript}`);

const accurate = engine.computeChartFactsAt(sample.SAMPLE_PROFILE_ACCURATE, frozenAt);
const approximate = engine.computeChartFactsAt(sample.SAMPLE_PROFILE_APPROXIMATE, frozenAt);
const unknown = engine.computeChartFactsAt(sample.SAMPLE_PROFILE_UNKNOWN, frozenAt);

// ---------- 1. 权威核对（Swiss Ephemeris）----------
console.log('\n=== 权威核对：1995-10-08 14:30 上海（UTC 06:30）vs Swiss Ephemeris ===');
console.log('  星体      新引擎        权威值        差值        旧档案        差值');
for (const body of BODY_ORDER) {
  const value = absoluteLongitude(planetOf(accurate, body));
  const swiss = anchor.swiss.longitudes[body];
  const legacy = anchor.legacy.longitudes[body];
  const diffSwiss = value - swiss;
  const diffLegacy = value - legacy;
  console.log(
    `  ${body.padEnd(8)} ${value.toFixed(4).padStart(10)} ${swiss.toFixed(4).padStart(12)} ${diffSwiss.toFixed(4).padStart(10)} ${legacy.toFixed(4).padStart(12)} ${diffLegacy.toFixed(4).padStart(9)}`
  );
  check(
    Math.abs(diffSwiss) <= anchor.tolerance.longitude,
    `${body} 与权威星历一致`,
    `偏差 ${diffSwiss.toFixed(4)}° ≤ ${anchor.tolerance.longitude}°`
  );
  check(
    Math.abs(diffLegacy) <= anchor.toleranceLegacy.longitude,
    `${body} 与旧冻结档案交叉验证一致`,
    `偏差 ${diffLegacy.toFixed(4)}° ≤ ${anchor.toleranceLegacy.longitude}°`
  );
}

const asc = accurate.angles.ascendant.longitude;
const mc = accurate.angles.midheaven.longitude;
console.log(`  上升 ASC  ${asc.toFixed(4)}（权威 ${anchor.swiss.ascendant}，旧档案 ${anchor.legacy.ascendant}）`);
console.log(`  天顶 MC   ${mc.toFixed(4)}（权威 ${anchor.swiss.midheaven}，旧档案 ${anchor.legacy.midheaven}）`);
check(Math.abs(asc - anchor.swiss.ascendant) <= anchor.tolerance.angle, 'ASC 与权威星历一致', `偏差 ${(asc - anchor.swiss.ascendant).toFixed(4)}°`);
check(Math.abs(mc - anchor.swiss.midheaven) <= anchor.tolerance.angle, 'MC 与权威星历一致', `偏差 ${(mc - anchor.swiss.midheaven).toFixed(4)}°`);
check(Math.abs(asc - anchor.legacy.ascendant) <= anchor.toleranceLegacy.angle, 'ASC 与旧档案交叉验证一致', `偏差 ${(asc - anchor.legacy.ascendant).toFixed(4)}°`);
check(Math.abs(mc - anchor.legacy.midheaven) <= anchor.toleranceLegacy.angle, 'MC 与旧档案交叉验证一致', `偏差 ${(mc - anchor.legacy.midheaven).toFixed(4)}°`);

console.log('\n  Placidus 宫头（新引擎 vs 权威）');
let cuspWorst = 0;
for (const house of accurate.houses) {
  const value = SIGN_ORDER.indexOf(house.sign) * 30 + house.cuspDegree;
  const diff = value - anchor.swiss.cusps[house.number - 1];
  cuspWorst = Math.max(cuspWorst, Math.abs(diff));
  console.log(
    `  第 ${String(house.number).padStart(2)} 宫  ${value.toFixed(4).padStart(10)}  ${anchor.swiss.cusps[house.number - 1].toFixed(4).padStart(10)}  ${diff.toFixed(4).padStart(9)}`
  );
}
check(accurate.houseSystem === 'placidus', '示例盘宫制为 Placidus', `实际 ${accurate.houseSystem}`);
check(cuspWorst <= anchor.tolerance.cusp, '十二宫头与权威星历一致', `最大偏差 ${cuspWorst.toFixed(4)}° ≤ ${anchor.tolerance.cusp}°`);

// ---------- 2. 常识自检 ----------
console.log('\n=== 常识自检 ===');
const sun = planetOf(accurate, 'sun');
check(sun.sign === 'libra' && sun.degree >= 14 && sun.degree <= 15, '太阳为天秤 14-15°', `实际 ${sun.sign} ${sun.degree}`);
check(planetOf(accurate, 'mercury').retrograde === true, '1995-10-08 水星逆行');
check(planetOf(accurate, 'saturn').retrograde === true, '1995-10-08 土星逆行');
check(accurate.dataCompleteness === 'with-houses', '准确档为完整盘');
check(approximate.dataCompleteness === 'without-houses' && approximate.angles.ascendant.sign === null, '约时档降级为无宫位');
check(
  planetOf(approximate, 'sun').stability === 'signOnly' && planetOf(approximate, 'sun').sign === 'libra',
  '约时档太阳仅展示星座',
  '整度数跨边界'
);
check(planetOf(unknown, 'moon').sign === null, '未知档 1995-10-10 月亮跨座隐藏');
check(planetOf(unknown, 'sun').sign === 'libra', '未知档太阳星座稳定');
check(planetOf(unknown, 'sun').degree === null, '未知档不展示任何度数');

// ---------- 3. 生成冻结数据块 ----------
const frozenAtIso = frozenAt.toISOString();
const stripTransits = (facts) => ({ ...facts, transits: [] });
const generated = [
  '/** 冻结档案元信息（生成方式、引擎与口径版本） */',
  'export const SAMPLE_CHART_META = {',
  `  generatedBy: 'node scripts/freeze-sample-chart.mjs --write',`,
  `  frozenAt: '${frozenAtIso}',`,
  `  engineVersion: '${engine.ENGINE_VERSION}',`,
  `  orbTableVersion: '${accurate.orbTableVersion}',`,
  '} as const;',
  '',
  '/** 准确到分钟：完整盘（Placidus 宫位 + 四轴） */',
  `export const SAMPLE_CHART_ACCURATE: AstrologyChartFacts = ${JSON.stringify(stripTransits(accurate), null, 2)};`,
  '',
  '/** 大约时段：区间稳定性校验后的降级盘（无宫位；度数不稳定者仅展示星座） */',
  `export const SAMPLE_CHART_APPROXIMATE: AstrologyChartFacts = ${JSON.stringify(stripTransits(approximate), null, 2)};`,
  '',
  '/** 完全未知：无宫位无四轴降级盘（仅整日稳定的星座与主要相位） */',
  `export const SAMPLE_CHART_UNKNOWN: AstrologyChartFacts = ${JSON.stringify(stripTransits(unknown), null, 2)};`,
  '',
].join('\n');

if (failures.length > 0) {
  console.error('\n核对未通过，冻结终止：');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\n=== 冻结结果摘要 ===');
for (const [label, facts] of [
  ['accurate', accurate],
  ['approximate', approximate],
  ['unknown', unknown],
]) {
  console.log(
    `  ${label.padEnd(12)} 宫制 ${String(facts.houseSystem).padEnd(10)} 完整度 ${facts.dataCompleteness.padEnd(14)} 相位 ${
      facts.aspects.length
    }（稳定 ${facts.aspects.filter((a) => a.stability === 'stable').length}）行运 ${facts.transits.length}`
  );
}

if (!write) {
  console.log('\n（未传 --write，仅核对；加 --write 才会写入 sample-chart.ts）');
  process.exit(0);
}

if (!existsSync(SAMPLE_CHART_PATH)) {
  console.error(`找不到 ${SAMPLE_CHART_PATH}`);
  process.exit(1);
}
const source = readFileSync(SAMPLE_CHART_PATH, 'utf8');
const startIndex = source.indexOf(MARKER_START);
const endIndex = source.indexOf(MARKER_END);
if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
  console.error('sample-chart.ts 缺少冻结数据块标记，无法写入');
  process.exit(1);
}
const next =
  source.slice(0, startIndex + MARKER_START.length) + '\n\n' + generated + source.slice(endIndex);
writeFileSync(SAMPLE_CHART_PATH, next, 'utf8');
console.log(`\n已重新冻结并写入 ${path.relative(ROOT, SAMPLE_CHART_PATH)}`);
