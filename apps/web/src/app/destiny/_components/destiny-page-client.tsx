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
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/use-breakpoint';

export function DestinyPageClient({ initialTab }: { initialTab?: string }) {
  const [activeModule, setActiveModule] = useState<DestinyModuleKey>(() => {
    if (initialTab === 'bazi' || initialTab === 'ziwei' || initialTab === 'qimen') return initialTab;
    return 'bazi';
  });
  // 模型切换只在填表步骤显示，结果页不显示
  const isFormStep = useDestinyWorkspaceStore((s) => s[activeModule].step === 'form');
  const [qimenLoading, setQimenLoading] = useState(false);
  const [baziLoading, setBaziLoading] = useState(false);
  const [ziweiLoading, setZiweiLoading] = useState(false);

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
        {/* 移动端分段控件 */}
        <div className="sticky top-0 z-20 border-b border-white/50 bg-white/75 px-4 py-3 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/75">
          <div className="rounded-[999px] bg-slate-100/80 p-1 dark:bg-slate-800/80">
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
                        ? 'bg-white text-[#5D7CFA] shadow-sm dark:bg-slate-700 dark:text-[#9BADFF]'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 模型切换入口：移动端，仅在填表步骤显示 */}
          {isFormStep && (
            <div className="mt-2 flex justify-center">
              <DestinyModelSwitcher />
            </div>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
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
}: {
  activeModule: DestinyModuleKey;
  onModuleChange: (key: DestinyModuleKey) => void;
  isLoading: boolean;
  qimenLoading: boolean;
  workspaceElements: React.ReactNode;
  isFormStep: boolean;
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
    </div>
  );
}
