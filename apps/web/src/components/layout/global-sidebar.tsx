'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Settings, X, Check, Clock, FileText, Home } from 'lucide-react';
import { ThemeToggle } from '../theme/theme-toggle';
import { useState, useRef, useEffect } from 'react';
import { AppsModal, APP_CONFIGS, type AppId } from './apps-modal';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import { usePinnedApps, useShowAppsModal, useUIActions } from '@/stores';

export function GlobalSidebar() {
  const pathname = usePathname();

  // Zustand 状态管理
  const pinnedApps = usePinnedApps();
  const showAppsModal = useShowAppsModal();
  const { addPinnedApp, removePinnedApp, setAppsModal } = useUIActions();

  const [flyingIcons, setFlyingIcons] = useState<{ id: AppId; startRect: DOMRect; icon: any }[]>(
    []
  );
  // 存储新添加项目的 ref 以测量目标位置
  const newItemRef = useRef<HTMLAnchorElement>(null);
  const [justAddedApp, setJustAddedApp] = useState<AppId | null>(null);
  const [showToast, setShowToast] = useState(false);

  const [landingApp, setLandingApp] = useState<AppId | null>(null);

  // 简单的路由匹配逻辑
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleTogglePin = (id: AppId, startRect?: DOMRect) => {
    // 如果是移除
    if (pinnedApps.includes(id)) {
      removePinnedApp(id);
      return;
    }

    // 如果是添加
    if (startRect) {
      const appConfig = APP_CONFIGS.find((a) => a.id === id);

      // 将 DOMRect 序列化为普通对象以避免状态问题
      const plainRect = {
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        bottom: startRect.bottom,
        right: startRect.right,
        x: startRect.x,
        y: startRect.y,
      } as DOMRect;

      // 触发飞行图标动画
      setFlyingIcons((prev) => [...prev, { id, startRect: plainRect, icon: appConfig?.icon }]);

      // 重要：备份定时器，防止动画卡住时清理飞行图标
      setTimeout(() => {
        setFlyingIcons((prev) => prev.filter((item) => item.id !== id));
      }, 2000);

      //稍微延迟添加到列表，以便与飞行同步
      // 用户要求“弹性响应...腾出空间”。
      // 我们可以立即添加但将其样式设为不可见，或者稍等片刻。
      // 让我们等待 100 毫秒（仅仅为了开始飞行）来腾出空间
      setTimeout(() => {
        addPinnedApp(id);
        setJustAddedApp(id);
      }, 100);
    } else {
      // 如果没有 rect 则回退
      addPinnedApp(id);
    }
  };

  const handleFlightComplete = (id: AppId) => {
    setFlyingIcons((prev) => prev.filter((item) => item.id !== id));
    // 触发“着陆”效果（发光、提示）
    setJustAddedApp(null); // 清除“刚添加”状态（该状态可能隐藏了真实图标）
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    // 设置着陆状态以产生波浪效果
    setLandingApp(id);
    setTimeout(() => setLandingApp(null), 2000); // 2秒后停止波浪
  };

  return (
    <>
      <aside className="w-[80px] bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-6 h-screen flex-shrink-0 z-50 transition-colors duration-300 relative">
        {/* Logo */}
        <div className="mb-8 p-1 relative z-20">
          <Link
            href="/"
            className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" />
          </Link>
        </div>

        {/* 动态导航项 */}
        <nav className="flex-1 w-full flex flex-col gap-3 px-3 overflow-y-auto overflow-x-visible no-scrollbar relative z-10 pt-2">
          {/* 首页按钮 - 常驻 */}
          <div className="w-full">
            <Link href="/" className="flex flex-col items-center gap-1 group w-full relative">
              {/* 激活状态指示器 */}
              {pathname === '/' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 h-10 bg-blue-500 rounded-r-full" />
              )}

              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 relative',
                  pathname === '/'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-105'
                    : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105 active:scale-95'
                )}
              >
                <Home className="w-5 h-5" strokeWidth={2} />
              </div>
            </Link>
          </div>

          <AnimatePresence mode="popLayout">
            {pinnedApps.map((appId, index) => {
              const app = APP_CONFIGS.find((a) => a.id === appId);
              if (!app) return null;

              const active = isActive(app.href);
              const isJustAdded = justAddedApp === appId;
              const isLanding = landingApp === appId;

              return (
                <motion.div
                  key={app.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: isJustAdded ? 0 : 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="w-full"
                >
                  <Link
                    href={app.href}
                    className="flex flex-col items-center gap-1 group w-full relative"
                    ref={isJustAdded ? newItemRef : null}
                  >
                    {/* 激活状态指示器 */}
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 h-10 bg-blue-500 rounded-r-full" />
                    )}

                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 relative',
                        active
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-105'
                          : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105 active:scale-95'
                        // 着陆发光效果（当飞行完成且 isJustAdded 变为 false 时，我们可以触发 class 动画，但如果需要，依赖 css 动画关键帧更简单）
                      )}
                    >
                      <app.icon className="w-5 h-5" strokeWidth={2} />

                      {!active && isLanding && (
                        <span className="absolute inset-0 rounded-xl ring-2 ring-blue-400 ring-offset-2 animate-ping opacity-75"></span>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* 添加按钮 */}
          <motion.button
            layout
            onClick={() => setAppsModal(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-blue-500 dark:hover:text-blue-400 hover:scale-105 active:scale-95 transition-all duration-300 group mt-2 mx-auto"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </motion.button>
        </nav>

        {/* 底部图标 */}
        <div className="flex flex-col items-center gap-3 mt-auto w-full px-3 pt-4 pb-6 relative z-20 bg-slate-50 dark:bg-slate-900">
          {/* 历史记录 */}
          <Link
            href="/history"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Clock className="w-5 h-5" />
          </Link>

          {/* 主题切换 */}
          <ThemeToggle className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300" />

          {/* 设置 */}
          <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300">
            <Settings className="w-5 h-5" />
          </button>

          {/* 用户头像 */}
          <div className="relative cursor-pointer group mt-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 p-0.5 shadow-md hover:shadow-lg transition-shadow">
              <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                  alt="User"
                  className="w-full h-full scale-110"
                />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full" />
          </div>
        </div>
      </aside>

      {/* Toast通知 - 固定在顶部中央 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-5 py-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-white/30 dark:border-slate-700 shadow-2xl rounded-2xl whitespace-nowrap"
          >
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white">
              <Check className="w-3 h-3" strokeWidth={3} />
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              已成功添加至导航栏
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AppsModal
        isOpen={showAppsModal}
        onClose={() => setAppsModal(false)}
        pinnedApps={pinnedApps}
        onTogglePin={handleTogglePin}
      />

      {/* 飞行图标传送门 */}
      {flyingIcons.map((flight) => (
        <FlyingIcon
          key={flight.id}
          startRect={flight.startRect}
          icon={flight.icon}
          targetSelector="#sidebar-bottom-marker" /* 我们可以尝试定位特定元素，或使用固定坐标 */
          onComplete={() => handleFlightComplete(flight.id)}
        />
      ))}
    </>
  );
}

// 飞行图标组件
function FlyingIcon({
  startRect,
  icon: Icon,
  onComplete,
}: {
  startRect: DOMRect;
  icon: any;
  targetSelector?: string;
  onComplete: () => void;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 不在服务端渲染或 Icon 为 undefined 时
  if (!isMounted || !Icon) {
    // 延迟调用 onComplete 以不阻塞流程
    setTimeout(onComplete, 100);
    return null;
  }

  return createPortal(
    <FlyingIconInnerNew startRect={startRect} Icon={Icon} onComplete={onComplete} />,
    document.body
  );
}

function FlyingIconInner({ startRect, Icon, onComplete }: any) {
  const [animationState, setAnimationState] = useState<'initial' | 'flying' | 'done'>('initial');

  // 计算目标位置
  const targetX = 20; // 80px 侧边栏的中心，减去图标宽度的一半
  const targetY = 200; // 侧边栏中大约的 Y 位置

  // 计算弧线峰值（抛物线的最高点）
  const peakY = Math.min(startRect.top, targetY) - 120; // 从较高点向上 120px

  useEffect(() => {
    // 立即开始飞行
    requestAnimationFrame(() => {
      setAnimationState('flying');
    });

    // 动画时长结束后完成
    const timer = setTimeout(() => {
      setAnimationState('done');
      onComplete();
    }, 700); // 稍微长一点以适应抛物线效果

    return () => clearTimeout(timer);
  }, [onComplete]);

  // 计算抛物线路径的中间样式
  const getStyles = () => {
    if (animationState === 'initial') {
      return {
        left: startRect.left,
        top: startRect.top,
        opacity: 0.9,
        scale: 1,
      };
    }
    // 飞行状态 - 目标位置
    return {
      left: targetX,
      top: targetY,
      opacity: 0,
      scale: 0.5,
    };
  };

  const styles = getStyles();

  // 使用 CSS 自定义属性进行动画
  const cssVars = {
    '--start-x': `${startRect.left}px`,
    '--start-y': `${startRect.top}px`,
    '--peak-y': `${peakY}px`,
    '--end-x': `${targetX}px`,
    '--end-y': `${targetY}px`,
  } as React.CSSProperties;

  return (
    <>
      {/* 注入关键帧 */}
      <style>{`
        @keyframes flyParabola {
          0% {
            left: var(--start-x);
            top: var(--start-y);
            opacity: 0.9;
            transform: scale(1) rotate(0deg);
          }
          40% {
            top: var(--peak-y);
            opacity: 0.8;
            transform: scale(1.15) rotate(-5deg);
          }
          100% {
            left: var(--end-x);
            top: var(--end-y);
            opacity: 0;
            transform: scale(0.4) rotate(0deg);
          }
        }
        
        @keyframes flyParabolaX {
          0% { left: var(--start-x); }
          100% { left: var(--end-x); }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          top: startRect.top,
          left: startRect.left,
          zIndex: 2147483647,
          pointerEvents: 'none',
          opacity: animationState === 'initial' ? 0.9 : undefined,
          animation:
            animationState === 'flying'
              ? 'flyParabola 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards'
              : 'none',
          ...cssVars,
        }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white ring-2 ring-white/30"
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(99, 102, 241, 0.8))',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.6), 0 4px 20px rgba(0, 0, 0, 0.2)',
          }}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </>
  );
}

// 平滑动画的缓动函数
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

function FlyingIconInnerNew({ startRect, Icon, onComplete }: any) {
  const [styles, setStyles] = useState<React.CSSProperties>({
    position: 'fixed',
    left: 0,
    top: 0,
    opacity: 1,
    transform: `translate(${startRect.left}px, ${startRect.top}px) scale(1)`,
    pointerEvents: 'none',
    zIndex: 2147483647,
  });

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;
    const duration = 1500; // 减慢至 1.5 秒以获得更长的可见性

    // 目标配置
    const targetX = 20;
    const targetY = 200;

    // 抛物线配置
    const distanceX = Math.abs(startRect.left - targetX);
    // 增加振幅以获得更戏剧性的弧线
    const amplitude = Math.min(400, Math.max(200, distanceX * 0.4));

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      const t = easeInOutCubic(progress);

      // 线性插值
      const currentX = startRect.left + (targetX - startRect.left) * t;
      const baseY = startRect.top + (targetY - startRect.top) * t;

      // 弧线
      const arcY = -amplitude * Math.sin(progress * Math.PI);
      const currentY = baseY + arcY;

      // 效果
      const currentScale = 1 - 0.5 * t; // 结束时缩放为 0.5
      // 保持完全不透明直到飞行的最后 15%
      const currentOpacity = progress > 0.85 ? 1 - (progress - 0.85) * 6.6 : 1;
      const rotation = -60 * Math.sin(progress * Math.PI); // 更多旋转

      setStyles((prev) => ({
        ...prev,
        transform: `translate(${currentX}px, ${currentY}px) scale(${currentScale}) rotate(${rotation}deg)`,
        opacity: currentOpacity,
      }));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [startRect, onComplete]);

  return (
    <div style={styles}>
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white ring-2 ring-white/30"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(99, 102, 241, 0.9))',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.4), 0 4px 10px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );
}
