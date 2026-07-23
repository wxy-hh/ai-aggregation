// 紫微结果页主题解析：用户偏好优先，缺省跟随系统明暗
// 夜幕即紫微的暗色表达——暗色系统默认夜幕，亮色系统默认白昼

export type ZiweiThemePref = 'day' | 'night' | null;
export type ZiweiResolvedTheme = 'day' | 'night';

/** 解析紫微结果页主题：手动偏好 > 跟随系统（暗→夜幕 / 亮→白昼） */
export function resolveZiweiTheme(
  pref: ZiweiThemePref,
  systemResolved: 'light' | 'dark'
): ZiweiResolvedTheme {
  return pref ?? (systemResolved === 'dark' ? 'night' : 'day');
}
