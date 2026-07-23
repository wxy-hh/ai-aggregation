const PRODUCTION_DEFAULT_TIMEOUT_MS = 8_000;
const DEVELOPMENT_DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

/**
 * 简历 AI 在本地开发环境保留更长的验收窗口，生产环境继续保留平台超时余量。
 * 可通过环境变量覆盖，避免把单一部署平台的限制写死到所有运行环境。
 */
export function getResumeAiTimeoutMs(): number {
  const configuredValue = process.env.RESUME_AI_TIMEOUT_MS?.trim();
  const configured = configuredValue ? Number(configuredValue) : Number.NaN;
  if (Number.isFinite(configured)) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.floor(configured)));
  }

  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_DEFAULT_TIMEOUT_MS
    : DEVELOPMENT_DEFAULT_TIMEOUT_MS;
}
