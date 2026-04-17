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

export type QimenStreamStatus = 'queued' | 'charting' | 'analyzing' | 'finalizing';

export type QimenSectionKey =
  | 'overallAssessment'
  | 'riskAlerts'
  | 'actionSuggestions'
  | 'timingWindows'
  | 'chartSummary';

export type QimenSectionPayloadMap = {
  overallAssessment: QimenAnalyzeResult['overallAssessment'];
  riskAlerts: QimenAnalyzeResult['riskAlerts'];
  actionSuggestions: QimenAnalyzeResult['actionSuggestions'];
  timingWindows: QimenAnalyzeResult['timingWindows'];
  chartSummary: QimenAnalyzeResult['chartSummary'];
};

export type QimenLockedSections = Partial<QimenSectionPayloadMap>;

export type QimenStreamEvent =
  | {
      type: 'status';
      status: QimenStreamStatus;
    }
  | {
      [K in QimenSectionKey]: {
        type: 'section-final';
        sectionKey: K;
        payload: QimenSectionPayloadMap[K];
      };
    }[QimenSectionKey]
  | {
      type: 'complete';
      result: QimenAnalyzeResult;
    }
  | {
      type: 'error';
      error: string;
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
