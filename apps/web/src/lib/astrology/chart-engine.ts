/**
 * chart-engine.ts —— 星座寰宇 · 真实星盘计算域（★ 仅服务端使用 ★）
 *
 * 依据设计文档 docs/designs/2026-07-26-constellation-universe-design.md §9.2「首期计算口径」
 * 与 §9.3「推荐数据模型」实现唯一接缝 computeChartFacts(AstroBirthProfile) → AstrologyChartFacts：
 * - 星历：circular-natal-horoscope-js（纯 JS 星历），回归黄道、地心视角；
 * - 宫制：Placidus 为默认；任一宫头缺失、非有限值或十二宫顺序无法闭合 → 回退整宫制并在事实层标注；
 * - 相位：合相 / 六合 / 刑相 / 拱相 / 对冲，容许度由 ORB_TABLE 冻结（orbTableVersion 标识）；
 * - 时间：出生城市自带 IANA 时区 + Node Intl 求出生当日真实偏移（含历史夏令时），
 *   不使用星历库内部的 tz-lookup 反查（对新疆会返回 Asia/Urumqi，与全国统一 Asia/Shanghai 口径不符）；
 * - 降级：约时在整个区间内采样校验稳定性，不稳定字段为 null 并隐藏（不取中点或 12:00 补算）；
 *   未知时间不计算上升、天顶、宫位，只展示整日内稳定的星座与主要相位，月亮等快星体做跨座检测；
 * - 行运：以请求时刻所在自然周（周一 00:00 UTC 起）为窗口按日采样，产出与本命星体的主要相位 TransitFact；
 *   本命落点度数不稳定的星体（未知档全部、约时档的跨整度星体）不作为行运目标，避免以虚构精度外推。
 *
 * ⚠️ 本模块依赖 moment / moment-timezone / tz-lookup（星历库的依赖），只能被服务端代码引用：
 * 客户端组件、mock 与示例盘一律使用预冻结的 sample-chart.ts（纯数据），不得 import 本文件。
 *
 * 说明：本文件与 zodiac-geometry.ts / timezone.ts 会被 scripts/freeze-sample-chart.mjs 以
 * Node 原生 TS 运行时直接引入，故对本地模块使用显式 .ts 扩展名导入。
 */

import * as horoscopeNamespace from 'circular-natal-horoscope-js';
import { ORB_TABLE, ORB_TABLE_VERSION } from './chart-facts.ts';
import type {
  AngleFact,
  AspectFact,
  AstroBirthProfile,
  AstrologyChartFacts,
  ComputeChartFacts,
  HouseFact,
  HouseSystem,
  PlanetBody,
  PlanetPlacement,
  StabilityStatus,
  TransitFact,
  ZodiacSign,
} from './chart-facts';
import {
  ASPECT_IDEAL,
  SIGN_ORDER,
  degreeInSign,
  deriveAspectFactsFromRanges,
  deriveAspects,
  placementStability,
  round4,
  separation,
  signOfLongitude,
} from './zodiac-geometry.ts';
import type { AspectRange, LongitudeRange } from './zodiac-geometry.ts';
import { parseLocalWallClock, resolveLocalWallTime, wallClockAt } from './timezone.ts';

/** 计算引擎版本（写入事实层 engineVersion；重算口径变化时必须递增） */
export const ENGINE_VERSION = 'astro-engine-1.0.0+chjs1.1.0';

