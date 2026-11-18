import {
  incrementFaqHitCount,
  listActiveKnowledgeBasesForFaq,
  searchFaqsDense,
  validateKnowledgeBaseForFaq,
} from '@repo/db';
import { embedText } from '@repo/text';
import {
  createKnowledgeFaqMatchPolicy,
  type KnowledgeFaqPolicyDeps,
} from './faq-match-policy';

const defaultDeps: KnowledgeFaqPolicyDeps = {
  findActiveKnowledgeBases: listActiveKnowledgeBasesForFaq,
  validateKnowledgeBase: validateKnowledgeBaseForFaq,
  embedQuery: embedText,
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
