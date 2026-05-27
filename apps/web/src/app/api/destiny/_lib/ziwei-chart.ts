/**
 * 紫微斗数本地排盘工具
 * 基于 iztro 库进行精确星盘计算，避免 AI 模型幻觉
 * 集成真太阳时修正（参考八字测算的 buildSolarCorrection 算法）
 */
import { astro } from 'iztro';
import { buildSolarCorrection, ZIWEI_BASE_GLOSSARY } from '@repo/shared';
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

  // 用户专属词汇解释表（基于命盘数据生成）
  personalizedGlossary?: Record<string, string>;
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
    personalizedGlossary: buildPersonalizedGlossary({
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
    }),
  };
}

/**
 * 宫位对人生的影响映射（小白友好版）
 */
const PALACE_INFLUENCE: Record<string, string> = {
  '命宫': '你的核心性格、先天本质和整体命运基调',
  '官禄': '你的事业发展、职业方向和社会地位',
  '财帛': '你的财运理财、收入来源和物质生活水平',
  '夫妻': '你的感情婚姻、配偶特征和情感模式',
  '疾厄': '你的健康状况、体质强弱和养生方向',
  '迁移': '你的外出运势、人际关系和对外表现',
  '仆役': '你的社交圈子、朋友关系和人际互动',
  '交友': '你的社交圈子、朋友关系和人际互动',
  '兄弟': '你的兄弟姐妹、同辈缘分和合作关系',
  '子女': '你的子女缘分、创造力和享乐方式',
  '田宅': '你的家庭环境、房产状况和家族根基',
  '福德': '你的精神世界、福分厚薄和晚年心态',
  '父母': '你的父母关系、长辈缘分和外在形象',
};

/**
 * 将庙旺落陷翻译成大白话
 */
function translateBrightnessToPlain(brightness: string): string {
  switch (brightness) {
    case '庙':
      return '能量最强，优点会非常明显地表现出来';
    case '旺':
      return '能量很强，这颗星的正面特质会突出展现';
    case '得':
      return '能量不错，特点会正常且稳定地表现';
    case '利':
      return '能量尚可，特点会温和地表现出来';
    case '平':
      return '能量中等，表现不突出但也不弱';
    case '闲':
      return '能量偏弱，这颗星的负面影响需要留意';
    case '陷':
      return '能量较弱，容易表现出负面特点，需要自我调节';
    case '不':
      return '能量最弱，负面影响可能较明显，需特别注意';
    default:
      return '能量一般';
  }
}

/**
 * 基于用户命盘数据生成个性化词汇解释表
 * 每个解释都结合了该用户的实际命盘信息，而非通用百科描述
 * 核心原则：先讲"对你的影响"，再解释星曜本身，用"你"做主语
 */
