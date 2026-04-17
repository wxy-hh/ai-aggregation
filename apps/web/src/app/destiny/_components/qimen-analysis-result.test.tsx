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
        result={null}
        sections={{}}
        loading={false}
        streaming={true}
        streamStatus="queued"
        error={null}
        onBackToForm={() => {}}
        onRetry={() => {}}
      />
    );

    rerender(
      <QimenAnalysisResult
        result={null}
        sections={{ overallAssessment: '局势先稳后动，暂不宜贸然跳槽。' }}
        loading={false}
        streaming={true}
        streamStatus="charting"
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
