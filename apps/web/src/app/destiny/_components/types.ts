export type FiveElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type DestinyProfile = {
  name: string;
  genderLabel: string;
  birthText: string;
  locationText: string;
  lunarText?: string;
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
  pillars: BaZiPillar[];
  tenGods: { key: string; label: string; value: number; tooltip: string }[];
  elements: { key: FiveElementKey; label: string; value: number }[];
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
  pillars?: DestinyReport['pillars'];
  tenGods?: DestinyReport['tenGods'];
  elements?: DestinyReport['elements'];
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
  | 'pillars'
  | 'elementsAndTenGods'
  | 'modulesOverview'
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
  pillars: DestinyReport['pillars'];
  elementsAndTenGods: {
    elements: DestinyReport['elements'];
    tenGods: DestinyReport['tenGods'];
  };
  modulesOverview: DestinyReport['modules'];
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
  reportSummary: string;
  messages: DestinyCopilotMessage[];
  question: string;
};

export type DestinyCopilotResponse = {
  answer: string;
};
