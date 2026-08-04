'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
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
  /** 模块内部是否处于覆盖式流程（如八字合盘层），用于外层隐藏表单专属入口（模型切换/接力横幅） */
  compatActive: boolean;
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

export type DestinyWorkspaceCacheState = {
  bazi: BaziWorkspaceCache;
  ziwei: ZiweiWorkspaceCache;
  qimen: QimenWorkspaceCache;
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
    compatActive: false,
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
    compatActive: false,
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
    compatActive: false,
  };
}

export function createDefaultDestinyWorkspaceState(): DestinyWorkspaceCacheState {
  return {
    bazi: createDefaultBaziWorkspaceCache(),
    ziwei: createDefaultZiweiWorkspaceCache(),
    qimen: createDefaultQimenWorkspaceCache(),
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
