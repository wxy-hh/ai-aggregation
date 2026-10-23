/**
 * Unified History Types
 * 统一的历史记录类型定义
 */

import type { DerivationMetadata, ToolCallRecord } from '@repo/shared';

export type HistoryType = 'chat' | 'voice' | 'image' | 'video' | 'destiny' | 'agent';

export type DestinySubType = 'bazi' | 'ziwei' | 'qimen' | 'astrology' | 'bazi-compatibility';

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
    /** agent 工具调用记录（可选；旧历史数据无此字段，向后兼容） */
    toolCalls?: ToolCallRecord[];
    /**
     * agent 工具产出附件（可选，仅 id 以 tool- 开头的产出物，体积小）；
     * 用户上传附件是 base64 dataURL，刻意不入历史，避免撑爆 localStorage
     */
    attachments?: Array<{
      id: string;
      type: 'image' | 'file';
      name: string;
      imageUrl?: string;
      status: string;
    }>;
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
  profileSummary?: {
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

export interface AgentHistoryItem extends BaseHistoryItem {
  type: 'agent';
  preview: string;
  goalText?: string;
  steps?: number;
  outcome?: string;
  durationMs?: number;
}

export type HistoryItem =
  | ChatHistoryItem
  | VoiceHistoryItem
  | ImageHistoryItem
  | VideoHistoryItem
  | DestinyHistoryItem
  | AgentHistoryItem;

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
  agent?: number;
}
