import { authFetch } from '@/lib/api/client';
import {
  useDestinyWorkspaceStore,
  type DestinyProvider,
  type QimenErrorKind,
  type RestoreQimenWorkspacePayload,
} from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { generateUUID } from '@/lib/utils/uuid';
import { mapFormToQimenRequest } from '@/app/destiny/_components/qimen-mappers';
import { saveQimenHistoryRecord } from './qimen-history';
import { prepareDestinyRelay, commitDestinyRelay } from './relay-execution';
import type {
  QimenAnalysisBaseResult,
  QimenAnalysisStartResponse,
  QimenAsyncSectionKey,
  QimenAsyncSections,
  QimenBaseSectionResponse,
  QimenFormData,
  QimenSectionResponse,
} from '@/app/destiny/_components/qimen-types';

/** 模块级闭包单例状态 */
let latestRunId = 0;
let latestAbortController: AbortController | null = null;
const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

function clearAllTimeouts(): void {
  for (const timer of activeTimeouts) {
    clearTimeout(timer);
  }
  activeTimeouts.clear();
}

function classifyResponseError(status: number): QimenErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function toDisplayError(kind: QimenErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;

  switch (kind) {
    case 'validation':
      return '参数错误：请检查起局时间、地点及问题描述后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：奇门遁甲分析失败，请稍后重试。';
  }
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error;
  } catch {
    return undefined;
  }
}

export type StartQimenSessionOptions = {
  provider?: DestinyProvider;
};

/**
 * 发起奇门推演会话
 *
 * 闭环请求驱动、双哨兵校验、递归轮询重试、三分区并发拉取与恰好一次落盘。
 */
async function start(
  formData: QimenFormData,
  options?: StartQimenSessionOptions
): Promise<void> {
  // 必须使用 start 时的入参快照落盘，禁止从 store 等待期脏写读取
  const formDataSnapshot: QimenFormData = JSON.parse(JSON.stringify(formData));

  // 中止先前正在进行的在途请求并清理定时器
  latestAbortController?.abort();
  clearAllTimeouts();

  latestRunId += 1;
  const currentRunId = latestRunId;
  const controller = new AbortController();
  latestAbortController = controller;
  const signal = controller.signal;

  // run 级局部稳定 historyId 与写入门闩
  const runHistoryId = generateUUID();
  let historyWritten = false;

  const store = useDestinyWorkspaceStore.getState();
  const provider = options?.provider ?? store.provider;
  store.beginQimenSession();

  const scheduleTimeout = (fn: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      activeTimeouts.delete(timer);
      fn();
    }, delayMs);
    activeTimeouts.add(timer);
  };

  const checkSettledAndSaveHistory = () => {
    if (currentRunId !== latestRunId) return;
    if (historyWritten) return;

    const qimenState = useDestinyWorkspaceStore.getState().qimen;
    if (!qimenState.baseResult || !qimenState.analysisId) return;

    const requiredKeys: QimenAsyncSectionKey[] = [
      'strategyOverview',
      'timingWindows',
      'chartSummary',
    ];
    const allSettled = requiredKeys.every(
      (k) =>
        qimenState.sectionStatuses[k] === 'completed' ||
        qimenState.sectionStatuses[k] === 'failed'
    );
    if (!allSettled) return;

    historyWritten = true;

    // 接力两阶段：起局成功写历史前只读派生元数据（prepare）
    const derivation = prepareDestinyRelay();

    // 写入统一历史
    saveQimenHistoryRecord(
      formDataSnapshot,
      qimenState.baseResult,
      qimenState.sections,
      qimenState.analysisId,
      {
        id: runHistoryId,
        derivation,
      }
    );

    // 起局成功才完成接力（commit：清除活动引用与草稿）
    commitDestinyRelay();
  };

  const requestSection = async (
    sectionKey: QimenAsyncSectionKey,
    analysisId: string
  ): Promise<void> => {
    if (currentRunId !== latestRunId) return;

    try {
      const response = await authFetch(
        `/api/destiny/qimen/analyze/sections/${sectionKey}?analysisId=${encodeURIComponent(analysisId)}`,
        { signal }
      );

      if (currentRunId !== latestRunId) return;

      if (response.status === 202) {
        scheduleTimeout(() => void requestSection(sectionKey, analysisId), 1500);
        return;
      }

      const json = (await response.json()) as QimenSectionResponse<typeof sectionKey>;
      if (currentRunId !== latestRunId) return;

      if (json.status === 'pending') {
        scheduleTimeout(() => void requestSection(sectionKey, analysisId), 1500);
        return;
      }

      if (json.success && json.data) {
        useDestinyWorkspaceStore.getState().applyQimenSectionResult(sectionKey, {
          status: 'completed',
          data: json.data,
        });
        checkSettledAndSaveHistory();
        return;
      }

      const errMsg = json.error ?? '区块生成失败';
      useDestinyWorkspaceStore.getState().applyQimenSectionResult(sectionKey, {
        status: 'failed',
        error: errMsg,
      });
      checkSettledAndSaveHistory();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentRunId !== latestRunId) return;

      const errMsg = err instanceof Error ? err.message : '区块请求失败';
      useDestinyWorkspaceStore.getState().applyQimenSectionResult(sectionKey, {
        status: 'failed',
        error: errMsg,
      });
      checkSettledAndSaveHistory();
    }
  };

  const requestBaseResult = async (analysisId: string): Promise<void> => {
    if (currentRunId !== latestRunId) return;

    try {
      const response = await authFetch(
        `/api/destiny/qimen/analyze/sections/baseResult?analysisId=${encodeURIComponent(analysisId)}`,
        { signal }
      );

      if (currentRunId !== latestRunId) return;

      if (response.status === 202) {
        scheduleTimeout(() => void requestBaseResult(analysisId), 1500);
        return;
      }

      const json = (await response.json()) as QimenBaseSectionResponse;
      if (currentRunId !== latestRunId) return;

      if (json.status === 'pending') {
        scheduleTimeout(() => void requestBaseResult(analysisId), 1500);
        return;
      }

      if (json.success && json.data) {
        useDestinyWorkspaceStore.getState().applyQimenBaseResult(json.data);
        const sectionKeys: QimenAsyncSectionKey[] = [
          'strategyOverview',
          'timingWindows',
          'chartSummary',
        ];
        void Promise.all(sectionKeys.map((k) => requestSection(k, analysisId)));
        return;
      }

      if (json.status === 'failed') {
        const errMsg = json.error ?? '基础盘面生成失败';
        useDestinyWorkspaceStore.getState().failQimenSession(errMsg, 'timeout', 'base');
        return;
      }

      const errMsg = json.error ?? '基础盘面请求失败';
      useDestinyWorkspaceStore.getState().failQimenSession(errMsg, 'unknown', 'base');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentRunId !== latestRunId) return;

      const errMsg = err instanceof Error ? err.message : '基础盘面请求失败';
      useDestinyWorkspaceStore.getState().failQimenSession(errMsg, 'unknown', 'base');
    }
  };

  try {
    const response = await authFetch('/api/destiny/qimen/analyze/start', {
      method: 'POST',
      body: JSON.stringify({ ...mapFormToQimenRequest(formDataSnapshot), provider }),
      signal,
    });

    if (currentRunId !== latestRunId) return;

    if (!response.ok) {
      const kind = classifyResponseError(response.status);
      const rawMessage = await readErrorMessage(response);
      useDestinyWorkspaceStore.getState().failQimenSession(
        toDisplayError(kind, rawMessage),
        kind,
        'task'
      );
      return;
    }

    const json = (await response.json()) as QimenAnalysisStartResponse;
    if (currentRunId !== latestRunId) return;

    if (!json.success || !json.analysisId) {
      useDestinyWorkspaceStore.getState().failQimenSession(
        json.error || '分析任务创建失败，请稍后重试。',
        'model',
        'task'
      );
      return;
    }

    useDestinyWorkspaceStore.getState().applyQimenTaskCreated(json.analysisId);
    await requestBaseResult(json.analysisId);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    if (currentRunId !== latestRunId) return;

    const rawMessage = err instanceof Error ? err.message : undefined;
    useDestinyWorkspaceStore.getState().failQimenSession(
      toDisplayError('unknown', rawMessage),
      'unknown',
      'task'
    );
  }
}

