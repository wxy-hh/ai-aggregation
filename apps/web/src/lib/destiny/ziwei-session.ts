import { authFetch } from '@/lib/api/client';
import {
  useDestinyWorkspaceStore,
  type DestinyProvider,
  type ZiweiErrorKind,
} from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { generateUUID } from '@/lib/utils/uuid';
import { consumeSse, readSseErrorMessage } from '@/lib/utils/sse-client';
import { createDefaultBaziFormData, mapFormToBaziRequest } from '@/app/destiny/_components/bazi-mappers';
import { saveZiweiHistoryRecord } from './ziwei-history';
import { prepareDestinyRelay, commitDestinyRelay } from './relay-execution';
import type { BaziFormData } from '@/app/destiny/_components/bazi-types';
import type {
  DestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
  ZiweiPalaceAnalysis,
  ZiweiStreamEvent,
} from '@/app/destiny/_components/types';

/** AI 返回的宫位标签 → iztro 宫位名映射 */
export const AI_TO_IZTRO_PALACE: Record<string, string> = {
  父母宫: '父母',
  福德宫: '福德',
  田宅宫: '田宅',
  官禄宫: '官禄',
  命宫: '命宫',
  兄弟宫: '兄弟',
  奴仆宫: '仆役',
  夫妻宫: '夫妻',
  迁移宫: '迁移',
  子女宫: '子女',
  财帛宫: '财帛',
  疾厄宫: '疾厄',
};

/**
 * 归一化宫位标签
 * 将 AI 返回的宫位名称（如「父母宫」）映射为 iztro 规范名称（如「父母」）
 */
export function normalizePalaceLabel(label: string): string {
  return AI_TO_IZTRO_PALACE[label] ?? label;
}

/** 模块级闭包单例状态 */
let latestRequestToken = 0;
let latestAbortController: AbortController | null = null;

export function classifyResponseError(status: number): ZiweiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

export function displayError(kind: ZiweiErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;
  switch (kind) {
    case 'validation':
      return '参数错误：请检查姓名、出生日期、时间及地点后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：紫微斗数分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：紫微斗数分析失败，请稍后重试。';
  }
}

export type StartZiweiSessionOptions = {
  provider?: DestinyProvider;
};

/**
 * 发起紫微斗数推演会话
 *
 * 负责起盘流式渲染、双哨兵校验、宫位标签归一化、首宫自动聚焦与成盘即时中继闭环。
 */