/** 十星体顺序（事实层数组顺序固定，消费方与冻结档案一致） */
const BODY_ORDER: PlanetBody[] = [
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

/** 约时档区间采样步长（分钟）：3 小时时段约 19 个采样点 */
const APPROXIMATE_SAMPLE_STEP_MINUTES = 10;
/** 未知档民用日采样步长（分钟）：整日约 74 个采样点 */
const UNKNOWN_SAMPLE_STEP_MINUTES = 20;

const DAY_MS = 86400000;

/* ============================ 星历库适配 ============================ */

/** 库内部时区判定结果（moment-timezone Zone，只取 name 字段） */
interface LibraryZone {
  name?: string;
}

interface LibraryOrigin {
  timezone?: LibraryZone;
}

/** 库的 ChartPosition 结构（只取黄道经度） */
interface LibraryChartPosition {
  Ecliptic: { DecimalDegrees: number };
}

interface LibraryBody {
  key: string;
  isRetrograde: boolean;
  ChartPosition: LibraryChartPosition;
  House: { id: number };
}

interface LibraryHouse {
  id: number;
  ChartPosition: { StartPosition: LibraryChartPosition };
}

/** 库的角点结构（上升 / 天顶，同样挂在 ChartPosition 下） */
interface LibraryAngle {
  ChartPosition: LibraryChartPosition;
}

interface LibraryHoroscope {
  Ascendant: LibraryAngle;
  Midheaven: LibraryAngle;
  CelestialBodies: { all: LibraryBody[] };
  Houses: LibraryHouse[];
}

interface LibraryModule {
  Origin: new (options: Record<string, unknown>) => LibraryOrigin;
  Horoscope: new (options: Record<string, unknown>) => LibraryHoroscope;
}

/**
 * 取库导出：该包是 webpack UMD/CJS 产物，Node ESM 下命名导出探测失败（只暴露 default），
 * 打包器（webpack / vite）下 default 即 module.exports，故统一「命名导出优先、default 兜底」。
 */
function resolveLibrary(): LibraryModule {
  const namespace = horoscopeNamespace as unknown as Partial<LibraryModule> & { default?: unknown };
  const candidate = (typeof namespace.Origin === 'function' ? namespace : namespace.default) as
    | Partial<LibraryModule>
    | undefined;
  if (!candidate || typeof candidate.Origin !== 'function' || typeof candidate.Horoscope !== 'function') {
    throw new Error('星历库 circular-natal-horoscope-js 加载失败：未找到 Origin / Horoscope 导出');
  }
  return candidate as LibraryModule;
}

const library = resolveLibrary();

/** 库内 tz-lookup 对坐标判定的时区名缓存（仅用于把目标 UTC 时刻表达成库可复现的本地时刻） */
const libraryZoneCache = new Map<string, string>();

function libraryTimeZoneName(latitude: number, longitude: number): string {
  const key = `${latitude},${longitude}`;
  const cached = libraryZoneCache.get(key);
  if (cached !== undefined) return cached;
  const probe = new library.Origin({ year: 2000, month: 0, date: 1, hour: 0, minute: 0, latitude, longitude });
  const name = probe.timezone?.name ?? 'Etc/UTC';
  libraryZoneCache.set(key, name);
  return name;
}

/**
 * 目标 UTC 时刻 → 库可用的 Origin。
 *
 * 库用 tz-lookup(纬度, 经度) 反查时区来解释传入的本地时刻（例如喀什会被判为 Asia/Urumqi +6），
 * 与项目「城市表自带 IANA 时区」口径可能不一致。这里不改库，而是把已经算准的 UTC 时刻
 * 反向表达成「库所判时区」的本地时刻再交给库：库据此换回的 UTC 时刻与目标完全一致，
 * 行星黄经（只取决于 UTC 时刻）与四轴（UTC 时刻 + 经纬度）都落在项目口径上。
 */
function originForUtcInstant(utcMs: number, latitude: number, longitude: number): LibraryOrigin {
  const wall = wallClockAt(libraryTimeZoneName(latitude, longitude), new Date(utcMs));
  return new library.Origin({
    year: wall.year,
    month: wall.month - 1,
    date: wall.day,
    hour: wall.hour,
    minute: wall.minute,
    second: wall.second,
    latitude,
    longitude,
  });
}

/* ============================ 时刻快照 ============================ */

const BODY_KEYS = new Set<string>(BODY_ORDER);

interface ChartSnapshot {
  utcMs: number;
  longitudes: Record<PlanetBody, number>;
  retrograde: Record<PlanetBody, boolean>;
  /** Placidus 宫头黄经（12 个）；库计算失败时为 null */
  placidusCusps: number[] | null;
  /** 各星体的 Placidus 宫位号；库计算失败时为 null */
  placidusHouseOf: Record<PlanetBody, number> | null;
  /** 上升 / 天顶黄经（0-360） */
  asc: number;
  mc: number;
}

function readBodies(horoscope: LibraryHoroscope): {
  longitudes: Record<PlanetBody, number>;
  retrograde: Record<PlanetBody, boolean>;
  houseOf: Record<PlanetBody, number>;
} {
  const longitudes = {} as Record<PlanetBody, number>;
  const retrograde = {} as Record<PlanetBody, boolean>;
  const houseOf = {} as Record<PlanetBody, number>;
  for (const raw of horoscope.CelestialBodies.all) {
    // 库还会返回凯龙星、天狼星等，不在十星体口径内
    if (!BODY_KEYS.has(raw.key)) continue;
    const body = raw.key as PlanetBody;
    longitudes[body] = round4(raw.ChartPosition.Ecliptic.DecimalDegrees);
    retrograde[body] = raw.isRetrograde === true;
    houseOf[body] = raw.House?.id ?? 0;
  }
  for (const body of BODY_ORDER) {
    if (longitudes[body] === undefined) {
      throw new Error(`星历计算失败：缺少 ${body} 的黄经`);
    }
  }
  return { longitudes, retrograde, houseOf };
}

function buildHoroscope(utcMs: number, latitude: number, longitude: number): LibraryHoroscope {
  return new library.Horoscope({
    origin: originForUtcInstant(utcMs, latitude, longitude),
    houseSystem: 'placidus',
    zodiac: 'tropical',
    // 相位一律由本域按冻结容许度表推导，不让库参与判定
    aspectPoints: [],
    aspectWithPoints: [],
    aspectTypes: [],
  });
}

function snapshotAt(utcMs: number, latitude: number, longitude: number, withHouses: boolean): ChartSnapshot {
  const horoscope = buildHoroscope(utcMs, latitude, longitude);
  const bodies = readBodies(horoscope);
  const cusps = withHouses
    ? horoscope.Houses.map((h) => h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees)
    : null;
  return {
    utcMs,
    longitudes: bodies.longitudes,
    retrograde: bodies.retrograde,
    placidusCusps: cusps && cusps.length === 12 ? cusps : null,
    placidusHouseOf: cusps && cusps.length === 12 ? bodies.houseOf : null,
    asc: round4(horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees),
    mc: round4(horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees),
  };
}

/** 十星体黄经（不含宫位），供行运与测试复用 */
export function bodyLongitudesAt(utcMs: number, latitude: number, longitude: number): Record<PlanetBody, number> {
  return readBodies(buildHoroscope(utcMs, latitude, longitude)).longitudes;
}

/**
 * 宫头有效性：十二宫中任一宫头缺失 / 非有限值 / 顺序无法闭合（严格递增且总跨度不超过一圈）
 * 即判定 Placidus 在该纬度失效（文档 §9.2 的高纬回退条件）。
 */
export function placidusCuspsValid(cusps: number[] | null): cusps is number[] {
  if (!cusps || cusps.length !== 12) return false;
  if (cusps.some((cusp) => !Number.isFinite(cusp))) return false;
  let previous = cusps[0];
  let total = 0;
  for (let i = 1; i < 12; i++) {
    let cusp = cusps[i];
    while (cusp <= previous) cusp += 360;
    const span = cusp - previous;
    if (span <= 0) return false;
    total += span;
    previous = cusp;
  }
  return total < 360;
}

/* ============================ 出生时刻解析 ============================ */

/** 出生档案解析出的 UTC 时刻（含夏令时歧义标记） */
export interface ResolvedBirthInstant {
  utcMs: number;
  offsetMinutes: number;
  ambiguous: boolean;
  nonexistent: boolean;
}

/** 半开区间 [startMs, endMs) 的 UTC 端点 */
export interface ResolvedBirthInterval {
  startMs: number;
  endMs: number;
}

/** 准确到分钟：本地出生时刻 → UTC 时刻（IANA 时区 + 历史夏令时） */
export function resolveProfileInstant(profile: AstroBirthProfile): ResolvedBirthInstant {
  if (!profile.birthTime) {
    throw new Error('准确到分钟的出生档案必须带出生时刻');
  }
  return resolveLocalWallTime(
    { ...profile.birthDate, hour: profile.birthTime.hour, minute: profile.birthTime.minute },
    profile.timezone,
    {
      disambiguation: profile.localTimeDisambiguation,
      preferredOffsetMinutes: profile.utcOffsetMinutes,
    }
  );
}

/** 约时档：原始半开区间 [localStart, localEnd) 的 UTC 端点（跨夏令时按各自实例换算） */
export function resolveProfileInterval(profile: AstroBirthProfile): ResolvedBirthInterval {
  if (!profile.timeRange) {
    throw new Error('约时出生档案必须带本地区间');
  }
  const start = resolveLocalWallTime(parseLocalWallClock(profile.timeRange.localStart), profile.timeRange.timezone, {
    disambiguation: profile.localTimeDisambiguation,
    preferredOffsetMinutes: profile.utcOffsetMinutes,
  });
  const end = resolveLocalWallTime(parseLocalWallClock(profile.timeRange.localEnd), profile.timeRange.timezone, {
    disambiguation: profile.localTimeDisambiguation,
    preferredOffsetMinutes: profile.utcOffsetMinutes,
  });
  if (end.utcMs < start.utcMs) {
    throw new Error('约时区间非法：结束时刻早于开始时刻');
  }
  return { startMs: start.utcMs, endMs: end.utcMs };
}

/** 未知档：以出生城市当地民用日 [00:00, 次日 00:00) 计（文档 §9.2） */
export function resolveProfileCivilDay(profile: AstroBirthProfile): ResolvedBirthInterval {
  const { year, month, day } = profile.birthDate;
  const start = resolveLocalWallTime({ year, month, day, hour: 0, minute: 0 }, profile.timezone, {
    disambiguation: profile.localTimeDisambiguation,
    preferredOffsetMinutes: profile.utcOffsetMinutes,
  });
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = resolveLocalWallTime(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0 },
    profile.timezone,
    { disambiguation: profile.localTimeDisambiguation, preferredOffsetMinutes: profile.utcOffsetMinutes }
  );
  return { startMs: start.utcMs, endMs: end.utcMs };
}

