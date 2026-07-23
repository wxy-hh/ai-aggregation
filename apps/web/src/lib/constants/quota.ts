/**
 * 匿名用户免费额度配置。
 *
 * 该常量用于：
 * - 服务端创建匿名用户时的默认 token 数
 * - 前端额度耗尽弹框文案
 *
 * 后续若调整免费额度或改为按活动动态配置，只需修改此处。
 */
export const ANONYMOUS_FREE_TOKENS = 10000;

/** 注册用户的默认额度。 */
export const REGISTERED_FREE_TOKENS = 20000;
