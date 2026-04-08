export type QimenQuestionCategory =
  | 'career'
  | 'wealth'
  | 'love'
  | 'health'
  | 'decision'
  | 'study'
  | 'other';

export type QimenChartMethod = 'time' | 'daily';

export type QimenAnalysisFocus = 'short_term' | 'long_term' | 'risk_control';

export type QimenOutputStyle = 'professional' | 'plain';

export type QimenOutputLength = 'brief' | 'detailed';

export type QimenAnalyzeRequest = {
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

export type QimenBoardCell = {
  palace: string;
  luoshu: number;
  direction: string;
  god: string;
  star: string;
  door: string;
  heavenStem: string;
  earthStem: string;
  isValueSymbol?: boolean;
  isValueDoor?: boolean;
  isVoid?: boolean;
  isHorse?: boolean;
};

export type QimenAnalyzeResult = {
  chartTitle: string;
  chartMeta: {
    dun: string;
    ju: string;
    jiaziXunkong: string;
    horsePosition: string;
    valueSymbol: string;
    valueDoor: string;
  };
  board: QimenBoardCell[];
  chartSummary: string;
  overallAssessment: string;
  riskAlerts: string[];
  actionSuggestions: string[];
  timingWindows: Array<{
    period: string;
    guidance: string;
  }>;
  score: number;
  disclaimer: string;
};

export type QimenAnalyzeResponse = {
  success: boolean;
  data?: QimenAnalyzeResult;
  error?: string;
};

export type QimenFormData = {
  datetime: string;
  location: string;
  category: QimenQuestionCategory;
  description: string;
  chartMethod: QimenChartMethod;
  focus: QimenAnalysisFocus;
  outputStyle: QimenOutputStyle;
  outputLength: QimenOutputLength;
};