/* ============================ 采样与稳定性口径 ============================ */

/** 区间采样时刻：均匀覆盖 [start, end) 并在末尾补一个终点样本（边界跨变保守检出） */
function sampleInstants(startMs: number, endMs: number, stepMinutes: number): number[] {
  const step = stepMinutes * 60000;
  const duration = endMs - startMs;
  const count = Math.max(2, Math.ceil(duration / step));
  const instants: number[] = [];
  for (let i = 0; i < count; i++) {
    instants.push(startMs + (i * duration) / count);
  }
  instants.push(endMs);
  return instants;
}

/** 黄经序列解缠（跨 0° 时按累计插值），保证 min/max 与整度数判定不受跨 0° 影响 */
function unwrapSeries(values: number[]): number[] {
  const unwrapped = [values[0]];
  for (let i = 1; i < values.length; i++) {
    let value = values[i];
    while (value < unwrapped[i - 1] - 180) value += 360;
    while (value > unwrapped[i - 1] + 180) value -= 360;
    unwrapped.push(value);
  }
  return unwrapped;
}

function rangeOfSeries(values: number[]): LongitudeRange {
  const unwrapped = unwrapSeries(values);
  return { min: Math.min(...unwrapped), max: Math.max(...unwrapped) };
}

/* ============================ 事实层构件 ============================ */

function hiddenAngle(point: 'ascendant' | 'midheaven'): AngleFact {
  return { point, sign: null, degree: null, longitude: null, stability: 'unstable' };
}

