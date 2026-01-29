'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Settings, X, Check, Clock, FileText } from 'lucide-react';
import { ThemeToggle } from '../theme/theme-toggle';
import { useState, useRef, useEffect } from 'react';
import { AppsModal, APP_CONFIGS, type AppId } from './apps-modal';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { createPortal } from 'react-dom';

export function GlobalSidebar() {
  const pathname = usePathname();
  const [showAppsModal, setShowAppsModal] = useState(false);
  const [pinnedApps, setPinnedApps] = useState<AppId[]>(['chat', 'voice', 'image']);
  const [flyingIcons, setFlyingIcons] = useState<{ id: AppId; startRect: DOMRect; icon: any }[]>(
    []
  );
  // Store the ref of the newly added item to measure target position
  const newItemRef = useRef<HTMLAnchorElement>(null);
  const [justAddedApp, setJustAddedApp] = useState<AppId | null>(null);
  const [showToast, setShowToast] = useState(false);

  const [landingApp, setLandingApp] = useState<AppId | null>(null);

  // Simple route matching
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleTogglePin = (id: AppId, startRect?: DOMRect) => {
    // If removing
    if (pinnedApps.includes(id)) {
      setPinnedApps((prev) => prev.filter((appId) => appId !== id));
      return;
    }

    // If adding
    if (startRect) {
      const appConfig = APP_CONFIGS.find((a) => a.id === id);

      // Serialize DOMRect to plain object to avoid state issues
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

      // Trigger Flying Icon
      setFlyingIcons((prev) => [...prev, { id, startRect: plainRect, icon: appConfig?.icon }]);

      // IMPORTANT: Backup timer to clear flying icon if animation hangs
      setTimeout(() => {
        setFlyingIcons((prev) => prev.filter((item) => item.id !== id));
      }, 2000);

      // Delay adding to list slightly to sync with flight?
      // User asked for "elastic response... making space".
      // We can add it immediately but styled invisible, or wait a bit.
      // Let's wait 100ms (just to start flight) to make space
      setTimeout(() => {
        setPinnedApps((prev) => [...prev, id]);
        setJustAddedApp(id);
      }, 100);
    } else {
      // Fallback if no rect
      setPinnedApps((prev) => [...prev, id]);
    }
  };

  const handleFlightComplete = (id: AppId) => {
    setFlyingIcons((prev) => prev.filter((item) => item.id !== id));
    // Trigger "Landing" effects (glow, toast)
    setJustAddedApp(null); // Clear "just added" state (which might be hiding the real icon)
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    // Set landing state for wave effect
    setLandingApp(id);
    setTimeout(() => setLandingApp(null), 2000); // Stop wave after 2s
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

        {/* Dynamic Nav Items */}
        <nav className="flex-1 w-full flex flex-col gap-3 px-3 overflow-y-auto overflow-x-visible no-scrollbar relative z-10 pt-2">
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
                    {/* Active Indicator */}
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 h-10 bg-blue-500 rounded-r-full" />
                    )}

                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 relative',
                        active
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-105'
                          : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105 active:scale-95'
                        // Landing Glow Effect (when flight completes and isJustAdded becomes false, we could trigger a class animation, but simpler to rely on css animation keyframes if needed)
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

          {/* Add Button */}
          <motion.button
            layout
            onClick={() => setShowAppsModal(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-blue-500 dark:hover:text-blue-400 hover:scale-105 active:scale-95 transition-all duration-300 group mt-2 mx-auto"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </motion.button>
        </nav>

        {/* Bottom Icons */}
        <div className="flex flex-col items-center gap-3 mt-auto w-full px-3 pt-4 pb-6 relative z-20 bg-slate-50 dark:bg-slate-900">
          {/* History */}
          <Link
            href="/history"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Clock className="w-5 h-5" />
          </Link>

          {/* Theme Toggle */}
          <ThemeToggle className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300" />

          {/* Settings */}
          <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-sm text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 hover:text-slate-600 dark:hover:text-slate-200 hover:scale-105 active:scale-95 transition-all duration-300">
            <Settings className="w-5 h-5" />
          </button>

          {/* User Avatar */}
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

      {/* Toast Notification - Fixed to top center */}
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
        onClose={() => setShowAppsModal(false)}
        pinnedApps={pinnedApps}
        onTogglePin={handleTogglePin}
      />

      {/* Flying Icons Portal */}
      {flyingIcons.map((flight) => (
        <FlyingIcon
          key={flight.id}
          startRect={flight.startRect}
          icon={flight.icon}
          targetSelector="#sidebar-bottom-marker" /* We can try to target a specific element, or use fixed coords */
          onComplete={() => handleFlightComplete(flight.id)}
        />
      ))}
    </>
  );
}

// Flying Icon Component
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

  // Don't render on server or if Icon is undefined
  if (!isMounted || !Icon) {
    // Still call onComplete after a delay to not block the flow
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

  // Calculate target position
  const targetX = 20; // Center of 80px sidebar, minus half of icon width
  const targetY = 200; // Approximate Y position in sidebar

  // Calculate the arc peak (highest point of parabola)
  const peakY = Math.min(startRect.top, targetY) - 120; // Go up 120px from the higher point

  useEffect(() => {
    // Start flying immediately
    requestAnimationFrame(() => {
      setAnimationState('flying');
    });

    // Complete after animation duration
    const timer = setTimeout(() => {
      setAnimationState('done');
      onComplete();
    }, 700); // Slightly longer for parabola effect

    return () => clearTimeout(timer);
  }, [onComplete]);

  // Calculate intermediate styles for the parabolic path
  const getStyles = () => {
    if (animationState === 'initial') {
      return {
        left: startRect.left,
        top: startRect.top,
        opacity: 0.9,
        scale: 1,
      };
    }
    // Flying state - target position
    return {
      left: targetX,
      top: targetY,
      opacity: 0,
      scale: 0.5,
    };
  };

  const styles = getStyles();

  // Use CSS custom properties for the animation
  const cssVars = {
    '--start-x': `${startRect.left}px`,
    '--start-y': `${startRect.top}px`,
    '--peak-y': `${peakY}px`,
    '--end-x': `${targetX}px`,
    '--end-y': `${targetY}px`,
  } as React.CSSProperties;

  return (
    <>
      {/* Inject keyframes */}
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

// Easing function for smooth animation
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
    const duration = 1500; // Slow down to 1.5s for longer visibility

    // Target configuration
    const targetX = 20;
    const targetY = 200;

    // Parabola configuration
    const distanceX = Math.abs(startRect.left - targetX);
    // Increase amplitude for a more dramatic arc
    const amplitude = Math.min(400, Math.max(200, distanceX * 0.4));

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      const t = easeInOutCubic(progress);

      // Linear interpolation
      const currentX = startRect.left + (targetX - startRect.left) * t;
      const baseY = startRect.top + (targetY - startRect.top) * t;

      // Arc
      const arcY = -amplitude * Math.sin(progress * Math.PI);
      const currentY = baseY + arcY;

      // Effects
      const currentScale = 1 - 0.5 * t; // Ends at 0.5
      // Keep opacity full until the last 15% of flight
      const currentOpacity = progress > 0.85 ? 1 - (progress - 0.85) * 6.6 : 1;
      const rotation = -60 * Math.sin(progress * Math.PI); // More rotation

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
