/**
 * /api/chat — 流式对话入口
 *
 * 职责：声明路由配置 + 组装适配器。
 * 鉴权、限流、配额、错误处理均在 chat-handler.ts，
 * provider 差异在 adapters/ 目录。
 */

import type { ProviderName } from '@repo/providers';
import { createChatHandler } from './_lib/chat-handler';
import { XunfeiAdapter } from './_lib/adapters/xunfei';
import { DoubaoAdapter } from './_lib/adapters/doubao';
import { GenericAdapter } from './_lib/adapters/generic';
import type { ChatProviderAdapter } from './_lib/types';

export const runtime = 'nodejs';
// 豆包 Evolving 等推理型模型首 token 延迟可达 60s+（实测 13~60s 波动），
// 60s 上限会在推理期截断 SSE 导致"调用成功但无内容"，与 destiny 对齐放宽到 300s。
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function getAdapter(provider: ProviderName): ChatProviderAdapter {
  switch (provider) {
    case 'xunfei':
      return new XunfeiAdapter();
    case 'doubao': {
      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
      if (!arkApiKey) throw new Error('Missing ARK_API_KEY');
      return new DoubaoAdapter(arkApiKey, arkBaseUrl);
    }
    default:
      return new GenericAdapter();
  }
}

export const POST = createChatHandler({ getAdapter });
