/**
 * astrology-scroll.ts —— 星座寰宇 · 滚动复位（结果页与仪式页共用）
 *
 * 为什么需要：移动端 destiny 页是文档级滚动，桌面端工作区是局部容器（.custom-scrollbar）滚动；
 * 表单页滚到底提交后 scrollTop 会残留，把仪式摘要行与结果首屏顶出视口，两处都要回到 0。
 * 逻辑原先在 result-view 与 ritual 各写一份，重复即分叉风险，收敛到这里。
 */
export function resetAstrologyScroll() {
  window.scrollTo(0, 0);
  // 工作区局部滚动容器不会跟着文档级复位走，需逐个归零
  document.querySelectorAll('.custom-scrollbar').forEach((container) => {
    container.scrollTop = 0;
  });
}
