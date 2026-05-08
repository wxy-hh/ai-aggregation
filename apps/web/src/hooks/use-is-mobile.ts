import { useBreakpoint } from './use-breakpoint';

/**
 * 判断当前是否为移动端断点
 */
export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}
