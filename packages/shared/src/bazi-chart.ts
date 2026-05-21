import {
  ChildLimit,
  Gender,
  HideHeavenStemType,
  LunarHour,
  LunarYear,
  SixtyCycleHour,
  SixtyCycleYear,
  SolarTerm,
  SolarTime,
  YinYang,
} from 'tyme4ts';

export type FiveElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';
export type TenGodDomainKey = 'self' | 'expression' | 'wealth' | 'order' | 'resource';

export type BaziChartInput = {
  name: string;
  gender: 'male' | 'female';
  calendarType: 'lunar' | 'solar'; // 农历或阳历
  birthDate: { year: number; month: number; day: number; isLeapMonth?: boolean };
  birthTime: { hour: string; minute: string };
  location: { name: string; lat: number | null; lon: number | null };
};

export type BaziChartTimePoint = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  text: string;
};

export type BaziChartPillar = {
  label: '年柱' | '月柱' | '日柱' | '时柱';
  name: string;
  stem: string;
  branch: string;
  displayElement: FiveElementKey;
  stemElement: FiveElementKey;
  branchElement: FiveElementKey;
  stemTenGod: string;
  sound: string;
  hiddenStems: Array<{
    stem: string;
    type: 'main' | 'middle' | 'residual';
    element: FiveElementKey;
    tenGod: string;
  }>;
};

export type BaziChartElementStat = {
  key: FiveElementKey;
  label: string;
  value: number;
  weight: number;
  sources: {
    stems: number;
    branches: number;
    hiddenStems: number;
    seasonalBonus: number;
  };
};

export type BaziChartTenGodStat = {
  key: string;
  label: string;
  domain: TenGodDomainKey;
  value: number;
  weight: number;
  visibleStems: number;
  hiddenStems: number;
};

export type BaziChartSolarTermContext = {
  active: {
    name: string;
    type: 'jie' | 'qi';
    solarTime: BaziChartTimePoint;
  };
  previous: {
    name: string;
    type: 'jie' | 'qi';
    solarTime: BaziChartTimePoint;
  };
  next: {
    name: string;
    type: 'jie' | 'qi';
    solarTime: BaziChartTimePoint;
  };
};

export type BaziChartSolarCorrection = {
  applied: boolean;
  longitude: number | null;
  standardMeridian: number;
  longitudeOffset: number; // 经度时差（秒）
  equationOfTime: number; // 均时差（秒）
  offsetSeconds: number; // 总修正量（秒）= longitudeOffset + equationOfTime
  offsetMinutes: number; // 总修正量（分钟）
  summary: string;
};

export type BaziChartChildLimit = {
  forward: boolean;
  startAge: number;
  endAge: number;
  startTime: BaziChartTimePoint;
  endTime: BaziChartTimePoint;
  duration: {
    years: number;
    months: number;
    days: number;
    hours: number;
    minutes: number;
  };
};

export type BaziChartDecadeFortune = {
  index: number;
  name: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  sixtyCycle: string;
  active: boolean;
};

export type BaziChartAnnualCycle = {
  year: number;
  yearCycle: string;
  age: number;
  decadeFortune: string;
  annualFortune: string;
};

export type BaziChartBasis = {
  profile: {
    name: string;
    genderLabel: string;
    locationText: string;
    birthText: string;
    lunarText: string;
    solarText: string;
    chartSummary: string;
  };
  originalInput: BaziChartInput;
  solarTime: {
    standard: BaziChartTimePoint;
    corrected: BaziChartTimePoint;
  };
  correction: BaziChartSolarCorrection;
  dayMaster: {
    stem: string;
    element: FiveElementKey;
    yinYang: 'yin' | 'yang';
  };
  pillars: BaziChartPillar[];
  solarTerms: BaziChartSolarTermContext;
  elementStats: BaziChartElementStat[];
  tenGodStats: BaziChartTenGodStat[];
  childLimit: BaziChartChildLimit;
  decadeFortunes: BaziChartDecadeFortune[];
  annualCycles: BaziChartAnnualCycle[];
  reportSeed: {
    pillars: Array<{
      stem: string;
      branch: string;
      label: string;
      element: FiveElementKey;
      tooltip: string;
    }>;
    elements: Array<{ key: FiveElementKey; label: string; value: number }>;
    tenGods: Array<{ key: string; label: string; value: number; tooltip: string }>;
    timeline: Array<{
      year: number;
      title: string;
      summary: string;
      detail: {
        opportunities: string[];
        risks: string[];
        actions: string[];
      };
    }>;
  };
};

