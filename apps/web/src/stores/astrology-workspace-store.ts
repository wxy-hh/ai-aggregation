'use client';

/**
 * 星座寰宇 —— 占星工作区状态 store
 *
 * 独立管理出生资料、两步表单、星盘真值、报告与稳定性声明。
 * 与 destiny-workspace-store 解耦，供 RU-006+ 填充表单与结果页。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type {
  AstrologyAnalyzeRequest,
  AstrologyErrorKind,
  AstrologyFieldErrors,
  AstrologyFormStep,
  AstrologyReport,
  AstrologyWorkspaceStep,
  BirthFormData,
  ChartFacts,
  StabilityInfo,
} from '@/app/destiny/_components/astrology/astrology-types';

/** 载荷版本守卫：读取到未知版本时安全降级 */
export const ASTROLOGY_STORE_SCHEMA_VERSION = 1 as const;

function createDefaultBirthFormData(): BirthFormData {
  return {
    name: '',
    solarDate: { year: 1990, month: 1, day: 1 },
    birthTime: { hour: 12, minute: 0 },
    timePrecision: 'minute',
    approximateRange: null,
    location: { name: '', lat: null, lon: null },
    timezoneConfirmed: false,
    focusTheme: 'self',
  };
}

export type AstrologyWorkspaceState = {
  /** 当前大步骤：填表 / 结果 */
  step: AstrologyWorkspaceStep;
  /** 两步表单子步骤（1 基础资料，2 时间与地点） */
  formStep: AstrologyFormStep;
  /** 出生与关注主题表单数据 */
  formData: BirthFormData;
  /** 字段级校验错误 */
  fieldErrors: AstrologyFieldErrors;
  /** 阻塞式全屏加载（如提交排盘） */
  blockingLoading: boolean;
  /** 流式解读中 */
  streaming: boolean;
  /** 星盘真值 */
  chartFacts: ChartFacts | null;
  /** 结构化报告 */
  report: AstrologyReport | null;
  /** 稳定性/可信度声明 */
  stabilityInfo: StabilityInfo | null;
  /** 用户可读错误 */
  error: string | null;
  /** 错误分类 */
  errorKind: AstrologyErrorKind | null;
  /** 上次重新计算时间 */
  recalculatedAt: string | null;
  /** 载荷版本守卫 */
  schemaVersion: number;
};

type AstrologyWorkspaceStore = AstrologyWorkspaceState & {
  /** 全量或函数式补丁 */
  setWorkspaceState: (
    patch:
      | Partial<AstrologyWorkspaceState>
      | ((current: AstrologyWorkspaceState) => Partial<AstrologyWorkspaceState>)
  ) => void;
  /** 重置到初始填表状态 */
  resetWorkspace: () => void;
  /** 设置当前步骤 */
  setStep: (step: AstrologyWorkspaceStep) => void;
  /** 设置表单子步骤 */
  setFormStep: (formStep: AstrologyFormStep) => void;
  /** 更新表单字段 */
  setFormField: <K extends keyof BirthFormData>(key: K, value: BirthFormData[K]) => void;
  /** 设置字段错误 */
  setFieldErrors: (errors: AstrologyFieldErrors) => void;
  /** 设置阻塞加载 */
  setBlockingLoading: (loading: boolean) => void;
  /** 设置流式状态 */
  setStreaming: (streaming: boolean) => void;
  /** 设置错误 */
  setError: (error: string | null, errorKind?: AstrologyErrorKind) => void;
  /** 清除错误 */
  clearError: () => void;
  /** 标记结果已就绪（从 form 进入 result） */
  markResultReady: () => void;
  /** 从结果页返回修改表单 */
  backToForm: () => void;
  /** 设置星盘真值、报告与稳定性 */
  setResult: (payload: {
    chartFacts: ChartFacts;
    report: AstrologyReport;
    stabilityInfo: StabilityInfo;
  }) => void;
  /** 记录重新计算时间 */
  touchRecalculatedAt: () => void;
  /** 将当前表单映射为 API 请求 */
  toRequest: () => AstrologyAnalyzeRequest;
};