/**
 * 取消当前推演（安静暂停）：
 * 中止在途网络请求、清空定时器并释放 loading，保留已生成的盘面内容，不产生错误提示。
 */
function cancel(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  clearAllTimeouts();
  useDestinyWorkspaceStore.getState().abortQimenSession();
}

/**
 * 弃局重置：
 * 中止在途请求、清空定时器、失效 runId 并重置工作区到初始空白表单。
 */
function reset(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  clearAllTimeouts();
  latestRunId += 1;
  useDestinyWorkspaceStore.getState().resetWorkspace('qimen');
}

/**
 * 从历史记录中无损恢复奇门工作区：
 * 直达结果态并按 savedSections 重建 sectionStatuses，静默清洗 URL 中的 ?historyId=。
 */
function restoreFromHistory(historyId: string): boolean {
  const item = useHistoryStore.getState().getItemById(historyId);
  if (!item || item.type !== 'destiny' || item.subType !== 'qimen') {
    return false;
  }

  const savedData = item.reportData as Record<string, unknown> | null;
  if (!savedData) {
    return false;
  }

  const payload: RestoreQimenWorkspacePayload = {
    analysisId: (savedData.analysisId as string) || null,
    baseResult: (savedData.baseResult as QimenAnalysisBaseResult) || null,
    sections: (savedData.sections as QimenAsyncSections) || {},
    formData: (savedData.formData as QimenFormData) || (item.formData as QimenFormData),
  };

  useDestinyWorkspaceStore.getState().restoreQimenWorkspace(payload);

  // 清洗 URL 参数，防止刷新重复触发
  if (typeof window !== 'undefined' && window.location) {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('historyId')) {
        url.searchParams.delete('historyId');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // 忽略无法解析 URL 的特殊测试环境
    }
  }

  return true;
}

/** 测试隔离重置函数 */
export function _resetQimenSessionForTest(): void {
  latestAbortController?.abort();
  latestAbortController = null;
  clearAllTimeouts();
  latestRunId += 1;
}

export const qimenSession = {
  start,
  cancel,
  reset,
  restoreFromHistory,
};
