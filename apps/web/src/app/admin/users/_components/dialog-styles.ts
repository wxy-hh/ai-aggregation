/** 共享对话覆层样式 —— 三个管理弹窗通用 */
export const DIALOG_OVERLAY_CLASSES =
  'bg-[rgba(222,230,246,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.72)]';

/**
 * 玻璃质感 DialogContent 基础样式（编辑/创建弹窗，最大宽 640px，最大高 820px）
 *
 * 与 `DELETE_DIALOG_CONTENT_CLASSES` 的唯一区别在于 max-h 和 max-w。
 */
export const EDIT_DIALOG_CONTENT_CLASSES =
  'flex max-h-[min(88vh,820px)] w-[calc(100vw-1rem)] max-w-[640px] flex-col gap-0 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.48),transparent)] p-3 shadow-[0_20px_56px_-16px_rgba(59,130,246,0.14)] backdrop-blur-[24px] sm:rounded-[28px] sm:p-6 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))]';

/**
 * 玻璃质感 DialogContent 基础样式（删除弹窗，最大宽 480px，最大高 480px）
 */
export const DELETE_DIALOG_CONTENT_CLASSES =
  'flex max-h-[min(88vh,480px)] w-[calc(100vw-1rem)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.48),transparent)] p-3 shadow-[0_20px_56px_-16px_rgba(59,130,246,0.14)] backdrop-blur-[24px] sm:rounded-[28px] sm:p-6 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))]';

/** 管理弹窗输入框外层样式：保留与 `/home` 同级的浅玻璃边界和聚焦反馈 */
export const ADMIN_FIELD_SHELL_CLASSES =
  'group relative flex min-h-[44px] w-full items-center rounded-[12px] border border-[rgba(255,255,255,0.72)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_20px_rgba(76,95,154,0.08)] transition-[box-shadow,border-color,background-color] duration-200 focus-within:border-[#BFDBFE] focus-within:bg-white focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.20),inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(76,95,154,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.62))] dark:focus-within:border-[#3B82F6]/40 dark:focus-within:bg-slate-900/80';

/** 管理弹窗输入框文本样式 */
export const ADMIN_FIELD_INPUT_CLASSES =
  'h-[44px] w-full min-w-0 bg-transparent px-4 text-[14px] text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500';

/** 带左图标输入框的文本样式 */
export const ADMIN_FIELD_INPUT_WITH_ICON_CLASSES =
  'h-[44px] w-full min-w-0 bg-transparent pl-10 pr-4 text-[14px] text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500';

/** 管理弹窗输入图标样式 */
export const ADMIN_FIELD_ICON_CLASSES =
  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within:text-[#3C6DF3] dark:group-focus-within:text-[#A8BAFF]';
