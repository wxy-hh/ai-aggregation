/**
 * 页面材质与浮层共享样式常量
 *
 * 抽出的原因：个人中心与「我的工具」工作台要用同一套容器材质与弹窗遮罩，
 * 常量留在个人中心组件里会迫使新页面跨路由 import 个人中心组件，
 * 把个人中心主体拉进新页面首屏分包。
 *
 * 材质分级对齐 DESIGN.md：
 * - 玻璃质感只保留在容器层，内层元素一律不用 backdrop-blur，避免「玻璃套玻璃」发糊。
 * - 阴影即 Z 轴高度：主卡 Z-3、次级操作卡 Z-2、页头扁平无阴影。
 */

/**
 * 主容器卡：玻璃质感（G-3），用于基本信息卡、资源消耗卡、工具与 MCP 板块卡
 *
 * 取值对齐 DESIGN.md §4.1 的 G-3 档：`from-white/60 via-white/20 to-transparent` +
 * `backdrop-blur-2xl` + `backdrop-saturate-150`（玻璃公式 = blur + saturate(150%)，
 * 只 blur 不 saturate 会把底色压成白板），并带顶部 1px 捕光线。
 * 页面底色需另配环境光斑，保证玻璃面后方「有色可磨」（同 §4.1「折射内容统一」）。
 */
export const GLASS_CARD =
  'group relative overflow-hidden rounded-[24px] border border-white/60 bg-gradient-to-b from-white/60 via-white/20 to-transparent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] backdrop-blur-2xl backdrop-saturate-150 transition-[box-shadow,border-color] duration-300 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,0.4)] dark:hover:border-white/20 dark:hover:shadow-[0_24px_48px_-18px_rgba(0,0,0,0.5)]';

/** 次级操作卡：实体高对比（Z-2），用于邮箱绑定、安全退出、危险区域等操作卡 */
export const SOLID_CARD =
  'group relative overflow-hidden rounded-[24px] border border-slate-900/[0.06] bg-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/15';

/** 描边操作按钮：次级操作的统一形态（高 44px，满足移动端触控热区） */
export const OUTLINE_BUTTON =
  'h-11 w-full rounded-xl border-slate-200/90 bg-white text-sm font-semibold text-[#475569] shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10';

/** 发丝分隔线 */
export const HAIRLINE = 'border-slate-900/[0.06] dark:border-white/[0.08]';

/** 弹窗遮罩：统一压暗与背景模糊 */
export const DIALOG_OVERLAY = 'bg-slate-950/45 backdrop-blur-md dark:bg-slate-950/65';
