import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QimenAnalysisResult } from './qimen-analysis-result';

describe('QimenAnalysisResult', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('从空态切换到分区结果态时不会触发 Hook 顺序错误', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <QimenAnalysisResult
        analysisId={null}
        baseResult={null}
        baseStatus="loading"
        baseError={null}
        sections={{}}
        sectionStatuses={{
          strategyOverview: 'loading',
          timingWindows: 'loading',
          chartSummary: 'loading',
        }}
        sectionErrors={{}}
        error={null}
        onBackToForm={() => {}}
        onRetry={() => {}}
      />
    );

    rerender(
      <QimenAnalysisResult
        analysisId="analysis-1"
        baseResult={null}
        baseStatus="loading"
        baseError={null}
        sections={{
          strategyOverview: {
            overallAssessment: '局势先稳后动，暂不宜贸然跳槽。',
            riskAlerts: ['风险 1', '风险 2', '风险 3'],
            actionSuggestions: ['建议 1', '建议 2', '建议 3'],
          },
        }}
        sectionStatuses={{
          strategyOverview: 'completed',
          timingWindows: 'loading',
          chartSummary: 'loading',
        }}
        sectionErrors={{}}
        error={null}
        onBackToForm={() => {}}
        onRetry={() => {}}
      />
    );

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('change in the order of Hooks called by QimenAnalysisResult')
    );
  });
});