export type BaziPromptPayload = {
  deterministicFacts: Record<string, unknown>;
  litePromptPayload: Record<string, unknown>;
};

const PILLAR_LABELS: Array<BaziChartPillar['label']> = ['年柱', '月柱', '日柱', '时柱'];
const FIVE_ELEMENT_ORDER: FiveElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
const FIVE_ELEMENT_LABELS: Record<FiveElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

const TEN_GOD_DOMAIN_LABELS: Record<TenGodDomainKey, string> = {
  self: '比肩/劫财',
  expression: '食神/伤官',
  wealth: '正财/偏财',
  order: '正官/七杀',
  resource: '正印/偏印',
};

const TEN_GOD_PRESETS = [
  { key: 'bijian', label: '比肩', domain: 'self' },
  { key: 'jiecai', label: '劫财', domain: 'self' },
  { key: 'shishen', label: '食神', domain: 'expression' },
  { key: 'shangguan', label: '伤官', domain: 'expression' },
  { key: 'zhengcai', label: '正财', domain: 'wealth' },
  { key: 'piancai', label: '偏财', domain: 'wealth' },
  { key: 'zhengguan', label: '正官', domain: 'order' },
  { key: 'qisha', label: '七杀', domain: 'order' },
  { key: 'zhengyin', label: '正印', domain: 'resource' },
  { key: 'pianyin', label: '偏印', domain: 'resource' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  domain: TenGodDomainKey;
}>;

const MONTH_BRANCH_SEASONAL_BONUS = 4;
const STEM_WEIGHT = 10;
const BRANCH_WEIGHT = 8;
const HIDDEN_STEM_WEIGHTS: Record<'main' | 'middle' | 'residual', number> = {
  main: 4,
  middle: 2,
  residual: 1,
};

export function computeBaziChart(
  input: BaziChartInput,
  options: { referenceYear?: number } = {}
): BaziChartBasis {
  const referenceYear = options.referenceYear ?? new Date().getFullYear();

  // 根据历法类型创建时间对象
  let standardSolarTime: SolarTime;

  if (input.calendarType === 'lunar') {
    // 农历：使用 LunarHour.fromYmdHms，闰月用负数月份
    const lunarMonth = input.birthDate.isLeapMonth
      ? -input.birthDate.month
      : input.birthDate.month;
    const lunarHour = LunarHour.fromYmdHms(
      input.birthDate.year,
      lunarMonth,
      input.birthDate.day,
      Number(input.birthTime.hour),
      Number(input.birthTime.minute),
      0
    );
    standardSolarTime = lunarHour.getSolarTime();
  } else {
    // 阳历：直接使用 SolarTime.fromYmdHms
    standardSolarTime = SolarTime.fromYmdHms(
      input.birthDate.year,
      input.birthDate.month,
      input.birthDate.day,
      Number(input.birthTime.hour),
      Number(input.birthTime.minute),
      0
    );
  }

  const correction = buildSolarCorrection(
    input.location.lon,
    standardSolarTime.getYear(),
    standardSolarTime.getMonth(),
    standardSolarTime.getDay()
  );
  const correctedSolarTime = correction.applied
    ? SolarTime.fromYmdHms(
        standardSolarTime.getYear(),
        standardSolarTime.getMonth(),
        standardSolarTime.getDay(),
        standardSolarTime.getHour(),
        standardSolarTime.getMinute(),
        standardSolarTime.getSecond()
      ).next(correction.offsetSeconds)
    : standardSolarTime;

  const eightChar = SixtyCycleHour.fromSolarTime(correctedSolarTime).getEightChar();
  const dayMasterStem = eightChar.getDay().getHeavenStem();
  const pillars = [
    eightChar.getYear(),
    eightChar.getMonth(),
    eightChar.getDay(),
    eightChar.getHour(),
  ].map((cycle, index) => buildPillar(PILLAR_LABELS[index], cycle, dayMasterStem));

  const elementStats = buildElementStats(pillars);
  const tenGodStats = buildTenGodStats(pillars, dayMasterStem.getName());
  const childLimit = ChildLimit.fromSolarTime(
    correctedSolarTime,
    input.gender === 'female' ? Gender.WOMAN : Gender.MAN
  );
  const solarTerms = buildSolarTerms(correctedSolarTime);
  const decadeFortunes = buildDecadeFortunes(childLimit, referenceYear);
  const annualCycles = buildAnnualCycles(correctedSolarTime, childLimit, referenceYear);
  const genderLabel = input.gender === 'female' ? '坤造（女命）' : '乾造（男命）';
  const locationText =
    input.location.name && input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat.toFixed(2)}, ${input.location.lon.toFixed(2)}）`
      : input.location.name || '出生地待确认';
  const birthText = `${input.birthDate.year}年${input.birthDate.month}月${input.birthDate.day}日 ${input.birthTime.hour}:${input.birthTime.minute}`;

  // 根据历法类型生成农历文本
  const lunarText =
    input.calendarType === 'lunar'
      ? LunarHour.fromYmdHms(
          input.birthDate.year,
          input.birthDate.month,
          input.birthDate.day,
          Number(input.birthTime.hour),
          Number(input.birthTime.minute),
          0
        ).toString()
      : standardSolarTime.getLunarHour().toString();

  const chartSummary = `${genderLabel.startsWith('坤') ? '坤造' : '乾造'}：${pillars
    .map((pillar) => pillar.name)
    .join(' ')}`;

  const basis: BaziChartBasis = {
    profile: {
      name: input.name.trim() || '命主',
      genderLabel,
      locationText,
      birthText,
      lunarText,
      solarText: correctedSolarTime.toString(),
      chartSummary,
    },
    originalInput: input,
    solarTime: {
      standard: toTimePoint(standardSolarTime),
      corrected: toTimePoint(correctedSolarTime),
    },
    correction,
    dayMaster: {
      stem: dayMasterStem.getName(),
      element: mapElement(dayMasterStem.getElement().getName()),
      yinYang: dayMasterStem.getYinYang() === YinYang.YANG ? 'yang' : 'yin',
    },
    pillars,
    solarTerms,
    elementStats,
    tenGodStats,
    childLimit: {
      forward: childLimit.isForward(),
      startAge: childLimit.getStartAge(),
      endAge: childLimit.getEndAge(),
      startTime: toTimePoint(childLimit.getStartTime()),
      endTime: toTimePoint(childLimit.getEndTime()),
      duration: {
        years: childLimit.getYearCount(),
        months: childLimit.getMonthCount(),
        days: childLimit.getDayCount(),
        hours: childLimit.getHourCount(),
        minutes: childLimit.getMinuteCount(),
      },
    },
    decadeFortunes,
    annualCycles,
    reportSeed: buildReportSeed(pillars, elementStats, tenGodStats, annualCycles),
  };

  return basis;
}

/**
 * 获取指定农历年份的闰月
 *
 * @param year 农历年份
 * @returns 闰月月份（1-12），没有闰月返回 0
 */
export function getLunarLeapMonth(year: number): number {
  return LunarYear.fromYear(year).getLeapMonth();
}

export function buildBaziPromptPayload(basis: BaziChartBasis): BaziPromptPayload {
  return {
    deterministicFacts: {
      profile: basis.profile,
      solarCorrection: basis.correction,
      dayMaster: basis.dayMaster,
      pillars: basis.pillars.map((pillar) => ({
        label: pillar.label,
        name: pillar.name,
        stemElement: FIVE_ELEMENT_LABELS[pillar.stemElement],
        branchElement: FIVE_ELEMENT_LABELS[pillar.branchElement],
        stemTenGod: pillar.stemTenGod,
        hiddenStems: pillar.hiddenStems,
        sound: pillar.sound,
      })),
      solarTerms: basis.solarTerms,
      elementStats: basis.elementStats,
      tenGodStats: basis.tenGodStats,
      childLimit: basis.childLimit,
      decadeFortunes: basis.decadeFortunes,
      annualCycles: basis.annualCycles,
    },
    litePromptPayload: {
      chartSummary: basis.profile.chartSummary,
      birthContext: `${basis.profile.genderLabel}；${basis.profile.lunarText}；出生地：${basis.profile.locationText}`,
      solarCorrection: basis.correction.summary,
      dayMaster: `${basis.dayMaster.stem}${FIVE_ELEMENT_LABELS[basis.dayMaster.element]}`,
      pillars: basis.pillars.map((pillar) => ({
        label: pillar.label,
        name: pillar.name,
        hiddenStems: pillar.hiddenStems.map((item) => `${item.stem}${item.tenGod}`),
      })),
      solarTerms: {
        active: `${basis.solarTerms.active.name}（${basis.solarTerms.active.solarTime.text}）`,
        next: `${basis.solarTerms.next.name}（${basis.solarTerms.next.solarTime.text}）`,
      },
      elements: basis.elementStats.map((item) => `${item.label}${item.value}`),
      topTenGods: basis.tenGodStats.slice(0, 6).map((item) => `${item.label}${item.value}`),
      startFortune: {
        forward: basis.childLimit.forward,
        startAge: basis.childLimit.startAge,
        duration: basis.childLimit.duration,
      },
      annualCycles: basis.annualCycles,
    },
  };
}

function buildReportSeed(
  pillars: BaziChartPillar[],
  elementStats: BaziChartElementStat[],
  tenGodStats: BaziChartTenGodStat[],
  annualCycles: BaziChartAnnualCycle[]
) {
  return {
    pillars: pillars.map((pillar) => ({
      stem: pillar.stem,
      branch: pillar.branch,
      label: pillar.label,
      element: pillar.displayElement,
      tooltip: '',
    })),
    elements: elementStats.map((item) => ({
      key: item.key,
      label: item.label,
      value: item.value,
    })),
    tenGods: tenGodStats.slice(0, 4).map((item) => ({
      key: item.key,
      label: item.label,
      value: item.value,
      tooltip: `${item.label}对应${TEN_GOD_DOMAIN_LABELS[item.domain]}能量，在当前盘面中占比更显。`,
    })),
    timeline: annualCycles.map((item) => ({
      year: item.year,
      title: `${item.yearCycle}年 · 运势解读`,
      summary: `当前处于${item.decadeFortune}大运，AI 正在结合流年 ${item.yearCycle} 与岁运关系生成详细解读。`,
      detail: {
        opportunities: [`结合 ${item.decadeFortune} 大运观察年度放大机会`],
        risks: [`注意 ${item.annualFortune} 对节奏与压力感的牵引`],
        actions: ['等待完整流年叙事生成后查看具体建议'],
      },
    })),
  };
}

function buildPillar(
  label: BaziChartPillar['label'],
  cycle: any,
  dayMasterStem: any
): BaziChartPillar {
  const heavenStem = cycle.getHeavenStem();
  const earthBranch = cycle.getEarthBranch();
  return {
    label,
    name: cycle.getName(),
    stem: heavenStem.getName(),
    branch: earthBranch.getName(),
    displayElement: mapElement(heavenStem.getElement().getName()),
    stemElement: mapElement(heavenStem.getElement().getName()),
    branchElement: mapElement(earthBranch.getElement().getName()),
    stemTenGod: dayMasterStem.getTenStar(heavenStem).getName(),
    sound: cycle.getSound().getName(),
    hiddenStems: earthBranch.getHideHeavenStems().map((item: any) => {
      const stem = item.getHeavenStem();
      return {
        stem: stem.getName(),
        type: mapHiddenStemType(item.getType()),
        element: mapElement(stem.getElement().getName()),
        tenGod: dayMasterStem.getTenStar(stem).getName(),
      };
    }),
  };
}

function buildElementStats(pillars: BaziChartPillar[]): BaziChartElementStat[] {
  const counters = new Map<
    FiveElementKey,
    { weight: number; stems: number; branches: number; hiddenStems: number; seasonalBonus: number }
  >();

  for (const key of FIVE_ELEMENT_ORDER) {
    counters.set(key, { weight: 0, stems: 0, branches: 0, hiddenStems: 0, seasonalBonus: 0 });
  }

  pillars.forEach((pillar, index) => {
    const stemBucket = counters.get(pillar.stemElement)!;
    stemBucket.weight += STEM_WEIGHT;
    stemBucket.stems += STEM_WEIGHT;

    const branchBucket = counters.get(pillar.branchElement)!;
    branchBucket.weight += BRANCH_WEIGHT;
    branchBucket.branches += BRANCH_WEIGHT;

    if (index === 1) {
      branchBucket.weight += MONTH_BRANCH_SEASONAL_BONUS;
      branchBucket.seasonalBonus += MONTH_BRANCH_SEASONAL_BONUS;
    }

    for (const hiddenStem of pillar.hiddenStems) {
      const hiddenBucket = counters.get(hiddenStem.element)!;
      const hiddenWeight = HIDDEN_STEM_WEIGHTS[hiddenStem.type];
      hiddenBucket.weight += hiddenWeight;
      hiddenBucket.hiddenStems += hiddenWeight;
    }
  });

  const totalWeight =
    Array.from(counters.values()).reduce((sum, item) => sum + item.weight, 0) || 1;

  return FIVE_ELEMENT_ORDER.map((key) => {
    const item = counters.get(key)!;
    return {
      key,
      label: FIVE_ELEMENT_LABELS[key],
      value: Math.max(0, Math.min(100, Math.round((item.weight / totalWeight) * 100))),
      weight: item.weight,
      sources: {
        stems: item.stems,
        branches: item.branches,
        hiddenStems: item.hiddenStems,
        seasonalBonus: item.seasonalBonus,
      },
    };
  });
}

function buildTenGodStats(
  pillars: BaziChartPillar[],
  dayMasterName: string
): BaziChartTenGodStat[] {
  const counters = new Map<
    string,
    {
      label: string;
      domain: TenGodDomainKey;
      weight: number;
      visibleStems: number;
      hiddenStems: number;
    }
  >();
  for (const preset of TEN_GOD_PRESETS) {
    counters.set(preset.label, {
      label: preset.label,
      domain: preset.domain,
      weight: 0,
      visibleStems: 0,
      hiddenStems: 0,
    });
  }

  const monthStemBoost = 2;
  pillars.forEach((pillar, index) => {
    const visibleBucket = counters.get(pillar.stemTenGod)!;
    visibleBucket.weight += STEM_WEIGHT + (index === 1 ? monthStemBoost : 0);
    visibleBucket.visibleStems += STEM_WEIGHT + (index === 1 ? monthStemBoost : 0);

    for (const hiddenStem of pillar.hiddenStems) {
      const hiddenBucket = counters.get(hiddenStem.tenGod)!;
      const weight = HIDDEN_STEM_WEIGHTS[hiddenStem.type];
      hiddenBucket.weight += weight;
      hiddenBucket.hiddenStems += weight;
    }
  });

  const totalWeight =
    Array.from(counters.values()).reduce((sum, item) => sum + item.weight, 0) || 1;

  return TEN_GOD_PRESETS.map((preset) => {
    const item = counters.get(preset.label)!;
    return {
      key: preset.key,
      label: item.label,
      domain: item.domain,
      value: Math.max(0, Math.min(100, Math.round((item.weight / totalWeight) * 100))),
      weight: item.weight,
      visibleStems: item.visibleStems,
      hiddenStems: item.hiddenStems,
    };
  }).sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, 'zh-CN'));
}

function buildSolarTerms(solarTime: SolarTime): BaziChartSolarTermContext {
  const candidates: Array<{ name: string; type: 'jie' | 'qi'; solarTime: SolarTime }> = [];
  for (let year = solarTime.getYear() - 1; year <= solarTime.getYear() + 1; year += 1) {
    for (let index = 0; index < 24; index += 1) {
      const term = SolarTerm.fromIndex(year, index);
      candidates.push({
        name: term.getName(),
        type: term.isJie() ? 'jie' : 'qi',
        solarTime: term.getJulianDay().getSolarTime(),
      });
    }
  }

  candidates.sort((a, b) => timeScore(a.solarTime) - timeScore(b.solarTime));

  let activeIndex = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    if (timeScore(candidates[index].solarTime) <= timeScore(solarTime)) {
      activeIndex = index;
    } else {
      break;
    }
  }

  const previous = candidates[Math.max(0, activeIndex - 1)];
  const active = candidates[activeIndex];
  const next = candidates[Math.min(candidates.length - 1, activeIndex + 1)];

  return {
    previous: {
      name: previous.name,
      type: previous.type,
      solarTime: toTimePoint(previous.solarTime),
    },
    active: {
      name: active.name,
      type: active.type,
      solarTime: toTimePoint(active.solarTime),
    },
    next: {
      name: next.name,
      type: next.type,
      solarTime: toTimePoint(next.solarTime),
    },
  };
}

function buildDecadeFortunes(childLimit: any, referenceYear: number): BaziChartDecadeFortune[] {
  const result: BaziChartDecadeFortune[] = [];
  let decade = childLimit.getStartDecadeFortune();
  for (let index = 0; index < 6; index += 1) {
    result.push({
      index,
      name: decade.getName(),
      startAge: decade.getStartAge(),
      endAge: decade.getEndAge(),
      startYear: decade.getStartLunarYear().getYear(),
      endYear: decade.getEndLunarYear().getYear(),
      sixtyCycle: decade.getSixtyCycle().getName(),
      active:
        referenceYear >= decade.getStartLunarYear().getYear() &&
        referenceYear <= decade.getEndLunarYear().getYear(),
    });
    decade = decade.next(1);
  }
  return result;
}

function buildAnnualCycles(
  solarTime: SolarTime,
  childLimit: any,
  referenceYear: number
): BaziChartAnnualCycle[] {
  const startFortune = childLimit.getStartFortune();
  const startFortuneYear = startFortune.getLunarYear().getYear();

  return Array.from({ length: 3 }, (_, offset) => {
    const year = referenceYear + offset;
    const yearCycle = SixtyCycleYear.fromYear(year).getSixtyCycle().getName();
    const fortune =
      year >= startFortuneYear ? startFortune.next(year - startFortuneYear) : startFortune;
    const decade = findDecadeFortuneForYear(childLimit, year);
    return {
      year,
      yearCycle,
      age: year - solarTime.getYear() + 1,
      decadeFortune: decade.getName(),
      annualFortune: fortune.getName(),
    };
  });
}

function findDecadeFortuneForYear(childLimit: any, year: number) {
  let decade = childLimit.getStartDecadeFortune();
  for (let index = 0; index < 12; index += 1) {
    if (
      year >= decade.getStartLunarYear().getYear() &&
      year <= decade.getEndLunarYear().getYear()
    ) {
      return decade;
    }
    decade = decade.next(1);
  }
  return childLimit.getStartDecadeFortune();
}

/**
 * 计算均时差（Equation of Time）
 *
 * 均时差是真太阳时与平太阳时之间的差值，由地球公转轨道椭圆形和地轴倾斜导致。
 * 范围：-16 分钟 到 +16 分钟
 *
 * @param year 年份
 * @param month 月份（1-12）
 * @param day 日期（1-31）
 * @returns 均时差（分钟）
 */
function calculateEquationOfTime(year: number, month: number, day: number): number {
  // 计算一年中的第几天（Day of Year）
  const dayOfYear = getDayOfYear(year, month, day);

  // 计算 B 角度（单位：度）
  // B = 360° × (N - 81) / 365
  const B = (360 * (dayOfYear - 81)) / 365;

  // 转换为弧度
  const BRad = (B * Math.PI) / 180;

  // 均时差公式（单位：分钟）
  // EOT = 9.87 × sin(2B) - 7.53 × cos(B) - 1.5 × sin(B)
  const eot = 9.87 * Math.sin(2 * BRad) - 7.53 * Math.cos(BRad) - 1.5 * Math.sin(BRad);

  return eot;
}

/**
 * 计算一年中的第几天（Day of Year）
 *
 * @param year 年份
 * @param month 月份（1-12）
 * @param day 日期（1-31）
 * @returns 一年中的第几天（1-366）
 */
function getDayOfYear(year: number, month: number, day: number): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // 判断是否为闰年
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (isLeapYear) {
    daysInMonth[1] = 29;
  }

  // 累加前面月份的天数
  let dayOfYear = day;
  for (let i = 0; i < month - 1; i++) {
    dayOfYear += daysInMonth[i];
  }

  return dayOfYear;
}

function buildSolarCorrection(
  longitude: number | null,
  year: number,
  month: number,
  day: number
): BaziChartSolarCorrection {
  if (longitude == null || !Number.isFinite(longitude)) {
    return {
      applied: false,
      longitude: null,
      standardMeridian: 120,
      longitudeOffset: 0,
      equationOfTime: 0,
      offsetSeconds: 0,
      offsetMinutes: 0,
      summary: '未提供经度，沿用出生地原始时间，不进行真太阳时修正。',
    };
  }

  // 1. 计算经度时差（秒）
  // 公式：(经度 - 120) × 4 分钟 = (经度 - 120) × 240 秒
  const longitudeOffsetSeconds = Math.round((longitude - 120) * 240);

  // 2. 计算均时差（秒）
  const eotMinutes = calculateEquationOfTime(year, month, day);
  const eotSeconds = Math.round(eotMinutes * 60);

  // 3. 总修正量 = 经度时差 + 均时差
  const totalOffsetSeconds = longitudeOffsetSeconds + eotSeconds;
  const totalOffsetMinutes = Number((totalOffsetSeconds / 60).toFixed(1));

  // 4. 生成说明文本
  const longitudeDirection =
    longitudeOffsetSeconds === 0 ? '无需' : longitudeOffsetSeconds > 0 ? '向后顺延' : '向前回拨';
  const eotDirection = eotSeconds === 0 ? '无需' : eotSeconds > 0 ? '向后顺延' : '向前回拨';
  const totalDirection =
    totalOffsetSeconds === 0 ? '无需' : totalOffsetSeconds > 0 ? '向后顺延' : '向前回拨';

  const summary = `已进行真太阳时修正：经度修正${longitudeDirection} ${Math.abs(longitudeOffsetSeconds / 60).toFixed(1)} 分钟，均时差修正${eotDirection} ${Math.abs(eotMinutes).toFixed(1)} 分钟，总计${totalDirection} ${Math.abs(totalOffsetMinutes)} 分钟。`;

  return {
    applied: true,
    longitude,
    standardMeridian: 120,
    longitudeOffset: longitudeOffsetSeconds,
    equationOfTime: eotSeconds,
    offsetSeconds: totalOffsetSeconds,
    offsetMinutes: totalOffsetMinutes,
    summary,
  };
}

function mapElement(value: string): FiveElementKey {
  if (value.includes('金')) return 'metal';
  if (value.includes('木')) return 'wood';
  if (value.includes('水')) return 'water';
  if (value.includes('火')) return 'fire';
  return 'earth';
}

function mapHiddenStemType(value: HideHeavenStemType): 'main' | 'middle' | 'residual' {
  switch (value) {
    case HideHeavenStemType.MAIN:
      return 'main';
    case HideHeavenStemType.MIDDLE:
      return 'middle';
    default:
      return 'residual';
  }
}

function toTimePoint(value: SolarTime): BaziChartTimePoint {
  return {
    year: value.getYear(),
    month: value.getMonth(),
    day: value.getDay(),
    hour: value.getHour(),
    minute: value.getMinute(),
    second: value.getSecond(),
    text: value.toString(),
  };
}

function timeScore(value: SolarTime): number {
  return Date.UTC(
    value.getYear(),
    value.getMonth() - 1,
    value.getDay(),
    value.getHour(),
    value.getMinute(),
    value.getSecond()
  );
}
