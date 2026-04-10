'use client';

import { useEffect, useRef, useState } from 'react';
import { BaziWorkspace } from './bazi-workspace';
import { ZiweiWorkspace } from './ziwei-workspace';
import { QimenWorkspace } from './qimen-workspace';
import { QimenLoadingAnimation } from './qimen-loading-animation';
import { LeftNav, type DestinyModuleKey } from './layout/left-nav';
import { cn } from '@/lib/utils';

export function DestinyPageClient() {
  const [activeModule, setActiveModule] = useState<DestinyModuleKey>('qimen');
  const [qimenLoading, setQimenLoading] = useState(false);
  const [baziLoading, setBaziLoading] = useState(false);
  const [ziweiLoading, setZiweiLoading] = useState(false);

  const scrollByModuleRef = useRef<Partial<Record<DestinyModuleKey, number>>>({});
  const lastActiveModuleRef = useRef<DestinyModuleKey>(activeModule);

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

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      {/* 八字格局精批 */}
      <div
        className={cn(
          'absolute inset-0 transition-all duration-[120ms] ease-out will-change-transform will-change-opacity',
          activeModule === 'bazi'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <div className="relative h-full w-full">
          <div
            className={cn(
              'absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20 transition-opacity duration-200',
              baziLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="h-full w-full rounded-3xl border border-white/70 dark:border-white/10 bg-white/55 dark:bg-slate-900/90 backdrop-blur-xl p-4 shadow-sm">
              <LeftNav activeModule={activeModule} onModuleChange={setActiveModule} />
            </div>
          </div>

          <div className="h-full w-full">
            <BaziWorkspace
              activeModule={activeModule}
              onModuleChange={setActiveModule}
              onRecalculate={() => {
                // 重新排盘逻辑由 BaziWorkspace 内部处理
              }}
              onLoadingChange={setBaziLoading}
            />
          </div>
        </div>
      </div>

      {/* 紫微斗数排盘 */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[120ms]',
          activeModule === 'ziwei'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <div className="relative h-full w-full">
          <div
            className={cn(
              'absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20 transition-opacity duration-200',
              ziweiLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="h-full w-full rounded-3xl border border-white/70 dark:border-white/10 bg-white/55 dark:bg-slate-900/90 backdrop-blur-xl p-4 shadow-sm">
              <LeftNav activeModule={activeModule} onModuleChange={setActiveModule} />
            </div>
          </div>

          <div className="h-full w-full">
            <ZiweiWorkspace
              onRecalculate={() => {
                // 重新排盘逻辑由 ZiweiWorkspace 内部处理
              }}
              onLoadingChange={setZiweiLoading}
            />
          </div>
        </div>
      </div>

      {/* 奇门遁甲演化 */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[120ms]',
          activeModule === 'qimen'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <div className="relative h-full w-full">
          <div
            className={cn(
              'absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20 transition-opacity duration-200',
              qimenLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="h-full w-full rounded-3xl border border-white/70 dark:border-white/10 bg-white/55 dark:bg-slate-900/90 backdrop-blur-xl p-4 shadow-sm">
              <LeftNav activeModule={activeModule} onModuleChange={setActiveModule} />
            </div>
          </div>

          <div className={cn('h-full w-full', qimenLoading && 'pointer-events-none')}>
            <QimenWorkspace
              onRecalculate={() => {
                // 重新排盘逻辑由 QimenWorkspace 内部处理
              }}
              onLoadingChange={setQimenLoading}
            />
          </div>

          {qimenLoading && (
            <div className="absolute inset-0 z-[35] overflow-hidden">
              <div className="relative h-full w-full bg-white/10 backdrop-blur-[14px]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(133,167,255,0.12),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.06)_20%,rgba(255,255,255,0.02)_32%,rgba(255,255,255,0)_46%)]" />
                <div className="pointer-events-none absolute inset-y-0 left-[288px] hidden w-20 bg-gradient-to-r from-white/10 via-white/4 to-transparent blur-2xl xl:block" />
                <div className="relative h-full w-full xl:pl-[304px]">
                  <QimenLoadingAnimation />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
