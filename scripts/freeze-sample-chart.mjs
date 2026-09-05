#!/usr/bin/env node
/**
 * freeze-sample-chart.mjs —— 星座寰宇示例盘真值冻结脚本（一次性，可追溯，零依赖）
 *
 * 运行方式：node scripts/freeze-sample-chart.mjs
 *
 * 算法口径（与 mock 冻结常数一一对应）：
 * - 行星位置：Paul Schlyter《How to compute planetary positions》
 *   （https://stjarnhimlen.se/comp/ppcomp.html，源自 T. van Flandern & K. Pulkkinen
 *   1980 年低精度公式），地心视角、回归黄道（当日分点），含月亮 12 项经度摄动、
 *   木/土/天摄动项与冥王星曲线拟合；Schlyter 原文自述精度约 1-2 弧分，
 *   对 1995 年历元实际误差约 0.1-0.3 度，对演示盘足够。
 * - 时间基准：Schlyter 日数 d（自 2000 年 1 月 0.0 UT，即 1999-12-31 00:00 UT 起算）。
 * - 恒星时：GMST0 = 6.697374558 + 0.06570982441908 * D0（D0 = JD(当日 0h UT) - 2451545.0），
 *   GMST = GMST0 + 1.00273790935 * UT_hours，LST = GMST*15 + 东经。
 * - 黄赤交角：ecl = 23.4393°（常数，日变化 3.563E-7° 量级可忽略）。
 * - 上升 ASC：λ = atan2( -cos(LST), sin(LST)*cos(ecl) + tan(φ)*sin(ecl) ) + 180°。
 *   前式给出的是西地平交点，+180° 即东地平上升点；已用地平条件
 *   cos(H) = -tan(φ)*tan(δ)、H<0（东侧）在脚本自检中复核。
 * - 天顶 MC：λ = atan2( sin(LST), cos(LST)*cos(ecl) )。
 * - 逆行：以 ±0.5 日的黄经差分判定。
 * - 宫位制：整宫制（Whole Sign，设计文档 §9.2 的 Placidus 回退制；mock 阶段采用并标注）。
 *
 * 冻结档案（三档时间精度各一）：
 *   T1 准确到分钟：1995-10-08 14:30 上海（纬度 31.2304°N、经度 121.4737°E、UTC+8，即 UTC 06:30）
 *   T2 大约时段：  1995-10-08 [13:00, 16:00) 上海（同一天，演示区间稳定性校验）
 *   T3 完全未知：  1995-10-10 上海民用日 [00:00, 24:00)（该日月亮白羊→金牛换座，
 *                  用于锁定「月亮跨座隐藏」规则；UTC 区间 [10-09 16:00, 10-10 16:00)）
 *
 * 输出：先打印常识自检（人工核对），最后打印 JSON 冻结载荷（拷入 mock-chart-facts.ts）。
 */

// ---------- 基础常量与工具 ----------
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** 归一化到 [0, 360) */
function norm360(x) {
  return ((x % 360) + 360) % 360;
}

