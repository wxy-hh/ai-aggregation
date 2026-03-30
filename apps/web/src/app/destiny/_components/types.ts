export type FiveElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type DestinyProfile = {
  name: string;
  genderLabel: string;
  birthText: string;
  locationText: string;
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
