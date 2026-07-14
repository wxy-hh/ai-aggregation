/**
 * 共享模型目录（从 app/chat/page.tsx 抽出，供单聊与比较模式共同使用）
 *
 * 讯飞星火与豆包各自的 lite / pro / max 等变体都算作一个可独立对比的模型。
 */

import type { ModelCatalogItem } from '@/types/comparison';

// 并行对比允许的最少 / 最多模型数
export const MIN_COMPARE_MODELS = 2;
export const MAX_COMPARE_MODELS = 4;

// 全部可选模型变体：讯飞星火 3 个 + 豆包 2 个
export const CHAT_MODEL_CATALOG: ModelCatalogItem[] = [
  { provider: 'xunfei', providerLabel: '讯飞星火', model: 'lite', label: 'Spark Lite（免费）' },
  { provider: 'xunfei', providerLabel: '讯飞星火', model: 'generalv3.5', label: 'Spark Max' },
  { provider: 'xunfei', providerLabel: '讯飞星火', model: '4.0Ultra', label: 'Spark 4.0 Ultra' },
  {
    provider: 'doubao',
    providerLabel: '豆包',
    model: 'doubao-seed-2-0-lite-260428',
    label: 'Doubao Lite（轻量级）',
  },
  {
    provider: 'doubao',
    providerLabel: '豆包',
    model: 'doubao-seed-2-0-pro-260215',
    label: 'Doubao Pro（专业级）',
  },
];

// 默认比较组合：讯飞 lite + 豆包 lite（modelKey 形式）
export const DEFAULT_COMPARE_MODEL_KEYS = ['xunfei:lite', 'doubao:doubao-seed-2-0-lite-260428'];
