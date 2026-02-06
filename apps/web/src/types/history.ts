/**
 * Unified History Types
 * 统一的历史记录类型定义
 */

export type HistoryType = 'chat' | 'voice' | 'image';

export interface BaseHistoryItem {
  id: string;
  type: HistoryType;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryItem extends BaseHistoryItem {
  type: 'chat';
  preview: string;
  tags?: string[];
  model: string;
  provider: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export interface VoiceHistoryItem extends BaseHistoryItem {
  type: 'voice';
  preview: string;
  duration: string;
  model: string;
  fileName: string;
  fileSize: number;
  transcription: string;
}

export interface ImageHistoryItem extends BaseHistoryItem {
  type: 'image';
  preview: string;
  model: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  aspectRatio?: string;
  parameters?: Record<string, any>;
}

export type HistoryItem = ChatHistoryItem | VoiceHistoryItem | ImageHistoryItem;

export interface HistoryFilter {
  type?: HistoryType | 'all';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface HistoryStats {
  total: number;
  chat: number;
  voice: number;
  image: number;
}
