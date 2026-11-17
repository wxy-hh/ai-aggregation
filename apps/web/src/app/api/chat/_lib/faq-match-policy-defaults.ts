import {
  incrementFaqHitCount,
  listActiveKnowledgeBasesForFaq,
  searchFaqsDense,
  validateKnowledgeBaseForFaq,
} from '@repo/db';
import { embedFaqText } from '@/lib/rag/faq-service';
import {
  createKnowledgeFaqMatchPolicy,
  type KnowledgeFaqPolicyDeps,
} from './faq-match-policy';

const defaultDeps: KnowledgeFaqPolicyDeps = {
  findActiveKnowledgeBases: listActiveKnowledgeBasesForFaq,
  validateKnowledgeBase: validateKnowledgeBaseForFaq,
  embedQuery: embedFaqText,
  findCandidates: async ({ userId, knowledgeBaseIds, queryVector, limit }) =>
    searchFaqsDense({
      userId,
      knowledgeBaseIds,
      queryVector,
      topK: limit,
    }),
  incrementHitCount: incrementFaqHitCount,
  warn: (message, error) => console.warn(message, error),
};

export const knowledgeFaqMatchPolicy = createKnowledgeFaqMatchPolicy(defaultDeps);
