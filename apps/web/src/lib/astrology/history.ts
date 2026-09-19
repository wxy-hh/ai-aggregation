/**
 * history.ts —— 星座寰宇 × 统一历史记录（11 工单）
 *
 * 落点说明：当前统一历史的真值层是客户端 IndexedDB（/api/history 仍为占位 stub），
 * 本模块按现有规范写入 DestinyHistoryItem（subType='astrology'），
 * 恢复口径与八字/奇门一致（historyId → workspace 结果页）。
 * 设计文档 §9.3 的服务端 HistoryRecord 修订表落地后，只需替换本模块的底层读写。
 *
 * 关键规则（§6.7/§9.3/§12）：
 * - 确定性真值完成即写入；结果页不提供删除（删除只存在于全局历史页，本模块不涉及）。
 * - 出生日期 + 城市决定逻辑记录 id：仅补全/提高时间精度 → 覆盖更新同一记录并累积修订；
 *   改日期或城市 → 新 id，即新记录。
 * - 旧修订以快照数组只读保留（写入后不再修改），最多保留最近 5 份（控制 IndexedDB 体积）。
 * - 匿名用户写入会话级临时记录（sessionStorage，标签页关闭即删）；登录后经明确确认迁移（migrateTempRecordToHistory）。
 *
 * 异步写入策略（12 工单）：
 * 真值与解读是两条异步链路。提交（真值到达）即写记录——摘要先用日月星座组合兜底，
 * 保证用户提交后立刻切走也有记录；解读到达后由 updateAstrologyHistoryInterpretation
 * 把黄金主轴摘要合并覆盖进同一条逻辑记录（匿名临时记录链路同样覆盖）。
 */

import { useAuthStore } from '@/stores/auth-store';
import { useHistoryStore } from '@/stores/history-store';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import type { DestinyHistoryItem } from '@/types/history';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts, TimePrecision } from './chart-facts';
import { ZODIAC_CN } from './zh-names';

/** 历史记录 model 字段的诚实标注：星盘真值为本地计算引擎产出 */
export const ASTROLOGY_HISTORY_MODEL = 'astro-local';

/** 修订快照：旧版本真值按版本只读保留，不回写、不迁移问答 */
export interface AstrologyRevisionSnapshot {
  revision: number;
  recalculatedAt: string;
  timePrecision: TimePrecision;
  chartFacts: AstrologyChartFacts;
}

/** reportData 负载：顶层始终是最新修订，旧版在 revisions 中只读保留 */
export interface AstrologyReportPayload {
  chartFacts: AstrologyChartFacts;
  revision: number;
  recalculatedAt: string;
  timePrecision: TimePrecision;
  revisions: AstrologyRevisionSnapshot[];
}

/** 旧修订快照最多保留份数（超出丢弃最旧，控制本地存储体积） */
const MAX_REVISION_SNAPSHOTS = 5;

/** 稳定短哈希（djb2）：用于把出生城市编入逻辑记录 id，无需引入新依赖 */
function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * 逻辑记录 id：由出生日期 + 城市（名称+经纬度+时区）决定。
 * 时间精度/出生时刻变化 → 同一 id（更新同一记录）；日期或城市变化 → 新 id（新记录）。
 */
export function buildAstrologyLogicalId(formData: AstrologyFormData): string {
  const date = formData.birthDate;
  const dateKey = date
    ? `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`
    : 'nodate';
  const loc = formData.location;
  const cityKey = hashText(`${loc.name}|${loc.lat}|${loc.lon}|${loc.timezone}`);
  return `astrology-${dateKey}-${cityKey}`;
}

/** 把某次修订的顶层内容折叠为只读快照（不带嵌套 revisions，避免层层膨胀） */
function snapshotOf(payload: AstrologyReportPayload): AstrologyRevisionSnapshot {
  return {
    revision: payload.revision,
    recalculatedAt: payload.recalculatedAt,
    timePrecision: payload.timePrecision,
    chartFacts: payload.chartFacts,
  };
}

/**
 * 低敏摘要与标题（§6.7：历史列表只显示昵称、模块、日期与低敏摘要）：
 * - 标题：星座寰宇 · {昵称}的本命星盘（昵称为空兜底「星盘主人」，与结果页口径一致）
 * - 摘要：解读到达后为黄金主轴一句话（不含出生时刻/经纬度等高敏字段）；
 *   解读在途时退化为日月星座组合——真值先落记录、解读到达再合并覆盖（12 工单异步写入策略）
 * - coreTone 徽章：太阳×月亮星座的极简组合
 */
