/**
 * Unified History Types
 * 统一的历史记录类型定义
 */

export type HistoryType = 'chat' | 'voice' | 'image' | 'destiny';

export type DestinySubType = 'bazi' | 'ziwei' | 'qimen';

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

export interface DestinyHistoryItem extends BaseHistoryItem {
  type: 'destiny';
  subType: DestinySubType;
  preview: string;
  model: string;
  formData: Record<string, unknown>;
  reportData: Record<string, unknown> | null;
  profileSummary: {
    name: string;
    gender: string;
    birthDate: string;
  };
  coreTone: string;
}

export type HistoryItem = ChatHistoryItem | VoiceHistoryItem | ImageHistoryItem | DestinyHistoryItem;

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
  destiny: number;
}
