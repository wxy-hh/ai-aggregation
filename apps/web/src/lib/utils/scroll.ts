/**
 * 滚动元素度量属性接口
 */
export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/**
 * 判断滚动容器是否接近底部
 *
 * @param el 滚动容器元素或包含滚动度量属性的对象，若为空则默认返回 true（允许吸底）
 * @param threshold 距离底部的判定阈值（像素），默认 80px
 * @returns 当距离底部的距离小于或等于阈值时返回 true，否则返回 false
 */
export function isNearBottom(
  el: Pick<ScrollMetrics, 'scrollHeight' | 'scrollTop' | 'clientHeight'> | null | undefined,
  threshold = 80
): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