function visibleAngle(point: 'ascendant' | 'midheaven', longitude: number): AngleFact {
  return {
    point,
    sign: signOfLongitude(longitude),
    degree: round4(degreeInSign(longitude)),
    longitude: round4(longitude),
    stability: 'stable',
  };
}

function hiddenStatus(reason: 'unstable-in-range' | 'time-unknown', detail: string): StabilityStatus {
  return { displayable: false, reason, detail };
}

/** 整宫制宫头：上升所在星座起，逐宫顺行（宫头即星座 0°） */
function wholeSignHouses(ascSign: ZodiacSign): HouseFact[] {
  const ascIndex = SIGN_ORDER.indexOf(ascSign);
  return Array.from({ length: 12 }, (_, i): HouseFact => ({
    number: i + 1,
    sign: SIGN_ORDER[(ascIndex + i) % 12],
    cuspDegree: 0,
    stability: 'stable',
  }));
}

/** Placidus 宫头 → 事实层（宫头星座与星座内度数如实回填） */
function placidusHouses(cusps: number[]): HouseFact[] {
  return cusps.map((cusp, i): HouseFact => ({
    number: i + 1,
    sign: signOfLongitude(cusp),
    cuspDegree: round4(degreeInSign(cusp)),
    stability: 'stable',
  }));
}

/** 整宫制宫位归属：按星座相对上升星座的位移 */
function wholeSignHouseOf(sign: ZodiacSign, ascSign: ZodiacSign): number {
  return ((SIGN_ORDER.indexOf(sign) - SIGN_ORDER.indexOf(ascSign) + 12) % 12) + 1;
}

function revisionOf(profile: AstroBirthProfile): string {
  const canonical = [
    profile.birthDate.year,
    profile.birthDate.month,
    profile.birthDate.day,
    profile.timePrecision,
    profile.birthTime ? `${profile.birthTime.hour}:${profile.birthTime.minute}` : '-',
    profile.timeRange ? `${profile.timeRange.localStart}~${profile.timeRange.localEnd}` : '-',
    profile.city,
    profile.latitude,
    profile.longitude,
    profile.timezone,
  ].join('|');
  // FNV-1a 32 位：同一出生资料得到同一修订号，换资料即换修订号（文档 §9.3 修订语义）
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `astro-${hash.toString(16).padStart(8, '0')}`;
}

/** 组装事实层公共头（黄道体系、版本、修订号、行运），三档共用 */
function assembleFacts(
  profile: AstroBirthProfile,
  calculatedAt: string,
  transits: TransitFact[],
  parts: Omit<AstrologyChartFacts, 'zodiacSystem' | 'calculatedAt' | 'engineVersion' | 'orbTableVersion' | 'calculationRevision' | 'transits'>
): AstrologyChartFacts {
  return {
    zodiacSystem: 'tropical',
    calculatedAt,
    engineVersion: ENGINE_VERSION,
    orbTableVersion: ORB_TABLE_VERSION,
    calculationRevision: revisionOf(profile),
    transits,
    ...parts,
  };
}

/* ============================ 准确到分钟 ============================ */

function buildAccurateFacts(
  profile: AstroBirthProfile,
  snapshot: ChartSnapshot,
  calculatedAt: string,
  transits: TransitFact[]
): AstrologyChartFacts {
  const ascSign = signOfLongitude(snapshot.asc);
  const usePlacidus = placidusCuspsValid(snapshot.placidusCusps) && snapshot.placidusHouseOf !== null;
  const houses = usePlacidus ? placidusHouses(snapshot.placidusCusps as number[]) : wholeSignHouses(ascSign);
  const houseSystem: HouseSystem = usePlacidus ? 'placidus' : 'whole-sign';

  const planets = BODY_ORDER.map((body): PlanetPlacement => {
    const longitude = snapshot.longitudes[body];
    const sign = signOfLongitude(longitude);
    return {
      body,
      sign,
      degree: round4(degreeInSign(longitude)),
      house: usePlacidus ? snapshot.placidusHouseOf![body] : wholeSignHouseOf(sign, ascSign),
      retrograde: snapshot.retrograde[body],
      stability: 'stable',
    };
  });

  const fallbackNote = usePlacidus
    ? null
    : `出生地纬度较高（${profile.latitude.toFixed(2)}°），普拉西德制宫位在该时刻不可用，已回退整宫制（文档 §9.2）`;

  return assembleFacts(profile, calculatedAt, transits, {
    houseSystem,
    dataCompleteness: 'with-houses',
    planets,
    angles: {
      ascendant: visibleAngle('ascendant', snapshot.asc),
      midheaven: visibleAngle('midheaven', snapshot.mc),
    },
    houses,
    aspects: deriveAspects(snapshot.longitudes),
    factStability: {
      angles: { displayable: true, reason: null, detail: null },
      houses: usePlacidus
        ? { displayable: true, reason: null, detail: null }
        : { displayable: true, reason: null, detail: fallbackNote },
      placements: Object.fromEntries(
        BODY_ORDER.map((body) => [body, { displayable: true, reason: null, detail: null }])
      ) as Record<PlanetBody, StabilityStatus>,
      aspects: { displayable: true, reason: null, detail: null },
      note: fallbackNote,
    },
  });
}

