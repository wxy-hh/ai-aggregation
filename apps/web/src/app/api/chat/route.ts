/**
 * /api/chat — 流式对话入口
 *
 * 职责：声明路由配置 + 组装适配器。
 * 鉴权、限流、配额、错误处理均在 chat-handler.ts，
 * provider 差异在 adapters/ 目录。
 */

import type { ProviderName } from '@repo/providers';
import { createChatHandler } from './_lib/chat-handler';
import { createBillingManager, type BillingManager } from './_lib/billing-manager';
import { XunfeiAdapter } from './_lib/adapters/xunfei';
import { DoubaoAdapter } from './_lib/adapters/doubao';
import { GenericAdapter } from './_lib/adapters/generic';
import type { ChatProviderAdapter } from './_lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function getAdapter(provider: ProviderName, billing: BillingManager): ChatProviderAdapter {
  switch (provider) {
    case 'xunfei':
      return new XunfeiAdapter(billing);
    case 'doubao': {
      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
      if (!arkApiKey) throw new Error('Missing ARK_API_KEY');
      return new DoubaoAdapter(billing, arkApiKey, arkBaseUrl);
    }
    default:
      return new GenericAdapter(billing);
  }
}

export const POST = createChatHandler({ getAdapter });
