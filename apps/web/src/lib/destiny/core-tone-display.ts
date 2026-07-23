import type { DestinyCoreTone } from '@/app/destiny/_components/types';

/** 格局标题中常见术语，用于判断是否需要降级为「专业备注」 */
const JARGON_PATTERN =
  /印|食|伤|官|杀|比|劫|相生|相克|格局|透出|藏干|当令|调候|清透|混杂|寒金|日主|偏财|正印|偏印|食神|伤官|七杀|正官/;

/** 判断文案是否偏术语化（短句里术语密度高） */
export function isJargonHeavyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const hits = trimmed.match(new RegExp(JARGON_PATTERN.source, 'g')) ?? [];
  if (hits.length >= 2) return true;
  return hits.length >= 1 && trimmed.length <= 22;
}

/** 从描述里提取含「你」、偏白话的句子作为主标题 */
function extractPlainLine(description: string): string | null {
  const sentences = description
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const withYou = sentences.find((s) => /你/.test(s) && s.length >= 10 && !isJargonHeavyText(s));
  if (withYou) return withYou;

  const plain = sentences.find((s) => s.length >= 10 && !isJargonHeavyText(s));
  return plain ?? null;
}

export type CoreToneDisplay = {
  /** 主标题：大白话，面向零基础用户 */
  primaryTitle: string;
  /** 专业格局名（若有），显示为小标签 */
  patternLabel?: string;
  chartSummary?: string;
  description?: string;
};

/**
 * 将 coreTone 拆成「主标题 + 可选专业备注」。
 * 旧报告若 headline 过专业，则改用 description 中的白话句作主标题。
 */
export function resolveCoreToneDisplay(coreTone?: DestinyCoreTone): CoreToneDisplay {
  if (!coreTone?.headline?.trim()) {
    return { primaryTitle: '正在推演你的人生底色' };
  }

  const headline = coreTone.headline.trim();
  const description = coreTone.description?.trim();
  const chartSummary = coreTone.chartSummary?.trim();

  if (isJargonHeavyText(headline)) {
    const plain = description ? extractPlainLine(description) : null;
    const body =
      plain && description
        ? description.replace(plain, '').replace(/^[。！？\s]+/, '').trim() || undefined
        : description;
    return {
      primaryTitle: plain ?? headline,
      patternLabel: plain ? headline : undefined,
      chartSummary,
      description: body,
    };
  }

  return {
    primaryTitle: headline,
    chartSummary,
    description,
  };
}
