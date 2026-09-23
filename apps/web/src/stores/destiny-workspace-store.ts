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
import type {
  AstrologyBigThree,
  AstrologyHeadline,
  AstrologyInterpretationReport,
  AstrologyTransitsSection,
  ModuleReading,
} from '@/lib/astrology/interpretation';
import type { DestinyModuleKey } from '@/app/destiny/_components/layout/left-nav';

export type DestinyWorkspaceStep = 'form' | 'result';
export type DestinyProvider = 'doubao' | 'deepseek';
export type DestinyWorkspaceLastView = DestinyWorkspaceStep;
export type BaziErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type ZiweiErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type QimenErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';
export type ZiweiPanelTab = 'overview' | 'timeline' | 'relations' | 'glossary';

/** 星座寰宇解读分区增量补丁 */
export type AstrologyInterpretationSectionPatch = {
  headline?: AstrologyHeadline;
  bigThree?: AstrologyBigThree;
  modules?: ModuleReading[];
  transits?: AstrologyTransitsSection;
};

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

export type AstrologyErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

/** 解读层状态：未发起 / 在途 / 暂不可用（降级）/ 就绪（03 工单：分区事件到达后为 ready） */
export type AstrologyInterpretationStatus = 'idle' | 'pending' | 'unavailable' | 'ready';

/**
 * 解读暂不可用的原因档：
 * 额度不足 / 解读服务未接入 / 解读未完成（模型超时、报错、校验不过）/ 未取得结论。
 */
export type AstrologyInterpretationReason = 'quota' | 'not-wired' | 'model' | 'unknown';

/**
 * 解读层状态 + 原因 + 已到达的解读内容。
 * - status 'pending'：流已发起、分区未到（结果页按分区骨架占位）
 * - status 'ready'：至少一个分区已到达（03 工单：分区陆续填充，界面逐区替换骨架）
 * - status 'unavailable'：解读层降级（report 同时清空，绝不留半份冒充产出）
 */
export type AstrologyInterpretationState = {
  status: AstrologyInterpretationStatus;
  reason: AstrologyInterpretationReason | null;
  /** 累计到达的解读分区（未到达的分区为 null / 空数组） */
  report: AstrologyInterpretationReport | null;
};

/** 解读层默认态：未发起（首次进入 / 从历史记录恢复的旧结果） */
export function createIdleAstrologyInterpretation(): AstrologyInterpretationState {
  return { status: 'idle', reason: null, report: null };
}

/** 星座寰宇工作区缓存（01 骨架；03 加入口视图；04 加表单步骤与真值缓存） */
export type AstrologyWorkspaceCache = BaseWorkspaceCache<
  AstrologyFormData,
  Partial<Record<keyof AstrologyFormData, string>>,
  AstrologyErrorKind
