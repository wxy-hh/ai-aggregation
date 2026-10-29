/** 桌面右栏工作台宽度偏好（ADR-0037 §1：存本地，480px 至约 60% 视口） */

/** 本地偏好存储键 */
export const WORKSPACE_WIDTH_STORAGE_KEY = 'artifact-workspace-width';
/** 宽度下限（px） */
export const WORKSPACE_MIN_WIDTH = 480;
/** 宽度上限占视口宽度的比例 */
export const WORKSPACE_MAX_RATIO = 0.6;

/** 视口宽度对应的上限（px）；视口过窄导致上限低于下限时以下限为准 */
export function getWorkspaceMaxWidth(viewportWidth: number): number {
  return Math.max(WORKSPACE_MIN_WIDTH, Math.floor(viewportWidth * WORKSPACE_MAX_RATIO));
}

/** 把宽度钳制到 [480, 视口 60%] */
export function clampWorkspaceWidth(width: number, viewportWidth: number): number {
  return Math.min(getWorkspaceMaxWidth(viewportWidth), Math.max(WORKSPACE_MIN_WIDTH, Math.round(width)));
}

/** 无偏好时的默认宽度：与改造前的响应式断点一致（lg 480 / xl 540 / 2xl 600） */
export function getDefaultWorkspaceWidth(viewportWidth: number): number {
  if (viewportWidth >= 1536) return 600;
  if (viewportWidth >= 1280) return 540;
  return WORKSPACE_MIN_WIDTH;
}

/** 读取本地偏好；缺失、非数字、非正数或存储不可用时返回 null（调用方回退默认宽度） */
export function readStoredWorkspaceWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_WIDTH_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** 写入本地偏好；存储不可用（隐私模式、配额）时静默忽略，本次会话仍生效 */
export function writeStoredWorkspaceWidth(width: number): void {
  try {
    window.localStorage.setItem(WORKSPACE_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // 偏好丢失不影响功能
  }
}
