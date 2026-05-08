import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';
const DEFAULT_BREAKPOINT: Breakpoint = 'mobile';

function getBreakpointFromWidth(width: number): Breakpoint {
  if (width < 768) {
    return 'mobile';
  }

  if (width < 1024) {
    return 'tablet';
  }

  return 'desktop';
}

function getCurrentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') {
    return DEFAULT_BREAKPOINT;
  }

  return getBreakpointFromWidth(window.innerWidth);
}

/**
 * 响应式断点 Hook
 *
 * 统一返回 mobile、tablet、desktop 三种断点，
 * 并在浏览器窗口尺寸变化时自动更新。
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(DEFAULT_BREAKPOINT);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setBreakpoint(getCurrentBreakpoint());
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return breakpoint;
}