/* ============================ 区间采样（约时 / 未知） ============================ */

interface SampledFacts {
  planets: PlanetPlacement[];
  angles: { ascendant: AngleFact; midheaven: AngleFact };
  anglesStable: boolean;
  houses: HouseFact[];
  houseSystem: HouseSystem | null;
  aspects: AspectFact[];
  stableAspectCount: number;
}

/**
 * 区间全量采样：只有字段值在整个区间内一致才输出单值（文档 §9.2）。
 * - 度数：整度数一致才展示（stable），星座稳定而度数跨整度只展示星座（signOnly），
 *   星座本身跨座一律隐藏（unstable，字段为 null）；
 * - 角点与宫位：上升/天顶整度数一致才展示（约时档 3 小时时段实际上必然不稳定 → 无宫位降级）；
 * - 相位：区间分离角窗口全部落在容许度内才稳定，否则 orb/strength 为 null；
 * - 未知档 additionally：不展示任何度数（degree 一律 null），逆行状态在区间内变化时置 null。
 */
function sampleFacts(
  profile: AstroBirthProfile,
  interval: ResolvedBirthInterval,
  options: { stepMinutes: number; showDegrees: boolean; withAngles: boolean }
): SampledFacts {
  const instants = sampleInstants(interval.startMs, interval.endMs, options.stepMinutes);
  const snapshots = instants.map((utcMs) =>
    snapshotAt(utcMs, profile.latitude, profile.longitude, options.withAngles)
  );
  const midpoint = snapshotAt(
    (interval.startMs + interval.endMs) / 2,
    profile.latitude,
    profile.longitude,
    options.withAngles
  );

  const rangeByBody = {} as Record<PlanetBody, LongitudeRange>;
  for (const body of BODY_ORDER) {
    rangeByBody[body] = rangeOfSeries(snapshots.map((s) => s.longitudes[body]));
  }

  const ascRange = rangeOfSeries(snapshots.map((s) => s.asc));
  const mcRange = rangeOfSeries(snapshots.map((s) => s.mc));
  const anglesStable =
    options.withAngles &&
    placementStability(ascRange) === 'stable' &&
    placementStability(mcRange) === 'stable';

  // 角点整度数一致才输出宫位（宫位随角点变化）；代表时刻取区间起点
  const representative = snapshots[0];
  let houseSystem: HouseSystem | null = null;
  let houses: HouseFact[] = [];
  let houseOfBody: ((body: PlanetBody, sign: ZodiacSign) => number) | null = null;
  if (anglesStable) {
    const ascSign = signOfLongitude(representative.asc);
    const usePlacidus = placidusCuspsValid(representative.placidusCusps) && representative.placidusHouseOf !== null;
    houses = usePlacidus ? placidusHouses(representative.placidusCusps as number[]) : wholeSignHouses(ascSign);
    houseSystem = usePlacidus ? 'placidus' : 'whole-sign';
    houseOfBody = usePlacidus
      ? (body) => representative.placidusHouseOf![body]
      : (_body, sign) => wholeSignHouseOf(sign, ascSign);
  }

  const planets = BODY_ORDER.map((body): PlanetPlacement => {
    const range = rangeByBody[body];
    const stability = placementStability(range);
    const retrogradeSeries = snapshots.map((s) => s.retrograde[body]);
    const retrogradeStable = retrogradeSeries.every((flag) => flag === retrogradeSeries[0]);
    const sign = stability === 'unstable' ? null : signOfLongitude(range.min);
    return {
      body,
      sign,
      degree: options.showDegrees && stability === 'stable' ? Math.round(degreeInSign(range.min)) : null,
      house: sign && houseOfBody ? houseOfBody(body, sign) : null,
      retrograde: sign === null || !retrogradeStable ? null : retrogradeSeries[0],
      stability,
    };
  });

  const aspectRanges: AspectRange[] = [];
  for (let i = 0; i < BODY_ORDER.length; i++) {
    for (let j = i + 1; j < BODY_ORDER.length; j++) {
      const source = BODY_ORDER[i];
      const target = BODY_ORDER[j];
      const separations = snapshots.map((s) => separation(s.longitudes[source], s.longitudes[target]));
      aspectRanges.push({
        source,
        target,
        minSep: round4(Math.min(...separations)),
        maxSep: round4(Math.max(...separations)),
        midSep: round4(separation(midpoint.longitudes[source], midpoint.longitudes[target])),
      });
    }
  }
  const aspects = deriveAspectFactsFromRanges(aspectRanges);

  return {
    planets,
    angles: anglesStable
      ? {
          ascendant: visibleAngle('ascendant', representative.asc),
          midheaven: visibleAngle('midheaven', representative.mc),
        }
      : { ascendant: hiddenAngle('ascendant'), midheaven: hiddenAngle('midheaven') },
    anglesStable,
    houses,
    houseSystem,
    aspects,
    stableAspectCount: aspects.filter((a) => a.stability === 'stable').length,
  };
}

/* ============================ 行运（自然周窗口） ============================ */

