/**
 * 知识库标准问答对 (FAQ) 领域契约与类型定义 (ADR-0027)
 */

export interface KnowledgeFaqQuestionItem {
  id: string;
  faqId: string;
  questionText: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface KnowledgeFaqItem {
  id: string;
  knowledgeBaseId: string;
  userId: string;
  question: string;
  answer: string;
  enabled: boolean;
  hitCount: number;
  similarQuestions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFaqInput {
  question: string;
  answer: string;
  similarQuestions?: string[];
  enabled?: boolean;
}

export interface UpdateFaqInput {
  question?: string;
  answer?: string;
  similarQuestions?: string[];
  enabled?: boolean;
}

export interface FaqImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ line: number; message: string }>;
}
