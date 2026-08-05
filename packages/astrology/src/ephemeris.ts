/**
 * 星历计算：太阳、月亮与九大行星（含冥王星）的地心视黄经。
 *
 * 实现基于 Paul Schlyter「Computing planetary positions」的简化解析理论与 Meeus
 * 《Astronomical Algorithms》中的章动、光行差修正，在 1800–2100 年间整体精度约
 * 1–2 角分，满足 ±0.1° 的占星排盘需求。无运行时依赖。
 */

import { ZODIAC_SIGNS } from './constants';
import { degToRad, normalizeDegree, radToDeg, shortestArcDelta } from './geo';

/** 支持的星体集合。 */
export type PlanetBody =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

/** 全部星体标识，按黄道顺序惯例排列。 */
export const PLANET_BODIES: PlanetBody[] = [
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

/** 星座映射结果。 */
export interface ZodiacPosition {
  /** 星座英文标识 */
  signId: string;
  /** 星座中文名 */
  signCn: string;
  /** 星座内度数 [0, 30) */
  degreeInSign: number;
}

/** 黄道直角坐标与球坐标。 */
interface EclipticCoords {
  x: number;
  y: number;
  z: number;
  r: number;
  lon: number;
  lat: number;
}

/** 开普勒轨道根数。 */
interface OrbitalElements {
  N: number;
  i: number;
  w: number;
  a: number;
  e: number;
  M: number;
}

/** 儒略日转 Schlyter 日数 d（2000 Jan 0.0 起算）。 */
function jdToDayNumber(jd: number): number {
  return jd - 2451543.5;
}

/** 将角度规范化到 [0, 360) 后转弧度。 */
function normalizeRad(deg: number): number {
  return degToRad(normalizeDegree(deg));
}

/** 求解开普勒方程，返回偏近点角 E（度）。 */
function solveKepler(meanAnomalyDeg: number, eccentricity: number): number {
  const e = eccentricity;
  const toRad = Math.PI / 180;
  let E =
    meanAnomalyDeg +
    (180 / Math.PI) *
      e *
      Math.sin(meanAnomalyDeg * toRad) *
      (1 + e * Math.cos(meanAnomalyDeg * toRad));

  for (let iter = 0; iter < 12; iter++) {
    const ERad = E * toRad;
    const deltaE =
      (E - (180 / Math.PI) * e * Math.sin(ERad) - meanAnomalyDeg) /
      (1 - e * Math.cos(ERad));
    E -= deltaE;
    if (Math.abs(deltaE) < 0.0005) {
      break;
    }
  }

  return E;
}

/** 由轨道根数计算日心黄道直角坐标与球坐标。 */
function heliocentricFromElements(el: OrbitalElements): EclipticCoords {
  const N = normalizeRad(el.N);
  const i = normalizeRad(el.i);
  const w = normalizeRad(el.w);
  const e = el.e;
  const a = el.a;
  const M = normalizeDegree(el.M);

  const E = solveKepler(M, e);
  const ER = degToRad(E);

  const xOrbit = a * (Math.cos(ER) - e);
  const yOrbit = a * Math.sqrt(1 - e * e) * Math.sin(ER);

  const r = Math.hypot(xOrbit, yOrbit);
  const v = Math.atan2(yOrbit, xOrbit);
  const vw = v + w;

  const sinN = Math.sin(N);
  const cosN = Math.cos(N);
  const sinVw = Math.sin(vw);
  const cosVw = Math.cos(vw);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  const xh = r * (cosN * cosVw - sinN * sinVw * cosI);
  const yh = r * (sinN * cosVw + cosN * sinVw * cosI);
  const zh = r * (sinVw * sinI);

  const lon = radToDeg(Math.atan2(yh, xh));
  const lat = radToDeg(Math.atan2(zh, Math.hypot(xh, yh)));

  return { x: xh, y: yh, z: zh, r, lon, lat };
}

/** 太阳（实为地球）的轨道根数。 */
function sunElements(d: number): OrbitalElements {
  return {
    N: 0.0,
    i: 0.0,
    w: 282.9404 + 4.70935e-5 * d,
    a: 1.000_000,
    e: 0.016_709 - 1.151e-9 * d,
    M: 356.047 + 0.985_600_258_5 * d,
  };
}

/** 计算章动 in longitude（度）。 */
function nutationLongitude(d: number): number {
  const T = d / 36525;
  const omega = normalizeDegree(125.04452 - 1934.136261 * T);
  const L = normalizeDegree(280.4665 + 36000.7698 * T);
  const Lp = normalizeDegree(218.3165 + 481267.8813 * T);

  // 章动主要项，单位角秒，转为度。
  const deltaPsiArcsec =
    -17.2 * Math.sin(degToRad(omega)) -
    1.32 * Math.sin(degToRad(2 * L)) -
    0.23 * Math.sin(degToRad(2 * Lp)) +
    0.21 * Math.sin(degToRad(2 * omega));

  return deltaPsiArcsec / 3600;
}

/** 计算太阳视黄经（含章动与光行差）。
 *
 * 太阳的轨道根数在 Schlyter 方法中被视为以地球为中心的地心轨道，
 * 因此直接用轨道根数计算出的日心（实为地心）黄经即为太阳黄经。
 */
function sunApparentLongitude(d: number): number {
  const sunGeo = heliocentricFromElements(sunElements(d));
  let lon = sunGeo.lon;
  lon += nutationLongitude(d);
  // 太阳周年光行差修正，r 为日地距离（AU）。
  lon -= 20.49552 / 3600 / sunGeo.r;
  return normalizeDegree(lon);
}

/** 计算月亮视黄经（含主要周期项摄动与章动）。 */
function moonApparentLongitude(d: number): number {
  const moonEl: OrbitalElements = {
    N: 125.1228 - 0.0529538083 * d,
    i: 5.1454,
    w: 318.0634 + 0.1643573223 * d,
    a: 60.2666,
    e: 0.0549,
    M: 115.3654 + 13.0649929509 * d,
  };
  const moonGeo = heliocentricFromElements(moonEl);
  let lon = moonGeo.lon;

  // 太阳辅助量（用于月亮摄动）。
  const sunEl = sunElements(d);
  const Ms = normalizeDegree(sunEl.M);
  const ws = normalizeDegree(sunEl.w);
  const Ls = normalizeDegree(Ms + ws);
  const Mm = normalizeDegree(moonEl.M);
  const wm = normalizeDegree(moonEl.w);
  const Nm = normalizeDegree(moonEl.N);
  const Lm = normalizeDegree(Mm + wm + Nm);
  const D = normalizeDegree(Lm - Ls);
  const F = normalizeDegree(Lm - Nm);

  const rMs = degToRad(Ms);
  const rMm = degToRad(Mm);
  const rD = degToRad(D);
  const rF = degToRad(F);
  const r2D = degToRad(2 * D);

  // ELP-2000 简化主项（经度摄动），精度约 1–2 角分。
  const deltaLon =
    -1.274 * Math.sin(rMm - r2D) +
    0.658 * Math.sin(r2D) -
    0.186 * Math.sin(rMs) -
    0.059 * Math.sin(2 * rMm - r2D) -
    0.057 * Math.sin(rMm - r2D + rMs) +
    0.053 * Math.sin(rMm + r2D) +
    0.046 * Math.sin(r2D - rMs) +
    0.041 * Math.sin(rMm - rMs) -
    0.035 * Math.sin(rD) -
    0.031 * Math.sin(rMm + rMs) -
    0.015 * Math.sin(2 * rF - r2D) +
    0.011 * Math.sin(rMm - 2 * r2D);

  lon += deltaLon;
  lon += nutationLongitude(d);
  return normalizeDegree(lon);
}

/** 行星轨道根数表。 */
function planetElements(body: Exclude<PlanetBody, 'sun' | 'moon' | 'pluto'>, d: number): OrbitalElements {
  switch (body) {
    case 'mercury':
      return {
        N: 48.3313 + 3.24587e-5 * d,
        i: 7.0047 + 5.0e-8 * d,
        w: 29.1241 + 1.01444e-5 * d,
        a: 0.387098,
        e: 0.205635 + 5.59e-10 * d,
        M: 168.6562 + 4.0923344368 * d,
      };
    case 'venus':
      return {
        N: 76.6799 + 2.4659e-5 * d,
        i: 3.3946 + 2.75e-8 * d,
        w: 54.891 + 1.38374e-5 * d,
        a: 0.72333,
        e: 0.006773 - 1.302e-9 * d,
        M: 48.0052 + 1.6021302244 * d,
      };
    case 'mars':
      return {
        N: 49.5574 + 2.11081e-5 * d,
        i: 1.8497 - 1.78e-8 * d,
        w: 286.5016 + 2.92961e-5 * d,
        a: 1.523688,
        e: 0.093405 + 2.516e-9 * d,
        M: 18.6021 + 0.5240207766 * d,
      };
    case 'jupiter':
      return {
        N: 100.4542 + 2.76854e-5 * d,
        i: 1.303 - 1.557e-7 * d,
        w: 273.8777 + 1.64505e-5 * d,
        a: 5.20256,
        e: 0.048498 + 4.469e-9 * d,
        M: 19.895 + 0.0830853001 * d,
      };
    case 'saturn':
      return {
        N: 113.6634 + 2.3898e-5 * d,
        i: 2.4886 - 1.081e-7 * d,
        w: 339.3939 + 2.97661e-5 * d,
        a: 9.55475,
        e: 0.055546 - 9.499e-9 * d,
        M: 316.967 + 0.0334442282 * d,
      };
    case 'uranus':
      return {
        N: 74.0005 + 1.3978e-5 * d,
        i: 0.7733 + 1.9e-8 * d,
        w: 96.6612 + 3.0565e-5 * d,
        a: 19.18171 - 1.55e-8 * d,
        e: 0.047318 + 7.45e-9 * d,
        M: 142.5905 + 0.011725806 * d,
      };
    case 'neptune':
      return {
        N: 131.7806 + 3.0173e-5 * d,
        i: 1.77 - 2.55e-7 * d,
        w: 272.8461 - 6.027e-6 * d,
        a: 30.05826 + 3.313e-8 * d,
        e: 0.008606 + 2.15e-9 * d,
        M: 260.2471 + 0.005995147 * d,
      };
    default:
      throw new Error(`未知行星: ${body}`);
  }
}

/** 计算行星平均近点角，用于摄动修正。 */
function meanAnomaly(body: Exclude<PlanetBody, 'sun' | 'moon' | 'pluto'>, d: number): number {
  return normalizeDegree(planetElements(body, d).M);
}

/** 行星大距摄动修正（度）。 */
function planetaryPerturbations(
  body: Exclude<PlanetBody, 'sun' | 'moon' | 'pluto'>,
  d: number
): number {
  if (body !== 'jupiter' && body !== 'saturn' && body !== 'uranus') {
    return 0;
  }

  const Mj = meanAnomaly('jupiter', d);
  const Ms = meanAnomaly('saturn', d);
  const Mu = meanAnomaly('uranus', d);

  const rMj = degToRad(Mj);
  const rMs = degToRad(Ms);
  const rMu = degToRad(Mu);

  if (body === 'jupiter') {
    return (
      -0.332 * Math.sin(2 * rMj - 5 * rMs - degToRad(67.6)) -
      0.056 * Math.sin(2 * rMj - 2 * rMs + degToRad(21)) +
      0.042 * Math.sin(3 * rMj - 5 * rMs + degToRad(21)) -
      0.036 * Math.sin(rMj - 2 * rMs) +
      0.022 * Math.cos(rMj - rMs) +
      0.023 * Math.sin(2 * rMj - 3 * rMs + degToRad(52)) -
      0.016 * Math.sin(rMj - 5 * rMs - degToRad(69))
    );
  }

  if (body === 'saturn') {
    return (
      0.812 * Math.sin(2 * rMj - 5 * rMs - degToRad(67.6)) -
      0.229 * Math.cos(2 * rMj - 4 * rMs - degToRad(2)) +
      0.119 * Math.sin(rMj - 2 * rMs - degToRad(3)) +
      0.046 * Math.sin(2 * rMj - 6 * rMs - degToRad(69)) +
      0.014 * Math.sin(rMj - 3 * rMs + degToRad(32))
    );
  }

  // uranus
  return (
    0.04 * Math.sin(rMs - 2 * rMu + degToRad(6)) +
    0.035 * Math.sin(rMs - 3 * rMu + degToRad(33)) -
    0.015 * Math.sin(rMj - rMu + degToRad(20))
  );
}

/** 由日心黄道坐标与太阳地心坐标转为地心黄道坐标。 */
function heliocentricToGeocentric(
  helio: EclipticCoords,
  sunGeo: EclipticCoords
): EclipticCoords {
  // 地球日心坐标 = -太阳地心坐标，因此行星地心 = 行星日心 - 地球日心 = 行星日心 + 太阳地心。
  const x = helio.x + sunGeo.x;
  const y = helio.y + sunGeo.y;
  const z = helio.z + sunGeo.z;
  const r = Math.hypot(x, y, z);
  const lon = radToDeg(Math.atan2(y, x));
  const lat = radToDeg(Math.atan2(z, Math.hypot(x, y)));
  return { x, y, z, r, lon, lat };
}

/** 周年光行差修正（度）。 */
function annualAberration(
  lon: number,
  lat: number,
  sunLon: number,
  earthDist: number
): number {
  const k = 20.49552 / 3600; // 光行差常数，度
  const delta = degToRad(lon - sunLon);
  const beta = degToRad(lat);
  return (-k * Math.cos(delta)) / (earthDist * Math.cos(beta));
}

/** 计算行星（含水星至海王星）视黄经。 */
function planetApparentLongitude(
  body: Exclude<PlanetBody, 'sun' | 'moon' | 'pluto'>,
  d: number,
  sunGeo: EclipticCoords
): number {
  const helio = heliocentricFromElements(planetElements(body, d));
  const geo = heliocentricToGeocentric(helio, sunGeo);
  let lon = geo.lon;
  lon += planetaryPerturbations(body, d);
  lon += nutationLongitude(d);
  lon += annualAberration(lon, geo.lat, sunGeo.lon, sunGeo.r);
  return normalizeDegree(lon);
}

/** 冥王星 Fourier 拟合日心坐标，有效范围约 1800–2100 年。 */
function plutoHeliocentric(d: number): EclipticCoords {
  const S = degToRad(50.03 + 0.033459652 * d);
  const P = degToRad(238.95 + 0.003968789 * d);

  const lonecl =
    238.9508 +
    0.00400703 * d -
    19.799 * Math.sin(P) +
    19.848 * Math.cos(P) +
    0.897 * Math.sin(2 * P) -
    4.956 * Math.cos(2 * P) +
    0.61 * Math.sin(3 * P) +
    1.211 * Math.cos(3 * P) -
    0.341 * Math.sin(4 * P) -
    0.19 * Math.cos(4 * P) +
    0.128 * Math.sin(5 * P) -
    0.034 * Math.cos(5 * P) -
    0.038 * Math.sin(6 * P) +
    0.031 * Math.cos(6 * P) +
    0.02 * Math.sin(S - P) -
    0.01 * Math.cos(S - P);

  const latecl =
    -3.9082 -
    5.453 * Math.sin(P) -
    14.975 * Math.cos(P) +
    3.527 * Math.sin(2 * P) +
    1.673 * Math.cos(2 * P) -
    1.051 * Math.sin(3 * P) +
    0.328 * Math.cos(3 * P) +
    0.179 * Math.sin(4 * P) -
    0.292 * Math.cos(4 * P) +
    0.019 * Math.sin(5 * P) +
    0.1 * Math.cos(5 * P) -
    0.031 * Math.sin(6 * P) -
    0.026 * Math.cos(6 * P) +
    0.011 * Math.cos(S - P);

  const r =
    40.72 +
    6.68 * Math.sin(P) +
    6.9 * Math.cos(P) -
    1.18 * Math.sin(2 * P) -
    0.03 * Math.cos(2 * P) +
    0.15 * Math.sin(3 * P) -
    0.14 * Math.cos(3 * P);

  const lonR = degToRad(lonecl);
  const latR = degToRad(latecl);

  const x = r * Math.cos(lonR) * Math.cos(latR);
  const y = r * Math.sin(lonR) * Math.cos(latR);
  const z = r * Math.sin(latR);

  return { x, y, z, r, lon: lonecl, lat: latecl };
}

/** 计算冥王星视黄经。 */
function plutoApparentLongitude(d: number, sunGeo: EclipticCoords): number {
  const helio = plutoHeliocentric(d);
  const geo = heliocentricToGeocentric(helio, sunGeo);
  let lon = geo.lon;
  lon += nutationLongitude(d);
  lon += annualAberration(lon, geo.lat, sunGeo.lon, sunGeo.r);
  return normalizeDegree(lon);
}

/**
 * 计算指定星体在指定儒略日的地心视黄经（度，规范化到 [0, 360)）。
 */
export function planetLongitude(body: PlanetBody, jd: number): number {
  const d = jdToDayNumber(jd);

  switch (body) {
    case 'sun':
      return sunApparentLongitude(d);
    case 'moon':
      return moonApparentLongitude(d);
    case 'pluto': {
      const sunGeo = heliocentricFromElements(sunElements(d));
      return plutoApparentLongitude(d, sunGeo);
    }
    default: {
      const sunGeo = heliocentricFromElements(sunElements(d));
      return planetApparentLongitude(body, d, sunGeo);
    }
  }
}

/**
 * 批量计算全部星体在指定儒略日的地心视黄经。
 */
export function allPlanetsLongitude(jd: number): Record<PlanetBody, number> {
  const result = {} as Record<PlanetBody, number>;
  for (const body of PLANET_BODIES) {
    result[body] = planetLongitude(body, jd);
  }
  return result;
}

/**
 * 将黄经映射到星座与星座内度数。
 */
export function longitudeToZodiac(longitude: number): ZodiacPosition {
  const lon = normalizeDegree(longitude);
  const signIndex = Math.min(Math.floor(lon / 30), 11);
  const sign = ZODIAC_SIGNS[signIndex];
  return {
    signId: sign.id,
    signCn: sign.cn,
    degreeInSign: lon - sign.startLongitude,
  };
}

/** 逆行判定差分步长（儒略日，约 1 小时）。 */
const RETROGRADE_EPSILON_DAYS = 1 / 24;

/**
 * 判断指定星体在指定儒略日是否逆行。
 *
 * 太阳与月亮恒为顺行；其余星体通过 jd±ε 数值差分判断黄经变化方向。
 */
export function isRetrograde(body: PlanetBody, jd: number): boolean {
  if (body === 'sun' || body === 'moon') {
    return false;
  }

  const lonBefore = planetLongitude(body, jd - RETROGRADE_EPSILON_DAYS);
  const lonAfter = planetLongitude(body, jd + RETROGRADE_EPSILON_DAYS);
  const delta = shortestArcDelta(lonBefore, lonAfter);
  return delta < 0;
}
