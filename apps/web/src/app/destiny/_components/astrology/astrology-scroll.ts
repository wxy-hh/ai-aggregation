/**
 * astrology-scroll.ts —— 星座寰宇 · 滚动定位（结果页、仪式页与深读区共用）
 *
 * 为什么需要：移动端 destiny 页是文档级滚动，桌面端工作区是局部容器（.custom-scrollbar）滚动；
 * 只调 window.scrollTo 在桌面端是空操作，必须连同局部容器一起滚动，两处都要覆盖。
 * 逻辑原先在 result-view 与 ritual 各写一份，重复即分叉风险，收敛到这里。
 */

/** 回到顶部：文档级与工作区局部滚动容器同步执行（回顶按钮用平滑，相位切换复位用瞬时） */
export function scrollAstrologyToTop(behavior: ScrollBehavior = 'smooth') {
  window.scrollTo({ top: 0, behavior });
  // 工作区局部滚动容器不会跟着文档级滚动走，需逐个归零
  document.querySelectorAll('.custom-scrollbar').forEach((container) => {
    container.scrollTo({ top: 0, behavior });
  });
}

/** 瞬时复位：表单提交、相位切换等场景，结果首屏必须立刻从顶部呈现 */
export function resetAstrologyScroll() {
  scrollAstrologyToTop('auto');
}
