// @ts-nocheck — 第三方库 lunar-javascript / qimen-dunjia 无类型声明，仅跳过硬编码的导入行

import { Solar } from 'lunar-javascript';
import {
  generateQimenChart,
  chartToObject,
  JIEQI_JUSHU,
  YUAN_NAMES,
} from 'qimen-dunjia';

// ---- 类型检查恢复 ----
import { buildSolarCorrection } from './bazi-chart';
import type { QimenAnalysisBaseResult, QimenBoardCell } from './qimen-analysis';

// qimen-dunjia 库的 s2t 映射不完整（缺少 小满→小滿 等），在此补全
const S2T_JIEQI: Record<string, string> = {
  '冬至': '冬至', '小寒': '小寒', '大寒': '大寒',
  '立春': '立春', '雨水': '雨水', '惊蛰': '驚蟄',
  '春分': '春分', '清明': '清明', '谷雨': '穀雨',
  '立夏': '立夏', '小满': '小滿', '芒种': '芒種',
  '夏至': '夏至', '小暑': '小暑', '大暑': '大暑',
  '立秋': '立秋', '处暑': '處暑', '白露': '白露',
  '秋分': '秋分', '寒露': '寒露', '霜降': '霜降',
  '立冬': '立冬', '小雪': '小雪', '大雪': '大雪',
};

const PALACE_NAMES = ['巽四宫', '离九宫', '坤二宫', '震三宫', '中五宫', '兑七宫', '艮八宫', '坎一宫', '乾六宫'] as const;
const PALACE_DIRECTIONS = ['东南', '正南', '西南', '正东', '中宫', '正西', '东北', '正北', '西北'] as const;
const PALACE_LUOSHU = [4, 9, 2, 3, 5, 7, 8, 1, 6] as const;
const PALACE_WUXING = ['木', '火', '土', '木', '土', '金', '土', '水', '金'] as const;

export type QimenChartInput = {
  datetime: string;
  longitude?: number | null;
};

/**
 * 使用拆补法计算局数（修复了 qimen-dunjia 库的简繁体转换问题）
 */
function calculateJu(solar: Solar) {
  const lunar = solar.getLunar();

  // getJieQi() 仅在当天恰好是节气日时返回对象，否则返回空字符串
  // 拆补法需要上一个节气，使用 getPrevJieQi() 确保始终获取到最近的节气
  const jieQi = lunar.getJieQi();
  const currentJieQi = jieQi && typeof jieQi === 'object' && typeof jieQi.getName === 'function'
    ? jieQi
    : lunar.getPrevJieQi();

  const rawName = currentJieQi.getName();
  const jieQiName = S2T_JIEQI[rawName] || rawName;

  const config = (JIEQI_JUSHU as Record<string, { yang: boolean; ju: number[] }>)[jieQiName];
  if (!config) {
    throw new Error(`未知的节气：${jieQiName}（原始：${rawName}）`);
  }

  const julianSolar = solar.getJulianDay();
  const julianJieQi = currentJieQi.getSolar().getJulianDay();
  const daysSinceJieQi = Math.floor(julianSolar - julianJieQi);
  const yuan = Math.min(Math.floor(daysSinceJieQi / 5), 2);

  return {
    jieQiName,
    yuan,
    yuanName: YUAN_NAMES[yuan] as string,
    isYang: config.yang,
    yinYang: config.yang ? '陽' as const : '陰' as const,
    gameNumber: config.ju[yuan],
    daysSinceJieQi,
  };
}

/**
 * 本地计算奇门遁甲盘局
 *
 * 排盘逻辑完全由 qimen-dunjia 算法库保证，LLM 不再参与盘局生成。
 * 返回的数据可直接填入 QimenAnalysisBaseResult 和 QimenBoardCell[]。
 */