/** 行运主题词汇表（固定口径，非 AI 生成；解读层可改写文案但不得改变事实） */
const TRANSIT_THEME: Record<PlanetBody, string> = {
  sun: '自我表达与活力',
  moon: '情绪与日常节奏',
  mercury: '沟通与思考',
  venus: '关系与审美',
  mars: '行动与冲劲',
  jupiter: '扩张与机会',
  saturn: '责任与结构',
  uranus: '变化与突破',
  neptune: '感受与想象',
  pluto: '转化与深度',
};

/** 相位语气词（固定口径） */
const ASPECT_TONE: Record<string, string> = {
  conjunction: '融合叠加',
  sextile: '顺势协作',
  square: '摩擦磨合',
  trine: '顺流推进',
  opposition: '拉扯平衡',
};

/** 自然周（周一 00:00 UTC 起，半开区间 [startMs, endMs)） */
export function startOfNaturalWeekUtc(instantMs: number): ResolvedBirthInterval {
  const dayIndex = Math.floor(instantMs / DAY_MS);
  // 1970-01-01 为星期四：换算成「周日为 0」的星期序号，再求距上一个周一的天数
  const weekday = (((dayIndex + 4) % 7) + 7) % 7;
  const daysSinceMonday = (weekday + 6) % 7;
  const startMs = (dayIndex - daysSinceMonday) * DAY_MS;
  return { startMs, endMs: startMs + 7 * DAY_MS };
}

/**
 * 纯函数：由带符号偏差采样（delta = 分离角 − 精确成相角）求出区间内全部「落在容许度内」的时段。
 * - 相邻样本一内一外 → 割线求边界（可传入 refine 用真实星历校正）；
 * - 相邻样本都在容差外但偏差变号 → 中间存在一次精确成相，先求成相时刻再向两侧求边界；
 * - 结果与自然周窗口取交集（窗口外的部分裁掉）。
 */
export function collectInOrbSpans(
  samples: Array<{ tMs: number; delta: number }>,
  orb: number,
  bounds: ResolvedBirthInterval,
  refine?: (tMs: number) => number
): ResolvedBirthInterval[] {
  if (samples.length < 2) return [];
  const inOrb = (delta: number) => Math.abs(delta) <= orb;

  const solve = (
    a: { tMs: number; delta: number },
    b: { tMs: number; delta: number },
    target: number
  ): number => {
    let left = a;
    let right = b;
    let estimate = left.tMs;
    for (let iteration = 0; iteration < 3; iteration++) {
      const denominator = right.delta - left.delta;
      const ratio = denominator === 0 ? 0.5 : (target - left.delta) / denominator;
      estimate = left.tMs + Math.min(1, Math.max(0, ratio)) * (right.tMs - left.tMs);
      if (!refine) break;
      const actual = refine(estimate);
      if (Math.abs(actual - target) < 0.001) break;
      const point = { tMs: estimate, delta: actual };
      // 目标值落在 [left, 实际值] 之间 → 用实际值收窄右端，否则收窄左端
      if ((left.delta - target) * (actual - target) <= 0) {
        right = point;
      } else {
        left = point;
      }
    }
    return Math.min(b.tMs, Math.max(a.tMs, estimate));
  };

  const spans: ResolvedBirthInterval[] = [];
  let openStart: number | null = inOrb(samples[0].delta) ? bounds.startMs : null;

  for (let k = 0; k < samples.length - 1; k++) {
    const a = samples[k];
    const b = samples[k + 1];
    const aIn = inOrb(a.delta);
    const bIn = inOrb(b.delta);
    if (aIn && bIn) continue;
    if (aIn && !bIn) {
      // 脱相：边界在「外侧样本」所在的一侧
      const sign = b.delta !== 0 ? Math.sign(b.delta) : Math.sign(a.delta) || 1;
      spans.push({ startMs: openStart ?? a.tMs, endMs: solve(a, b, sign * orb) });
      openStart = null;
    } else if (!aIn && bIn) {
      // 入相：边界在「外侧样本」a 所在的一侧
      const sign = a.delta !== 0 ? Math.sign(a.delta) : Math.sign(b.delta) || 1;
      openStart = solve(a, b, sign * orb);
    } else if (a.delta !== 0 && b.delta !== 0 && Math.sign(a.delta) !== Math.sign(b.delta)) {
      // 两端都在容差外但中间精确成相：完整短窗口
      const exact = solve(a, b, 0);
      const exactPoint = refine ? { tMs: exact, delta: refine(exact) } : { tMs: exact, delta: 0 };
      const startMs = solve(a, exactPoint, Math.sign(a.delta) * orb);
      const endMs = solve(exactPoint, b, Math.sign(b.delta) * orb);
      if (endMs > startMs) {
        spans.push({ startMs, endMs });
      }
    }
  }
  if (openStart !== null) {
    spans.push({ startMs: openStart, endMs: bounds.endMs });
  }

  return spans
    .map((span) => ({
      startMs: Math.max(span.startMs, bounds.startMs),
      endMs: Math.min(span.endMs, bounds.endMs),
    }))
    .filter((span) => span.endMs > span.startMs);
}

/**
 * 行运事实：以 at 所在自然周为窗口（UTC 按日采样 + 割线校正边界），
 * 筛出与指定本命星体成主要相位的时段，产出 TransitFact[]（文档 §9.3 实体五）。
 * natalLongitudes 只应包含度数稳定的本命星体（不稳定的落点不作为行运目标）。
 */
