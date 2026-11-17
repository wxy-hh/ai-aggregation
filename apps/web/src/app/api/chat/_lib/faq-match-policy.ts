import { RAG_FAQ_CONFIG } from '@repo/shared';

export type KnowledgeFaqMatchScene = 'chat-short-circuit' | 'agent-retrieval' | 'comparison';

export interface FaqKnowledgeBaseFact {
  id: string;
  updatedAt: Date;
  status: 'active' | string;
}

export interface FaqCandidateFact {
  faqId: string;
  knowledgeBaseId: string;
  userId: string;
  question: string;
  answer: string;
  matchedQuestionText: string;
  similarity: number;
  enabled: boolean;
  knowledgeBaseUpdatedAt: Date;
}

export interface KnowledgeFaqMatchInput {
  userId: string;
  query: string;
  scene: KnowledgeFaqMatchScene;
  knowledgeBaseId?: string;
  hasCurrentAttachments?: boolean;
}

export type NoMatchReason =
  | 'scene-ineligible'
  | 'empty-query'
  | 'attachments'
  | 'query-too-long'
  | 'access-denied'
  | 'no-scope'
  | 'no-candidate'
  | 'below-threshold'
  | 'lookup-failed';

export interface KnowledgeFaqMatchFact {
  faqId: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  matchedQuestionText: string;
  similarity: number;
}

export type KnowledgeFaqMatchDecision =
  | { kind: 'short-circuit'; faq: KnowledgeFaqMatchFact }
  | { kind: 'ground-truth'; faq: KnowledgeFaqMatchFact }
  | { kind: 'no-match'; reason: NoMatchReason };

export interface KnowledgeFaqPolicyDeps {
  findActiveKnowledgeBases: (userId: string, limit: number) => Promise<FaqKnowledgeBaseFact[]>;
  validateKnowledgeBase: (userId: string, knowledgeBaseId: string) => Promise<boolean>;
  embedQuery: (query: string) => Promise<number[]>;
  findCandidates: (input: {
    userId: string;
    knowledgeBaseIds: string[];
    queryVector: number[];
    limit: number;
  }) => Promise<FaqCandidateFact[]>;
  incrementHitCount: (faqId: string) => Promise<void>;
  warn: (message: string, error: unknown) => void;
}

const CANDIDATE_LIMIT = 20;

function noMatch(reason: NoMatchReason): KnowledgeFaqMatchDecision {
  return { kind: 'no-match', reason };
}

function compareCandidates(a: FaqCandidateFact, b: FaqCandidateFact): number {
  if (a.similarity !== b.similarity) return b.similarity - a.similarity;
  const timeDiff = b.knowledgeBaseUpdatedAt.getTime() - a.knowledgeBaseUpdatedAt.getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.faqId < b.faqId ? -1 : a.faqId > b.faqId ? 1 : 0;
}

export function createKnowledgeFaqMatchPolicy(deps: KnowledgeFaqPolicyDeps) {
  function adopt(
    decision: Extract<KnowledgeFaqMatchDecision, { kind: 'short-circuit' | 'ground-truth' }>
  ): KnowledgeFaqMatchDecision {
    try {
      void Promise.resolve(deps.incrementHitCount(decision.faq.faqId)).catch(() => {});
    } catch {
      // 计数是尽力而为的辅助副作用，不得改变已作出的匹配决策
    }
    return decision;
  }

  async function match(input: KnowledgeFaqMatchInput): Promise<KnowledgeFaqMatchDecision> {
    if (input.scene === 'comparison') return noMatch('scene-ineligible');

    const trimmed = input.query.trim();
    if (!trimmed) return noMatch('empty-query');

    if (input.scene === 'chat-short-circuit') {
      if (input.hasCurrentAttachments) return noMatch('attachments');
      if (trimmed.length > RAG_FAQ_CONFIG.maxQuestionLength) return noMatch('query-too-long');
    }

    try {
      let knowledgeBaseIds: string[];
      const explicitId = input.knowledgeBaseId?.trim();
      if (explicitId) {
        if (!(await deps.validateKnowledgeBase(input.userId, explicitId))) {
          return noMatch('access-denied');
        }
        knowledgeBaseIds = [explicitId];
      } else {
        const bases = await deps.findActiveKnowledgeBases(input.userId, 3);
        knowledgeBaseIds = bases
          .filter((base) => base.status === 'active')
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 3)
          .map((base) => base.id);
      }

      if (knowledgeBaseIds.length === 0) return noMatch('no-scope');

      const queryVector = await deps.embedQuery(trimmed);
      const allowedBases = new Set(knowledgeBaseIds);
      const candidates = (
        await deps.findCandidates({
          userId: input.userId,
          knowledgeBaseIds,
          queryVector,
          limit: CANDIDATE_LIMIT,
        })
      )
        .filter(
          (candidate) =>
            candidate.userId === input.userId &&
            candidate.enabled &&
            allowedBases.has(candidate.knowledgeBaseId)
        )
        .sort(compareCandidates);

      const best = candidates[0];
      if (!best) return noMatch('no-candidate');

      if (input.scene === 'chat-short-circuit') {
        if (best.similarity < RAG_FAQ_CONFIG.shortCircuitThreshold) {
          return noMatch('below-threshold');
        }
        return adopt({
          kind: 'short-circuit',
          faq: {
            faqId: best.faqId,
            knowledgeBaseId: best.knowledgeBaseId,
            question: best.question,
            answer: best.answer,
            matchedQuestionText: best.matchedQuestionText,
            similarity: best.similarity,
          },
        });
      }

      if (best.similarity < RAG_FAQ_CONFIG.groundTruthThreshold) {
        return noMatch('below-threshold');
      }
      return adopt({
        kind: 'ground-truth',
        faq: {
          faqId: best.faqId,
          knowledgeBaseId: best.knowledgeBaseId,
          question: best.question,
          answer: best.answer,
          matchedQuestionText: best.matchedQuestionText,
          similarity: best.similarity,
        },
      });
    } catch (error) {
      deps.warn('[faq-match-policy] 匹配失败，按无 FAQ 降级', error);
      return noMatch('lookup-failed');
    }
  }

  return { match };
}