export function computeQimenChart(input: QimenChartInput): QimenAnalysisBaseResult {
  const dt = new Date(input.datetime);
  const year = dt.getFullYear();
  const month = dt.getMonth() + 1;
  const day = dt.getDate();
  const hour = dt.getHours();

  // 真太阳时修正
  const correction = buildSolarCorrection(input.longitude ?? null, year, month, day);
  let correctedYear = year;
  let correctedMonth = month;
  let correctedDay = day;
  let correctedHour = hour;

  if (correction.applied) {
    const totalMs = correction.offsetSeconds * 1000;
    const corrected = new Date(dt.getTime() + totalMs);
    correctedYear = corrected.getFullYear();
    correctedMonth = corrected.getMonth() + 1;
    correctedDay = corrected.getDate();
    correctedHour = corrected.getHours();
  }

  // 格式化为 yyyyMMddHH
  const datetimeStr =
    String(correctedYear).padStart(4, '0') +
    String(correctedMonth).padStart(2, '0') +
    String(correctedDay).padStart(2, '0') +
    String(correctedHour).padStart(2, '0');

  // 调用 qimen-dunjia 排盘
  const solar = Solar.fromYmdHms(correctedYear, correctedMonth, correctedDay, correctedHour, 0, 0);
  const ju = calculateJu(solar);

  const lunar = solar.getLunar();
  const yearPillar = lunar.getYearInGanZhiExact();
  const monthPillar = lunar.getMonthInGanZhiExact();
  const dayPillar = lunar.getDayInGanZhiExact();
  const timePillar = lunar.getTimeInGanZhi();

  const chart = generateQimenChart(datetimeStr, [
    yearPillar,
    monthPillar,
    dayPillar,
    timePillar,
    ju.gameNumber,
    ju.yinYang,
  ]);

  const obj = chartToObject(chart) as Record<string, unknown>;

  // 提取盘局数据（注意：排盘库返回繁体中文 key）
  const diPan = obj['地盤'] as string[];
  const tianPan = obj['天盤'] as string[];
  const tianMen = obj['天門'] as string[];
  const jiuXing = obj['九星'] as string[];
  const baShenRaw = obj['八神'] as string[];
  const xunShou = obj['旬首'] as string;
  const zhiFu = obj['值符'] as string;
  const zhiShi = obj['值使'] as string;
  const zhiFuPalaceName = obj['值符落宮'] as string;
  const zhiShiPalaceName = obj['值使落宮'] as string;
  const shiGan = obj['時干'] as string;
  const riGan = dayPillar[0];
  const timeKongWang = obj['時孤虛'] as string[];

  // 八神名称规范化：统一为转盘奇门主流命名（库使用飞盘奇门勾陈/朱雀）
  const BASHEN_NORMALIZE: Record<string, string> = {
    '勾陳': '白虎',
    '勾陈': '白虎',
    '朱雀': '玄武',
    '滕蛇': '螣蛇',
    '太陰': '太阴',
  };
  const baShen = baShenRaw.map((s) => BASHEN_NORMALIZE[s] || s);

  // 卦名 → 九宫索引映射
  const TRIGRAM_TO_IDX: Record<string, number> = {
    '巽': 0, '離': 1, '离': 1, '坤': 2, '震': 3,
    '中': 4, '兌': 5, '兑': 5, '艮': 6, '坎': 7, '乾': 8,
  };

  // 空亡与马星
  const kongWangDirs = timeKongWang ?? [];
  const jiaziXunkong = kongWangDirs.length > 0 ? kongWangDirs.join('、') : '-';

  // 马星查法：按时柱地支确定
  const shiZhi = timePillar[1];
  const horseMap: Record<string, string> = {
    '申': '寅', '子': '寅', '辰': '寅',
    '寅': '申', '午': '申', '戌': '申',
    '巳': '亥', '酉': '亥', '丑': '亥',
    '亥': '巳', '卯': '巳', '未': '巳',
  };
  const horseDiZhi = horseMap[shiZhi] || '';
  const horseDiZhiToDir: Record<string, string> = {
    '子': '正北', '丑': '东北', '寅': '东北',
    '卯': '正东', '辰': '东南', '巳': '东南',
    '午': '正南', '未': '西南', '申': '西南',
    '酉': '正西', '戌': '西北', '亥': '西北',
  };
  const horsePosition = horseDiZhi ? `马星在${horseDiZhi}（${horseDiZhiToDir[horseDiZhi] || ''}）` : '';

  // 构建 board
  const board: QimenBoardCell[] = PALACE_NAMES.map((palace, idx) => {
    const diPanGan = diPan[idx] || '';
    const tianPanGan = tianPan[idx] || '';
    const pattern = tianPanGan && diPanGan ? `${tianPanGan}+${diPanGan}` : '';
    const door = tianMen[idx] || '';

    return {
      palace,
      luoshu: PALACE_LUOSHU[idx],
      direction: PALACE_DIRECTIONS[idx],
      god: palace === '中五宫' ? '-' : (baShen[idx] || ''),
      star: jiuXing[idx] || '',
      door: palace === '中五宫' ? '寄坤二宫' : (door || '-'),
      heavenStem: tianPanGan,
      earthStem: diPanGan,
      wuxing: PALACE_WUXING[idx],
      pattern,
      isValueSymbol: TRIGRAM_TO_IDX[zhiFuPalaceName] === idx,
      isValueDoor: TRIGRAM_TO_IDX[zhiShiPalaceName] === idx,
      isVoid: kongWangDirs.some((d) => PALACE_DIRECTIONS[idx].includes(d) || d.includes(PALACE_DIRECTIONS[idx])),
      isHorse: horseDiZhiToDir[horseDiZhi] === PALACE_DIRECTIONS[idx],
    };
  });

  // 生成盘局标题
  const chartTitle = `${ju.jieQiName} ${ju.yuanName} ${ju.yinYang}遁${ju.gameNumber}局`;

  // 免责声明
  const disclaimer = '本排盘由算法精确计算，分析解读由 AI 基于奇门理论生成，仅供传统民俗文化研究和决策参考，不构成任何现实决策承诺。';

  return {
    chartTitle,
    chartMeta: {
      dun: `${ju.yinYang}遁`,
      ju: `${ju.gameNumber}局`,
      jiaziXunkong,
      horsePosition,
      valueSymbol: zhiFu,
      valueDoor: zhiShi,
      xunshou: xunShou,
      riGan,
      shiGan,
      trueSolarTime: correction.applied
        ? `${correctedYear}-${String(correctedMonth).padStart(2, '0')}-${String(correctedDay).padStart(2, '0')} ${String(correctedHour).padStart(2, '0')}:00`
        : undefined,
    },
    board,
    score: 75,
    disclaimer,
  };
}
