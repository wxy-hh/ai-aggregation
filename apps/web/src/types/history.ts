/**
 * Unified History Types
 * 统一的历史记录类型定义
 */

import type { DerivationMetadata } from '@repo/shared';

export type HistoryType = 'chat' | 'voice' | 'image' | 'video' | 'destiny';

export type DestinySubType = 'bazi' | 'ziwei' | 'qimen' | 'bazi-compatibility';

export interface BaseHistoryItem extends DerivationMetadata {
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
  // 比较会话扩展（单聊时缺省，向后兼容）
  mode?: 'single' | 'compare'; // 会话模式
  conversationId?: string; // 比较会话 id，点击后回 /chat 按 id 载入
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

export interface VideoHistoryItem extends BaseHistoryItem {
  type: 'video';
  preview: string;
  model: string;
  /** 视频地址（可恢复地址，禁 objectURL） */
  videoUrl: string;
  prompt: string;
  /** 参考图（可选） */
  referenceImage?: string;
  durationSec?: number;
  aspectRatio?: string;
  parameters?: Record<string, any>;
}

export type HistoryItem = ChatHistoryItem | VoiceHistoryItem | ImageHistoryItem | VideoHistoryItem | DestinyHistoryItem;

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
  video: number;
  destiny: number;
}
