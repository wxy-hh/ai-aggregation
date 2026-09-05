'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
import {
  createDefaultAstrologyFormData,
  type AstrologyFormData,
} from '@/app/destiny/_components/astrology-types';
import type { BaziFormData } from '@/app/destiny/_components/bazi-types';
import type { QimenFormData } from '@/app/destiny/_components/qimen-types';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSectionKey,
  QimenAsyncSections,
  QimenBaseStatus,
  QimenSectionStatus,
} from '@/app/destiny/_components/qimen-types';
import type {
  BaziLockedSections,
  DestinyReport,
  DestinyStreamStatus,
  ZiweiChartData,
  ZiweiLockedSections,
} from '@/app/destiny/_components/types';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import type { DestinyModuleKey } from '@/app/destiny/_components/layout/left-nav';

export type DestinyWorkspaceStep = 'form' | 'result';
export type DestinyProvider = 'doubao' | 'deepseek';
export type DestinyWorkspaceLastView = DestinyWorkspaceStep;
export type BaziErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type ZiweiErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type QimenErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type ZiweiPanelTab = 'overview' | 'timeline' | 'relations' | 'glossary';

type BaseWorkspaceCache<TFormData, TFieldErrors, TErrorKind> = {
  step: DestinyWorkspaceStep;
  hasResult: boolean;
  lastView: DestinyWorkspaceLastView;
  formData: TFormData;
  fieldErrors: TFieldErrors;
  blockingLoading: boolean;
  error: string | null;
  errorKind: TErrorKind | null;
};

export type BaziWorkspaceCache = BaseWorkspaceCache<
  BaziFormData,
  Partial<Record<keyof BaziFormData, string>>,
  BaziErrorKind
> & {
  streaming: boolean;
  report: DestinyReport | null;
  lockedSections: BaziLockedSections;
  streamStatus: DestinyStreamStatus | null;
};

export type ZiweiWorkspaceCache = BaseWorkspaceCache<
  BaziFormData,
  Partial<Record<keyof BaziFormData, string>>,
  ZiweiErrorKind
> & {
  streaming: boolean;
  report: DestinyReport | null;
  chartData: ZiweiChartData | null;
  lockedSections: ZiweiLockedSections;
  streamStatus: DestinyStreamStatus | null;
  tab: ZiweiPanelTab;
  activePalaceLabel: string;
};

export type QimenWorkspaceCache = BaseWorkspaceCache<
  QimenFormData,
  Partial<Record<keyof QimenFormData, string>>,
  QimenErrorKind
> & {
  analysisId: string | null;
  baseResult: QimenAnalysisBaseResult | null;
  baseStatus: QimenBaseStatus;
  baseError: string | null;
  sections: QimenAsyncSections;
  sectionStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>;
  sectionErrors: Partial<Record<QimenAsyncSectionKey, string>>;
};

export type AstrologyErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

/** 星座寰宇工作区缓存（01 骨架；03 加入口视图；04 加表单步骤与真值缓存） */
export type AstrologyWorkspaceCache = BaseWorkspaceCache<
  AstrologyFormData,
  Partial<Record<keyof AstrologyFormData, string>>,
  AstrologyErrorKind
> & {
  /** 入口视图：首页（首次进入/重新测算）、两步表单（§6.2）或加载仪式（05：真值锁定后转场进结果页） */
  entryView: 'home' | 'form' | 'loading';
  /** 两步表单当前步骤（切模块保留进度） */
  formStep: 1 | 2;
  /** 提交后经唯一接缝计算的星盘真值（结果页/分享/问答的真值来源） */
  chartFacts: AstrologyChartFacts | null;
};

export type DestinyWorkspaceCacheState = {
  bazi: BaziWorkspaceCache;
  ziwei: ZiweiWorkspaceCache;
  qimen: QimenWorkspaceCache;
  astrology: AstrologyWorkspaceCache;
};

