import type { DestinyReport, FiveElementKey, LifeDimensionKey } from '../types';
import { resolveLifeDimensionsForDisplay } from '../visualization/life-dimension-scores';
import { LIFE_DIMENSION_META } from '../visualization/life-dimension-meta';

/**
 * 分享卡片数据 —— 隐私白名单。
 *
 * 卡片组件只接收本类型，出生时间（birthText）、出生地点（locationText）、
 * 农历、经纬度、性别等隐私字段在构建期即被剥离，渲染层物理上无法触及。
 */
export type BaziShareCardData = {
  /** 昵称（超长截断） */
  nickname: string;
  /** 一句话钩子（命盘定调） */
  headline: string;
  /** 四柱干支（仅干支与柱名，不含任何时间信息） */
  pillars: Array<{
    stem: string;
    branch: string;
    label: string;
    element: FiveElementKey;
  }>;
  /** 人生五维相对指数 */
  dimensions: Array<{
    key: LifeDimensionKey;
    label: string;
    value: number;
  }>;
  /** 二维码指向的落地地址（含 UTM 追踪参数） */
  shareUrl: string;
};

/** 昵称最长保留字符数，超出追加省略号 */
const NICKNAME_MAX_LENGTH = 8;
/** 钩子文案最长保留字符数 */
const HEADLINE_MAX_LENGTH = 24;

/** 昵称截断：保护卡片排版不被超长名字破坏 */
export function truncateNickname(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= NICKNAME_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, NICKNAME_MAX_LENGTH)}…`;
}

/** 文件名净化：剥离昵称中文件系统非法字符与空白，避免下载文件名异常 */
export function sanitizeShareFileName(nickname: string): string {
  const cleaned = nickname.replace(/[\\/:*?"<>|\s]+/g, '');
  return cleaned || '未知';
}

/** 钩子文案截断 */
function truncateHeadline(headline: string): string {
  const trimmed = headline.trim();
  if (trimmed.length <= HEADLINE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, HEADLINE_MAX_LENGTH)}…`;
}

/**
 * 构建二维码落地地址（一期：指向 /destiny 并附 UTM 参数；
 * 专属落地页与 ref 合盘参数属二期范围，见需求设计文档 §4.2）。
 */
export function buildBaziShareUrl(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/destiny?utm_source=share_card&utm_medium=qrcode&utm_campaign=bazi`;
}

/**
 * 从完整命盘报告构建分享卡片数据。
 * 数据不足以构成一张完整卡片时返回 null（调用方应隐藏分享入口）。
 */
export function buildBaziShareCardData(
  report: DestinyReport,
  options: { origin: string }
): BaziShareCardData | null {
  const nickname = truncateNickname(report.profile?.name ?? '');
  if (!nickname) return null;

  const headlineRaw = report.coreTone?.headline?.trim() || report.coreTone?.tag?.trim() || '';
  if (!headlineRaw) return null;
  const headline = truncateHeadline(headlineRaw);

  const pillars = (report.pillars ?? []).slice(0, 4).map((pillar) => ({
    stem: pillar.stem,
    branch: pillar.branch,
    label: pillar.label,
    element: pillar.element,
  }));
  if (pillars.length !== 4) return null;

  const resolvedDimensions = resolveLifeDimensionsForDisplay({
    lifeDimensions: report.lifeDimensions,
    baziBasis: report.baziBasis,
  });
  if (!resolvedDimensions || resolvedDimensions.length !== 5) return null;
  // 分享卡标签列固定两字宽（w-8），必须用短标签；报告里的「事业发展」等长文案会换行撑破布局
  const dimensions = resolvedDimensions.map((dimension) => ({
    key: dimension.key,
    label: LIFE_DIMENSION_META[dimension.key].label,
    value: dimension.value,
  }));

  return {
    nickname,
    headline,
    pillars,
    dimensions,
    shareUrl: buildBaziShareUrl(options.origin),
  };
}
