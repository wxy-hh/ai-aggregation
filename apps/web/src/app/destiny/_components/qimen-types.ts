import type {
  QimenAnalyzeRequest as SharedQimenAnalyzeRequest,
  QimenAnalysisBaseResult as SharedQimenAnalysisBaseResult,
  QimenBoardCell as SharedQimenBoardCell,
  QimenSectionResponseMap as SharedQimenSectionResponseMap,
  QimenSectionTaskStatus as SharedQimenSectionTaskStatus,
  QimenStrategyOverview as SharedQimenStrategyOverview,
} from '@repo/shared';

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

export type QimenAnalyzeRequest = SharedQimenAnalyzeRequest;
export type QimenBoardCell = SharedQimenBoardCell;
export type QimenAnalysisBaseResult = SharedQimenAnalysisBaseResult;
export type QimenStrategyOverview = SharedQimenStrategyOverview;
export type QimenSectionResponseMap = SharedQimenSectionResponseMap;
export type QimenSectionTaskStatus = SharedQimenSectionTaskStatus;
export type QimenAsyncSectionKey = 'strategyOverview' | 'timingWindows' | 'chartSummary';
export type QimenSectionStatus = 'idle' | 'loading' | 'completed' | 'failed';
export type QimenBaseStatus = QimenSectionStatus;
export type QimenAsyncSections = Partial<
  Pick<QimenSectionResponseMap, 'strategyOverview' | 'timingWindows' | 'chartSummary'>
>;
export type QimenAnalysisStartResponse = {
  success: boolean;
  analysisId: string;
  error?: string;
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

export type QimenSectionResponse<K extends QimenAsyncSectionKey> = {
  success: boolean;
  analysisId: string;
  sectionKey: K;
  status: QimenSectionTaskStatus | 'pending';
  data?: QimenSectionResponseMap[K];
  error?: string;
};

export type QimenBaseSectionResponse = {
  success: boolean;
  analysisId: string;
  sectionKey: 'baseResult';
  status: QimenSectionTaskStatus | 'pending';
  data?: QimenAnalysisBaseResult;
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