function createDefaultAstrologyWorkspaceState(): AstrologyWorkspaceState {
  return {
    step: 'form',
    formStep: 1,
    formData: createDefaultBirthFormData(),
    fieldErrors: {},
    blockingLoading: false,
    streaming: false,
    chartFacts: null,
    report: null,
    stabilityInfo: null,
    error: null,
    errorKind: null,
    recalculatedAt: null,
    schemaVersion: ASTROLOGY_STORE_SCHEMA_VERSION,
  };
}

/** 版本守卫：遇到未知 schemaVersion 时降级为默认值，避免旧 persisted 状态污染 */
function migrateAstrologyWorkspaceState(
  persisted: unknown
): AstrologyWorkspaceState {
  const state = persisted as Partial<AstrologyWorkspaceState> | undefined;
  const defaultState = createDefaultAstrologyWorkspaceState();
  if (!state || state.schemaVersion !== ASTROLOGY_STORE_SCHEMA_VERSION) {
    return defaultState;
  }
  return { ...defaultState, ...state, schemaVersion: ASTROLOGY_STORE_SCHEMA_VERSION };
}

export const useAstrologyWorkspaceStore = create<AstrologyWorkspaceStore>()(
  persist(
    (set, get) => ({
      ...createDefaultAstrologyWorkspaceState(),

      setWorkspaceState: (patch) =>
        set((state) => {
          const nextPatch = typeof patch === 'function' ? patch(state) : patch;
          return { ...state, ...nextPatch };
        }),

      resetWorkspace: () => set(() => createDefaultAstrologyWorkspaceState()),

      setStep: (step) => set((state) => ({ ...state, step })),

      setFormStep: (formStep) => set((state) => ({ ...state, formStep })),

      setFormField: (key, value) =>
        set((state) => ({
          ...state,
          formData: { ...state.formData, [key]: value },
          // 用户修改字段时清除对应字段错误
          fieldErrors: { ...state.fieldErrors, [key]: undefined },
        })),

      setFieldErrors: (errors) => set((state) => ({ ...state, fieldErrors: errors })),

      setBlockingLoading: (blockingLoading) => set((state) => ({ ...state, blockingLoading })),

      setStreaming: (streaming) => set((state) => ({ ...state, streaming })),

      setError: (error, errorKind = 'unknown') =>
        set((state) => ({ ...state, error, errorKind })),

      clearError: () =>
        set((state) => ({ ...state, error: null, errorKind: null })),

      markResultReady: () =>
        set((state) => ({
          ...state,
          step: 'result',
          error: null,
          errorKind: null,
          recalculatedAt: new Date().toISOString(),
        })),

      backToForm: () =>
        set((state) => ({
          ...state,
          step: 'form',
          formStep: 1,
        })),

      setResult: ({ chartFacts, report, stabilityInfo }) =>
        set((state) => ({
          ...state,
          chartFacts,
          report,
          stabilityInfo,
          error: null,
          errorKind: null,
          recalculatedAt: new Date().toISOString(),
        })),

      touchRecalculatedAt: () =>
        set((state) => ({ ...state, recalculatedAt: new Date().toISOString() })),

      toRequest: () => {
        const { formData } = get();
        return {
          name: formData.name,
          solarDate: formData.solarDate,
          birthTime: formData.birthTime,
          timePrecision: formData.timePrecision,
          approximateRange: formData.approximateRange,
          location: formData.location,
          timezoneConfirmed: formData.timezoneConfirmed,
          focusTheme: formData.focusTheme,
          // 模型提供方与八字/紫微/奇门共用全局切换（destiny-workspace-store）
          provider: useDestinyWorkspaceStore.getState().provider,
        };
      },
    }),
    {
      name: 'astrology-workspace',
      version: ASTROLOGY_STORE_SCHEMA_VERSION,
      migrate: migrateAstrologyWorkspaceState,
      partialize: (state) => ({
        step: state.step,
        formStep: state.formStep,
        formData: state.formData,
        chartFacts: state.chartFacts,
        report: state.report,
        stabilityInfo: state.stabilityInfo,
        recalculatedAt: state.recalculatedAt,
        schemaVersion: state.schemaVersion,
      }),
    }
  )
);