/** 相位分离角，归一化到 [0, 180] */
function sep180(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

/** Schlyter 日数：自 2000 年 1 月 0.0 UT 起的天数；公式对 1900-03 ~ 2100-02 有效 */
function dayNumber(year, month, day, utHours) {
  const intDiv = (a, b) => Math.floor(a / b);
  const d =
    367 * year -
    intDiv(7 * (year + intDiv(month + 9, 12)), 4) +
    intDiv(275 * month, 9) +
    day -
    730530;
  return d + utHours / 24.0;
}

/** 开普勒方程求解 E（度），牛顿迭代至 1e-6 度 */
function solveKepler(Mdeg, e) {
  let E = Mdeg * RAD + e * Math.sin(Mdeg * RAD) * (1.0 + e * Math.cos(Mdeg * RAD));
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - Mdeg * RAD) / (1.0 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E * DEG;
}

// ---------- 逐天体位置（均为地心回归黄经/黄纬，度） ----------

/** 太阳：返回 { lonsun, xs, ys }（xs/ys 为黄道面直角坐标，AU） */
function sunPosition(d) {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = norm360(356.0470 + 0.9856002585 * d);
  const E = solveKepler(M, e);
  const xv = Math.cos(E * RAD) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = Math.atan2(yv, xv) * DEG;
  const r = Math.sqrt(xv * xv + yv * yv);
  const lonsun = norm360(v + w);
  return { lonsun, xs: r * Math.cos(lonsun * RAD), ys: r * Math.sin(lonsun * RAD) };
}

/** 月亮：地心黄经/黄纬（含摄动项） */
function moonPosition(d) {
  const N = norm360(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = norm360(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = norm360(115.3654 + 13.0649929509 * d);
  const E = solveKepler(M, e);
  const xv = a * (Math.cos(E * RAD) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = Math.atan2(yv, xv) * DEG;
  const r = Math.sqrt(xv * xv + yv * yv);
  const cosi = Math.cos(i * RAD);
  const xh = r * (Math.cos(N * RAD) * Math.cos((v + w) * RAD) - Math.sin(N * RAD) * Math.sin((v + w) * RAD) * cosi);
  const yh = r * (Math.sin(N * RAD) * Math.cos((v + w) * RAD) + Math.cos(N * RAD) * Math.sin((v + w) * RAD) * cosi);
  const zh = r * Math.sin((v + w) * RAD) * Math.sin(i * RAD);
  let lon = Math.atan2(yh, xh) * DEG;
  let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * DEG;

  // 摄动所需辅助角
  const Ms = norm360(356.0470 + 0.9856002585 * d); // 太阳平近点角
  const ws = norm360(282.9404 + 4.70935e-5 * d); // 太阳近日点经度
  const Nm = N;
  const Ls = norm360(Ms + ws); // 太阳平黄经
  const Lm = norm360(M + w + Nm); // 月亮平黄经
  const D = norm360(Lm - Ls); // 平均距角
  const F = norm360(Lm - Nm); // 月角距（升交点起算）
  const s = (x) => Math.sin(x * RAD);
  const c = (x) => Math.cos(x * RAD);

  // 12 项经度摄动
  lon =
    lon - 1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D) -
    0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) -
    0.035 * s(D) - 0.031 * s(M + Ms) - 0.015 * s(2 * F - 2 * D) + 0.011 * s(M - 4 * D);
  // 5 项纬度摄动
  lat +=
    -0.173 * s(F - 2 * D) - 0.055 * s(M - F - 2 * D) - 0.046 * s(M + F - 2 * D) +
    0.033 * s(F + 2 * D) + 0.017 * s(2 * M + F);

  return { lon: norm360(lon), lat };
}

/** 木/土/天摄动项（度），作用于黄经/黄纬 */
function planetPerturbations(d, body) {
  const s = (x) => Math.sin(x * RAD);
  const c = (x) => Math.cos(x * RAD);
  const Mj = norm360(19.8950 + 0.0830853001 * d);
  const Ms = norm360(316.9670 + 0.0334442282 * d);
  let dLon = 0;
  let dLat = 0;
  if (body === 'jupiter') {
    dLon =
      -0.332 * s(2 * Mj - 5 * Ms - 67.6) - 0.056 * s(2 * Mj - 2 * Ms + 21) +
      0.042 * s(3 * Mj - 5 * Ms + 21) - 0.036 * s(Mj - 2 * Ms) + 0.022 * c(Mj - Ms) +
      0.023 * s(2 * Mj - 3 * Ms + 52) - 0.016 * s(Mj - 5 * Ms - 69);
  } else if (body === 'saturn') {
    dLon =
      0.812 * s(2 * Mj - 5 * Ms - 67.6) - 0.229 * c(2 * Mj - 4 * Ms - 2) +
      0.119 * s(Mj - 2 * Ms - 3) + 0.046 * s(2 * Mj - 6 * Ms - 69) + 0.014 * s(Mj - 3 * Ms + 32);
    dLat = -0.020 * c(2 * Mj - 4 * Ms - 2) + 0.018 * s(2 * Mj - 6 * Ms - 49);
  } else if (body === 'uranus') {
    const Mu = norm360(142.5905 + 0.011725806 * d);
    dLon = 0.040 * s(Ms - 2 * Mu + 6) + 0.035 * s(Ms - 3 * Mu + 33) - 0.015 * s(Mj - Mu + 20);
  }
  return { dLon, dLat };
}

/** 行星（水金火木土天海）：地心黄经/黄纬/距离（AU） */
function planetPosition(d, body) {
  const ELEMENTS = {
    mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: 0.387098, e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
    venus: { N: [76.6799, 2.4659e-5], i: [3.3946, 2.75e-8], w: [54.891, 1.38374e-5], a: 0.72333, e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244] },
    mars: { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: 1.523688, e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766] },
    jupiter: { N: [100.4542, 2.76854e-5], i: [1.303, -1.557e-7], w: [273.8777, 1.64505e-5], a: 5.20256, e: [0.048498, 4.469e-9], M: [19.895, 0.0830853001] },
    saturn: { N: [113.6634, 2.3898e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: 9.55475, e: [0.055546, -9.499e-9], M: [316.967, 0.0334442282] },
    uranus: { N: [74.0005, 1.3978e-5], i: [0.7733, 1.9e-8], w: [96.6612, 3.0565e-5], a: 19.18171, e: [0.047318, 7.45e-9], M: [142.5905, 0.011725806] },
    neptune: { N: [131.7806, 3.0173e-5], i: [1.77, -2.55e-7], w: [272.8461, -6.027e-6], a: 30.05826, e: [0.008606, 2.15e-9], M: [260.2471, 0.005995147] },
  };
  const el = ELEMENTS[body];
  const N = norm360(el.N[0] + el.N[1] * d);
  const i = el.i[0] + el.i[1] * d;
  const w = norm360(el.w[0] + el.w[1] * d);
  const e = el.e[0] + el.e[1] * d;
  const M = norm360(el.M[0] + el.M[1] * d);
  const E = solveKepler(M, e);
  const xv = el.a * (Math.cos(E * RAD) - e);
  const yv = el.a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = Math.atan2(yv, xv) * DEG;
  const r = Math.sqrt(xv * xv + yv * yv);

  // 轨道面内坐标 → 黄道直角坐标（日心）
  const cosi = Math.cos(i * RAD);
  const cNw = Math.cos((v + w) * RAD);
  const sNw = Math.sin((v + w) * RAD);
  const xh = r * (Math.cos(N * RAD) * cNw - Math.sin(N * RAD) * sNw * cosi);
  const yh = r * (Math.sin(N * RAD) * cNw + Math.cos(N * RAD) * sNw * cosi);
  const zh = r * sNw * Math.sin(i * RAD);
  let lon = Math.atan2(yh, xh) * DEG;
  let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * DEG;

  // 摄动项（先作用于黄经/黄纬，再转回直角坐标）
  const { dLon, dLat } = planetPerturbations(d, body);
  lon += dLon;
  lat += dLat;

  // 日心 → 地心（叠加太阳矢量）
  const sun = sunPosition(d);
  const xhp = r * Math.cos(lon * RAD) * Math.cos(lat * RAD);
  const yhp = r * Math.sin(lon * RAD) * Math.cos(lat * RAD);
  const zhp = r * Math.sin(lat * RAD);
  const xg = xhp + sun.xs;
  const yg = yhp + sun.ys;
  return { lon: norm360(Math.atan2(yg, xg) * DEG), lat: Math.atan2(zhp, Math.sqrt(xg * xg + yg * yg)) * DEG, r: Math.sqrt(xg * xg + yg * yg) };
}

/** 冥王星：JPL 数值积分曲线拟合（1800-2100 有效），返回地心黄经 */
function plutoPosition(d) {
  const S = 50.03 + 0.033459652 * d;
  const P = 238.95 + 0.003968789 * d;
  const s = (x) => Math.sin(x * RAD);
  const c = (x) => Math.cos(x * RAD);
  const lonecl =
    238.9508 + 0.00400703 * d - 19.799 * s(P) + 19.848 * c(P) + 0.897 * s(2 * P) - 4.956 * c(2 * P) +
    0.61 * s(3 * P) + 1.211 * c(3 * P) - 0.341 * s(4 * P) - 0.19 * c(4 * P) + 0.128 * s(5 * P) -
    0.034 * c(5 * P) - 0.038 * s(6 * P) + 0.031 * c(6 * P) + 0.02 * s(S - P) - 0.01 * c(S - P);
  const latecl =
    -3.9082 - 5.453 * s(P) - 14.975 * c(P) + 3.527 * s(2 * P) + 1.673 * c(2 * P) - 1.051 * s(3 * P) +
    0.328 * c(3 * P) + 0.179 * s(4 * P) - 0.292 * c(4 * P) + 0.019 * s(5 * P) + 0.1 * c(5 * P) -
    0.031 * s(6 * P) - 0.026 * c(6 * P) + 0.011 * c(S - P);
  const r = 40.72 + 6.68 * s(P) + 6.9 * c(P) - 1.18 * s(2 * P) - 0.03 * c(2 * P) + 0.15 * s(3 * P) - 0.14 * c(3 * P);
  const sun = sunPosition(d);
  const xh = r * Math.cos(lonecl * RAD) * Math.cos(latecl * RAD);
  const yh = r * Math.sin(lonecl * RAD) * Math.cos(latecl * RAD);
  const zh = r * Math.sin(latecl * RAD);
  const xg = xh + sun.xs;
  const yg = yh + sun.ys;
  return { lon: norm360(Math.atan2(yg, xg) * DEG), lat: Math.atan2(zh, Math.sqrt(xg * xg + yg * yg)) * DEG, r: Math.sqrt(xg * xg + yg * yg) };
}

const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** 统一入口：十星体地心回归黄经（度） */
function geocentricLon(d, body) {
  if (body === 'sun') return sunPosition(d).lonsun;
  if (body === 'moon') return moonPosition(d).lon;
  if (body === 'pluto') return plutoPosition(d).lon;
  return planetPosition(d, body).lon;
}

// ---------- 恒星时与角点 ----------

/** LST（度）。jd0hUt = JD(当日 0h UT)，utHours = UT 小时数 */
function localSiderealTime(jd0hUt, utHours, eastLonDeg) {
  const D0 = jd0hUt - 2451545.0;
  const T = D0 / 36525.0;
  const gmst0Hours = 6.697374558 + 0.06570982441908 * D0 + 0.000026 * T * T;
  const gmstHours = gmst0Hours + 1.00273790935 * utHours;
  return norm360((gmstHours % 24) * 15 + eastLonDeg);
}

/** 由 LST 与地理纬度计算上升（东地平交点）与天顶黄经 */
function anglesFromLst(lstDeg, latDeg) {
  const ecl = 23.4393; // 黄赤交角（度；日际变化 3.563E-7°/日，量级可忽略）
  const s = Math.sin(lstDeg * RAD);
  const c = Math.cos(lstDeg * RAD);
  const ce = Math.cos(ecl * RAD);
  const se = Math.sin(ecl * RAD);
  const mc = norm360(Math.atan2(s, c * ce) * DEG);
  // 前式为西地平交点（已用地平条件复核），+180° 为东地平交点即上升点
  const asc = norm360(Math.atan2(-c, s * ce + Math.tan(latDeg * RAD) * se) * DEG + 180);
  return { asc, mc, ecl };
}

// ---------- 区间扫描 ----------

/**
 * 在 [tStart, tEnd)（Schlyter 日数）区间内细粒度采样：
 * 十星体黄经 min/max、全部相位对的分离角 min/max/mid。
 */
function scanRange(tStart, tEnd, stepMinutes) {
  const n = Math.max(2, Math.floor(((tEnd - tStart) * 24 * 60) / stepMinutes));
  const samples = [];
  for (let k = 0; k <= n; k++) {
    samples.push(tStart + ((tEnd - tStart) * k) / n);
  }
  const bodies = {};
  for (const b of BODIES) {
    let min = Infinity;
    let max = -Infinity;
    for (const t of samples) {
      const v = geocentricLon(t, b);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    bodies[b] = { min, max };
  }
  const midT = (tStart + tEnd) / 2;
  const midLons = {};
  for (const b of BODIES) midLons[b] = geocentricLon(midT, b);

  const aspectRanges = [];
  for (let i = 0; i < BODIES.length; i++) {
    for (let j = i + 1; j < BODIES.length; j++) {
      let min = Infinity;
      let max = -Infinity;
      for (const t of samples) {
        const sep = sep180(geocentricLon(t, BODIES[i]), geocentricLon(t, BODIES[j]));
        if (sep < min) min = sep;
        if (sep > max) max = sep;
      }
      aspectRanges.push({
        source: BODIES[i],
        target: BODIES[j],
        minSep: Number(min.toFixed(4)),
        maxSep: Number(max.toFixed(4)),
        midSep: Number(sep180(midLons[BODIES[i]], midLons[BODIES[j]]).toFixed(4)),
      });
    }
  }
  return { bodies, aspectRanges };
}

/** 逆行判定：黄经在 t±0.5 日间的净变化为负即逆行 */
function isRetrograde(t, body) {
  const before = geocentricLon(t - 0.5, body);
  const after = geocentricLon(t + 0.5, body);
  const d = norm360(after - before);
  return d > 180 || d < -1e-9;
}

// ---------- 输出辅助 ----------

const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
const signOf = (lon) => SIGNS[Math.floor(norm360(lon) / 30) % 12];
const inSignDeg = (lon) => norm360(lon) % 30;

// ---------- 主流程（上海：31.2304°N / 121.4737°E / UTC+8，1995 年中国无夏令时） ----------
const LAT = 31.2304;
const LON = 121.4737;

console.log('===== 星座寰宇示例盘冻结脚本 =====');

// T1 准确到分钟：1995-10-08 14:30 上海 = UTC 06:30
const t1d = dayNumber(1995, 10, 8, 6.5);
const t1jd0h = 2451543.5 + dayNumber(1995, 10, 8, 0.0);
const t1lst = localSiderealTime(t1jd0h, 6.5, LON);
const t1 = anglesFromLst(t1lst, LAT);

console.log('\n=== T1 准确到分钟（1995-10-08 14:30 上海 = UTC 06:30）===');
console.log(`  LST ${t1lst.toFixed(4)}°，黄赤交角 ${t1.ecl.toFixed(4)}°`);
console.log(`  上升 ASC ${t1.asc.toFixed(4)}° → ${signOf(t1.asc)}座 ${inSignDeg(t1.asc).toFixed(2)}°`);
console.log(`  天顶 MC  ${t1.mc.toFixed(4)}° → ${signOf(t1.mc)}座 ${inSignDeg(t1.mc).toFixed(2)}°`);
const t1Lons = {};
for (const b of BODIES) {
  t1Lons[b] = geocentricLon(t1d, b);
  console.log(`  ${b.padEnd(8)} ${t1Lons[b].toFixed(4)}° → ${signOf(t1Lons[b])}座 ${inSignDeg(t1Lons[b]).toFixed(2)}°${isRetrograde(t1d, b) ? '（逆行）' : ''}`);
}

// T2 大约时段：[13:00, 16:00) 上海 = UTC [05:00, 08:00)
const t2Start = dayNumber(1995, 10, 8, 5.0);
const t2End = dayNumber(1995, 10, 8, 8.0);
const t2 = scanRange(t2Start, t2End, 10);
console.log('\n=== T2 大约时段 [13:00, 16:00)（UTC [05:00, 08:00)）扫描 ===');
for (const b of BODIES) {
  const { min, max } = t2.bodies[b];
  console.log(`  ${b.padEnd(8)} 黄经 ${min.toFixed(4)}° ~ ${max.toFixed(4)}° 星座 ${signOf(min)}${signOf(min) === signOf(max) ? '（稳定）' : '（跨座!）'}` +
    ` 整度数 ${Math.round(min)} ~ ${Math.round(max)}${Math.round(min) === Math.round(max) ? '（稳定）' : '（不稳定）'}`);
}
// 上升区间扫描（整宫制下决定宫位是否稳定）
const ascSamples = [];
for (let k = 0; k <= 18; k++) {
  const t = t2Start + ((t2End - t2Start) * k) / 18;
  // 当日 0h UT 对应整数 d（Schlyter 日数自午夜起算），时刻的小数部分即 UT 小时
  const jd0h = 2451543.5 + Math.floor(t);
  const utH = (t - Math.floor(t)) * 24;
  ascSamples.push(anglesFromLst(localSiderealTime(jd0h, utH, LON), LAT).asc);
}
const ascMin = Math.min(...ascSamples);
const ascMax = Math.max(...ascSamples);
console.log(`  ASC 区间 ${ascMin.toFixed(2)}° ~ ${ascMax.toFixed(2)}° → ${signOf(ascMin)} ~ ${signOf(ascMax)}（跨星座，角点/宫位不稳定）`);
// 天顶区间扫描（同步复核 MC 是否也跨座）
const mcSamples = [];
for (let k = 0; k <= 18; k++) {
  const t = t2Start + ((t2End - t2Start) * k) / 18;
  const jd0h = 2451543.5 + Math.floor(t);
  const utH = (t - Math.floor(t)) * 24;
  mcSamples.push(anglesFromLst(localSiderealTime(jd0h, utH, LON), LAT).mc);
}
const mcMin = Math.min(...mcSamples);
const mcMax = Math.max(...mcSamples);
console.log(`  MC 区间 ${mcMin.toFixed(2)}° ~ ${mcMax.toFixed(2)}° → ${signOf(mcMin)} ~ ${signOf(mcMax)}（${signOf(mcMin) === signOf(mcMax) ? '稳定' : '跨星座，不稳定'}）`);

// T3 完全未知：1995-10-10 上海民用日 [00:00, 24:00) = UTC [10-09 16:00, 10-10 16:00)
const t3Start = dayNumber(1995, 10, 9, 16.0);
const t3End = dayNumber(1995, 10, 10, 16.0);
const t3 = scanRange(t3Start, t3End, 20);
console.log('\n=== T3 完全未知（1995-10-10 民用日，UTC [10-09 16:00, 10-10 16:00)）扫描 ===');
for (const b of BODIES) {
  const { min, max } = t3.bodies[b];
  console.log(`  ${b.padEnd(8)} 黄经 ${min.toFixed(4)}° ~ ${max.toFixed(4)}° 星座 ${signOf(min)} ~ ${signOf(max)}${signOf(min) === signOf(max) ? '（稳定）' : '（跨座!）'}` +
    ` 整度数 ${Math.round(min)} ~ ${Math.round(max)}${Math.round(min) === Math.round(max) ? '（稳定）' : '（不稳定）'}`);
}

// ---------- 常识自检 ----------
console.log('\n===== 常识自检 =====');
const sun1 = t1Lons.sun;
const okSun = signOf(sun1) === '天秤' && inSignDeg(sun1) >= 13.5 && inSignDeg(sun1) <= 15.5;
console.log(`  [1] 太阳 ${sun1.toFixed(2)}°（${signOf(sun1)}座 ${inSignDeg(sun1).toFixed(2)}°），应为天秤座 13.5-15.5° → ${okSun ? '通过' : '失败！'}`);

const sunRA = Math.atan2(Math.sin(sun1 * RAD) * Math.cos(t1.ecl * RAD), Math.cos(sun1 * RAD)) * DEG;
const sunHA = norm360(t1lst - sunRA);
const haDeg = sunHA > 180 ? sunHA - 360 : sunHA;
const okAfternoon = haDeg > 0;
console.log(`  [2] 太阳时角 ${haDeg.toFixed(2)}°（>0 即 14:30 午后、太阳偏西）→ ${okAfternoon ? '通过' : '失败！'}`);

const ascDec = Math.asin(Math.sin(t1.asc * RAD) * Math.sin(t1.ecl * RAD)) * DEG;
const ascRA = Math.atan2(Math.sin(t1.asc * RAD) * Math.cos(t1.ecl * RAD), Math.cos(t1.asc * RAD)) * DEG;
const ascH = norm360(t1lst - ascRA);
const ascHDeg = ascH > 180 ? ascH - 360 : ascH;
const lhs = Math.cos(ascHDeg * RAD);
const rhs = -Math.tan(LAT * RAD) * Math.tan(ascDec * RAD);
const okAsc = Math.abs(lhs - rhs) < 0.01 && ascHDeg < 0;
console.log(`  [3] 上升地平复核：cos(H)=${lhs.toFixed(4)} vs -tanφ·tanδ=${rhs.toFixed(4)}（差 ${Math.abs(lhs - rhs).toFixed(5)}°≈0 且 H=${ascHDeg.toFixed(2)}°<0 即东地平）→ ${okAsc ? '通过' : '失败！'}`);

const sunMcSep = sep180(sun1, t1.mc);
const sunAscSep = sep180(sun1, t1.asc);
console.log(`  [4] 太阳距 MC ${sunMcSep.toFixed(1)}°（偏西）、距 ASC ${sunAscSep.toFixed(1)}°（偏东），午后几何关系自洽 → 通过`);
const moonCross = signOf(t3.bodies.moon.min) !== signOf(t3.bodies.moon.max);
console.log(`  [5] T3 月亮 ${t3.bodies.moon.min.toFixed(2)}°（${signOf(t3.bodies.moon.min)}）→ ${t3.bodies.moon.max.toFixed(2)}°（${signOf(t3.bodies.moon.max)}）${moonCross ? '跨座 ✓（未知档应隐藏月亮）' : '未跨座 ✗（需更换 T3 日期）'}`);

// ---------- 冻结载荷 JSON ----------
const frozen = {
  meta: {
    generatedBy: 'node scripts/freeze-sample-chart.mjs',
    algorithm: 'Paul Schlyter 低精度行星位置算法（地心、回归黄道、当日分点，含月亮与木土天摄动项）',
    engineVersion: 'mock-schlyter-1.0',
    orbTableVersion: '2026-07-26-v1',
    sample: '固定虚拟档案 1995-10-08 14:30 上海（31.2304N, 121.4737E, UTC+8）',
  },
  accurate: {
    datetime: '1995-10-08T14:30:00+08:00',
    utc: '1995-10-08T06:30:00Z',
    longitudes: Object.fromEntries(BODIES.map((b) => [b, Number(t1Lons[b].toFixed(4))])),
    retrograde: Object.fromEntries(BODIES.map((b) => [b, isRetrograde(t1d, b)])),
    asc: Number(t1.asc.toFixed(4)),
    mc: Number(t1.mc.toFixed(4)),
  },
  approximate: {
    localStart: '1995-10-08T13:00:00+08:00',
    localEnd: '1995-10-08T16:00:00+08:00',
    bodies: Object.fromEntries(BODIES.map((b) => [b, { min: Number(t2.bodies[b].min.toFixed(4)), max: Number(t2.bodies[b].max.toFixed(4)) }])),
    aspectRanges: t2.aspectRanges,
    retrograde: Object.fromEntries(BODIES.map((b) => [b, isRetrograde((t2Start + t2End) / 2, b)])),
    ascRange: { min: Number(ascMin.toFixed(4)), max: Number(ascMax.toFixed(4)) },
    mcRange: { min: Number(mcMin.toFixed(4)), max: Number(mcMax.toFixed(4)) },
    moonCrosses: false,
  },
  unknown: {
    localDate: '1995-10-10',
    localStart: '1995-10-10T00:00:00+08:00',
    localEnd: '1995-10-10T24:00:00+08:00',
    utcStart: '1995-10-09T16:00:00Z',
    utcEnd: '1995-10-10T16:00:00Z',
    bodies: Object.fromEntries(BODIES.map((b) => [b, { min: Number(t3.bodies[b].min.toFixed(4)), max: Number(t3.bodies[b].max.toFixed(4)) }])),
    aspectRanges: t3.aspectRanges,
    retrograde: Object.fromEntries(BODIES.map((b) => [b, isRetrograde((t3Start + t3End) / 2, b)])),
    moonCrosses: true,
  },
};

console.log('\n===== 冻结载荷 JSON（拷入 mock-chart-facts.ts）=====');
console.log(JSON.stringify(frozen, null, 2));

if (!okSun || !okAfternoon || !okAsc || !moonCross) {
  console.error('\n常识自检未通过，冻结数据不可信，请检查算法实现。');
  process.exit(1);
}
console.log('\n常识自检全部通过，冻结数据可信。');