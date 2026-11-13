'use client';

import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { qimenSession } from '@/lib/destiny/qimen-session';
import { cn } from '@/lib/utils';
import { DestinyModelSwitcher } from '@/components/destiny/model-switcher';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
// 跨模态接力：奇门预填所问之事（REQ-011；绝不写入出生资料，奇门无出生资料）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import type { QimenFormData } from './qimen-types';

type QimenWorkspaceProps = {
  isActive: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

function validateForm(formData: QimenFormData): Partial<Record<keyof QimenFormData, string>> {
  const errors: Partial<Record<keyof QimenFormData, string>> = {};

  if (!formData.datetime.trim()) {
    errors.datetime = '请填写起局时间';
  }
  if (!formData.location.name.trim()) {
    errors.location = '请选择地点';
  }

  const desc = formData.description.trim();
  if (!desc) {
    errors.description = '请填写问题描述';
  } else if (desc.length < 10) {
    errors.description = '问题描述至少 10 个字';
  }

  return errors;
}

export function QimenWorkspace({ isActive, onLoadingChange }: QimenWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    error,
    analysisId,
    baseResult,
    baseStatus,
    baseError,
    sections,
    sectionStatuses,
    sectionErrors,
    setWorkspaceState,
    restoreWorkspace,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.qimen,
      setWorkspaceState: state.setWorkspaceState,
      restoreWorkspace: state.restoreWorkspace,
    }))
  );

  // 接力：奇门目标接收。所问之事（description）可预填，绝不自动起局（点起局才完成）。
  const relay = useRelayReceive('destiny');
  const relayText = relay.bundle?.items[0]?.snapshotText ?? '';
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (!relayText) return;
    // 仅在 description 为空且用户未编辑过草稿时预填，避免覆盖用户输入
    if (!formData.description.trim() && !relay.draft) {
      onChange('description', relayText);
      relay.setDraft(relayText);
    }
     
  }, [relay.initialized, relay.bundle?.id]);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  // 模块激活时恢复视图，并尝试从 URL 历史参数恢复
  useEffect(() => {
    if (isActive) {
      restoreWorkspace('qimen');
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const historyId = params.get('historyId');
        if (historyId) {
          qimenSession.restoreFromHistory(historyId);
        }
      }
    }
  }, [isActive, restoreWorkspace]);

  // 组件卸载时安静暂停推演，释放在途网络与定时器
  useEffect(() => {
    return () => {
      qimenSession.cancel();
    };
  }, []);

  const onChange = <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => {
    setWorkspaceState('qimen', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setWorkspaceState('qimen', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('qimen', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    await qimenSession.start(formData);
  };

  const reset = () => {
    qimenSession.reset();
  };

  const stepTransitionClass =
    'transition-all duration-300 motion-reduce:transition-opacity motion-reduce:duration-150';
  const stepTransitionStyle = {
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  return (
    <DestinyPageScaffold withNavOffset tone="indigo">
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div className="relative flex h-full min-h-0 flex-col p-4 sm:p-6">
          {step === 'form' && (
            <header className="flex shrink-0 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    奇门遁甲演化
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                    信息输入
                  </span>
                </div>
                {/* 模型切换与标题同行右上：各宽度均内嵌于标题行，桌面布局同步展示 */}
                <DestinyModelSwitcher size="compact" className="shrink-0" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                填写起局时空与问题描述，系统基于时家奇门进行演化分析
              </p>
            </header>
          )}

          <div className="relative mt-4 min-h-0 flex-1 sm:mt-6">
            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'form'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'form'}
            >
              <QimenInputForm
                value={formData}
                submitting={blockingLoading}
                error={error}
                fieldErrors={fieldErrors}
                onChange={onChange}
                onSubmit={() => {
                  void submit();
                }}
                onReset={reset}
              />
            </div>

            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'result'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'result'}
            >
              <QimenAnalysisResult
                analysisId={analysisId}
                baseResult={baseResult}
                baseStatus={baseStatus}
                baseError={baseError}
                sections={sections}
                sectionStatuses={sectionStatuses}
                sectionErrors={sectionErrors}
                error={error}
                onBackToForm={() =>
                  setWorkspaceState('qimen', {
                    step: 'form',
                    lastView: 'form',
                  })
                }
                onRetry={() => {
                  void submit();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </DestinyPageScaffold>
  );
}
