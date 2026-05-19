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
};

export type ZiweiCenterInfo = {
  chartTitle: string;
  mingZhu: string;
  shenZhu: string;
};

export type BaZiPillar = {
  stem: string;
  branch: string;
  label: string;
  element: FiveElementKey;
  tooltip: string;
};

export type DestinyModule = {
  title: string;
  summary: string;
  bullets: string[];
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
  | 'profileOverview'
  | 'ziweiCenter'
  | 'overviewModules'
  | 'timeline'
  | 'relations'
  | 'ziweiPalaces';

export type BaziSectionPayloadMap = {
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
  profileOverview: DestinyReport['profile'];
  ziweiCenter: NonNullable<DestinyReport['ziweiCenter']>;
  overviewModules: Pick<DestinyReport['modules'], 'personality' | 'career' | 'wealth'>;
  timeline: DestinyReport['timeline'];
  relations: {
    summary: string;
    opportunities: string[];
    risks: string[];
    actions: string[];
  };
  ziweiPalaces: NonNullable<DestinyReport['ziweiPalaces']>;
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