export function computeTransitFacts(
  natalLongitudes: Partial<Record<PlanetBody, number>>,
  profile: Pick<AstroBirthProfile, 'latitude' | 'longitude'>,
  at: Date
): TransitFact[] {
  const bounds = startOfNaturalWeekUtc(at.getTime());
  const sampleTimes: number[] = [];
  for (let day = 0; day <= 7; day++) {
    sampleTimes.push(bounds.startMs + day * DAY_MS);
  }

  const cache = new Map<number, Record<PlanetBody, number>>();
  const longitudesAt = (tMs: number): Record<PlanetBody, number> => {
    const key = Math.round(tMs / 60000) * 60000;
    const hit = cache.get(key);
    if (hit) return hit;
    const value = bodyLongitudesAt(key, profile.latitude, profile.longitude);
    cache.set(key, value);
    return value;
  };

  const targets = (Object.keys(natalLongitudes) as PlanetBody[]).filter(
    (body) => natalLongitudes[body] !== undefined
  );
  const transits: TransitFact[] = [];
  const aspectTypes = Object.keys(ASPECT_IDEAL) as Array<keyof typeof ASPECT_IDEAL>;

  for (const transitingBody of BODY_ORDER) {
    const series = sampleTimes.map((tMs) => ({ tMs, longitude: longitudesAt(tMs)[transitingBody] }));
    for (const natalTarget of targets) {
      const natalLongitude = natalLongitudes[natalTarget] as number;
      for (const aspectType of aspectTypes) {
        const orb = ORB_TABLE[aspectType];
        const samples = series.map((point) => ({
          tMs: point.tMs,
          delta: separation(point.longitude, natalLongitude) - ASPECT_IDEAL[aspectType],
        }));
        const hasOrbSample = samples.some((s) => Math.abs(s.delta) <= orb);
        const hasExactCrossing = samples.some(
          (s, i) => i > 0 && s.delta !== 0 && samples[i - 1].delta !== 0 && Math.sign(s.delta) !== Math.sign(samples[i - 1].delta)
        );
        if (!hasOrbSample && !hasExactCrossing) continue;

        const refine = (tMs: number) =>
          separation(longitudesAt(tMs)[transitingBody], natalLongitude) - ASPECT_IDEAL[aspectType];
        const spans = collectInOrbSpans(samples, orb, bounds, refine);
        for (const span of spans) {
          transits.push({
            startsAt: new Date(Math.round(span.startMs / 60000) * 60000).toISOString(),
            endsAt: new Date(Math.round(span.endMs / 60000) * 60000).toISOString(),
            transitingBody,
            natalTarget,
            aspect: aspectType,
            theme: `${TRANSIT_THEME[transitingBody]}·${ASPECT_TONE[aspectType]}`,
          });
        }
      }
    }
  }

  return transits.sort((a, b) => {
    if (a.startsAt !== b.startsAt) return a.startsAt < b.startsAt ? -1 : 1;
    const startDelta = BODY_ORDER.indexOf(a.transitingBody) - BODY_ORDER.indexOf(b.transitingBody);
    if (startDelta !== 0) return startDelta;
    const targetDelta = BODY_ORDER.indexOf(a.natalTarget) - BODY_ORDER.indexOf(b.natalTarget);
    if (targetDelta !== 0) return targetDelta;
    return a.aspect < b.aspect ? -1 : a.aspect > b.aspect ? 1 : 0;
  });
}

/** 行运目标：只取度数稳定（stable）的本命星体落点 */
function transitTargetsOf(planets: PlanetPlacement[], longitudes: Record<PlanetBody, number>): Partial<Record<PlanetBody, number>> {
  const targets: Partial<Record<PlanetBody, number>> = {};
  for (const planet of planets) {
    if (planet.stability === 'stable' && planet.sign !== null) {
      targets[planet.body] = longitudes[planet.body];
    }
  }
  return targets;
}

/* ============================ 约时 / 未知档构建 ============================ */

/** 约时档：区间采样稳定性校验；角点/宫位不稳定 → 无宫位降级 */
function buildApproximateFacts(
  profile: AstroBirthProfile,
  sampled: SampledFacts,
  calculatedAt: string,
  transits: TransitFact[]
): AstrologyChartFacts {
  const withHouses = sampled.anglesStable && sampled.houses.length === 12;

  const signOnlyCount = sampled.planets.filter((p) => p.stability === 'signOnly').length;
  const unstableCount = sampled.planets.filter((p) => p.stability === 'unstable').length;
  const noteParts: string[] = [];
  if (!withHouses) noteParts.push('约时：上升、天顶与宫位在所选时段内不稳定，已按无宫位范围展示');
  if (signOnlyCount > 0) noteParts.push('部分星体度数不稳定，仅展示星座');
  if (unstableCount > 0) noteParts.push('个别星体在时段内跨星座，已隐藏');

  return assembleFacts(profile, calculatedAt, transits, {
    houseSystem: sampled.houseSystem,
    dataCompleteness: withHouses ? 'with-houses' : 'without-houses',
    planets: sampled.planets,
    angles: sampled.angles,
    houses: sampled.houses,
    aspects: sampled.aspects,
    factStability: {
      angles: sampled.anglesStable
        ? { displayable: true, reason: null, detail: null }
        : hiddenStatus('unstable-in-range', '上升与天顶在所选时段内不稳定（文档 §9.2）'),
      houses: withHouses
        ? { displayable: true, reason: null, detail: null }
        : hiddenStatus('unstable-in-range', '上升不稳定，宫位无法确定，已按无宫位范围降级（文档 §6.2）'),
      placements: Object.fromEntries(
        sampled.planets.map((p) => [
          p.body,
          p.stability === 'stable'
            ? { displayable: true, reason: null, detail: null }
            : p.stability === 'signOnly'
              ? { displayable: true, reason: null, detail: '该星体在所选时段内度数不稳定，仅展示星座' }
              : hiddenStatus('unstable-in-range', '该星体在所选时段内星座不稳定，已隐藏'),
        ])
      ) as Record<PlanetBody, StabilityStatus>,
      aspects: {
        displayable: true,
        reason: null,
        detail: `区间内成相且稳定的相位共 ${sampled.stableAspectCount} 条`,
      },
      note: noteParts.length > 0 ? noteParts.join('；') : null,
    },
  });
}