function buildTitleAndPreview(
  formData: AstrologyFormData,
  facts: AstrologyChartFacts,
  headlineText?: string | null
) {
  const name = formData.name.trim() || '星盘主人';
  const title = `星座寰宇 · ${name}的本命星盘`;

  const signOf = (body: 'sun' | 'moon') => facts.planets.find((p) => p.body === body)?.sign ?? null;
  const sunSign = signOf('sun');
  const moonSign = signOf('moon');
  const coreTone =
    sunSign && moonSign
      ? `太阳${ZODIAC_CN[sunSign].slice(0, -1)}·月亮${ZODIAC_CN[moonSign].slice(0, -1)}`
      : '本命星盘';
  const fallbackPreview =
    sunSign && moonSign ? `太阳${ZODIAC_CN[sunSign]} · 月亮${ZODIAC_CN[moonSign]}` : '本命星盘结果';
  // 主轴是金句而非隐私数据；解读未到时用日月星座组合兜底，绝不留空摘要
  const preview = (headlineText || fallbackPreview).slice(0, 150);

  return { title, preview, coreTone };
}

/**
 * 组装历史记录项（纯函数，便于单测）。
 * @param existing 同一逻辑 id 的既有记录：有则修订号 +1、旧版折叠进 revisions，并保留 createdAt
 * @param carryRevisions 迁移场景带入的匿名期旧修订快照
 */