> & {
  /** 入口视图：首页（首次进入/重新测算）、两步表单（§6.2）或加载仪式（05：真值在仪式窗内送达，双条件满足即转场进结果页） */
  entryView: 'home' | 'form' | 'loading';
  /** 两步表单当前步骤（切模块保留进度） */
  formStep: 1 | 2;
  /** 提交后经异步接缝送达的星盘真值（结果页/分享/问答的真值来源）；null = 真值在途（仪式等待室） */
  chartFacts: AstrologyChartFacts | null;
  /**
   * 解读层状态（02 工单建立，03 工单接入 LLM 后启用 ready）：真值到达后由报告流事件驱动——
   * 解读分区事件把 status 推进到 ready 并累计 report；interpretation-unavailable 把它落为
   * unavailable 并清空 report（解读失败绝不留半份冒充产出）。结果页据此逐区渲染骨架 / 内容 /
   * 诚实的「解读暂不可用」卡。
   */
  interpretation: AstrologyInterpretationState;
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
  /** 发起全新测算或重试真值：进入加载仪式态并重置解读为待就绪 */
  beginAstrologySession: () => void;
  /** 解读重试：重置解读为待就绪，保持星盘真值与布局不动 */
  beginAstrologyInterpretationRetry: () => void;
  /** 星盘会话失败：记录失败错误与原因档，保持解读状态不动 */
  failAstrologySession: (error: string, errorKind: AstrologyErrorKind) => void;
  /** 星盘真值送达：写入真值数据并清理错误 */
  applyAstrologyChartFacts: (facts: AstrologyChartFacts) => void;
  /** 解读分区送达：累积合入解读报告并推进至就绪（非待就绪/就绪时拒绝迟到分区） */
  applyAstrologyInterpretationSection: (section: AstrologyInterpretationSectionPatch) => void;
  /** 落定解读状态：设置最终解读状态 */
  settleAstrologyInterpretation: (next: AstrologyInterpretationState) => void;
  /** 从历史记录恢复星座寰宇工作区：直达结果视图并回填真值与解读 */
  restoreAstrologyWorkspace: (payload: {
    formData: AstrologyFormData;
    chartFacts: AstrologyChartFacts;
    interpretation: AstrologyInterpretationState;
  }) => void;
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

function createDefaultAstrologyWorkspaceCache(): AstrologyWorkspaceCache {
  return {
    step: 'form',
    hasResult: false,
    lastView: 'form',
    entryView: 'home',
    formStep: 1,
    chartFacts: null,
    interpretation: createIdleAstrologyInterpretation(),
    formData: createDefaultAstrologyFormData(),
    fieldErrors: {},
    blockingLoading: false,
    error: null,
    errorKind: null,
    compatActive: false,
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

      // 发起全新测算或重试真值：进入加载仪式态并重置解读为待就绪
      beginAstrologySession: () =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            step: 'form',
            chartFacts: null,
            entryView: 'loading',
            error: null,
            errorKind: null,
            interpretation: { status: 'pending', reason: null, report: null },
          },
        })),

      // 解读重试：重置解读为待就绪，保持星盘真值与布局不动
      beginAstrologyInterpretationRetry: () =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            interpretation: { status: 'pending', reason: null, report: null },
          },
        })),

      // 星盘会话失败：记录失败错误与原因档，保持解读状态不动
      failAstrologySession: (error, errorKind) =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            step: 'form',
            chartFacts: null,
            entryView: 'loading',
            error,
            errorKind,
          },
        })),

      // 星盘真值送达：写入真值数据并清理错误
      applyAstrologyChartFacts: (facts) =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            chartFacts: facts,
            error: null,
            errorKind: null,
          },
        })),

      // 解读分区送达：累积合入解读报告并推进至就绪（非待就绪/就绪时拒绝迟到分区）
      applyAstrologyInterpretationSection: (section) =>
        set((state) => {
          const previous = state.astrology.interpretation;
          // 已降级（unavailable）或未发起（idle）时不接受迟到分区：结论只认本次流
          if (previous.status !== 'pending' && previous.status !== 'ready') {
            return state;
          }
          const report: AstrologyInterpretationReport = {
            headline: section.headline ?? previous.report?.headline ?? null,
            bigThree: section.bigThree ?? previous.report?.bigThree ?? null,
            modules: section.modules ?? previous.report?.modules ?? [],
            transits: section.transits ?? previous.report?.transits ?? null,
          };
          return {
            ...state,
            astrology: {
              ...state.astrology,
              interpretation: {
                status: 'ready',
                reason: null,
                report,
              },
            },
          };
        }),

      // 落定解读状态：设置最终解读状态
      settleAstrologyInterpretation: (next) =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            interpretation: next,
          },
        })),

      // 从历史记录恢复星座寰宇工作区：直达结果视图并回填真值与解读
      restoreAstrologyWorkspace: (payload) =>
        set((state) => ({
          ...state,
          astrology: {
            ...state.astrology,
            step: 'result',
            lastView: 'result',
            hasResult: true,
            chartFacts: payload.chartFacts,
            interpretation: payload.interpretation,
            formData: payload.formData,
            fieldErrors: {},
            error: null,
            errorKind: null,
          },
        })),
    }),
    {
      name: 'destiny-provider',
      partialize: (state) => ({ provider: state.provider }),
    }
  )
);
