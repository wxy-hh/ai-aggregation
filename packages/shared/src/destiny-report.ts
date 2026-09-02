// ============================================
// Destiny（八字 / 紫微）报告领域类型 — 前后端唯一权威定义
// --------------------------------------------
// 从 apps/web/src/app/destiny/_components/types.ts 迁入（架构评审 2.2 C2），
// API 层与 UI 层统一从 @repo/shared 导入，禁止服务端反向依赖 UI 组件目录。
//
// 纯类型模块：唯一外部依赖是 bazi-chart.ts，零运行时代码。
// 流式事件契约见 ./destiny-stream-contract.ts。
// ============================================

import type {
  BaziChartBasis,
  FiveElementKey,
  TenGodDomainKey,
} from './bazi-chart';

export type LifeDimensionKey = 'career' | 'wealth' | 'health' | 'love' | 'wisdom';

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
  /** 大白话：该维在用户命局中的倾向（AI 生成，可选） */
  summary?: string;
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

// ─── Copilot 追问对话契约 ───

export type DestinyCopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DestinyCopilotRequest = {
  report: DestinyReport;
  question: string;
  /** 从十年大运弹层发起追问时，指定聚焦的干支大运名（如「丙寅」） */
  focusDecadeName?: string;
};

export type DestinyCopilotResponse = {
  answer: string;
};
