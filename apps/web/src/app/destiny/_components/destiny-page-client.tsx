'use client';

import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BaziWorkspace } from './bazi-workspace';
import { ZiweiWorkspace } from './ziwei-workspace';
import { QimenWorkspace } from './qimen-workspace';
import { DestinyModelSwitcher } from '@/components/destiny/model-switcher';
import { QimenLoadingAnimation } from './qimen-loading-animation';
import type { DestinyModuleKey } from './layout/left-nav';
import { DestinyDesktopNav } from './layout/destiny-desktop-nav';
import { DestinyNavProvider, useDestinyNav } from './layout/destiny-nav-context';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useZiweiThemeStore } from '@/stores/ziwei-theme-store';
import { resolveZiweiTheme } from '@/lib/utils/ziwei-theme';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/use-breakpoint';
// 跨模态接力：「待解读引用」领域级入口（REQ-011）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import { ReferenceSourcePreview } from '@/components/relay/reference-source-preview';
import { ReferenceBar } from '@/components/relay/reference-bar';
import { RelayMethodPicker } from './relay-method-picker';
import { RELAY_COPY } from '@/lib/relay/copy';

export function DestinyPageClient({ initialTab }: { initialTab?: string }) {
  const [activeModule, setActiveModule] = useState<DestinyModuleKey>(() => {
    // 合盘档案从历史进入：tab=bazi-compatibility 时落到八字工作区
    if (initialTab === 'bazi-compatibility') return 'bazi';
    if (initialTab === 'bazi' || initialTab === 'ziwei' || initialTab === 'qimen') return initialTab;
    return 'bazi';
  });
  // 同步激活模块到全局 store,供命理域外的全局 chrome(移动端顶栏/底栏)感知场景
  const setActiveModuleInStore = useDestinyWorkspaceStore((s) => s.setActiveModule);
  useEffect(() => {
    setActiveModuleInStore(activeModule);
    return () => setActiveModuleInStore(null);
  }, [activeModule, setActiveModuleInStore]);
  // 模型切换只在填表步骤显示，结果页不显示
  const isFormStep = useDestinyWorkspaceStore((s) => s[activeModule].step === 'form');
  // 紫微结果态:仅夜幕主题时移动端分段控件入夜;白昼与八字/奇门一致
  const ziweiInResult = useDestinyWorkspaceStore((s) => s.ziwei.step === 'result');
  const ziweiThemePref = useZiweiThemeStore((s) => s.pref);
  const systemResolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const ziweiTheme = resolveZiweiTheme(ziweiThemePref, systemResolvedTheme);
  const isZiweiNight = activeModule === 'ziwei' && ziweiInResult && ziweiTheme === 'night';
  const [qimenLoading, setQimenLoading] = useState(false);
  const [baziLoading, setBaziLoading] = useState(false);
  const [ziweiLoading, setZiweiLoading] = useState(false);

  // 接力：命理目标接收。文本绝不写入出生资料字段，仅以「待解读引用」呈现 + 三术数平级选择。
  const relay = useRelayReceive('destiny');
  const [relayPreviewOpen, setRelayPreviewOpen] = useState(false);
  const relaySourceType = relay.bundle?.items[0]?.sourceType;

  // 各术数必要输入就绪：出生资料看八字/紫微表单，所问之事看奇门 description
  const baziHasBirth = useDestinyWorkspaceStore((s) => Boolean(s.bazi.formData?.name?.trim()));
  const ziweiHasBirth = useDestinyWorkspaceStore((s) => Boolean(s.ziwei.formData?.name?.trim()));
  const qimenHasQuestion = useDestinyWorkspaceStore((s) =>
    Boolean(s.qimen.formData?.description?.trim())
  );
  const relayReadinessCtx = {
    hasBirthProfile: baziHasBirth || ziweiHasBirth,
    hasQuestion: qimenHasQuestion,
    hasCastTime: true, // 起局时间默认取当前时刻，不作为阻塞输入
  };

  const scrollByModuleRef = useRef<Partial<Record<DestinyModuleKey, number>>>({});
  const lastActiveModuleRef = useRef<DestinyModuleKey>(activeModule);
  const breakpoint = useBreakpoint();
  const isCompactLayout = breakpoint !== 'desktop';

  // 滚动位置管理
  useEffect(() => {
    const onScroll = () => {
      scrollByModuleRef.current[activeModule] = window.scrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeModule]);

  useEffect(() => {
    const prev = lastActiveModuleRef.current;
    if (prev === activeModule) return;

    scrollByModuleRef.current[prev] = window.scrollY;

    const nextY = scrollByModuleRef.current[activeModule] ?? 0;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: nextY, behavior: 'auto' });
    });

    lastActiveModuleRef.current = activeModule;
  }, [activeModule]);

  // 接力「待解读引用」横幅：替换确认 / 活动引用 + 术数平级选择 / 失效提示。
  // 引用文本绝不写入出生资料字段；仅在表单步展示（结果步由顾问 externalDraft 接管）。
  // 桌面端：xl 起给左侧 nav 与右上模型切换器让位（与 DestinyPageScaffold 的 withNavOffset 对齐）；
  // 移动端：模型切换嵌在各术数表单标题行右侧，与 sticky 分段控件不冲突。
  const relayBanner = (relay.replaceCandidate || relay.bundle || relay.isInvalid) && isFormStep ? (
    <div className="transition-[padding-left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] xl:pl-[var(--destiny-nav-offset,304px)]">
      <div className="mx-4 mt-3 rounded-2xl border border-[#5D7CFA]/20 bg-[#5D7CFA]/5 px-4 py-3 dark:border-[#7D8CFF]/20 dark:bg-[#5D7CFA]/10 sm:mx-6 xl:mr-[280px]">
        {relay.replaceCandidate ? (
          <ReferenceBar
            bundle={relay.replaceCandidate.incoming}
            isReplaceCandidate
            onConfirmReplace={relay.confirmReplace}
            onCancelReplace={relay.cancelReplace}
            onRemove={relay.remove}
          />
        ) : relay.bundle ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#5D7CFA]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#3C58D8] dark:bg-[#5D7CFA]/20 dark:text-[#9BADFF]">
                {RELAY_COPY.destiny.pendingReference}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {RELAY_COPY.destiny.prefillNote}
              </p>
            </div>
            <ReferenceBar
              bundle={relay.bundle}
              onRemove={relay.remove}
              onViewSource={() => setRelayPreviewOpen(true)}
            />
            {relaySourceType && (
              <RelayMethodPicker
                sourceType={relaySourceType}
                readinessCtx={relayReadinessCtx}
                onPick={(methodId) => setActiveModule(methodId)}
              />
            )}
          </div>
        ) : relay.isInvalid ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {RELAY_COPY.referenceBar.invalid}
          </p>
        ) : null}
      </div>
    </div>
  ) : null;

  // 所有工作区始终挂载，仅通过 CSS 显隐切换，确保后台请求不中断
  const workspaceElements = (
    <>
      <div className={cn('h-full w-full', activeModule !== 'bazi' && 'hidden')}>
        <BaziWorkspace
          isActive={activeModule === 'bazi'}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          onLoadingChange={setBaziLoading}
        />
      </div>
      <div className={cn('h-full w-full', activeModule !== 'ziwei' && 'hidden')}>
        <ZiweiWorkspace
          isActive={activeModule === 'ziwei'}
          onLoadingChange={setZiweiLoading}
        />
      </div>
      <div className={cn('h-full w-full', activeModule !== 'qimen' && 'hidden')}>
        <QimenWorkspace
          isActive={activeModule === 'qimen'}
          onLoadingChange={setQimenLoading}
        />
      </div>
    </>
  );

  if (isCompactLayout) {
    const mobileTabs = [
      { key: 'bazi' as const, label: '八字' },
      { key: 'ziwei' as const, label: '紫微' },
      { key: 'qimen' as const, label: '奇门' },
    ];

    return (
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent"
        style={{ minHeight: '100dvh' }}
      >
        {/* 移动端分段控件(紫微结果态入夜) */}
        <div
          className={cn(
            'sticky top-0 z-20 border-b px-4 py-3 backdrop-blur-2xl transition-[background-color,border-color] duration-500',
            isZiweiNight
              ? 'border-[#E7C873]/15 bg-[#0C1128]/85'
              : 'border-white/50 bg-white/75 dark:border-white/10 dark:bg-slate-900/75'
          )}
        >
          <div
            className={cn(
              'rounded-[999px] p-1 transition-colors duration-500',
              isZiweiNight ? 'bg-white/5' : 'bg-slate-100/80 dark:bg-slate-800/80'
            )}
          >
            <div className="grid grid-cols-3 gap-1">
              {mobileTabs.map((tab) => {
                const active = activeModule === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveModule(tab.key)}
                    className={cn(
                      'rounded-[999px] px-4 py-2 text-sm font-semibold transition-all duration-200',
                      active
                        ? isZiweiNight
                          ? 'bg-[#A78BFA]/15 text-[#C4B5FD] shadow-[0_0_16px_rgba(139,92,246,0.25)]'
                          : 'bg-white text-[#5D7CFA] shadow-sm dark:bg-slate-700 dark:text-[#9BADFF]'
                        : isZiweiNight
                          ? 'text-[#8B87A0] hover:text-[#C9C4D8]'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 模型切换已移入各术数表单标题行右侧（移动端），此处不再单独占顶栏一行 */}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {relayBanner}
          {workspaceElements}

          {activeModule === 'qimen' && qimenLoading ? (
            <div
              className="fixed inset-x-0 z-10 overflow-hidden bg-white/70 backdrop-blur-[10px] dark:bg-slate-950/70"
              style={{
                top: 'calc(env(safe-area-inset-top) + 4.5rem)',
                bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)',
              }}
            >
              <div className="h-full w-full">
                <QimenLoadingAnimation
                  variant="inline"
                  intensity="low"
                  subMessage="按九宫、八门与九星节奏推进推演"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 接力来源只读预览 */}
        <ReferenceSourcePreview
          open={relayPreviewOpen}
          onOpenChange={setRelayPreviewOpen}
          item={relay.bundle?.items[0] ?? null}
        />
      </div>
    );
  }

  const isLoading = activeModule === 'bazi' ? baziLoading : activeModule === 'ziwei' ? ziweiLoading : qimenLoading;

  return (
    <DestinyNavProvider>
      <DestinyDesktopLayout
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isLoading={isLoading}
        qimenLoading={qimenLoading}
        workspaceElements={workspaceElements}
        isFormStep={isFormStep}
        relayBanner={relayBanner}
        relayPreview={
          <ReferenceSourcePreview
            open={relayPreviewOpen}
            onOpenChange={setRelayPreviewOpen}
            item={relay.bundle?.items[0] ?? null}
          />
        }
      />
    </DestinyNavProvider>
  );
}

function DestinyDesktopLayout({
  activeModule,
  onModuleChange,
  isLoading,
  qimenLoading,
  workspaceElements,
  isFormStep,
  relayBanner,
  relayPreview,
}: {
  activeModule: DestinyModuleKey;
  onModuleChange: (key: DestinyModuleKey) => void;
  isLoading: boolean;
  qimenLoading: boolean;
  workspaceElements: React.ReactNode;
  isFormStep: boolean;
  relayBanner?: React.ReactNode;
  relayPreview?: React.ReactNode;
}) {
  const { navOffsetPx } = useDestinyNav();

  return (
    <div
      className="relative h-full flex-1 overflow-hidden"
      style={{ ['--destiny-nav-offset' as string]: `${navOffsetPx}px` }}
    >
      <DestinyDesktopNav
        activeModule={activeModule}
        onModuleChange={onModuleChange}
        disabled={isLoading}
      />

      {/* 模型切换入口：桌面端右上角悬浮，仅在填表步骤显示 */}
      {isFormStep && (
        <div className="fixed right-6 top-4 z-30">
          <DestinyModelSwitcher />
        </div>
      )}

      <div className="h-full w-full">
        {relayBanner}
        {workspaceElements}

        {activeModule === 'qimen' && qimenLoading && (
          <div className="absolute inset-0 z-[35] overflow-hidden">
            <div className="relative h-full w-full bg-white/10 backdrop-blur-[14px] dark:bg-slate-950/20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(133,167,255,0.12),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.06)_20%,rgba(255,255,255,0.02)_32%,rgba(255,255,255,0)_46%)]" />
              <div className="pointer-events-none absolute inset-y-0 left-[var(--destiny-nav-offset,304px)] hidden w-20 -translate-x-4 bg-gradient-to-r from-white/10 via-white/4 to-transparent blur-2xl xl:block" />
              <div className="relative h-full w-full transition-[padding-left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] xl:pl-[var(--destiny-nav-offset,304px)]">
                <QimenLoadingAnimation />
              </div>
            </div>
          </div>
        )}
      </div>

      {relayPreview}
    </div>
  );
}
