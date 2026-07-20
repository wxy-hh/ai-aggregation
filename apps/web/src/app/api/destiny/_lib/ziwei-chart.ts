/**
 * 紫微斗数本地排盘工具
 * 基于 iztro 库进行精确星盘计算，避免 AI 模型幻觉
 * 集成真太阳时修正（参考八字测算的 buildSolarCorrection 算法）
 */
import { astro } from 'iztro';
import { buildSolarCorrection, ZIWEI_BASE_GLOSSARY } from '@repo/shared';
import type { DestinyReportRequest } from '@/app/destiny/_components/types';

// ─── 时辰映射（小时 → iztro timeIndex）───
// iztro 的 timeIndex 顺序（经 iztro@2.5.8 源码与实测双重确认）：
//   0=早子(00-01), 1=丑(01-03), 2=寅(03-05), 3=卯(05-07), 4=辰(07-09), 5=巳(09-11),
//   6=午(11-13), 7=未(13-15), 8=申(15-17), 9=酉(17-19), 10=戌(19-21), 11=亥(21-23), 12=晚子(23-24)
//   依据：lib/calendar/heavenlyStemAndEarthlyBranch.js 中 timeIndex===12 判定为晚子时加一天
// 注意：晚子时(23点)必须是 12，否则农历日不会加一天，整个命盘都会错
const HOUR_TO_TIME_INDEX: Record<number, number> = {
  0: 0,   // 早子时 00:00-00:59
  1: 1,   // 丑时
  2: 1,
  3: 2,   // 寅时
  4: 2,
  5: 3,   // 卯时
  6: 3,
  7: 4,   // 辰时
  8: 4,
  9: 5,   // 巳时
  10: 5,
  11: 6,  // 午时
  12: 6,
  13: 7,  // 未时
  14: 7,
  15: 8,  // 申时
  16: 8,
  17: 9,  // 酉时
  18: 9,
  19: 10, // 戌时
  20: 10,
  21: 11, // 亥时
  22: 11,
  23: 12, // 晚子时 23:00-23:59
};

