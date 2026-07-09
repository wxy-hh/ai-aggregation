/**
 * 匿名用户免费额度配置。
 *
 * 该常量用于：
 * - 服务端创建匿名用户时的默认 token 数
 * - 前端额度耗尽弹框文案
 *
 * 后续若调整免费额度或改为按活动动态配置，只需修改此处。
 */
export const ANONYMOUS_FREE_TOKENS = 3000;

/**
 * 各 AI 功能对匿名用户的单次调用成本（token 数）。
 * 集中维护便于运营调整，避免分散在多个路由文件中。
 */
export const ANONYMOUS_OPERATION_COSTS = {
  /** 聊天流式接口预扣额度（实际按 usage 结算，失败时退还） */
  CHAT_RESERVE: 500,

  /** 命理 AI 助手 */
  DESTINY_COPILOT: 100,

  /** 奇门分析 */
  DESTINY_QIMEN_ANALYZE: 500,

  /** 图像生成 */
  IMAGE_GENERATE: 100,

  /** 简历诊断 */
  RESUME_DIAGNOSE: 100,

  /** 简历润色 */
  RESUME_POLISH: 100,

  /** 语音转写 */
  VOICE_TRANSCRIBE: 50,
} as const;
