/**
 * Webhook URL 校验收紧层（spec §4.1 / §4.5）
 *
 * 职责：
 * - 复用 url-guard 纯函数层的 validateUrlLiteral，拦截内网 IP、云元数据及危险主机名；
 * - 在其基础上追加 https-only 判定（Webhook 绝不允许明文 http 传输，杜绝凭证和数据泄露）；
 * - 本层为纯函数、无网络 IO，供 CRUD 登记入参校验使用。
 */

import { validateUrlLiteral, type UrlGuardResult } from '@/lib/agent/url-guard';

export type WebhookUrlValidationResult =
  | { ok: true; url: URL; hostname: string }
  | { ok: false; reason: string };

/**
 * 校验用户输入的 Webhook URL：必须合法、为 https 协议且未命中内网/危险主机名字面量黑名单。
 */
export function validateWebhookUrl(raw: string): WebhookUrlValidationResult {
  const result: UrlGuardResult = validateUrlLiteral(raw);
  if (!result.ok) {
    return result;
  }

  if (result.url.protocol !== 'https:') {
    return { ok: false, reason: 'Webhook 网址必须使用 https 协议' };
  }

  return result;
}
