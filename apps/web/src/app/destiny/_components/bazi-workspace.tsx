'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { baziSession } from '@/lib/destiny/bazi-session';
import { buildPartialReport } from '@/lib/destiny/bazi-report-merge';
import { cn } from '@/lib/utils';
import type { DestinyHistoryItem } from '@/types/history';
import { BaziInputForm } from './bazi-input-form';
import { DestinyShell } from './layout/destiny-shell';
import { DestinyModelSwitcher } from '@/components/destiny/model-switcher';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
// 跨模态接力：命盘生成后经 externalDraft 预填顾问（绝不复用 queuedQuestion，REQ §4.6.4）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import type { BaziFormData } from './bazi-types';
import type {
  BaziLockedSections,
  DestinyReport,
  PartialDestinyReport,
} from './types';
import type { DestinyModuleKey } from './layout/left-nav';
import { createDefaultPartnerForm } from './compatibility/constants';
import { CompatibilityPartnerForm } from './compatibility/partner-form';
import { CompatibilityGeneratingView } from './compatibility/generating-view';
import { CompatibilityReportView } from './compatibility/report/compatibility-report';
import { useCompatibilityFlow } from './compatibility/hooks/use-compatibility-flow';
import type {
  CompatibilityFlowStep,
  CompatibilityReport,
  CompatibilityStreamStatus,
  PartnerProfileForm,
  RelationType,
} from './compatibility/types';

/** 从历史合盘档案回填对方资料表单 */
function partnerFormFromHistory(item: DestinyHistoryItem): PartnerProfileForm {
  const form = (item.formData || {}) as {
    partner?: {
      name?: string;
      gender?: 'male' | 'female' | null;
      calendarType?: 'lunar' | 'solar';
      birthDate?: PartnerProfileForm['birthDate'];
      birthTime?: PartnerProfileForm['birthTime'];
      location?: { name: string; lat?: number | null; lon?: number | null } | null;
    };
    focusTags?: string[];
  };
  const partner = form.partner;
  const defaults = createDefaultPartnerForm();
  if (!partner) {
    return { ...defaults, consentConfirmed: true, focusTags: form.focusTags || [] };
  }
  return {
    displayName: partner.name?.trim() || '',
    gender:
      partner.gender === 'male' || partner.gender === 'female' ? partner.gender : 'unspecified',
    calendarType: partner.calendarType || 'solar',
    birthDate: partner.birthDate || defaults.birthDate,
    birthTime: partner.birthTime ?? null,
    location: partner.location
      ? {
          name: partner.location.name,
          lat: partner.location.lat ?? null,
          lon: partner.location.lon ?? null,
        }
      : null,
    locationSkipped: !partner.location?.name,
    consentConfirmed: true,
    focusTags: form.focusTags || [],
  };
}

/**
 * 在历史中找与当前八字最相关的合盘档案：
 * 1) sourceBaziHistoryId 精确关联
 * 2) 我方姓名与当前八字表单匹配
 * 3) 兜底取最新一份合盘（同会话回看）
 */
function findRelatedCompatibilityItem(
  items: ReturnType<typeof useHistoryStore.getState>['items'],
  opts: { sourceBaziHistoryId?: string | null; selfName?: string }
): DestinyHistoryItem | null {
  const compatItems = items.filter(
    (item): item is DestinyHistoryItem =>
      item.type === 'destiny' && item.subType === 'bazi-compatibility'
  );
  if (compatItems.length === 0) return null;

  const byUpdated = [...compatItems].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (opts.sourceBaziHistoryId) {
    const linked = byUpdated.find((item) => {
      const report = item.reportData as CompatibilityReport | null;
      return report?.sourceBaziHistoryId === opts.sourceBaziHistoryId;
    });
    if (linked) return linked;
  }

  const selfName = opts.selfName?.trim();
  if (selfName) {
    const bySelf = byUpdated.find((item) => {
      const form = item.formData as { self?: { name?: string } };
      return form.self?.name?.trim() === selfName;
    });
    if (bySelf) return bySelf;
  }

  // 无姓名可匹配时不盲目回填他人合盘，避免串档
  return null;
}

