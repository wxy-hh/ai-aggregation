/**
 * 紫微斗数本地排盘工具
 * 基于 iztro 库进行精确星盘计算，避免 AI 模型幻觉
 * 集成真太阳时修正（参考八字测算的 buildSolarCorrection 算法）
 */
import { astro } from 'iztro';
import { buildSolarCorrection } from '@repo/shared';
import type { DestinyReportRequest } from '@/app/destiny/_components/types';

// ─── 时辰映射（小时 → iztro timeIndex）───
// iztro 的 timeIndex: 0=早子, 1=晚子, 2=丑, 3=寅, 4=卯, 5=辰, 6=巳, 7=午, 8=未, 9=申, 10=酉, 11=戌, 12=亥
const HOUR_TO_TIME_INDEX: Record<number, number> = {
  0: 0,   // 早子时 00:00-00:59
  1: 2,   // 丑时
  2: 2,
  3: 3,   // 寅时
  4: 3,
  5: 4,   // 卯时
  6: 4,
  7: 5,   // 辰时
  8: 5,
  9: 6,   // 巳时
  10: 6,
  11: 7,  // 午时
  12: 7,
  13: 8,  // 未时
  14: 8,
  15: 9,  // 申时
  16: 9,
  17: 10, // 酉时
  18: 10,
  19: 11, // 戌时
  20: 11,
  21: 12, // 亥时
  22: 12,
  23: 1,  // 晚子时 23:00-23:59
};

const SHI_CHEN_NAMES: Record<number, string> = {
  0: '早子时', 1: '晚子时', 2: '丑时', 3: '寅时', 4: '卯时',
  5: '辰时', 6: '巳时', 7: '午时', 8: '未时', 9: '申时',
  10: '酉时', 11: '戌时', 12: '亥时',
};

