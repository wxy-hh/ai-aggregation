/**
 * FAQ 前置精准短路调度与流构造器 (ADR-0027)
 */

import { encodeSseEvent } from './sse';
import { prisma, findBestFaqMatch, incrementFaqHitCount } from '@repo/db';
import { embedFaqText } from '@/lib/rag/faq-service';

/**
 * 检查当前用户提问是否可触发 FAQ 前置精准短路 (Cosine >= 0.92)
 */
export async function checkFaqShortCircuit(params: {
  userId: string;
  query: string;
  knowledgeBaseId?: string;
}): Promise<{ question: string; answer: string; faqId: string } | null> {
  const { userId, query, knowledgeBaseId } = params;
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 500) {
    return null;
  }

  try {
    let targetKbIds: string[] = [];
    if (knowledgeBaseId && knowledgeBaseId.trim()) {
      targetKbIds = [knowledgeBaseId.trim()];
    } else {
      // 默认查询用户最近活跃的知识库（最多 3 个）
      const kbs = await prisma.knowledgeBase.findMany({
        where: { userId, status: 'active' },
        select: { id: true },
        take: 3,
        orderBy: { updatedAt: 'desc' },
      });
      targetKbIds = kbs.map((k) => k.id);
    }

    if (targetKbIds.length === 0) {
      return null;
    }

    const match = await findBestFaqMatch({
      userId,
      knowledgeBaseIds: targetKbIds,
      query: trimmed,
      embedFn: embedFaqText,
    });

    if (match && match.isShortCircuit) {
      // 异步记录命中次数
      try {
        Promise.resolve(incrementFaqHitCount(match.faqId)).catch(() => {});
      } catch {
        // 忽略异步递增异常
      }
      return {
        question: match.question,
        answer: match.answer,
        faqId: match.faqId,
      };
    }
  } catch (err) {
    console.warn('[faq-short-circuit] 前置短路判定降级:', err);
  }

  return null;
}

/**
 * 构造 FAQ 短路的极速直出流
 */
export function createFaqShortCircuitStream(faq: { question: string; answer: string }): ReadableStream<Uint8Array> {
  const text = `💡 **官方标准口径答复**\n\n${faq.answer}`;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSseEvent({ type: 'text-delta', text }));
      controller.enqueue(encodeSseEvent({ type: 'done' }));
      controller.close();
    },
  });
}
