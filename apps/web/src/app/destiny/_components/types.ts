import type { BaziChartBasis } from '@repo/shared';

export type FiveElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';
export type LifeDimensionKey = 'career' | 'wealth' | 'health' | 'love' | 'wisdom';
export type TenGodDomainKey = 'self' | 'expression' | 'wealth' | 'order' | 'resource';

export type DestinyProfile = {
  name: string;
  genderLabel: string;
  birthText: string;
  locationText: string;
  lunarText?: string;
};

export type DestinyCoreTone = {
  tag: string;
  chartSummary: string;
  headline: string;
  description: string;
};

export type DestinyBalanceInsight = {
  title: string;
  value: string;
  tooltip: string;
};

export type DestinyPatternInsight = {
  label: string;
  tooltip: string;
};

export type DestinyLifeDimension = {
  key: LifeDimensionKey;
  label: string;
  value: number;
};

export type DestinyLifeDimensionHighlights = {
  strength: string;
  caution: string;
};

export type DestinyTenGodDomain = {
  key: TenGodDomainKey;
  label: string;
  technicalLabel: string;
  value: number;
  description: string;
  positive?: string;
  negative?: string;
};

export type ZiweiCenterInfo = {
  chartTitle: string;
  mingZhu: string;
  shenZhu: string;
};

// ─── 本地排盘产出（iztro）───

export type ZiweiStarInfo = {
  name: string;
  type: string;
  brightness: string;
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
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  yearStem: string;
  yearBranch: string;
  soulPalaceBranch: string;
  bodyPalaceBranch: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  sihua: ZiweiSihua;
  palaces: ZiweiChartPalace[];
  solarCorrection?: string;
  /** 基于用户命盘数据生成的个性化词汇解释（优先于基础词表） */
  personalizedGlossary?: Record<string, string>;
};

// AI 对每个宫位的解读（仅含解读，不含星曜数据）
export type ZiweiPalaceAnalysis = {
  key: string;
  label: string;
  summary: string;
  suggestions: string[];
};

export type BaZiPillar = {
  stem: string;
  branch: string;
  label: string;
  element: FiveElementKey;
  tooltip: string;
};

export type DestinyModule = {
  /** 宫位名，如「紫杀在辰」 */
  title: string;
  /** 核心描述（一句话概括） */
  summary: string;
  /** 优势列表（每项为纯文本，前端自动加「优势：」前缀） */
  advantages?: string[];
  /** 建议列表（每项为纯文本，前端自动加「建议：」前缀） */
  suggestions?: string[];
  /** 旧格式兼容：兜底 bullet 列表（优先使用 advantages / suggestions） */
  bullets?: string[];
};

export type DestinyTimelineItem = {
  year: number;
  title: string;
  summary: string;
  detail: { opportunities: string[]; risks: string[]; actions: string[] };
};

export type ZiweiPalace = {
  key: string;
  label: string;
  branch: string;
  stars: string[];
  summary: string;
  suggestions: string[];
  dominant?: string;
};

export type DestinyReport = {
  profile: DestinyProfile;
  coreTone: DestinyCoreTone;
  baziBasis?: BaziChartBasis;
  pillars: BaZiPillar[];
  tenGods: { key: string; label: string; value: number; tooltip: string }[];
  elements: { key: FiveElementKey; label: string; value: number }[];
  balanceInsight: DestinyBalanceInsight;
  patternHighlights: DestinyPatternInsight[];
  lifeDimensions?: DestinyLifeDimension[];
  lifeDimensionHighlights?: DestinyLifeDimensionHighlights;
  tenGodDomains?: DestinyTenGodDomain[];
  modules: {
    career: DestinyModule;
    love: DestinyModule;
    wealth: DestinyModule;
    health: DestinyModule;
    personality: DestinyModule;
  };
  timeline: DestinyTimelineItem[];
  ziweiPalaces?: ZiweiPalace[];
  ziweiCenter?: ZiweiCenterInfo;
};

