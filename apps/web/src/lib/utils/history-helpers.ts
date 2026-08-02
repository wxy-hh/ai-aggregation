/**
 * History Helper Functions
 * 历史记录辅助函数
 */

import { ChatHistoryItem, VoiceHistoryItem, ImageHistoryItem, VideoHistoryItem, DestinyHistoryItem, DestinySubType } from '@/types/history';
import { generateUUID } from '@/lib/utils/uuid';
import type { ComparisonTurn, SelectedModel } from '@/types/comparison';
import type { DerivationMetadata } from '@repo/shared';

/**
 * Format relative time
 * 对无效输入做兜底：匿名/本地数据可能缺 updatedAt，避免抛 TypeError
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '未知时间';
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return '未知时间';
  }
  const diffMs = now.getTime() - targetDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;

  return targetDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate preview text from messages
 */
export function generateChatPreview(messages: Array<{ role: string; content: string }>): string {
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  if (lastAssistantMessage) {
    const content = lastAssistantMessage.content.trim();
    return content.length > 150 ? content.slice(0, 150) + '...' : content;
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUserMessage) {
    const content = lastUserMessage.content.trim();
    return content.length > 150 ? content.slice(0, 150) + '...' : content;
  }

  return '新对话';
}

/**
 * Generate title from messages
 */
export function generateChatTitle(messages: Array<{ role: string; content: string }>): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim();
    return content.length > 50 ? content.slice(0, 50) + '...' : content;
  }
  return '新对话';
}

/**
 * Extract tags from chat messages
 */
export function extractChatTags(messages: Array<{ role: string; content: string }>): string[] {
  const tags: string[] = [];
  const content = messages
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();

  // Simple keyword-based tagging
  if (content.includes('代码') || content.includes('编程') || content.includes('code')) {
    tags.push('编程');
  }
  if (content.includes('设计') || content.includes('ui') || content.includes('ux')) {
    tags.push('设计');
  }
  if (content.includes('营销') || content.includes('市场')) {
    tags.push('营销');
  }
  if (content.includes('产品') || content.includes('功能')) {
    tags.push('产品');
  }
  if (content.includes('邮件') || content.includes('email')) {
    tags.push('邮件');
  }

  return tags.slice(0, 3); // Limit to 3 tags
}

/**
 * Create chat history item
 */
export function createChatHistoryItem(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  provider: string,
  model: string
): Omit<ChatHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date();
  return {
    type: 'chat',
    title: generateChatTitle(messages),
    preview: generateChatPreview(messages),
    date: formatRelativeTime(now),
    model,
    provider,
    messages,
    tags: extractChatTags(messages),
  };
}

/**
 * Create comparison (multi-model) history item
 * 比较会话历史记录：以单条记录呈现，conversationId 用于回 /chat 重新载入
 */
export function createComparisonHistoryItem(
  conversationId: string,
  turns: ComparisonTurn[],
  selectedModels: SelectedModel[]
): Omit<ChatHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date();
  const firstPrompt = turns[0]?.prompt ?? '比较对话';
  const lastTurn = turns[turns.length - 1];
  // 取最后一个已完成模型的回答作为预览
  const lastContent = lastTurn
    ? (Object.values(lastTurn.runs).find((r) => r.content)?.content ?? '')
    : '';
  const preview = lastContent
    ? lastContent.length > 150 ? lastContent.slice(0, 150) + '...' : lastContent
    : '比较对话';

  return {
    type: 'chat',
    title: firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt,
    preview,
    date: formatRelativeTime(now),
    model: `${selectedModels.length} 模型对比`,
    provider: 'compare',
    messages: turns.map((t) => ({ role: 'user' as const, content: t.prompt })),
    tags: ['多模型对比'],
    mode: 'compare',
    conversationId,
  };
}

/**
 * Create voice history item
 */
export function createVoiceHistoryItem(
  fileName: string,
  fileSize: number,
  duration: string,
  transcription: string,
  model: string
): Omit<VoiceHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date();
  const preview = transcription.length > 150 ? transcription.slice(0, 150) + '...' : transcription;
  const title = transcription.split(/[。！？\n]/)[0].slice(0, 50) || fileName;

  return {
    type: 'voice',
    title,
    preview,
    date: formatRelativeTime(now),
    duration,
    model,
    fileName,
    fileSize,
    transcription,
  };
}

/**
 * Create image history item
 */