// ─── 生年四化表（按年干）───
const SIHUA_TABLE: Record<string, { lu: string; quan: string; ke: string; ji: string }> = {
  '甲': { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' },
  '乙': { lu: '天机', quan: '天梁', ke: '紫微', ji: '太阴' },
  '丙': { lu: '天同', quan: '天机', ke: '文昌', ji: '廉贞' },
  '丁': { lu: '太阴', quan: '天同', ke: '天机', ji: '巨门' },
  '戊': { lu: '贪狼', quan: '太阴', ke: '右弼', ji: '天机' },
  '己': { lu: '武曲', quan: '贪狼', ke: '天梁', ji: '文曲' },
  '庚': { lu: '太阳', quan: '武曲', ke: '太阴', ji: '天同' },
  '辛': { lu: '巨门', quan: '太阳', ke: '文曲', ji: '文昌' },
  '壬': { lu: '天梁', quan: '紫微', ke: '左辅', ji: '武曲' },
  '癸': { lu: '破军', quan: '巨门', ke: '太阴', ji: '贪狼' },
};

// ─── 类型定义 ───

export type ZiweiStarInfo = {
  name: string;
  type: string;       // major | soft | tough | adjective | tianma | lucun | flower | helper
  brightness: string; // 庙 | 旺 | 得 | 平 | 利 | 陷 | 不
};

export type ZiweiChartPalace = {
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  majorStars: ZiweiStarInfo[];
  minorStars: ZiweiStarInfo[];
  adjectiveStars: ZiweiStarInfo[];
  changsheng12: string;
  stageRange: [number, number];
  stageStem: string;
  ages: number[];
};

export type ZiweiSihua = {
  lu: string;
  quan: string;
  ke: string;
  ji: string;
};

export type ZiweiChartData = {
  // 基础信息
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  yearStem: string;
  yearBranch: string;

  // 命盘核心
  soulPalaceBranch: string;
  bodyPalaceBranch: string;
  soul: string;
  body: string;
  fiveElementsClass: string;

  // 生年四化
  sihua: ZiweiSihua;

  // 十二宫
  palaces: ZiweiChartPalace[];

  // 真太阳时修正
  solarCorrection?: string;
};

// ─── 核心函数 ───

/** 将出生小时转换为时辰索引 */
function hourToTimeIndex(hour: number): number {
  return HOUR_TO_TIME_INDEX[hour] ?? 0;
}

/** 从四柱字符串中提取年干和年支 */
function extractYearStemBranch(chineseDate: string): { yearStem: string; yearBranch: string } {
  // chineseDate 格式: "庚辰 甲申 丙午 庚寅"
  const parts = chineseDate.split(' ');
  if (parts.length >= 1 && parts[0].length >= 2) {
    return {
      yearStem: parts[0][0],
      yearBranch: parts[0][1],
    };
  }
  return { yearStem: '', yearBranch: '' };
}

/** 根据年干获取生年四化 */
function getSihua(yearStem: string): ZiweiSihua {
  return SIHUA_TABLE[yearStem] ?? { lu: '', quan: '', ke: '', ji: '' };
}

/** 格式化星曜列表为提示字符串 */
function formatStarsForPrompt(palaces: ZiweiChartPalace[]): string {
  return palaces.map((p) => {
    const major = p.majorStars.map((s) => {
      const b = s.brightness ? `[${s.brightness}]` : '';
      return `${s.name}${b}`;
    }).join('、') || '无主星（空宫）';

    const minor = p.minorStars.map((s) => s.name).join('、') || '无';
    const adj = p.adjectiveStars.map((s) => s.name).join('、') || '无';

    const bodyTag = p.isBodyPalace ? ' [身宫]' : '';
    const originTag = p.isOriginalPalace ? ' [来因宫]' : '';

    return `${p.name}(${p.heavenlyStem}${p.earthlyBranch})${bodyTag}${originTag}: 主星=${major} | 辅星=${minor} | 杂耀=${adj} | 长生=${p.changsheng12} | 大限=${p.stageRange[0]}-${p.stageRange[1]}岁`;
  }).join('\n');
}

/**
 * 计算紫微斗数星盘
 * @param input 用户输入（姓名、性别、出生日期/时间/地点、日历类型）
 * @returns 精确的星盘数据（已应用真太阳时修正）
 */
export function computeZiweiChart(input: DestinyReportRequest): ZiweiChartData {
  const { birthDate, birthTime, gender, calendarType } = input;

  const year = birthDate.year;
  const month = birthDate.month;
  const day = birthDate.day;
  const hour = parseInt(birthTime.hour, 10);
  const minute = parseInt(birthTime.minute, 10);

  // ─── 真太阳时修正（参考八字测算算法）───
  let correctedHour = hour;
  let correctedMinute = minute;
  let solarCorrectionSummary = '';

  if (input.location.lon != null && Number.isFinite(input.location.lon)) {
    const correction = buildSolarCorrection(
      input.location.lon,
      year,
      month,
      day
    );

    if (correction.applied) {
      // 将出生时间转换为总分钟，加上修正偏移量
      const totalMinutes = hour * 60 + minute + Math.round(correction.offsetSeconds / 60);

      // 处理跨日边界（极其罕见，修正量通常在 ±30 分钟内）
      let wrappedMinutes = totalMinutes;
      if (wrappedMinutes < 0) wrappedMinutes += 1440; // 加一天
      if (wrappedMinutes >= 1440) wrappedMinutes -= 1440; // 减一天

      correctedHour = Math.floor(wrappedMinutes / 60);
      correctedMinute = wrappedMinutes % 60;
      solarCorrectionSummary = correction.summary;
    }
  }

  const timeIndex = hourToTimeIndex(correctedHour);

  const iztroGender = gender === 'male' ? '男' : '女';
  const dateStr = `${year}-${month}-${day}`;

  // ─── 调用 iztro 排盘 ───
  const astrolabe =
    calendarType === 'solar'
      ? astro.bySolar(dateStr, timeIndex, iztroGender, true, 'zh-CN')
      : astro.byLunar(dateStr, timeIndex, iztroGender, false, true, 'zh-CN');

  const { yearStem, yearBranch } = extractYearStemBranch(astrolabe.chineseDate);

  // 转换宫位数据
  const palaces: ZiweiChartPalace[] = astrolabe.palaces.map((p) => ({
    name: p.name,
    heavenlyStem: p.heavenlyStem,
    earthlyBranch: p.earthlyBranch,
    isBodyPalace: p.isBodyPalace,
    isOriginalPalace: p.isOriginalPalace,
    majorStars: p.majorStars.map((s) => ({
      name: s.name,
      type: s.type,
      brightness: s.brightness ?? '',
    })),
    minorStars: p.minorStars.map((s) => ({
      name: s.name,
      type: s.type,
      brightness: s.brightness ?? '',
    })),
    adjectiveStars: p.adjectiveStars.map((s) => ({
      name: s.name,
      type: s.type,
      brightness: s.brightness ?? '',
    })),
    changsheng12: p.changsheng12,
    stageRange: p.decadal.range as [number, number],
    stageStem: p.decadal.heavenlyStem,
    ages: p.ages,
  }));

  return {
    solarDate: astrolabe.solarDate,
    lunarDate: astrolabe.lunarDate,
    chineseDate: astrolabe.chineseDate,
    time: astrolabe.time,
    timeRange: astrolabe.timeRange,
    sign: astrolabe.sign,
    zodiac: astrolabe.zodiac,
    yearStem,
    yearBranch,
    soulPalaceBranch: astrolabe.earthlyBranchOfSoulPalace,
    bodyPalaceBranch: astrolabe.earthlyBranchOfBodyPalace,
    soul: astrolabe.soul,
    body: astrolabe.body,
    fiveElementsClass: astrolabe.fiveElementsClass,
    sihua: getSihua(yearStem),
    palaces,
    solarCorrection: solarCorrectionSummary || undefined,
  };
}

/**
 * 将星盘数据转换为 AI 提示词用的上下文
 * 包含所有精确的星盘信息，AI 只需要据此进行解读
 */
export function buildZiweiPromptContext(chart: ZiweiChartData): string {
  const sihuaStr = `生年四化 — 化禄: ${chart.sihua.lu}, 化权: ${chart.sihua.quan}, 化科: ${chart.sihua.ke}, 化忌: ${chart.sihua.ji}`;

  const starsSummary = formatStarsForPrompt(chart.palaces);

  return [
    '【以下紫微斗数星盘数据已由本地算法精确计算，请勿编造或修改任何星曜位置、宫位、四化等信息】',
    '',
    `出生信息：${chart.lunarDate} ${chart.time}(${chart.timeRange})`,
    `四柱：${chart.chineseDate}`,
    `生肖：${chart.zodiac}  星座：${chart.sign}`,
    '',
    `命宫地支：${chart.soulPalaceBranch}  身宫地支：${chart.bodyPalaceBranch}`,
    `命主：${chart.soul}  身主：${chart.body}`,
    `五行局：${chart.fiveElementsClass}`,
    sihuaStr,
    '',
    '【十二宫星曜分布（精确数据）】',
    starsSummary,
    '',
    '请基于以上精确星盘数据，从紫微斗数的专业角度进行解读分析。',
    '注意：星盘数据已是确定的，你只需根据宫位、星曜、四化之间的组合关系进行推理和解读。',
  ].join('\n');
}

/**
 * 获取时辰名称
 */
export function getShiChenName(timeIndex: number): string {
  return SHI_CHEN_NAMES[timeIndex] ?? '未知';
}
