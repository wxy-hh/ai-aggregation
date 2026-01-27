export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  sessionId: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}