/** 未知档：无宫位无四轴，仅整日稳定的星座与主要相位（度数一律为 null） */
function buildUnknownFacts(
  profile: AstroBirthProfile,
  interval: ResolvedBirthInterval,
  calculatedAt: string,
  transits: TransitFact[]
): AstrologyChartFacts {
  const sampled = sampleFacts(profile, interval, {
    stepMinutes: UNKNOWN_SAMPLE_STEP_MINUTES,
    showDegrees: false,
    withAngles: false,
  });

  return assembleFacts(profile, calculatedAt, transits, {
    houseSystem: null,
    dataCompleteness: 'without-houses',
    planets: sampled.planets.map((p) => ({ ...p, house: null })),
    angles: { ascendant: hiddenAngle('ascendant'), midheaven: hiddenAngle('midheaven') },
    houses: [],
    aspects: sampled.aspects,
    factStability: {
      angles: hiddenStatus('time-unknown', '出生时间未知，不计算上升与天顶（文档 §9.2）'),
      houses: hiddenStatus('time-unknown', '出生时间未知，不计算十二宫（文档 §9.2）'),
      placements: Object.fromEntries(
        sampled.planets.map((p) => [
          p.body,
          // 展示口径就是「星座是否可用」：未知档一律不展示度数，星座稳定即展示
          // （快星体如月亮可能整日跨座而整颗隐藏；慢星体整日稳定，台账必须与展示一致）
          p.sign !== null
            ? {
                displayable: true,
                reason: null,
                detail:
                  p.stability === 'stable'
                    ? '该星体星座与整度数在当日稳定；时间未知档不展示度数'
                    : '该星体星座在整日内稳定，度数不展示',
              }
            : hiddenStatus('time-unknown', '该星体在当日跨星座，当前资料无法确定'),
        ])
      ) as Record<PlanetBody, StabilityStatus>,
      aspects: {
        displayable: true,
        reason: null,
        detail: `整日内成相且稳定的相位共 ${sampled.stableAspectCount} 条`,
      },
      note: '出生时间未知：未计算上升、天顶与宫位；仅展示整日内稳定的星体星座与主要相位',
    },
  });
}

/* ============================ 接缝实现 ============================ */

/**
 * 计算 at 时刻的星盘事实（含行运扩展）。
 * 测试与冻结脚本传入固定 at 即可得到完全确定的结果；本命盘部分与 at 无关（除 calculatedAt）。
 */
export function computeChartFactsAt(profile: AstroBirthProfile, at: Date): AstrologyChartFacts {
  const calculatedAt = at.toISOString();
  switch (profile.timePrecision) {
    case 'accurate': {
      const instant = resolveProfileInstant(profile);
      const snapshot = snapshotAt(instant.utcMs, profile.latitude, profile.longitude, true);
      const transits = computeTransitFacts(snapshot.longitudes, profile, at);
      return buildAccurateFacts(profile, snapshot, calculatedAt, transits);
    }
    case 'approximate': {
      const interval = resolveProfileInterval(profile);
      const sampled = sampleFacts(profile, interval, {
        stepMinutes: APPROXIMATE_SAMPLE_STEP_MINUTES,
        showDegrees: true,
        withAngles: true,
      });
      // 行运目标只取度数稳定的星体（代表时刻取区间起点，与 unstable 字段一律隐藏的口径一致）
      const representative = snapshotAt(interval.startMs, profile.latitude, profile.longitude, false);
      const transits = computeTransitFacts(
        transitTargetsOf(sampled.planets, representative.longitudes),
        profile,
        at
      );
      return buildApproximateFacts(profile, sampled, calculatedAt, transits);
    }
    case 'unknown': {
      const interval = resolveProfileCivilDay(profile);
      // 未知档不展示任何度数，落点不足以支撑行运判定（文档 §11.1：行运不可用时隐藏本周行动三角）
      return buildUnknownFacts(profile, interval, calculatedAt, []);
    }
  }
}

/**
 * 占星真值计算域真实实现（文档 §9.3 声明的唯一接缝）。
 * 注意：行运以「本次计算时刻」所在自然周为窗口，故同一出生资料在不同时间的行运事实不同，
 * 本命盘部分完全一致（确定性）。
 */
export const computeChartFacts: ComputeChartFacts = (profile) => computeChartFactsAt(profile, new Date());
