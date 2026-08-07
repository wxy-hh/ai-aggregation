import type { RelationType } from './types';

export const BAZI_COMPATIBILITY_ENABLED =
  process.env.NEXT_PUBLIC_BAZI_COMPATIBILITY_ENABLED !== 'false';

export const RELATION_OPTIONS: Array<{
  key: RelationType;
  label: string;
  hint: string;
  focusTags: string[];
}> = [
  {
    key: 'romance',
    label: '恋爱',
    hint: '暧昧、恋爱、异地、关系修复',
    focusTags: ['如何靠近', '总是误会', '该如何沟通', '关系下一步'],
  },
  {
    key: 'marriage',
    label: '婚姻',
    hint: '新婚、长期婚姻、共同生活',
    focusTags: ['日常分工', '财务协作', '家庭边界', '共同规划'],
  },
  {
    key: 'friendship',
    label: '朋友',
    hint: '新朋友、老友、闺蜜/兄弟',
    focusTags: ['如何更亲近', '联系节奏', '避免内耗', '修复尴尬'],
  },
  {
    key: 'partnership',
    label: '合作',
    hint: '合伙人、同事、项目伙伴',
    focusTags: ['如何分工', '如何决策', '如何反馈', '风险怎么谈'],
  },
];

export const DIMENSIONS_BY_RELATION: Record<
  RelationType,
  Array<{ key: string; label: string }>
> = {
  romance: [
    { key: 'expression', label: '情感表达' },
    { key: 'pace', label: '沟通节奏' },
    { key: 'intimacy', label: '亲密需求' },
    { key: 'practical', label: '现实协作' },
    { key: 'repair', label: '冲突修复' },
    { key: 'stability', label: '关系稳定感' },
  ],
  marriage: [
    { key: 'bond', label: '情感连接' },
    { key: 'chores', label: '日常分工' },
    { key: 'finance', label: '财务协作' },
    { key: 'boundary', label: '家庭边界' },
    { key: 'repair', label: '冲突修复' },
    { key: 'vision', label: '共同愿景' },
  ],
  friendship: [
    { key: 'trust', label: '信任感' },
    { key: 'contact', label: '联系节奏' },
    { key: 'support', label: '情绪支持' },
    { key: 'interest', label: '共同兴趣' },
    { key: 'boundary', label: '边界与互惠' },
    { key: 'repair', label: '分歧修复' },
  ],
  partnership: [
    { key: 'alignment', label: '目标对齐' },
    { key: 'decision', label: '决策节奏' },
    { key: 'execution', label: '执行推进' },
    { key: 'feedback', label: '反馈方式' },
    { key: 'risk', label: '风险共识' },
    { key: 'credit', label: '利益与信用边界' },
  ],
};

export const RELATION_LABEL: Record<RelationType, string> = {
  romance: '恋爱',
  marriage: '婚姻',
  friendship: '朋友',
  partnership: '合作',
};

export const SCORE_BAND_COPY = {
  high: {
    title: '默契基础较好',
    hint: '结构契合点较多，属于少见的高契合组合；把差异说清会更稳。',
  },
  mid: {
    title: '互补可经营',
    hint: '大多数组合都落在这个区间，关系需要经营而非契合度差；有吸引也有节奏差异，建议优先解决高频摩擦。',
  },
  low: {
    title: '差异值得被看见',
    hint: '需要更多协商与边界，这不代表关系注定不好，只是要多用点心。',
  },
} as const;

/** 关系视角首屏标题（对齐设计图语气） */
export const RELATION_HERO_TITLE: Record<RelationType, string> = {
  romance: '相合有度，久处更见默契',
  marriage: '把默契放进日常，关系才会更稳',
  friendship: '相处舒服，贵在彼此留有余地',
  partnership: '优势互补，规则先行',
};

export const FORBIDDEN_PHRASES = [
  '注定',
  '绝配',
  '必然分开',
  '正缘',
  '劫缘',
  '一定会结婚',
  '一定会分手',
  '天生一对',
  '相克不宜来往',
];

export function createDefaultPartnerForm(): import('./types').PartnerProfileForm {
  const now = new Date();
  return {
    displayName: '',
    gender: 'unspecified',
    calendarType: 'solar',
    birthDate: {
      year: now.getFullYear() - 28,
      month: 6,
      day: 15,
      isLeapMonth: false,
    },
    birthTime: null,
    location: null,
    locationSkipped: false,
    consentConfirmed: false,
    focusTags: [],
  };
}
