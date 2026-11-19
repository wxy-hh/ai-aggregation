/**
 * FAQ 前置精准短路调度与流构造器 (ADR-0027)
 */

import { encodeSseEvent } from './sse';
import { knowledgeFaqMatchPolicy } from './faq-match-policy-defaults';

/**
 * 检查当前用户提问是否可触发 FAQ 前置精准短路 (Cosine >= 0.92)
 */
export async function checkFaqShortCircuit(params: {
  userId: string;
  query: string;
  knowledgeBaseId?: string;
  hasCurrentAttachments?: boolean;
}): Promise<{ question: string; answer: string; faqId: string } | null> {
  const decision = await knowledgeFaqMatchPolicy.match({
    userId: params.userId,
    query: params.query,
    scene: 'chat-short-circuit',
    knowledgeBaseId: params.knowledgeBaseId,
    hasCurrentAttachments: params.hasCurrentAttachments,
  });

  if (decision.kind !== 'short-circuit') return null;

  return {
    question: decision.faq.question,
    answer: decision.faq.answer,
    faqId: decision.faq.faqId,
  };
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