export function buildAstrologyHistoryItem(
  formData: AstrologyFormData,
  chartFacts: AstrologyChartFacts,
  existing?: DestinyHistoryItem | null,
  carryRevisions: AstrologyRevisionSnapshot[] = []
): DestinyHistoryItem {
  const id = buildAstrologyLogicalId(formData);
  const prevPayload =
    existing?.type === 'destiny' && existing.subType === 'astrology'
      ? (existing.reportData as unknown as AstrologyReportPayload | null)
      : null;

  // 修订累积：既有记录的历代快照 + 既有最新版折叠 + 迁入快照；按「修订号@时间」去重后截断
  const prior: AstrologyRevisionSnapshot[] = [
    ...(prevPayload ? [...(prevPayload.revisions ?? []), snapshotOf(prevPayload)] : []),
    ...carryRevisions,
  ];
  const seen = new Set<string>();
  const revisions = prior
    .filter((s) => {
      const key = `${s.revision}@${s.recalculatedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-MAX_REVISION_SNAPSHOTS);

  const payload: AstrologyReportPayload = {
    chartFacts,
    revision: (prevPayload?.revision ?? 0) + 1,
    recalculatedAt: new Date().toISOString(),
    timePrecision: formData.timePrecision,
    revisions,
  };

  const { title, preview, coreTone } = buildTitleAndPreview(formData, chartFacts);
  const item = createDestinyHistoryItem(
    'astrology',
    formData as unknown as Record<string, unknown>,
    payload as unknown as Record<string, unknown>,
    ASTROLOGY_HISTORY_MODEL,
    { id, title, preview, coreTone }
  );

  // 更新同一逻辑记录时保留首次创建时间（列表排序仍以更新时间为「最近活动」）
  if (existing) {
    item.createdAt = existing.createdAt;
  }
  return item;
}

/** 当前是否为已登录（非匿名）用户：匿名接口显式返回 isAnonymous=true；真实用户该字段可能缺省，故按「非 true」判定 */
function isLoggedInUser(): boolean {
  const user = useAuthStore.getState().user;
  return user !== null && user.isAnonymous !== true;
}

/**
 * 真值完成写入入口（表单提交与仪式重试两处调用）：
 * 已登录 → 统一历史（IndexedDB）；匿名 → 会话级临时记录（sessionStorage）。
 * 此时解读尚未返回，摘要为日月星座组合兜底；解读到达后由 updateAstrologyHistoryInterpretation 补全。
 */
export function saveAstrologyHistoryRecord(
  formData: AstrologyFormData,
  chartFacts: AstrologyChartFacts
): DestinyHistoryItem {
  const existing = useHistoryStore.getState().getItemById(buildAstrologyLogicalId(formData));
  const item = buildAstrologyHistoryItem(
    formData,
    chartFacts,
    existing?.type === 'destiny' ? existing : null
  );
  if (isLoggedInUser()) {
    useHistoryStore.getState().addItem(item);
  } else {
    useAstrologyTempRecordStore.getState().setTempRecord(item);
  }
  return item;
}

/**
 * 解读到达后的合并更新（12 工单异步写入策略）：
 * 提交时先落真值记录（至少保证「有真值」）；解读晚到时，若同一条逻辑记录仍在，
 * 把解读摘要（黄金主轴）合并覆盖进去。修订号、快照数组与时间戳一律不动——
 * 这不是新一次测算，只是同一次记录的低敏摘要补全。
 *
 * 身份校验用 calculatedAt + calculationRevision：重算会换上新真值（新 calculatedAt），
 * 上一份迟到的解读不得改写新记录。
 * @returns 是否完成合并（记录已删或被新修订替换时为 false，静默跳过）
 */
export function updateAstrologyHistoryInterpretation(
  formData: AstrologyFormData,
  chartFacts: AstrologyChartFacts,
  headlineText: string | null
): boolean {
  const id = buildAstrologyLogicalId(formData);
  const stored = useHistoryStore.getState().getItemById(id);
  const temp = useAstrologyTempRecordStore.getState().tempRecord;
  const target = stored ?? (temp?.id === id ? temp : undefined);
  if (target?.type !== 'destiny' || target.subType !== 'astrology') return false;

  const payload = target.reportData as unknown as AstrologyReportPayload | null;
  if (!payload?.chartFacts) return false;
  if (
    payload.chartFacts.calculatedAt !== chartFacts.calculatedAt ||
    payload.chartFacts.calculationRevision !== chartFacts.calculationRevision
  ) {
    return false;
  }

  const { title, preview, coreTone } = buildTitleAndPreview(formData, chartFacts, headlineText);
  const next: DestinyHistoryItem = { ...target, title, preview, coreTone };
  // 覆盖更新同一逻辑记录：登录用户进统一历史，匿名用户进会话临时记录（两条链路一致）
  if (stored) {
    useHistoryStore.getState().addItem(next);
  } else {
    useAstrologyTempRecordStore.getState().setTempRecord(next);
  }
  return true;
}

/**
 * 登录确认迁移：把匿名会话临时记录并入统一历史。
 * 同一逻辑 id 已有登录期旧记录时，匿名期旧修订随快照一并保留。
 */
export function migrateTempRecordToHistory(): boolean {
  const temp = useAstrologyTempRecordStore.getState().tempRecord;
  if (!temp) return false;
  const payload = temp.reportData as unknown as AstrologyReportPayload | null;
  if (!payload?.chartFacts) {
    // 形状受损的记录不迁移，直接丢弃临时态
    useAstrologyTempRecordStore.getState().clearTempRecord();
    return false;
  }
  const formData = temp.formData as unknown as AstrologyFormData;
  const existing = useHistoryStore.getState().getItemById(temp.id);
  const item = buildAstrologyHistoryItem(
    formData,
    payload.chartFacts,
    existing?.type === 'destiny' ? existing : null,
    payload.revisions ?? []
  );
  useHistoryStore.getState().addItem(item);
  useAstrologyTempRecordStore.getState().clearTempRecord();
  return true;
}

/**
 * 从统一历史（或匿名临时记录）恢复该次结果：
 * 入口首页「继续查看」与全局历史页卡片（historyId 参数）共用一个恢复函数。
 */
export function restoreAstrologyFromHistory(historyId: string): boolean {
  const fromHistory = useHistoryStore.getState().getItemById(historyId);
  const temp = useAstrologyTempRecordStore.getState().tempRecord;
  const item = fromHistory ?? (temp?.id === historyId ? temp : undefined);
  if (item?.type !== 'destiny' || item.subType !== 'astrology') return false;
  const payload = item.reportData as unknown as AstrologyReportPayload | null;
  if (!payload?.chartFacts) return false;

  useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
    step: 'result',
    lastView: 'result',
    hasResult: true,
    chartFacts: payload.chartFacts,
    formData: item.formData as unknown as AstrologyFormData,
    fieldErrors: {},
    error: null,
    errorKind: null,
  });
  return true;
}
