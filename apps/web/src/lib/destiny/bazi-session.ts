import { authFetch } from '@/lib/api/client';
import { classifyDestinyResponseError } from './destiny-errors';
import {
  useDestinyWorkspaceStore,
  type BaziErrorKind,
  type DestinyProvider,
} from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { generateUUID } from '@/lib/utils/uuid';
import { consumeSse, readSseErrorMessage } from '@/lib/utils/sse-client';
import {
  createDefaultBaziFormData,
  mapFormToBaziRequest,
} from '@/app/destiny/_components/bazi-mappers';
import { saveBaziHistoryRecord } from './bazi-history';
import { prepareDestinyRelay, commitDestinyRelay } from './relay-execution';
import type { BaziFormData } from '@/app/destiny/_components/bazi-types';
import type {
  BaziLockedSections,
  BaziSectionKey,
  BaziStreamEvent,
  DestinyReport,
} from '@/app/destiny/_components/types';

/** 模块级闭包单例状态 */
let latestRunId = 0;
let latestAbortController: AbortController | null = null;

function displayError(kind: BaziErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;
  switch (kind) {
    case 'validation':
      return '参数错误：请检查姓名、出生日期、时间及地点后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：八字分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：八字分析失败，请稍后重试。';
  }
}

export type StartBaziSessionOptions = {
  provider?: DestinyProvider;
};

/**
 * 发起八字推演会话
 *
 * 负责起盘流式渲染、双哨兵校验、分区锁定与延后中继闭环（成盘不 commit，顾问发送成功才闭环）。
 */
async function start(
  formData: BaziFormData,
  options?: StartBaziSessionOptions
): Promise<void> {
  // 必须使用 start 时的入参快照落盘，禁止从 store 等待期脏写读取
  const formDataSnapshot: BaziFormData = JSON.parse(JSON.stringify(formData));

  // 中止先前正在进行的在途请求
  latestAbortController?.abort();

  latestRunId += 1;
  const currentRunId = latestRunId;
  const controller = new AbortController();
  latestAbortController = controller;

  // run 级局部稳定 historyId 与写入门闩
  const runHistoryId = generateUUID();
  let historyWritten = false;

  const store = useDestinyWorkspaceStore.getState();
  const provider = options?.provider ?? store.provider;
  store.beginBaziSession();

  let currentErrorKind: BaziErrorKind = 'unknown';

  try {
    const response = await authFetch('/api/destiny/report', {
      method: 'POST',
      body: JSON.stringify({ ...mapFormToBaziRequest(formDataSnapshot), provider }),
      signal: controller.signal,
    });

    if (currentRunId !== latestRunId) return;

    if (!response.ok) {
      currentErrorKind = classifyDestinyResponseError(response.status);
      const errText = await readSseErrorMessage(response);
      throw new Error(displayError(currentErrorKind, errText));
    }

    let sawComplete = false;

    await consumeSse<BaziStreamEvent>(response, {
      onEvent: (event) => {
        if (currentRunId !== latestRunId) return;

        if (event.type === 'status') {
          useDestinyWorkspaceStore.getState().applyBaziStreamStatus(event.status);
          return;
        }

        if (event.type === 'section-final') {
          const key = event.sectionKey as keyof BaziLockedSections;
          useDestinyWorkspaceStore.getState().applyBaziSection(key, event.payload);
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          useDestinyWorkspaceStore.getState().applyBaziComplete(event.report);

          // 门闩防重与落盘
          if (!historyWritten) {
            historyWritten = true;
            const currentState = useDestinyWorkspaceStore.getState().bazi;
            saveBaziHistoryRecord(
              formDataSnapshot,
              currentState.report!,
              currentState.lockedSections,
              {
                id: runHistoryId,
                derivation: prepareDestinyRelay(),
              }
            );
            // 八字延后接力闭环语义：绝不在此处调用 commitDestinyRelay()，引用保留给顾问
          }
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error);
        }
      },
    });

    if (currentRunId !== latestRunId) return;

    if (!sawComplete) {
      useDestinyWorkspaceStore.getState().abortBaziSession();
    }
  } catch (err) {
    if (currentRunId !== latestRunId) return;
    if (err instanceof Error && err.name === 'AbortError') return;

    const rawMessage = err instanceof Error ? err.message : undefined;
    useDestinyWorkspaceStore
      .getState()
      .failBaziSession(displayError(currentErrorKind, rawMessage), currentErrorKind);
  } finally {
    if (latestAbortController === controller) {
      latestAbortController = null;
    }
  }
}

/**
 * 完成顾问发送后的延迟接力闭环（清理 destiny 目标上的活动引用与用户草稿）
 */
function commitAdvisorRelay(): void {
  commitDestinyRelay();
}

/**
 * 取消当前八字推演会话（仅释放运行时流状态，不写入错误）
 */
function cancel(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  useDestinyWorkspaceStore.getState().abortBaziSession();
}

/**
 * 重置八字推演会话（取消在途请求，失效请求 token 并全量重置工作区）
 */
function reset(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  latestRunId += 1;
  useDestinyWorkspaceStore.getState().resetWorkspace('bazi');
}

/**
 * 从统一历史记录中恢复八字工作区
 *
 * 兼容旧格式（reportData 直接是 DestinyReport）和新格式（{ report, lockedSections }），
 * 回填后清理 URL 中的 historyId 查询参数，不二次落盘。
 */
function restoreFromHistory(historyId: string): boolean {
  const historyItem = useHistoryStore.getState().getItemById(historyId);
  if (historyItem?.type !== 'destiny' || historyItem.subType !== 'bazi') {
    return false;
  }

  const reportData = historyItem.reportData as Record<string, unknown> | null;
  const isNewFormat = reportData != null && 'report' in reportData && 'lockedSections' in reportData;
  const savedReport = (isNewFormat ? reportData.report : reportData) as DestinyReport | null;
  const savedLockedSections = (isNewFormat ? reportData.lockedSections : {}) as BaziLockedSections;
  const savedFormData = (historyItem.formData as BaziFormData) || createDefaultBaziFormData();

  useDestinyWorkspaceStore.getState().restoreBaziWorkspace({
    report: savedReport,
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
export function _resetBaziSessionForTest(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  latestRunId += 1;
}

export const baziSession = {
  start,
  commitAdvisorRelay,
  cancel,
  reset,
  restoreFromHistory,
};
