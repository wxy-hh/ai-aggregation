// 星座寰宇结果页「夜幕观星」主题解析
//
// 与紫微的关键差异（为什么不是 pref ?? 跟随全局）：
// 本页的夜幕靠「容器嵌套 dark 类」翻转 Tailwind dark: 样式实现，而 dark: 是祖先级联——
// 全局暗色时 <html> 自带 .dark，页面内任何容器都无法「撤销」它，白昼视图在全局暗色下
// 无法交付。因此契约定为：全局暗 → 恒夜幕（且为 .astrology-night 增强版夜幕）；
// 手动偏好只在全局亮时生效（夜幕观星是亮全局下的沉浸开关）

export type AstrologyNightPref = 'day' | 'night' | null;
export type AstrologyNightResolved = 'day' | 'night';

/** 解析星座寰宇结果页主题：全局暗 → 恒夜幕；全局亮 → 手动偏好优先，缺省白昼 */
export function resolveAstrologyNightTheme(
  pref: AstrologyNightPref,
  systemResolved: 'light' | 'dark'
): AstrologyNightResolved {
  if (systemResolved === 'dark') return 'night';
  return pref ?? 'day';
}
