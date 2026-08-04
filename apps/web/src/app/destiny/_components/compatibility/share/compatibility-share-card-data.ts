import { RELATION_LABEL, SCORE_BAND_COPY } from '../constants';
import { computeRelationFeelScore } from '../score';
import type { CompatibilityReport, RelationType } from '../types';
import {
  sanitizeShareFileName,
  truncateNickname,
} from '../../share/share-card-data';

/**
 * 缘分卡数据 —— 隐私白名单。
 *
 * 卡面组件只接收本类型；生辰、地点、四柱、六维明细、命盘底分等
 * 在构建期即剥离，渲染层物理上无法触及。
 */
export type CompatibilityShareCardData = {
  /** 对方展示名（截断后） */
  partnerLabel: string;
  /** 关系视角 */
  relationType: RelationType;
  /** 关系类型中文 */
  relationLabel: string;
  /** 本视角适配分 0–100 */
  score: number;
  /** 分档 */
  scoreBand: 'high' | 'mid' | 'low';
  /** 分档短标签（SCORE_BAND_COPY.title） */
  bandTitle: string;
  /** 一句关系底色 */
  oneLiner: string;
  /** 本周可做（可选） */
  weeklyAction: string | null;
  /** 二维码落地地址 */
  shareUrl: string;
  /** 系统分享附属短钩子 */
  shareText: string;
  /** 导出文件名（不含路径） */
  fileName: string;
};

/** 构建缘分卡二维码落地地址（不深链报告 / historyId） */
export function buildCompatibilityShareUrl(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/destiny?utm_source=share_card&utm_medium=qrcode&utm_campaign=bazi_compatibility`;
}

/**
 * 从合盘报告 + 当前视角构建缘分卡数据。
 * 当前视角未就绪（无 view / oneLiner）时返回 null。
 */
export function buildCompatibilityShareCardData(
  report: CompatibilityReport,
  activeRelation: RelationType,
  options: { origin: string }
): CompatibilityShareCardData | null {
  const view = report.views[activeRelation];
  if (!view) return null;

  const oneLiner = view.oneLiner?.trim() || '';
  if (!oneLiner) return null;

  const facts = report.chartFacts;
  if (!facts) return null;

  const feel = computeRelationFeelScore(facts, activeRelation, view.dimensions);
  const bandTitle = SCORE_BAND_COPY[feel.scoreBand].title;
  const relationLabel = RELATION_LABEL[activeRelation];
  const partnerRaw = (report.partnerDisplayName || 'TA').trim() || 'TA';
  const partnerLabel = truncateNickname(partnerRaw) || 'TA';

  const weeklyRaw = view.weeklyActions?.[0]?.text?.trim() || '';
  const weeklyAction = weeklyRaw || null;

  const shareUrl = buildCompatibilityShareUrl(options.origin);
  const shareText = `【八字合盘·${relationLabel}】我 × ${partnerLabel} · 适配 ${feel.score} · ${bandTitle}`;
  const fileName = `缘分卡-${sanitizeShareFileName(partnerLabel)}-${relationLabel}.png`;

  return {
    partnerLabel,
    relationType: activeRelation,
    relationLabel,
    score: feel.score,
    scoreBand: feel.scoreBand,
    bandTitle,
    oneLiner,
    weeklyAction,
    shareUrl,
    shareText,
    fileName,
  };
}
