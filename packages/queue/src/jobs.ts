import type { QimenAnalyzeRequest, QimenSectionKey, TaskType } from '@repo/shared';

export interface STTJobData {
  taskId: string;
  userId: string;
  audioUrl: string;
  language?: string;
}

export interface PPTJobData {
  taskId: string;
  userId: string;
  content: string;
  template?: string;
}

export interface ImageJobData {
  taskId: string;
  userId: string;
  prompt: string;
  size?: string;
  style?: string;
}

export interface QimenBaseJobData {
  analysisId: string;
  userId?: string;
  input: QimenAnalyzeRequest;
  precomputedChart?: boolean;
  provider?: 'doubao' | 'deepseek';
}

export interface QimenSectionJobData {
  analysisId: string;
  userId?: string;
  /** 非管理员请求的额度幂等键；管理员任务不传该字段。 */
  billingRequestId?: string;
  sectionKey: QimenSectionKey;
  input: QimenAnalyzeRequest;
  provider?: 'doubao' | 'deepseek';
}

/**
 * RAG 知识库文档索引队列任务数据结构
 */
export interface RagIndexJobData {
  documentId: string;
  knowledgeBaseId: string;
  userId: string;
  version: number;
  storageKey: string;
  fileName: string;
}

/**
 * 会话记忆增量索引队列任务数据结构 (工单 09)
 */
export interface MemoryIndexJobData {
  userId: string;
  sessionId: string;
}

// 任务名单一事实源约束：与 shared 的 TaskType 对齐（评审 C3），新增任务类型需两处同步
export const JOB_NAMES = {
  STT: 'stt',
  PPT: 'ppt',
  IMAGE: 'image',
  QIMEN_BASE: 'qimen-base',
  QIMEN_SECTION: 'qimen-section',
  RAG_INDEX: 'rag-index',
  MEMORY_INDEX: 'memory-index',
} as const satisfies Record<string, TaskType>;
