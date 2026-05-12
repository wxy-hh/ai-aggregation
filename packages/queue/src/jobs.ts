export interface STTJobData {
  taskId: string;
  userId: string;
  audioUrl: string;
  language?: string;
}

export interface PPTJobData {
  taskId: string;
  userId: string;
  content: string;
  template?: string;
}

export interface ImageJobData {
  taskId: string;
  userId: string;
  prompt: string;
  size?: string;
  style?: string;
}

type QimenQuestionCategory =
  | 'career'
  | 'wealth'
  | 'love'
  | 'health'
  | 'decision'
  | 'study'
  | 'other';

type QimenChartMethod = 'time' | 'daily';
type QimenAnalysisFocus = 'short_term' | 'long_term' | 'risk_control';
type QimenOutputStyle = 'professional' | 'plain';
type QimenOutputLength = 'brief' | 'detailed';
type QimenSectionKey = 'strategyOverview' | 'timingWindows' | 'chartSummary';

type QimenAnalyzeRequest = {
  context: {
    datetime: string;
    location: string;
    chartMethod: QimenChartMethod;
  };
  question: {
    category: QimenQuestionCategory;
    description: string;
    focus: QimenAnalysisFocus;
    outputStyle: QimenOutputStyle;
    outputLength: QimenOutputLength;
  };
};

export interface QimenBaseJobData {
  analysisId: string;
  userId?: string;
  input: QimenAnalyzeRequest;
}

export interface QimenSectionJobData {
  analysisId: string;
  userId?: string;
  sectionKey: QimenSectionKey;
  input: QimenAnalyzeRequest;
}

export const JOB_NAMES = {
  STT: 'stt',
  PPT: 'ppt',
  IMAGE: 'image',
  QIMEN_BASE: 'qimen-base',
  QIMEN_SECTION: 'qimen-section',
} as const;