type BaziWorkspaceProps = {
  isActive: boolean;
  activeModule: DestinyModuleKey;
  onModuleChange?: (key: DestinyModuleKey) => void;
  onLoadingChange?: (loading: boolean) => void;
};

function validateForm(formData: BaziFormData): Partial<Record<keyof BaziFormData, string>> {
  const errors: Partial<Record<keyof BaziFormData, string>> = {};

  if (!formData.name.trim()) {
    errors.name = '请填写姓名';
  }
  if (!formData.location.name.trim()) {
    errors.location = '请填写出生地点';
  }

  return errors;
}

export function BaziWorkspace({
  isActive,
  activeModule,
  onModuleChange,
  onLoadingChange,
}: BaziWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    streaming,
    error,
    report,
    lockedSections,
    streamStatus,
    activeReportHistoryId,
    setWorkspaceState,
    restoreWorkspace,
    provider,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.bazi,
      setWorkspaceState: state.setWorkspaceState,
      restoreWorkspace: state.restoreWorkspace,
      provider: state.provider,
    }))
  );

  // ─── 八字合盘本地流程状态（与个人报告 step 分离，独立占满主内容区） ───
  // 必须放在 submit / 历史恢复 effect 之前声明，保证闭包与 hooks 顺序稳定
  const [compatStep, setCompatStep] = useState<CompatibilityFlowStep>('idle');
  const [compatRelation, setCompatRelation] = useState<RelationType>('romance');
  const [partnerForm, setPartnerForm] = useState<PartnerProfileForm>(() =>
    createDefaultPartnerForm()
  );
  const [compatReport, setCompatReport] = useState<CompatibilityReport | null>(null);
  const [compatStatus, setCompatStatus] = useState<CompatibilityStreamStatus | null>(null);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [compatLoadingView, setCompatLoadingView] = useState(false);
  const { generate: generateCompatibility, abort: abortCompatibility } =
    useCompatibilityFlow();

  // 清空合盘本地状态助手（主盘提交与重算前调用，留在页面，绝不传入 session）
  const resetLocalCompatibilityState = useCallback(() => {
    abortCompatibility();
    setCompatStep('idle');
    setCompatReport(null);
    setCompatStatus(null);
    setCompatError(null);
    setCompatLoadingView(false);
    setPartnerForm(createDefaultPartnerForm());
    setCompatRelation('romance');
  }, [abortCompatibility]);

  // 同步合盘流程激活态到 store：合盘层是覆盖式全屏视图，外层需隐藏表单专属入口（模型切换/接力横幅）
  useEffect(() => {
    setWorkspaceState('bazi', (current) => {
      const next = compatStep !== 'idle';
      return current.compatActive === next ? {} : { compatActive: next };
    });
  }, [compatStep, setWorkspaceState]);

  // 订阅历史列表：用于本地态丢失后仍能回看「上次合盘」
  const historyItems = useHistoryStore((s) => s.items);
  const isHistoryReady = useHistoryStore((s) => s.isInitialized);

  // 接力：八字目标接收。命盘生成后把引用文本经 externalDraft 预填到 AI 顾问输入框。
  const relay = useRelayReceive('destiny');
  const relayText = relay.bundle?.items[0]?.snapshotText ?? '';
  const relayDraft = useMemo(() => {
    if (step !== 'result' || !report || !relayText) return null;
    return { id: relay.bundle!.id, text: relayText };
  }, [step, report, relayText, relay.bundle]);
  // 预填被顾问接收：仅记录，不完成接力（REQ §4.6.4-5：发送成功才完成接力）
  const handleRelayDraftHandled = useMemo(
    () => () => {
      // 顾问已接收预填：此处不清引用，接力完成时机推迟到「顾问发送成功」（onRelayDraftSent）
    },
    [relay.bundle?.id]
  );
  // 顾问发送预填内容成功：完成一次接力（代理至会话命令模块闭环）
  const handleRelayDraftSent = useCallback(() => {
    baziSession.commitAdvisorRelay();
  }, []);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) {
      restoreWorkspace('bazi');
    }
  }, [isActive, restoreWorkspace]);

  const isBaziHistoryInitialized = useHistoryStore((state) => state.isInitialized);

  // 从历史记录恢复（个人八字 / 八字合盘）
  useEffect(() => {
    if (!isActive || !isBaziHistoryInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;
    const historyItem = useHistoryStore.getState().getItemById(historyId);
    if (historyItem?.type !== 'destiny') return;

    // 合盘档案：直接进入独立合盘报告层
    if (historyItem.subType === 'bazi-compatibility') {
      // 已处于合盘流程（含切 tab 后保留下来的流程态）时不再重复恢复。
      // 恢复写入的是本地组件状态（compatStep 等），StrictMode/重挂载会丢失该状态，
      // 因此这里保留 URL 的 historyId，待退出合盘层时统一清理（见 backFromCompatibility）。
      if (compatStep !== 'idle') return;
      const form = historyItem.formData as {
        self?: BaziFormData;
        partner?: {
          name?: string;
          gender?: 'male' | 'female' | null;
          calendarType?: 'lunar' | 'solar';
          birthDate?: PartnerProfileForm['birthDate'];
          birthTime?: PartnerProfileForm['birthTime'];
          location?: { name: string; lat?: number | null; lon?: number | null } | null;
        };
        relationType?: RelationType;
        focusTags?: string[];
      };
      const reportData = historyItem.reportData as CompatibilityReport | null;
      if (form.self) {
        // 仅回填「我」的表单，不覆盖已有个人报告
        setWorkspaceState('bazi', {
          formData: form.self,
          fieldErrors: {},
          error: null,
          errorKind: null,
        });
      }
      if (form.partner) {
        setPartnerForm({
          displayName: form.partner.name?.trim() || '',
          gender:
            form.partner.gender === 'male' || form.partner.gender === 'female'
              ? form.partner.gender
              : 'unspecified',
          calendarType: form.partner.calendarType || 'solar',
          birthDate: form.partner.birthDate || createDefaultPartnerForm().birthDate,
          birthTime: form.partner.birthTime ?? null,
          location: form.partner.location
            ? {
                name: form.partner.location.name,
                lat: form.partner.location.lat ?? null,
                lon: form.partner.location.lon ?? null,
              }
            : null,
          locationSkipped: !form.partner.location?.name,
          consentConfirmed: true,
          focusTags: form.focusTags || [],
        });
      }
      if (form.relationType) setCompatRelation(form.relationType);
      if (reportData?.chartFacts && reportData?.views) {
        setCompatReport(reportData);
        setCompatRelation(reportData.relationType || form.relationType || 'romance');
        setCompatStep('report');
      } else {
        setCompatStep('partner-form');
      }
      return;
    }

    if (historyItem.subType !== 'bazi') return;
    baziSession.restoreFromHistory(historyId);

    // 恢复个人八字时，若存在关联合盘，预填以便结果页展示「查看合盘」
    const linkedCompat = findRelatedCompatibilityItem(useHistoryStore.getState().items, {
      sourceBaziHistoryId: historyId,
      selfName: (historyItem.formData as BaziFormData | undefined)?.name,
    });
    if (linkedCompat) {
      const compatData = linkedCompat.reportData as CompatibilityReport | null;
      if (compatData?.chartFacts && compatData.views) {
        setCompatReport(compatData);
        setPartnerForm(partnerFormFromHistory(linkedCompat));
        const form = linkedCompat.formData as { relationType?: RelationType };
        setCompatRelation(compatData.relationType || form.relationType || 'romance');
        setCompatStep('idle');
      }
    }
  }, [isActive, isBaziHistoryInitialized]);

  useEffect(() => {
    return () => {
      baziSession.cancel();
    };
  }, []);

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
    setWorkspaceState('bazi', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setWorkspaceState('bazi', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('bazi', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    resetLocalCompatibilityState();
    await baziSession.start(formData, { provider });
  };

  const reset = () => {
    baziSession.reset();
  };

  const handleRecalculate = () => {
    resetLocalCompatibilityState();
    baziSession.reset();
  };

  const partialReport = useMemo(() => buildPartialReport(lockedSections), [lockedSections]);

  const relatedCompatHistory = useMemo(() => {
    if (!isHistoryReady) return null;
    return findRelatedCompatibilityItem(historyItems, {
      sourceBaziHistoryId: activeReportHistoryId,
      selfName: formData.name,
    });
  }, [historyItems, isHistoryReady, activeReportHistoryId, formData.name, compatReport?.id]);

  // 本地尚无合盘结果时，从历史档案回填（同会话返回 / 刷新后仍可「查看上次合盘」）
  useEffect(() => {
    if (compatReport?.chartFacts && compatReport.views) return;
    if (!relatedCompatHistory) return;
    const reportData = relatedCompatHistory.reportData as CompatibilityReport | null;
    if (!reportData?.chartFacts || !reportData.views) return;

    setCompatReport(reportData);
    setPartnerForm(partnerFormFromHistory(relatedCompatHistory));
    const form = relatedCompatHistory.formData as { relationType?: RelationType };
    setCompatRelation(reportData.relationType || form.relationType || 'romance');
  }, [relatedCompatHistory, compatReport?.chartFacts, compatReport?.views]);

  const historyCompatReport =
    (relatedCompatHistory?.reportData as CompatibilityReport | null) ?? null;

  const hasExistingCompatibility = Boolean(
    (compatReport?.chartFacts &&
      compatReport.views &&
      Object.keys(compatReport.views).length > 0) ||
      (historyCompatReport?.chartFacts &&
        historyCompatReport.views &&
        Object.keys(historyCompatReport.views).length > 0)
  );

  const existingCompatibilityLabel = useMemo(() => {
    if (!hasExistingCompatibility) return undefined;
    const partner =
      compatReport?.partnerDisplayName?.trim() ||
      historyCompatReport?.partnerDisplayName?.trim() ||
      partnerForm.displayName.trim() ||
      'TA';
    return `查看与${partner}的合盘`;
  }, [
    hasExistingCompatibility,
    compatReport?.partnerDisplayName,
    historyCompatReport?.partnerDisplayName,
    partnerForm.displayName,
  ]);

  const selfSummary = useMemo(() => {
    const d = formData.birthDate;
    return {
      name: formData.name || '我',
      birthText: `${d.year}年${d.month}月${d.day}日`,
      locationText: formData.location?.name || undefined,
    };
  }, [formData]);

  /**
   * 开启 / 重新测算合盘：进入对方资料表单。
   * 不清空已有报告与对方资料，方便从八字结果页再次进入后编辑重算；
   * 仅在首次无资料时初始化默认表单。
   */
  const startCompatibility = useCallback(() => {
    setCompatError(null);
    setCompatStatus(null);
    setCompatLoadingView(false);
    setPartnerForm((prev) => {
      // 已有对方资料（含上次合盘）则保留，避免无效重填
      if (prev.displayName.trim() || prev.consentConfirmed || compatReport) {
        return prev;
      }
      return createDefaultPartnerForm();
    });
    setCompatStep('partner-form');
  }, [compatReport]);

  /** 回看已生成的合盘报告（不重算、不扣费）；必要时先从历史回填 */
  const resumeCompatibilityReport = useCallback(() => {
    if (!compatReport?.chartFacts || !compatReport.views) {
      if (!relatedCompatHistory) return;
      const fromHistory = relatedCompatHistory.reportData as CompatibilityReport | null;
      if (!fromHistory?.chartFacts || !fromHistory.views) return;
      setCompatReport(fromHistory);
      setPartnerForm(partnerFormFromHistory(relatedCompatHistory));
      const form = relatedCompatHistory.formData as { relationType?: RelationType };
      setCompatRelation(fromHistory.relationType || form.relationType || 'romance');
    }
    setCompatError(null);
    setCompatStatus(null);
    setCompatLoadingView(false);
    setCompatStep('report');
  }, [compatReport, relatedCompatHistory]);

  /**
   * 从合盘层回到八字结果/表单。
   * 保留 compatReport / partnerForm，使八字页可再进入「查看上次合盘」。
   */
  const backFromCompatibility = useCallback(() => {
    abortCompatibility();
    setCompatStep('idle');
    setCompatStatus(null);
    setCompatLoadingView(false);
    // 合盘恢复依赖 URL 的 historyId（重挂载后重放），退出合盘层时清理，避免下次进入八字时误恢复
    const url = new URL(window.location.href);
    if (url.searchParams.has('historyId')) {
      url.searchParams.delete('historyId');
      window.history.replaceState({}, '', url.toString());
    }
    // 若个人报告已就绪，确保落在结果步，避免返回后只剩表单
    if (report || Object.keys(lockedSections || {}).length > 0) {
      setWorkspaceState('bazi', {
        step: 'result',
        lastView: 'result',
        hasResult: true,
      });
    }
  }, [abortCompatibility, report, lockedSections, setWorkspaceState]);

  const submitCompatibility = async (
    relationOverride?: RelationType,
    viewOnly = false,
    rollbackRelation?: RelationType
  ) => {
    if (!partnerForm.consentConfirmed) {
      setCompatError('请先确认已获得对方同意');
      return;
    }
    const relation = relationOverride ?? compatRelation;
    setCompatError(null);
    if (!viewOnly) setCompatStep('generating');
    else setCompatLoadingView(true);

    await generateCompatibility({
      selfForm: formData,
      partnerForm,
      relationType: relation,
      provider,
      sourceBaziHistoryId: activeReportHistoryId,
      existingReportId: compatReport?.id,
      viewOnly,
      onStatus: setCompatStatus,
      onReport: (next) => {
        setCompatReport((prev) => {
          if (!prev) return next;
          return {
            ...next,
            views: { ...prev.views, ...next.views },
            id: prev.id || next.id,
            sourceBaziHistoryId:
              next.sourceBaziHistoryId ??
              prev.sourceBaziHistoryId ??
              activeReportHistoryId,
          };
        });
        setCompatRelation(relation);
        setCompatStep('report');
        setCompatLoadingView(false);
      },
      onError: (message) => {
        // 额度不足由全局 QuotaExhaustedDialog 承接；不写页内 error，已缓存视角仍可看
        const isQuota =
          /额度不足|不足以处理|不足以开始|QUOTA_INSUFFICIENT|QUOTA_LIMIT_REACHED/i.test(
            message
          );
        setCompatError(isQuota ? null : message);
        if (!viewOnly) setCompatStep('partner-form');
        else if (rollbackRelation) setCompatRelation(rollbackRelation);
        setCompatLoadingView(false);
      },
    });
  };

  /**
   * Tab 切换：已有缓存直接切；未缓存则立即切到目标 tab 并 viewOnly 请求，
   * 由结果页主题化 loading 承接，无二次确认。
   */
  const handleCompatRelationChange = (next: RelationType) => {
    if (next === compatRelation) return;
    if (compatLoadingView) return;
    if (compatReport?.views[next]) {
      setCompatError(null);
      setCompatRelation(next);
      return;
    }
    const previous = compatRelation;
    // 先切 activeRelation，确保 loading 展示目标视角主题
    setCompatRelation(next);
    void submitCompatibility(next, true, previous);
  };

  const stepTransitionClass =
    'transition-all duration-300 motion-reduce:transition-opacity motion-reduce:duration-150';
  const stepTransitionStyle = {
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  const inCompatFlow = compatStep !== 'idle';

  return (
    <DestinyPageScaffold withNavOffset tone="blue">
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div className="relative flex h-full min-h-0 flex-col p-4 sm:p-6">
          {step === 'form' && !inCompatFlow && (
            <header className="flex shrink-0 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    八字格局精批
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                    信息输入
                  </span>
                </div>
                {/* 模型切换与标题同行右上：各宽度均内嵌于标题行，桌面布局同步展示 */}
                <DestinyModelSwitcher size="compact" className="shrink-0" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                填写生辰时空信息，AI 将基于真实模型生成完整命理解读
              </p>
            </header>
          )}

          <div className={cn('relative min-h-0 flex-1', !inCompatFlow && 'mt-4 sm:mt-6')}>
            {/* 合盘全屏层：独立报告页，不与个人报告混排；内部自管滚动，避免底栏 fixed 穿透左侧导航 */}
            {inCompatFlow ? (
              <div className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden">
                {compatStep === 'partner-form' && (
                  <CompatibilityPartnerForm
                    selfSummary={selfSummary}
                    value={partnerForm}
                    relationType={compatRelation}
                    submitting={false}
                    error={compatError}
                    onRelationChange={setCompatRelation}
                    onChange={(patch) => setPartnerForm((prev) => ({ ...prev, ...patch }))}
                    onBack={backFromCompatibility}
                    onSubmit={() => {
                      void submitCompatibility();
                    }}
                  />
                )}
                {compatStep === 'generating' && (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                    <CompatibilityGeneratingView
                      status={compatStatus}
                      partnerName={partnerForm.displayName || 'TA'}
                      onCancel={() => {
                        abortCompatibility();
                        setCompatStatus(null);
                        setCompatStep('partner-form');
                      }}
                    />
                  </div>
                )}
                {compatStep === 'report' && compatReport && (
                  <CompatibilityReportView
                    report={compatReport}
                    activeRelation={compatRelation}
                    loadingView={compatLoadingView}
                    error={compatError}
                    onBack={backFromCompatibility}
                    onOpenMyBazi={backFromCompatibility}
                    onRelationChange={handleCompatRelationChange}
                    onToggleAction={(actionId) => {
                      setCompatReport((prev) => {
                        if (!prev) return prev;
                        const view = prev.views[compatRelation];
                        if (!view) return prev;
                        return {
                          ...prev,
                          views: {
                            ...prev.views,
                            [compatRelation]: {
                              ...view,
                              weeklyActions: view.weeklyActions.map((a) =>
                                a.id === actionId ? { ...a, done: !a.done } : a
                              ),
                            },
                          },
                        };
                      });
                    }}
                    onRefill={() => setCompatStep('partner-form')}
                  />
                )}
              </div>
            ) : null}

            {/* 表单步 */}
            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'form' && !inCompatFlow
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'form' || inCompatFlow}
            >
              <BaziInputForm
                value={formData}
                submitting={blockingLoading || streaming}
                error={error}
                fieldErrors={fieldErrors}
                onChange={onChange}
                onSubmit={() => {
                  void submit();
                }}
                onReset={reset}
              />
            </div>

            {/* 结果步 */}
            <div
              className={cn(
                'absolute inset-0 h-full min-h-0 w-full',
                stepTransitionClass,
                step === 'result' && !inCompatFlow
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'result' || inCompatFlow}
            >
              <DestinyShell
                report={report}
                partialReport={partialReport}
                streaming={streaming}
                streamStatus={streamStatus}
                streamError={error}
                lockedSections={lockedSections}
                activeModule={activeModule}
                title="AI 命理大师"
                subtitleTag="八字格局精批"
                onModuleChange={onModuleChange}
                onRecalculate={handleRecalculate}
                relayDraft={relayDraft}
                onRelayDraftHandled={handleRelayDraftHandled}
                onRelayDraftSent={handleRelayDraftSent}
                onStartCompatibility={startCompatibility}
                hasExistingCompatibility={hasExistingCompatibility}
                onViewExistingCompatibility={resumeCompatibilityReport}
                existingCompatibilityLabel={existingCompatibilityLabel}
              />
            </div>
          </div>
        </div>
      </div>

      <StarDecodeOverlay open={blockingLoading} />
    </DestinyPageScaffold>
  );
}