export function createImageHistoryItem(
  prompt: string,
  imageUrl: string,
  model: string,
  options?: {
    negativePrompt?: string;
    style?: string;
    aspectRatio?: string;
    parameters?: Record<string, any>;
  }
): Omit<ImageHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date();
  const preview = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
  const title = prompt.split(/[,，。]/)[0].slice(0, 30) || '生成图片';

  return {
    type: 'image',
    title,
    preview,
    date: formatRelativeTime(now),
    model,
    imageUrl,
    prompt,
    negativePrompt: options?.negativePrompt,
    style: options?.style,
    aspectRatio: options?.aspectRatio,
    parameters: options?.parameters,
  };
}

/**
 * 创建视频历史记录项（REQ-013；成功生成后写入，含接力派生元数据）
 */
export function createVideoHistoryItem(
  prompt: string,
  videoUrl: string,
  model: string,
  options?: {
    referenceImage?: string;
    aspectRatio?: string;
    parameters?: Record<string, any>;
    derivation?: DerivationMetadata;
  }
): Omit<VideoHistoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date();
  const preview = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
  const title = prompt.split(/[,，。]/)[0].slice(0, 30) || '生成视频';

  return {
    type: 'video',
    title,
    preview,
    date: formatRelativeTime(now),
    model,
    videoUrl,
    prompt,
    referenceImage: options?.referenceImage,
    aspectRatio: options?.aspectRatio,
    parameters: options?.parameters,
    ...(options?.derivation ?? {}),
  };
}

/**
 * 创建命理历史记录项（返回完整对象，包含 id 和时间戳）
 * @param id - 可选的外部 ID，用于防止重复保存；不传则生成新 UUID
 */
export function createDestinyHistoryItem(
  subType: DestinySubType,
  formData: Record<string, unknown>,
  reportData: Record<string, unknown> | null,
  model: string,
  options?: {
    title?: string;
    preview?: string;
    coreTone?: string;
    id?: string;
    derivation?: DerivationMetadata;
  }
): DestinyHistoryItem {
  const now = new Date();
  const id = options?.id || generateUUID();
  const timestamp = now.toISOString();

  // 根据不同命理类型提取人物概要信息
  let name = '未知';
  let genderLabel = '未知';
  let birthDateText = '未知';

  if (subType === 'qimen') {
    const qf = formData as { datetime?: string; location?: { name?: string }; description?: string };
    name = qf.location?.name || '奇门遁甲';
    genderLabel = '';
    birthDateText = qf.datetime
      ? new Date(qf.datetime).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '未知';
  } else if (subType === 'bazi-compatibility') {
    const cf = formData as {
      self?: { name?: string };
      partner?: {
        name?: string;
        birthDate?: { year: number; month: number; day: number };
        gender?: string | null;
      };
      relationType?: string;
    };
    const partnerName = cf.partner?.name?.trim() || 'TA';
    const selfName = cf.self?.name?.trim() || '我';
    name = `${selfName} × ${partnerName}`;
    const birthDate = cf.partner?.birthDate;
    birthDateText = birthDate
      ? `${birthDate.year}年${birthDate.month}月${birthDate.day}日`
      : '未知';
    const g = cf.partner?.gender;
    genderLabel = g === 'male' ? '男' : g === 'female' ? '女' : '合盘';
  } else {
    name = (formData as { name?: string }).name || '未知';
    const birthDate =
      (formData as { birthDate?: { year: number; month: number; day: number } }).birthDate;
    birthDateText = birthDate
      ? `${birthDate.year}年${birthDate.month}月${birthDate.day}日`
      : '未知';
    const gender = (formData as { gender?: string }).gender || 'male';
    genderLabel = gender === 'male' ? '男' : '女';
  }

  const subTypeLabel =
    subType === 'bazi'
      ? '八字'
      : subType === 'ziwei'
        ? '紫微斗数'
        : subType === 'bazi-compatibility'
          ? '八字合盘'
          : '奇门遁甲';
  const title =
    options?.title ||
    (subType === 'bazi-compatibility'
      ? `${name} · 合盘`
      : `${name}的${subTypeLabel}命理报告`);
  const preview =
    options?.preview ||
    (subType === 'bazi-compatibility'
      ? '八字合盘关系观察'
      : name !== '未知'
        ? `姓名：${name}，出生：${birthDateText}`
        : `起局时间：${birthDateText}`);
  const coreTone = options?.coreTone || (subType === 'bazi-compatibility' ? '八字合盘' : '命理分析');

  return {
    id,
    type: 'destiny',
    subType,
    title,
    preview,
    date: formatRelativeTime(now),
    createdAt: timestamp,
    updatedAt: timestamp,
    model,
    formData,
    reportData,
    profileSummary: {
      name,
      gender: genderLabel,
      birthDate: birthDateText,
    },
    coreTone,
    // 接力派生元数据（REQ-013/016「由某来源接力生成」）
    ...(options?.derivation ?? {}),
  };
}