// timeIndex → 时辰名（与上方 iztro 序号保持一致）
const SHI_CHEN_NAMES: Record<number, string> = {
  0: '早子时', 1: '丑时', 2: '寅时', 3: '卯时', 4: '辰时',
  5: '巳时', 6: '午时', 7: '未时', 8: '申时', 9: '酉时',
  10: '戌时', 11: '亥时', 12: '晚子时',
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

/** 查找星曜所在的宫位名称 */
function findStarPalace(starName: string, palaces: ZiweiChartPalace[]): string | null {
  for (const p of palaces) {
    if (p.majorStars.some((s) => s.name === starName)) return p.name;
    if (p.minorStars.some((s) => s.name === starName)) return p.name;
  }
  return null;
}

// ─── 四化落宫具体影响表 ───
const SIHUA_LU_EFFECT: Record<string, string> = {
  '命宫': '你天生自带福气，性格乐观、人缘好，一生中常有意外之喜，做事容易遇到好机会。',
  '官禄': '你的事业发展顺利，工作中容易获得赏识和提升，适合从事与人脉相关的行业，财运随事业水涨船高。',
  '财帛': '你的财运亨通，正财偏财都不错，赚钱相对轻松，但也需注意理财规划，避免来得快去得也快。',
  '夫妻': '你的感情婚姻运势良好，容易遇到条件不错的对象，婚恋美满，配偶对你的事业和财运也有帮助。',
  '疾厄': '你体质不错，恢复力强。先天底子好但也不能挥霍，保持良好生活习惯即可。',
  '迁移': '你外出运佳，适合外出发展，出门遇贵人，外地机缘多，社交场合中也容易给人好印象。',
  '仆役': '你朋友多、人脉广，朋友圈中常有贵人相助，合作合伙能顺利开展，社交活动丰富。',
  '交友': '你朋友多、人脉广，朋友圈中常有贵人相助，合作合伙能顺利开展，社交活动丰富。',
  '兄弟': '你的兄弟姐妹和同辈朋友对你有帮助，合作关系和谐，共同创业或合伙做事容易成功。',
  '子女': '你子女缘分好，生育顺利，与孩子关系融洽，在创造力和兴趣爱好方面也容易有收获。',
  '田宅': '你的房产运不错，买房置业比较顺利，家庭环境温暖和睦，家族根基稳固。',
  '福德': '你晚年福气好，心态乐观知足，精神世界丰富，喜欢享受生活，晚年安逸。',
  '父母': '你的父母长辈对你帮助很大，长辈缘好，容易得到贵人提携，家教和学历背景也不错。',
};

const SIHUA_QUAN_EFFECT: Record<string, string> = {
  '命宫': '你天生有领导力和掌控欲，做事果断有主见。适合管理和决策类工作，但要避免独断专行。',
  '官禄': '你的事业心强，有担当和责任心，能独当一面，有望成为团队核心或领导，适合自立门户。',
  '财帛': '你对财务有掌控力，善于主导赚钱方向，不满足于稳定收入，有创业意识。建议做好风险把控。',
  '夫妻': '你在感情中较有主导权，习惯掌控关系走向。建议多沟通协商，适当让伴侣也有发挥空间。',
  '疾厄': '你对健康有较强的自我管理意识，能坚持锻炼和养生。但避免过度强势导致紧张压力。',
  '迁移': '你外出时展现的气场和能力较强，容易在异地获得认可和话语权，适合到外地开拓。',
  '仆役': '你在朋友圈中比较有话语权，善于组织和带领，但注意不要对朋友过于挑剔或强势。',
  '交友': '你在朋友圈中比较有话语权，善于组织和带领，但注意不要对朋友过于挑剔或强势。',
  '兄弟': '你在兄弟姐妹和同辈中较有话语权，合作中习惯主导方向。建议多听取他人意见，保持平衡。',
  '子女': '你对子女教育有严格要求和方向感，孩子长大后也比较有主张。创造力方面你有较强的执行力。',
  '田宅': '你对房产和家庭事务有较强的决定权，家里以你为主导，购房置业决策果断。',
  '福德': '你晚年依然保有较强个性，精神和思想上不容易受外界影响，内心世界较强，活得很自我。',
  '父母': '你的父母长辈对你比较严格，或你在家庭中承担较多责任，长辈关系中有较强的张力。',
};

const SIHUA_KE_EFFECT: Record<string, string> = {
  '命宫': '你气质好、有才华，容易给人留下好印象，学识修养不错，考试运也比较好，适合学术或艺术方向。',
  '官禄': '你的事业发展容易获得名声和认可，工作中你的才华能被看见，适合需要展现专业能力的职业。',
  '财帛': '你的财运来得比较体面，靠才华和名声赚钱，不太需要投机冒险，适合稳扎稳打。',
  '夫妻': '你的配偶品味较好，有一定的学识修养，婚恋名声不错，感情关系体面和谐。',
  '疾厄': '你的健康状况总体可控，养生意识强，愿意学习健康知识。建议保持定期体检。',
  '迁移': '你外出的形象表现容易给人留下良好印象，异地发展有利于名声和人际关系的积累。',
  '仆役': '你交友有品位，朋友圈素质较高，朋友中有文化人或专业能力强的人，社交中你的形象加分。',
  '交友': '你交友有品位，朋友圈素质较高，朋友中有文化人或专业能力强的人，社交中你的形象加分。',
  '兄弟': '你的兄弟朋友中有人比较有才华，合作关系和学术交流对你有利，同辈中容易产生良性互动。',
  '子女': '你的子女聪慧好学，教育运好，孩子有才艺天赋。你在创造力方面也容易获得认可和赞赏。',
  '田宅': '你的居住环境比较有品位，家庭文化氛围好，房产购置过程也较顺利，属于精致宜居的类型。',
  '福德': '你晚年心态优雅，精神世界丰富，喜欢阅读、艺术等高雅活动，晚年生活有品质有格调。',
  '父母': '你的父母长辈品味好、学识不错，对你的教育和培养比较用心，长辈缘好，外在气质出众。',
};

const SIHUA_JI_EFFECT: Record<string, string> = {
  '命宫': '你个性中容易有执着不放的一面，对某些事情特别较真。建议学会放松，不要钻牛角尖。',
  '官禄': '你的事业发展容易遇到瓶颈和阻力，需要特别努力才能突破。不适合频繁跳槽，建议选定方向深耕。',
  '财帛': '你的财运波动较大，花钱的地方多，建议做好财务规划，避免冲动消费和投资，财来财去要守住。',
  '夫妻': '你的感情婚姻需要特别用心经营，容易有沟通不畅或缘分波折。建议多包容理解，感情需要时间沉淀。',
  '疾厄': '健康是需要你特别留意的领域，容易有慢性病或体质偏弱。建议养成规律体检和健康管理的习惯。',
  '迁移': '你外出发展容易遇到不顺，建议多留后路。如果不适合远行，就近发展未尝不是好的选择。',
  '仆役': '你的朋友圈中容易有是非纠纷，交友需谨慎，避免轻信他人。合作合伙建议签好协议留有证据。',
  '交友': '你的朋友圈中容易有是非纠纷，交友需谨慎，避免轻信他人。合作合伙建议签好协议留有证据。',
  '兄弟': '你与兄弟姐妹或同辈之间容易有摩擦或竞争，合作关系需要特别维护，建议多沟通避免误会累积。',
  '子女': '你的子女成长中可能需要更多关照，教育上建议多些耐心。创造力方面容易碰到瓶颈，不急于求成。',
  '田宅': '你的房产家庭方面容易有波折，购房置业需谨慎，家庭关系也需要多花心思维护。',
  '福德': '你晚年轻松的心态较难维持，容易思虑过多或精神压力大。建议培养一两项放松身心的爱好。',
  '父母': '你的父母长辈关系需要你多包容体谅，或父母健康需要关注。建议多和家人沟通，尽孝要及时。',
};

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
// ─── 地支含义表 ───
const EARTHLY_BRANCH_MEANING: Record<string, string> = {
  '子': '子属水，为桃花帝座，代表智慧灵动、善于变通，但也可能内心敏感多思。',
  '丑': '丑属土，为金库墓库，代表勤勉务实、稳重坚韧，但也可能固执守旧。',
  '寅': '寅属木，为火的长生之地，代表开创进取、活力充沛，但也可能冲动急躁。',
  '卯': '卯属木，为桃花之地，代表柔美灵活、善交际表达，但也可能优柔寡断。',
  '辰': '辰属土，为水库墓库，代表包容大度、善于谋划，但也可能隐藏心机。',
  '巳': '巳属火，为金的长生之地，代表热情积极、行动力强，但也可能急躁多变。',
  '午': '午属火，为桃花帝座，代表光明磊落、热情直率，但也可能骄傲自负。',
  '未': '未属土，为木库墓库，代表温厚善良、细腻包容，但也可能优柔寡断。',
  '申': '申属金，为水的长生之地，代表机敏灵活、善于变通，但也可能心猿意马。',
  '酉': '酉属金，为桃花之地，代表精致细腻、善于社交，但也可能过于在意细节。',
  '戌': '戌属土，为火库墓库，代表忠诚可靠、有担当魄力，但也可能顽固不化。',
  '亥': '亥属水，为木的长生之地，代表聪明灵慧、直觉敏锐，但也可能情绪波动大。',
};

// ─── 五行局含义表 ───
const FIVE_ELEMENT_CLASS_MEANING: Record<string, string> = {
  '水二局': '水主智，属水的人聪明灵慧、善于变通，但有时情绪波动较大、心思多变。大限每十年递进一个宫位。',
  '木三局': '木主仁，属木的人善良正直、富有同理心，但有时容易优柔寡断、缺乏主见。大限每十年递进一个宫位。',
  '金四局': '金主义，属金的人刚毅果断、重情重义，但有时过于刚硬、缺乏灵活变通。大限每十年递进一个宫位。',
  '土五局': '土主信，属土的人稳重务实、诚信可靠，但有时固执保守、不善变通。大限每十年递进一个宫位。',
  '火六局': '火主礼，属火的人热情开朗、行动力强，但有时急躁冲动、缺乏耐心。大限每十年递进一个宫位。',
};

function buildPersonalizedGlossary(chart: ZiweiChartData): Record<string, string> {
  const glossary: Record<string, string> = {};
  const palaceMap = new Map(chart.palaces.map((p) => [p.name, p]));

  // ─── 核心命盘参数 ───

  const fe = chart.fiveElementsClass;
  const firstAge = fe.includes('二') ? 2 : fe.includes('三') ? 3 : fe.includes('四') ? 4 : fe.includes('五') ? 5 : 6;
  const feMeaning = FIVE_ELEMENT_CLASS_MEANING[fe] ?? `${fe}决定了您的大限起始年龄和递转步长。`;

  glossary['五行局'] = `您的五行局为${fe}，大限从${firstAge}岁开始起运。${feMeaning}（注：五行局是紫微斗数中由命宫天干地支推算的独立参数，与八字测算的五行分布没有对应关系，两者不同是正常现象。）`;

  // 命宫
  const ming = palaceMap.get('命宫');
  const mingMain = ming?.majorStars[0];
  const branchMeaning = EARTHLY_BRANCH_MEANING[chart.soulPalaceBranch] ?? `${chart.soulPalaceBranch}是十二地支之一。`;
  glossary['命宫'] = `您的命宫在${chart.soulPalaceBranch}。${branchMeaning}${mingMain ? `您的命宫主星为${mingMain.name}${mingMain.brightness ? `（${mingMain.brightness}）` : ''}，与${chart.soulPalaceBranch}地支结合，塑造了您核心性格特质的基础。` : '您的命宫为空宫，需借对宫星曜参考，不代表命运空白，而是该领域受到对宫影响较大。'}`;

  // 身宫
  const bodyPalace = palaceMap.get(chart.bodyPalaceBranch);
  const bodyBranchMeaning = EARTHLY_BRANCH_MEANING[chart.bodyPalaceBranch] ?? `${chart.bodyPalaceBranch}是十二地支之一。`;
  glossary['身宫'] = `您的身宫在${chart.bodyPalaceBranch}。${bodyBranchMeaning}身宫代表后天运势的重心所在，影响中年以后的人生走向。${bodyPalace?.majorStars.length ? `您的身宫主星为${bodyPalace.majorStars.map((s) => s.name).join('、')}。` : '您的身宫为空宫，需借对宫星曜参考。'}`;

  // 命主 / 身主
  const soulMeaning = EARTHLY_BRANCH_MEANING[chart.soulPalaceBranch] ?? '';
  glossary['命主'] = `您的命主是${chart.soul}。命主由命宫地支${chart.soulPalaceBranch}决定，代表您的先天本质和性格核心。${soulMeaning ? `命宫在${chart.soulPalaceBranch}的补充说明：${soulMeaning}` : ''}`;
  const yearBranchMeaning = EARTHLY_BRANCH_MEANING[chart.yearBranch] ?? '';
  glossary['身主'] = `您的身主是${chart.body}。身主由出生年支${chart.yearBranch}决定，代表您的后天发展和身体运势。${yearBranchMeaning ? `年支${chart.yearBranch}的说明：${yearBranchMeaning}` : ''}`;

  // 四柱
  const pillars = chart.chineseDate.split(' ');
  glossary['四柱'] = `您的四柱为${chart.chineseDate}，即年柱${pillars[0] ?? ''}、月柱${pillars[1] ?? ''}、日柱${pillars[2] ?? ''}、时柱${pillars[3] ?? ''}。四柱以天干地支表示出生年月日时，是紫微斗数排盘的基础。`;

  // 生年四化
  glossary['生年四化'] = `您的生年四化由年干${chart.yearStem}决定：化禄在${chart.sihua.lu}、化权在${chart.sihua.quan}、化科在${chart.sihua.ke}、化忌在${chart.sihua.ji}。四化是紫微斗数中最重要的动态能量，决定一生运势变化的主要线索。`;

  // 各化 —— 结合星曜 + 落入宫位 + 具体吉凶影响生成个性化解释
  const getSihuaEffectMap = (huaname: string): Record<string, string> | null => {
    if (huaname === '化禄') return SIHUA_LU_EFFECT;
    if (huaname === '化权') return SIHUA_QUAN_EFFECT;
    if (huaname === '化科') return SIHUA_KE_EFFECT;
    if (huaname === '化忌') return SIHUA_JI_EFFECT;
    return null;
  };

  const buildSihuaGlossary = (huaname: string, starName: string, desc: string) => {
    if (!starName) return `您的${huaname}暂未确定。${desc}`;
    const palaceName = findStarPalace(starName, chart.palaces);
    const palaceKey = palaceName ?? '命宫';
    const palaceInfluence = PALACE_INFLUENCE[palaceKey] ?? '你人生的一个方面';
    const displayPalace = palaceName === '命宫' ? '命宫' : `${palaceName}宫`;
    const effectMap = getSihuaEffectMap(huaname);
    const specificEffect = effectMap?.[palaceKey] ?? `你在${palaceInfluence}上会特别明显地感受到这股能量的影响`;
    return `您的${huaname}是${starName}，落入${displayPalace}（${palaceInfluence}）。${desc}具体来说：${specificEffect}`;
  };

  glossary['化禄'] = buildSihuaGlossary('化禄', chart.sihua.lu, '化禄代表财富、机会、顺利和增加的能量。');
  glossary['化权'] = buildSihuaGlossary('化权', chart.sihua.quan, '化权代表权力、掌控、能力和主导力。');
  glossary['化科'] = buildSihuaGlossary('化科', chart.sihua.ke, '化科代表名声、才华展现、考试和贵人。');
  glossary['化忌'] = buildSihuaGlossary('化忌', chart.sihua.ji, '化忌代表阻碍、收敛、执着和需要注意之处。');

  // 天干 / 地支
  glossary['天干'] = `您的年干为${chart.yearStem}。天干与地支配合组成六十甲子纪年，是推算四化、五行局的基础。`;
  const sbMeaning = EARTHLY_BRANCH_MEANING[chart.soulPalaceBranch] ?? '';
  const ybMeaning = EARTHLY_BRANCH_MEANING[chart.yearBranch] ?? '';
  glossary['地支'] = `您的命宫地支为${chart.soulPalaceBranch}，年支为${chart.yearBranch}。地支用于划分宫位和纪年。${sbMeaning ? `${chart.soulPalaceBranch}：${sbMeaning}` : ''}${ybMeaning ? ` ${chart.yearBranch}：${ybMeaning}` : ''}`;

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