export type PartialDestinyReport = {
  profile?: DestinyReport['profile'];
  coreTone?: DestinyReport['coreTone'];
  baziBasis?: DestinyReport['baziBasis'];
  pillars?: DestinyReport['pillars'];
  tenGods?: DestinyReport['tenGods'];
  elements?: DestinyReport['elements'];
  balanceInsight?: DestinyReport['balanceInsight'];
  patternHighlights?: DestinyReport['patternHighlights'];
  lifeDimensions?: DestinyReport['lifeDimensions'];
  lifeDimensionHighlights?: DestinyReport['lifeDimensionHighlights'];
  tenGodDomains?: DestinyReport['tenGodDomains'];
  modules?: Partial<DestinyReport['modules']>;
  timeline?: DestinyReport['timeline'];
  ziweiPalaces?: DestinyReport['ziweiPalaces'];
  ziweiCenter?: DestinyReport['ziweiCenter'];
};

export type DestinyReportRequest = {
  name: string;
  gender: 'male' | 'female';
  calendarType: 'lunar' | 'solar'; // 农历或阳历
  birthDate: { year: number; month: number; day: number };
  birthTime: { hour: string; minute: string };
  location: { name: string; lat: number | null; lon: number | null };
};

export type DestinyReportResponse = {
  report: DestinyReport;
  generatedAt: string;
};

export type DestinyStreamStatus = 'queued' | 'charting' | 'analyzing' | 'finalizing';

export type BaziSectionKey =
  | 'baziBasis'
  | 'profileOverview'
  | 'coreDestinyTone'
  | 'pillars'
  | 'elementsAndTenGods'
  | 'modulePersonality'
  | 'moduleCareer'
  | 'moduleLove'
  | 'moduleWealth'
  | 'moduleHealth'
  | 'timeline';

export type ZiweiSectionKey =
  | 'chartData'
  | 'profileOverview'
  | 'overviewModules'
  | 'timeline'
  | 'relations'
  | 'palaceAnalysis'
  | 'love'
  | 'health';

export type BaziSectionPayloadMap = {
  baziBasis: NonNullable<DestinyReport['baziBasis']>;
  profileOverview: DestinyReport['profile'];
  coreDestinyTone: DestinyReport['coreTone'];
  pillars: DestinyReport['pillars'];
  elementsAndTenGods: {
    elements: DestinyReport['elements'];
    tenGods: DestinyReport['tenGods'];
    balanceInsight: DestinyReport['balanceInsight'];
    patternHighlights: DestinyReport['patternHighlights'];
    lifeDimensions?: DestinyReport['lifeDimensions'];
    lifeDimensionHighlights?: DestinyReport['lifeDimensionHighlights'];
    tenGodDomains?: DestinyReport['tenGodDomains'];
  };
  modulePersonality: DestinyReport['modules']['personality'];
  moduleCareer: DestinyReport['modules']['career'];
  moduleLove: DestinyReport['modules']['love'];
  moduleWealth: DestinyReport['modules']['wealth'];
  moduleHealth: DestinyReport['modules']['health'];
  timeline: DestinyReport['timeline'];
};

export type ZiweiSectionPayloadMap = {
  chartData: ZiweiChartData;
  profileOverview: DestinyReport['profile'];
  overviewModules: Pick<DestinyReport['modules'], 'personality' | 'career' | 'wealth'>;
  timeline: DestinyReport['timeline'];
  relations: {
    summary: string;
    opportunities: string[];
    risks: string[];
    actions: string[];
  };
  palaceAnalysis: ZiweiPalaceAnalysis[];
  love: DestinyModule;
  health: DestinyModule;
};

export type BaziLockedSections = Partial<BaziSectionPayloadMap>;
export type ZiweiLockedSections = Partial<ZiweiSectionPayloadMap>;

export type BaziStreamEvent =
  | { type: 'status'; status: DestinyStreamStatus }
  | {
      [K in BaziSectionKey]: {
        type: 'section-final';
        sectionKey: K;
        payload: BaziSectionPayloadMap[K];
      };
    }[BaziSectionKey]
  | { type: 'complete'; report: DestinyReport }
  | { type: 'error'; error: string };

export type ZiweiStreamEvent =
  | { type: 'status'; status: DestinyStreamStatus }
  | {
      [K in ZiweiSectionKey]: {
        type: 'section-final';
        sectionKey: K;
        payload: ZiweiSectionPayloadMap[K];
      };
    }[ZiweiSectionKey]
  | { type: 'complete'; report: DestinyReport }
  | { type: 'error'; error: string };

export type DestinyCopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DestinyCopilotRequest = {
  report: DestinyReport;
  question: string;
};

export type DestinyCopilotResponse = {
  answer: string;
};