function buildPersonalizedGlossary(chart: ZiweiChartData): Record<string, string> {
  const glossary: Record<string, string> = {};
  const palaceMap = new Map(chart.palaces.map((p) => [p.name, p]));

  // ─── 核心命盘参数 ───

  const fe = chart.fiveElementsClass;
  const firstAge = fe.includes('二') ? 2 : fe.includes('三') ? 3 : fe.includes('四') ? 4 : fe.includes('五') ? 5 : 6;

  glossary['五行局'] = `您的五行局为${fe}。五行局由命宫的天干地支推算得出，决定了您大限的起始年龄和递转步长。${fe}意味着您的大限从${firstAge}岁开始，每十年递进一个宫位。`;

  // 命宫
  const ming = palaceMap.get('命宫');
  const mingMain = ming?.majorStars[0];
  glossary['命宫'] = `您的命宫在${chart.soulPalaceBranch}。命宫是十二宫之首，代表您的先天本质和整体命运基调。${mingMain ? `您的命宫主星为${mingMain.name}${mingMain.brightness ? `（${mingMain.brightness}）` : ''}，这塑造了您核心性格特质的基础。` : '您的命宫为空宫，需借对宫星曜参考，不代表命运空白，而是该领域受到对宫影响较大。'}`;

  // 身宫
  const bodyPalace = palaceMap.get(chart.bodyPalaceBranch);
  glossary['身宫'] = `您的身宫在${chart.bodyPalaceBranch}。身宫代表后天运势的重心所在，影响中年以后的人生走向。${bodyPalace?.majorStars.length ? `您的身宫主星为${bodyPalace.majorStars.map((s) => s.name).join('、')}。` : '您的身宫为空宫，需借对宫星曜参考。'}`;

  // 命主 / 身主
  glossary['命主'] = `您的命主是${chart.soul}。命主由命宫地支${chart.soulPalaceBranch}决定，代表您的先天本质和性格核心。`;
  glossary['身主'] = `您的身主是${chart.body}。身主由出生年支${chart.yearBranch}决定，代表您的后天发展和身体运势。`;

  // 四柱
  const pillars = chart.chineseDate.split(' ');
  glossary['四柱'] = `您的四柱为${chart.chineseDate}，即年柱${pillars[0] ?? ''}、月柱${pillars[1] ?? ''}、日柱${pillars[2] ?? ''}、时柱${pillars[3] ?? ''}。四柱以天干地支表示出生年月日时，是紫微斗数排盘的基础。`;

  // 生年四化
  glossary['生年四化'] = `您的生年四化由年干${chart.yearStem}决定：化禄在${chart.sihua.lu}、化权在${chart.sihua.quan}、化科在${chart.sihua.ke}、化忌在${chart.sihua.ji}。四化是紫微斗数中最重要的动态能量，决定一生运势变化的主要线索。`;

  // 各化
  glossary['化禄'] = `您的化禄在${chart.sihua.lu}。化禄代表财富、机会、顺利和增加的能量。`;
  glossary['化权'] = `您的化权在${chart.sihua.quan}。化权代表权力、掌控、能力和主导力。`;
  glossary['化科'] = `您的化科在${chart.sihua.ke}。化科代表名声、才华展现、考试和贵人。`;
  glossary['化忌'] = `您的化忌在${chart.sihua.ji}。化忌代表阻碍、收敛、执着和需要注意之处。`;

  // 天干 / 地支
  glossary['天干'] = `您的年干为${chart.yearStem}。天干与地支配合组成六十甲子纪年，是推算四化、五行局的基础。`;
  glossary['地支'] = `您的命宫地支为${chart.soulPalaceBranch}，年支为${chart.yearBranch}。地支用于划分宫位和纪年。`;

  // ─── 十二宫 ───

  for (const p of chart.palaces) {
    const palaceName = p.name === '命宫' ? '命宫' : `${p.name}宫`;
    const main = p.majorStars.map((s) => `${s.name}${s.brightness ? `（${s.brightness}）` : ''}`).join('、');
    const minor = p.minorStars.map((s) => s.name).join('、');
    const bodyTag = p.isBodyPalace ? '，同时也是您的身宫' : '';
    const originTag = p.isOriginalPalace ? '，是您的来因宫' : '';

    glossary[palaceName] = `您的${palaceName}在${p.heavenlyStem}${p.earthlyBranch}${bodyTag}${originTag}。${main ? `主星：${main}` : '无主星（空宫），需借对宫星曜参考'}${minor ? `；辅星/煞星：${minor}` : ''}。大限范围：${p.stageRange[0]}-${p.stageRange[1]}岁。`;
  }

  // ─── 星曜位置映射 ───

  const starPositions = new Map<string, { palace: string; brightness: string }>();
  for (const p of chart.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      if (!starPositions.has(s.name)) {
        starPositions.set(s.name, {
          palace: p.name === '命宫' ? '命宫' : `${p.name}宫`,
          brightness: s.brightness,
        });
      }
    }
  }

  // 各星曜（个性化影响式描述）
  for (const [name, info] of starPositions) {
    const base = ZIWEI_BASE_GLOSSARY[name];
    const palaceKey = info.palace === '命宫' ? '命宫' : info.palace.replace('宫', '');
    const palaceInfluence = PALACE_INFLUENCE[palaceKey] ?? `你人生的某个方面`;
    const energyDesc = info.brightness ? translateBrightnessToPlain(info.brightness) : '';

    // 把基础描述中的百科式表达转为「对你影响」式
    let personalizedBase = base ?? '';
    // 替换常见的百科式表达
    personalizedBase = personalizedBase
      .replace(/坐命者/g, '你')
      .replace(/坐命/g, '在你命盘中')
      .replace(/所在的宫位/g, '所在的位置')
      .replace(/代表/g, '意味着')
      .replace(/主/g, '影响');

    const parts: string[] = [];
    parts.push(`【在你命盘中的位置】`);
    parts.push(`这颗${name}落在你的${info.palace}，主要影响${palaceInfluence}。`);

    if (energyDesc) {
      parts.push(`【能量状态】它的能量状态是「${info.brightness}」——${energyDesc}。`);
    }

    if (personalizedBase) {
      parts.push(`【对你的影响】${personalizedBase}`);
    }

    glossary[name] = parts.join('\n\n');
  }

  // 亮度状态（按用户命盘中实际出现的星曜分组）
  const brightnessGroups: Record<string, string[]> = {};
  for (const [name, info] of starPositions) {
    if (info.brightness) {
      if (!brightnessGroups[info.brightness]) brightnessGroups[info.brightness] = [];
      brightnessGroups[info.brightness].push(name);
    }
  }

  for (const [brightness, stars] of Object.entries(brightnessGroups)) {
    const base = ZIWEI_BASE_GLOSSARY[brightness] ?? '';
    glossary[brightness] = `在您的命盘中，${stars.join('、')}处于${brightness}状态。${base}`;
  }

  // ─── 核心概念 ───

  const empty = chart.palaces.filter((p) => p.majorStars.length === 0);
  glossary['空宫'] = `空宫是指某个宫位没有主星落入。在您的命盘中，${empty.length > 0 ? `${empty.map((p) => (p.name === '命宫' ? '命宫' : `${p.name}宫`)).join('、')}为空宫` : '没有空宫'}。空宫需要借对宫的星曜来参考解读，并不意味着该领域完全空白。`;

  const origin = chart.palaces.find((p) => p.isOriginalPalace);
  glossary['来因宫'] = `来因宫是与出生年天干${chart.yearStem}相同的宫位。在您的命盘中，${origin ? `${origin.name === '命宫' ? '命宫' : `${origin.name}宫`}是来因宫` : '来因宫需进一步推算'}，代表您今生的起点，是命盘的核心枢轴。`;

  glossary['三方四正'] = '三方四正是紫微斗数中重要的宫位关系。每个宫位有其三方（每隔四个宫位的另外两个宫位）和对宫（正对的宫位），用于综合分析宫位的联动影响。';
  glossary['大限'] = `大限是每十年为一个大限，每个宫位依次主管十年运势。您的五行局为${chart.fiveElementsClass}，决定了大限从${firstAge}岁开始递转。`;
  glossary['小限'] = '小限是每年一个小限，按年龄依次对应不同宫位，用于分析每年的运势细节。';

  return glossary;
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
