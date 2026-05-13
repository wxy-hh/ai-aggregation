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
