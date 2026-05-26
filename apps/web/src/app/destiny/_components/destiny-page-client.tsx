'use client';

import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BaziWorkspace } from './bazi-workspace';
import { ZiweiWorkspace } from './ziwei-workspace';
import { QimenWorkspace } from './qimen-workspace';
import { QimenLoadingAnimation } from './qimen-loading-animation';
import { LeftNav, type DestinyModuleKey } from './layout/left-nav';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/use-breakpoint';

export function DestinyPageClient() {
  const [activeModule, setActiveModule] = useState<DestinyModuleKey>('bazi');
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

  const renderWorkspace = (module: DestinyModuleKey) => {
    if (module === 'bazi') {
      return (
        <BaziWorkspace
          isActive={activeModule === 'bazi'}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          onLoadingChange={setBaziLoading}
        />
      );
    }

    if (module === 'ziwei') {
      return (
        <ZiweiWorkspace isActive={activeModule === 'ziwei'} onLoadingChange={setZiweiLoading} />
      );
    }

    return <QimenWorkspace isActive={activeModule === 'qimen'} onLoadingChange={setQimenLoading} />;
  };

  if (isCompactLayout) {
    const mobileTabs = [
      { key: 'bazi' as const, label: '八字' },
      { key: 'ziwei' as const, label: '紫微' },
      { key: 'qimen' as const, label: '奇门' },
    ];

    return (
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950"
        style={{ minHeight: '100dvh' }}
      >
        {/* 移动端分段控件 - 使用设计系统规范 */}
        <div className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/90">
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
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {renderWorkspace(activeModule)}

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
    <div className="relative flex-1 h-full overflow-hidden">
      {/* 左侧导航 - 渲染一次，按活跃模块显示加载状态 */}
      <div
        className={cn(
          'absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20 transition-opacity duration-200',
          isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'
        )}
      >
        <div className="h-full w-full rounded-[32px] border border-white/60 dark:border-white/10 bg-white/78 dark:bg-slate-900/90 backdrop-blur-[24px] p-4 shadow-[0_8px_20px_rgba(76,95,154,0.10)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)]">
          <LeftNav activeModule={activeModule} onModuleChange={setActiveModule} />
        </div>
      </div>

      {/* 工作区 - 仅渲染当前活跃模块 */}
      <div className="h-full w-full">
        {activeModule === 'bazi' && (
          <BaziWorkspace
            isActive
            activeModule={activeModule}
            onModuleChange={setActiveModule}
            onLoadingChange={setBaziLoading}
          />
        )}
        {activeModule === 'ziwei' && (
          <ZiweiWorkspace isActive onLoadingChange={setZiweiLoading} />
        )}
        {activeModule === 'qimen' && (
          <>
            <div className={cn('h-full w-full', qimenLoading && 'pointer-events-none')}>
              <QimenWorkspace isActive onLoadingChange={setQimenLoading} />
            </div>
            {qimenLoading && (
              <div className="absolute inset-0 z-[35] overflow-hidden">
                <div className="relative h-full w-full bg-white/10 backdrop-blur-[14px] dark:bg-slate-950/20">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(133,167,255,0.12),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.06)_20%,rgba(255,255,255,0.02)_32%,rgba(255,255,255,0)_46%)]" />
                  <div className="pointer-events-none absolute inset-y-0 left-[288px] hidden w-20 bg-gradient-to-r from-white/10 via-white/4 to-transparent blur-2xl xl:block" />
                  <div className="relative h-full w-full xl:pl-[304px]">
                    <QimenLoadingAnimation />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