async function start(
  formData: BaziFormData,
  options?: StartZiweiSessionOptions
): Promise<void> {
  // 必须使用 start 时的入参快照落盘，禁止从 store 等待期脏写读取
  const formDataSnapshot: BaziFormData = JSON.parse(JSON.stringify(formData));

  // 中止先前正在进行的在途请求
  latestAbortController?.abort();

  latestRequestToken += 1;
  const currentToken = latestRequestToken;
  const controller = new AbortController();
  latestAbortController = controller;

  // run 级局部稳定 historyId 与写入门闩
  const runHistoryId = generateUUID();
  let historyWritten = false;

  const store = useDestinyWorkspaceStore.getState();
  const provider = options?.provider ?? store.provider;
  store.beginZiweiSession();

  let currentErrorKind: ZiweiErrorKind = 'unknown';

  try {
    const response = await authFetch('/api/destiny/ziwei-report', {
      method: 'POST',
      body: JSON.stringify({ ...mapFormToBaziRequest(formDataSnapshot), provider }),
      signal: controller.signal,
    });

    if (currentToken !== latestRequestToken) return;

    if (!response.ok) {
      currentErrorKind = classifyResponseError(response.status);
      const errText = await readSseErrorMessage(response);
      throw new Error(displayError(currentErrorKind, errText));
    }

    let sawComplete = false;

    await consumeSse<ZiweiStreamEvent>(response, {
      onEvent: (event) => {
        if (currentToken !== latestRequestToken) return;

        if (event.type === 'status') {
          useDestinyWorkspaceStore.getState().applyZiweiStreamStatus(event.status);
          return;
        }

        if (event.type === 'section-final') {
          const key = event.sectionKey as keyof ZiweiLockedSections;
          let payload = event.payload;

          // 将 AI 返回的宫位标签（如"父母宫"）归一化为 iztro 名称（如"父母"）
          if (event.sectionKey === 'palaceAnalysis' && Array.isArray(event.payload)) {
            payload = (event.payload as ZiweiPalaceAnalysis[]).map((item) => ({
              ...item,
              label: normalizePalaceLabel(item.label),
            }));
          }

          useDestinyWorkspaceStore.getState().applyZiweiSection(key, payload);
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          useDestinyWorkspaceStore.getState().applyZiweiComplete(event.report);

          // 门闩防重与落盘
          if (!historyWritten) {
            historyWritten = true;
            const currentState = useDestinyWorkspaceStore.getState().ziwei;
            saveZiweiHistoryRecord(
              formDataSnapshot,
              event.report,
              currentState.chartData,
              currentState.lockedSections,
              {
                id: runHistoryId,
                derivation: prepareDestinyRelay(),
              }
            );
            // 紫微承接语义：生成命盘成功即完成接力（清引用+草稿，即时闭环）
            commitDestinyRelay();
          }
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error);
        }
      },
    });

    if (currentToken !== latestRequestToken) return;

    if (!sawComplete) {
      useDestinyWorkspaceStore.getState().abortZiweiSession();
    }
  } catch (err) {
    if (currentToken !== latestRequestToken) return;
    if (err instanceof Error && err.name === 'AbortError') return;

    const rawMessage = err instanceof Error ? err.message : undefined;
    useDestinyWorkspaceStore
      .getState()
      .failZiweiSession(displayError(currentErrorKind, rawMessage), currentErrorKind);
  } finally {
    if (latestAbortController === controller) {
      latestAbortController = null;
    }
  }
}

/**
 * 取消当前紫微斗数推演会话（仅释放运行时流状态，不写入错误）
 */
function cancel(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  useDestinyWorkspaceStore.getState().abortZiweiSession();
}

/**
 * 重置紫微斗数推演会话（取消在途请求，失效请求 token 并全量重置工作区）
 */
function reset(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  latestRequestToken += 1;
  useDestinyWorkspaceStore.getState().resetWorkspace('ziwei');
}

/**
 * 从统一历史记录中恢复紫微斗数工作区
 *
 * 包含完整数据解包（report / chartData / lockedSections / formData），
 * 回填后清理 URL 中的 historyId 查询参数，不二次落盘。
 */
function restoreFromHistory(historyId: string): boolean {
  const historyItem = useHistoryStore.getState().getItemById(historyId);
  if (historyItem?.type !== 'destiny' || historyItem.subType !== 'ziwei') {
    return false;
  }

  const savedReportData = historyItem.reportData as Record<string, unknown> | null;
  const savedReport = (savedReportData?.report as DestinyReport) || null;
  const savedChartData = (savedReportData?.chartData as ZiweiChartData) || null;
  const savedLockedSections = (savedReportData?.lockedSections as ZiweiLockedSections) || {};
  const savedFormData = (historyItem.formData as BaziFormData) || createDefaultBaziFormData();

  useDestinyWorkspaceStore.getState().restoreZiweiWorkspace({
    report: savedReport,
    chartData: savedChartData,
    lockedSections: savedLockedSections,
    formData: savedFormData,
  });

  // 恢复完成后清理 URL 中的 historyId，避免刷新或切换 tab 时重复触发
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (url.searchParams.has('historyId')) {
      url.searchParams.delete('historyId');
      window.history.replaceState({}, '', url.toString());
    }
  }

  return true;
}

/** 仅供单元测试重置模块单例状态使用 */
export function _resetZiweiSessionForTest(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  latestRequestToken = 0;
}

export const ziweiSession = {
  start,
  cancel,
  reset,
  restoreFromHistory,
};
