/**
 * 奇门分析契约层（评审 C3 内部分段）。
 * 只含纯类型；schema / prompt 构建 / AI 编排各自独立，单向依赖本层。
 */

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
    longitude?: number;
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
  wuxing?: string;
  pattern?: string;
};

export type QimenAnalysisBaseResult = {
  chartTitle: string;
  chartMeta: {
    dun: string;
    ju: string;
    jiaziXunkong: string;
    horsePosition: string;
    valueSymbol: string;
    valueDoor: string;
    xunshou: string;
    riGan: string;
    shiGan: string;
    trueSolarTime?: string;
  };
  board: QimenBoardCell[];
  score: number;
  disclaimer: string;
};

export type QimenStrategyOverview = {
  overallAssessment: string;
  riskAlerts: string[];
  actionSuggestions: string[];
};

export type QimenTimingWindow = {
  period: string;
  guidance: string;
};

export type QimenSectionKey = 'strategyOverview' | 'timingWindows' | 'chartSummary';
export type QimenQuerySectionKey = QimenSectionKey | 'baseResult';
export type QimenSectionTaskStatus = 'pending' | 'completed' | 'failed';

export type QimenSectionResultMap = {
  strategyOverview: QimenStrategyOverview;
  timingWindows: QimenTimingWindow[];
  chartSummary: string;
};

export type QimenAnalysisStartResponse = {
  success: true;
  analysisId: string;
  baseResult: QimenAnalysisBaseResult;
};

export type QimenSectionResponseMap = {
  baseResult: QimenAnalysisBaseResult;
  strategyOverview: QimenStrategyOverview;
  timingWindows: QimenTimingWindow[];
  chartSummary: string;
};