type DestinyWorkspaceStore = DestinyWorkspaceCacheState & {
  provider: DestinyProvider;
  setProvider: (provider: DestinyProvider) => void;
  /** 当前激活的命理模块(由 DestinyPageClient 同步,供全局 chrome 感知场景,如移动端顶栏入夜) */
  activeModule: DestinyModuleKey | null;
  setActiveModule: (module: DestinyModuleKey | null) => void;
  setWorkspaceState: <TModule extends DestinyModuleKey>(
    module: TModule,
    patch:
      | Partial<DestinyWorkspaceCacheState[TModule]>
      | ((current: DestinyWorkspaceCacheState[TModule]) => Partial<DestinyWorkspaceCacheState[TModule]>)
  ) => void;
  resetWorkspace: (module: DestinyModuleKey) => void;
  restoreWorkspace: (module: DestinyModuleKey) => void;
  markResultReady: (module: DestinyModuleKey) => void;
  resetAllWorkspaces: () => void;
};

function createDefaultBaziWorkspaceCache(): BaziWorkspaceCache {
  return {
    step: 'form',
    hasResult: false,
    lastView: 'form',
    formData: createDefaultBaziFormData(),
    fieldErrors: {},
    blockingLoading: false,
    streaming: false,
    error: null,
    errorKind: null,
    report: null,
    lockedSections: {},
    streamStatus: null,
  };
}

function createDefaultZiweiWorkspaceCache(): ZiweiWorkspaceCache {
  return {
    step: 'form',
    hasResult: false,
    lastView: 'form',
    formData: createDefaultBaziFormData(),
    fieldErrors: {},
    blockingLoading: false,
    streaming: false,
    error: null,
    errorKind: null,
    report: null,
    chartData: null,
    lockedSections: {},
    streamStatus: null,
    tab: 'overview',
    activePalaceLabel: '命宫',
  };
}

function createDefaultQimenWorkspaceCache(): QimenWorkspaceCache {
  return {
    step: 'form',
    hasResult: false,
    lastView: 'form',
    formData: createDefaultQimenFormData(),
    fieldErrors: {},
    blockingLoading: false,
    error: null,
    errorKind: null,
    analysisId: null,
    baseResult: null,
    baseStatus: 'idle',
    baseError: null,
    sections: {},
    sectionStatuses: {
      strategyOverview: 'idle',
      timingWindows: 'idle',
      chartSummary: 'idle',
    },
    sectionErrors: {},
  };
}

function createDefaultAstrologyWorkspaceCache(): AstrologyWorkspaceCache {
  return {
    step: 'form',
    hasResult: false,
    lastView: 'form',
    entryView: 'home',
    formStep: 1,
    chartFacts: null,
    formData: createDefaultAstrologyFormData(),
    fieldErrors: {},
    blockingLoading: false,
    error: null,
    errorKind: null,
  };
}

export function createDefaultDestinyWorkspaceState(): DestinyWorkspaceCacheState {
  return {
    bazi: createDefaultBaziWorkspaceCache(),
    ziwei: createDefaultZiweiWorkspaceCache(),
    qimen: createDefaultQimenWorkspaceCache(),
    astrology: createDefaultAstrologyWorkspaceCache(),
  };
}

export const useDestinyWorkspaceStore = create<DestinyWorkspaceStore>()(
  persist(
    (set) => ({
      ...createDefaultDestinyWorkspaceState(),

      provider: 'doubao',
      setProvider: (provider) => set({ provider }),

      activeModule: null,
      setActiveModule: (activeModule) => set({ activeModule }),

      setWorkspaceState: (module, patch) =>
        set((state) => {
          const current = state[module];
          const nextPatch = typeof patch === 'function' ? patch(current as never) : patch;
          return {
            [module]: {
              ...current,
              ...nextPatch,
            },
          } as Partial<DestinyWorkspaceStore>;
        }),

      resetWorkspace: (module) =>
        set((state) => ({
          ...state,
          [module]: createDefaultDestinyWorkspaceState()[module],
        })),

      restoreWorkspace: (module) =>
        set((state) => {
          const current = state[module];
          const nextStep: DestinyWorkspaceStep = current.hasResult ? 'result' : 'form';
          return {
            ...state,
            [module]: {
              ...current,
              step: nextStep,
              lastView: nextStep,
            },
          };
        }),

      markResultReady: (module) =>
        set((state) => ({
          ...state,
          [module]: {
            ...state[module],
            hasResult: true,
            step: 'result',
            lastView: 'result',
          },
        })),

      resetAllWorkspaces: () =>
        set((state) => ({
          ...createDefaultDestinyWorkspaceState(),
          provider: state.provider,
        })),
    }),
    {
      name: 'destiny-provider',
      partialize: (state) => ({ provider: state.provider }),
    }
  )
);
