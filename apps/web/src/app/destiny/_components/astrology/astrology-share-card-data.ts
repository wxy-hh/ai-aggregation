/**
 * astrology-share-card-data.ts —— 星座寰宇 · 星语海报分享卡数据层（隐私白名单）
 *
 * 与八字分享卡同一工法（见 ../share/share-card-data.ts）：
 * 卡片组件只接收本类型，出生日期/精确时间/出生地点/度数/宫位在构建期即被剥离，
 * 渲染层物理上无法触及。时间未知或约时不稳定的事实（sign 为 null）一律不进入产物，
 * 因此「未知档不显示上升、约时只含已确定要素」由本层构造保证，而非渲染层判断。
 *
 * 修订绑定（工单 12 criterion 4）：海报为本地 PNG 生成、无服务端资产；
 * revision 直接取事实层 calculationRevision，每次打开都从当前修订重建，
 * 重算后旧 PNG 自然失效（不含新修订信息），无需额外失效逻辑。
 */

import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import { PLANET_CN, ZODIAC_CN, ZODIAC_ORDER } from '@/lib/astrology/zh-names';
import { truncateNickname } from '../share/share-card-data';

/** 分享海报卡数据（纯可序列化数据；符号组件由渲染层按 body 查表映射） */
export interface AstrologyShareCardData {
  /** 昵称截断（≤8 字）；匿名展示是渲染层选项，产物始终携带截断后的昵称 */
  nickname: string;
  /** 主轴金句（必须；缺失则整个入口不渲染） */
  headline: string;
  /** 已确定的核心要素（稳定太阳/月亮/上升，仅星座名；0 个时海报强制仅主轴模式） */
  elements: Array<{ key: 'sun' | 'moon' | 'ascendant'; label: string; signName: string }>;
  /** 海报缩略轮行星落点（装饰轮定位用；只含 sign 稳定的行星，无度数/宫位字段） */
  wheelPlanets: Array<{ body: PlanetBody; longitude: number }>;
  /** 生成日期（脱敏可分享，如「2026年9月4日」） */
  generatedDate: string;
  /** 二维码落地地址（含 UTM 追踪参数） */
  shareUrl: string;
  /** 真值修订号（声明绑定，重算后旧海报自然失效） */
  revision: string;
}

/** 默认放置角：度数缺失（未知档/约时度数不稳定）时放在星座正中，不泄露精确度数 */
const FALLBACK_DEGREE_IN_SIGN = 15;

/** 构建二维码落地地址：指向星座寰宇入口并附 UTM 参数 */
export function buildAstrologyShareUrl(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/destiny?tab=astrology&utm_source=share_card&utm_medium=qrcode&utm_campaign=astrology`;
}

/** 生成日期格式化（本地时区，中文口径） */
function formatGeneratedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 从星盘事实层构建分享海报卡数据。
 * headline 缺失时返回 null（调用方应隐藏分享入口，不生成半成品卡片）。
 */
export function buildAstrologyShareCardData(
  facts: AstrologyChartFacts,
  options: { name: string | null; headline: string; origin: string }
): AstrologyShareCardData | null {
  const headline = options.headline.trim();
  if (!headline) return null;

  // 大三要素：只收 sign 稳定的项；未知档/不稳定项在事实层即为 null，此处自动排除
  const sun = facts.planets.find((p) => p.body === 'sun');
  const moon = facts.planets.find((p) => p.body === 'moon');
  const elements: AstrologyShareCardData['elements'] = [];
  if (sun?.sign) {
    elements.push({ key: 'sun', label: PLANET_CN.sun, signName: ZODIAC_CN[sun.sign] });
  }
  if (moon?.sign) {
    elements.push({ key: 'moon', label: PLANET_CN.moon, signName: ZODIAC_CN[moon.sign] });
  }
  if (facts.angles.ascendant.sign) {
    elements.push({
      key: 'ascendant',
      label: '上升',
      signName: ZODIAC_CN[facts.angles.ascendant.sign],
    });
  }

  // 缩略轮行星：sign 为 null（跨座隐藏/不稳定）的星体不进海报；
  // 度数缺失时落星座正中——装饰轮只展示「在哪个星座区域」，不展示精确度数
  const wheelPlanets = facts.planets
    .filter((p) => p.sign !== null)
    .map((p) => ({
      body: p.body,
      longitude:
        ZODIAC_ORDER.indexOf(p.sign as NonNullable<typeof p.sign>) * 30 +
        (p.degree ?? FALLBACK_DEGREE_IN_SIGN),
    }));

  return {
    nickname: truncateNickname(options.name ?? ''),
    headline,
    elements,
    wheelPlanets,
    generatedDate: formatGeneratedDate(facts.calculatedAt),
    shareUrl: buildAstrologyShareUrl(options.origin),
    revision: facts.calculationRevision,
  };
}
