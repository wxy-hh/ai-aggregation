import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
import {
  createDefaultDestinyWorkspaceState,
  useDestinyWorkspaceStore,
} from './destiny-workspace-store';

describe('destiny-workspace-store', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
  });

  it('切回模块时若已有结果则优先恢复结果页', () => {
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', {
      step: 'form',
      hasResult: true,
      lastView: 'form',
    });

    useDestinyWorkspaceStore.getState().restoreWorkspace('bazi');

    expect(useDestinyWorkspaceStore.getState().bazi.step).toBe('result');
    expect(useDestinyWorkspaceStore.getState().bazi.lastView).toBe('result');
  });

  it('重新摆盘会清空当前模块缓存但不影响其他模块', () => {
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', {
      step: 'result',
      hasResult: true,
      lastView: 'result',
      formData: {
        ...createDefaultBaziFormData(),
        name: '张三',
      },
    });

    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', {
      step: 'result',
      hasResult: true,
      lastView: 'result',
      formData: {
        ...createDefaultQimenFormData(),
        location: '上海市',
        description: '我想知道这次合作是否适合继续推进，并观察三个月内变化。',
      },
      analysisId: 'analysis-1',
    });

    useDestinyWorkspaceStore.getState().resetWorkspace('bazi');

    expect(useDestinyWorkspaceStore.getState().bazi).toEqual(
      createDefaultDestinyWorkspaceState().bazi
    );
    expect(useDestinyWorkspaceStore.getState().qimen.hasResult).toBe(true);
    expect(useDestinyWorkspaceStore.getState().qimen.analysisId).toBe('analysis-1');
  });
});
