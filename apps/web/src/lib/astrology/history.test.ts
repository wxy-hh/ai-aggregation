/**
 * history.test.ts —— 星座寰宇 × 统一历史（11 工单）
 *
 * 覆盖：逻辑记录 id 口径（日期+城市）、修订累积与只读快照、
 * 匿名/登录写入路由、登录确认迁移、从历史恢复结果页。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAstrologyLogicalId,
  buildAstrologyHistoryItem,
  saveAstrologyHistoryRecord,
  updateAstrologyHistoryInterpretation,
  migrateTempRecordToHistory,
  restoreAstrologyFromHistory,
  type AstrologyReportPayload,
  type AstrologyRevisionSnapshot,
} from './history';
import { computeChartFacts, SAMPLE_PROFILE_ACCURATE } from './mock-chart-facts';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { DestinyHistoryItem } from '@/types/history';
import { useAuthStore } from '@/stores/auth-store';
import { useHistoryStore } from '@/stores/history-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import {
  createDefaultDestinyWorkspaceState,
  useDestinyWorkspaceStore,
} from '@/stores/destiny-workspace-store';

/* ---------- 固定夹具：与示例盘同档（1995-10-08 14:30 上海） ---------- */

const baseForm: AstrologyFormData = {
  name: '小宇',
  birthDate: { year: 1995, month: 10, day: 8 },
  topic: null,
  timePrecision: 'accurate',
  birthTime: { hour: '14', minute: '30' },
  approximateSlot: '',
  location: { name: '上海', lat: 31.23, lon: 121.47, timezone: 'Asia/Shanghai' },
};

const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);

function payloadOf(item: DestinyHistoryItem): AstrologyReportPayload {
  return item.reportData as unknown as AstrologyReportPayload;
}

beforeEach(() => {
  // 每个用例前重置三个相关 store，避免互相污染
  useHistoryStore.setState({ items: [] });
  useAstrologyTempRecordStore.setState({ tempRecord: null });
  useDestinyWorkspaceStore.setState({ astrology: createDefaultDestinyWorkspaceState().astrology });
});

describe('buildAstrologyLogicalId（日期+城市决定逻辑记录）', () => {
  it('同一日期与城市：改时间精度或出生时刻，id 不变（更新同一记录）', () => {
    const a = buildAstrologyLogicalId(baseForm);
    const b = buildAstrologyLogicalId({ ...baseForm, timePrecision: 'approximate', approximateSlot: '12:00-15:00' });
    const c = buildAstrologyLogicalId({ ...baseForm, birthTime: { hour: '9', minute: '5' } });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('改出生日期或城市：生成新 id（新记录）', () => {
    const a = buildAstrologyLogicalId(baseForm);
    const otherDay = buildAstrologyLogicalId({ ...baseForm, birthDate: { year: 1995, month: 10, day: 9 } });
    const otherCity = buildAstrologyLogicalId({
      ...baseForm,
      location: { name: '北京', lat: 39.9, lon: 116.4, timezone: 'Asia/Shanghai' },
    });
    expect(otherDay).not.toBe(a);
    expect(otherCity).not.toBe(a);
  });
});

describe('buildAstrologyHistoryItem（标题、低敏摘要与修订）', () => {
  it('首次写入：文档标题格式、revision 1、无历史快照', () => {
    const item = buildAstrologyHistoryItem(baseForm, facts);
    expect(item.type).toBe('destiny');
    expect(item.subType).toBe('astrology');
    expect(item.title).toBe('星座寰宇 · 小宇的本命星盘');
    expect(item.profileSummary?.name).toBe('小宇');
    expect(item.profileSummary?.gender).toBe('准确到分钟');
    // 隐私规格：历史卡不得出现出生日期，birthDate 槽位展示「生成日期」
    expect(item.profileSummary?.birthDate).toMatch(/^\d{1,2}月\d{1,2}日生成$/);
    expect(item.profileSummary?.birthDate).not.toContain('1995');
    const payload = payloadOf(item);
    expect(payload.revision).toBe(1);
    expect(payload.revisions).toEqual([]);
    expect(payload.chartFacts).toBe(facts);
    expect(payload.timePrecision).toBe('accurate');
    // 低敏摘要：预览与徽章不含英文占星术语
    expect(item.preview).not.toMatch(/libra|aries|aquarius/i);
    expect(item.coreTone).toContain('太阳');
  });

  it('昵称为空时兜底「星盘主人」', () => {
    const item = buildAstrologyHistoryItem({ ...baseForm, name: '  ' }, facts);
    expect(item.title).toBe('星座寰宇 · 星盘主人的本命星盘');
  });

  it('时间未知档：精度标签为「时间未知」', () => {
    const item = buildAstrologyHistoryItem({ ...baseForm, timePrecision: 'unknown' }, facts);
    expect(item.profileSummary?.gender).toBe('时间未知');
  });

  it('精度提升重算：同一逻辑记录 revision+1，旧版折叠为只读快照，createdAt 保留', () => {
    const first = buildAstrologyHistoryItem(baseForm, facts);
    const upgradedForm = { ...baseForm, timePrecision: 'approximate' as const, approximateSlot: '12:00-15:00' };
    const second = buildAstrologyHistoryItem(upgradedForm, facts, first);

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    const payload = payloadOf(second);
    expect(payload.revision).toBe(2);
    expect(payload.timePrecision).toBe('approximate');
    expect(payload.revisions).toHaveLength(1);
    // 旧版快照保留第一版的真值与精度口径，且与新版解耦（只读）
    expect(payload.revisions[0].revision).toBe(1);
    expect(payload.revisions[0].timePrecision).toBe('accurate');
    expect(payload.revisions[0].chartFacts).toBe(facts);
  });

  it('修订快照最多保留最近 5 份', () => {
    let item = buildAstrologyHistoryItem(baseForm, facts);
    for (let i = 0; i < 6; i += 1) {
      item = buildAstrologyHistoryItem(baseForm, facts, item);
    }
    const payload = payloadOf(item);
    expect(payload.revision).toBe(7);
    expect(payload.revisions).toHaveLength(5);
    // 截断后保留的是最近的修订（最旧的 revision 1 已丢弃）
    expect(payload.revisions[0].revision).toBe(2);
    expect(payload.revisions[4].revision).toBe(6);
  });
});

describe('saveAstrologyHistoryRecord（匿名/登录写入路由）', () => {
  it('匿名用户：写入会话临时记录，不进统一历史', () => {
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    const item = saveAstrologyHistoryRecord(baseForm, facts);
    expect(useAstrologyTempRecordStore.getState().tempRecord?.id).toBe(item.id);
    expect(useHistoryStore.getState().getItemById(item.id)).toBeUndefined();
  });

  it('已登录用户：写入统一历史，不留临时记录', () => {
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    const item = saveAstrologyHistoryRecord(baseForm, facts);
    expect(useHistoryStore.getState().getItemById(item.id)?.title).toBe('星座寰宇 · 小宇的本命星盘');
    expect(useAstrologyTempRecordStore.getState().tempRecord).toBeNull();
  });

  it('真实用户响应缺省 isAnonymous 字段时也按已登录处理', () => {
    // 注册/登录接口的真实用户负载不带 isAnonymous（undefined），不能误判为匿名
    useAuthStore.setState({ user: { id: 'u1', username: 'real_user' } as never });
    const item = saveAstrologyHistoryRecord(baseForm, facts);
    expect(useHistoryStore.getState().getItemById(item.id)).toBeDefined();
    expect(useAstrologyTempRecordStore.getState().tempRecord).toBeNull();
  });
});

describe('migrateTempRecordToHistory（登录确认迁移）', () => {
  it('匿名临时记录迁移进统一历史并清空临时态', () => {
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    const temp = saveAstrologyHistoryRecord(baseForm, facts);

    useAuthStore.setState({ user: { isAnonymous: false } as never });
    expect(migrateTempRecordToHistory()).toBe(true);

    const migrated = useHistoryStore.getState().getItemById(temp.id) as DestinyHistoryItem | undefined;
    expect(migrated?.subType).toBe('astrology');
    expect(useAstrologyTempRecordStore.getState().tempRecord).toBeNull();
  });

  it('匿名期重算沿用同一逻辑链：迁移后旧版快照去重只留一份', () => {
    // 登录期：同一盘面已有 revision 1
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    saveAstrologyHistoryRecord(baseForm, facts);

    // 匿名期（如退出后）：同一盘面重算两次——临时记录从既有链延伸，不另起炉灶
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    saveAstrologyHistoryRecord(baseForm, facts);
    saveAstrologyHistoryRecord({ ...baseForm, timePrecision: 'approximate', approximateSlot: '12:00-15:00' }, facts);
    const temp = useAstrologyTempRecordStore.getState().tempRecord;
    expect(payloadOf(temp as DestinyHistoryItem).revision).toBe(2);
    expect(payloadOf(temp as DestinyHistoryItem).revisions).toHaveLength(1);

    // 迁移：登录期旧版折叠为唯一只读快照（与临时链同源的那一份去重），最新为匿名期真值
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    expect(migrateTempRecordToHistory()).toBe(true);
    const merged = payloadOf(useHistoryStore.getState().getItemById(temp!.id) as DestinyHistoryItem);
    expect(merged.revision).toBe(2);
    expect(merged.revisions).toHaveLength(1);
    expect(merged.revisions[0].revision).toBe(1);
    expect(merged.timePrecision).toBe('approximate');
  });

  it('没有临时记录时返回 false', () => {
    expect(migrateTempRecordToHistory()).toBe(false);
  });
});

/* ---------- 12 工单：解读到达后的合并更新（异步写入策略） ---------- */

describe('updateAstrologyHistoryInterpretation（解读摘要合并）', () => {
  it('已登录：同一条逻辑记录的摘要由日月兜底换成主轴金句，修订与时间戳不动', () => {
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    const saved = saveAstrologyHistoryRecord(baseForm, facts);
    // 提交时解读未到：摘要为日月星座组合兜底
    expect(saved.preview).toMatch(/^太阳.+· 月亮/);

    const merged = updateAstrologyHistoryInterpretation(baseForm, facts, '心里那团火是真的，练习把它慢慢烧。');
    expect(merged).toBe(true);

    const after = useHistoryStore.getState().getItemById(saved.id) as DestinyHistoryItem;
    expect(after.preview).toBe('心里那团火是真的，练习把它慢慢烧。');
    expect(after.createdAt).toBe(saved.createdAt);
    // 不是新一次测算：修订号与快照数组不动
    expect(payloadOf(after).revision).toBe(1);
    expect(payloadOf(after).revisions).toEqual([]);
  });

  it('匿名：会话临时记录同样被覆盖更新', () => {
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    const saved = saveAstrologyHistoryRecord(baseForm, facts);

    expect(updateAstrologyHistoryInterpretation(baseForm, facts, '主轴金句')).toBe(true);
    expect(useAstrologyTempRecordStore.getState().tempRecord?.preview).toBe('主轴金句');
    expect(useAstrologyTempRecordStore.getState().tempRecord?.createdAt).toBe(saved.createdAt);
  });

  it('主轴缺失（null）时保留兜底摘要，不影响记录', () => {
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    const saved = saveAstrologyHistoryRecord(baseForm, facts);
    expect(updateAstrologyHistoryInterpretation(baseForm, facts, null)).toBe(true);
    const after = useHistoryStore.getState().getItemById(saved.id) as DestinyHistoryItem;
    expect(after.preview).toBe(saved.preview);
  });

  it('记录已不在（未登录无临时记录）时静默跳过', () => {
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    expect(updateAstrologyHistoryInterpretation(baseForm, facts, '主轴金句')).toBe(false);
    expect(useAstrologyTempRecordStore.getState().tempRecord).toBeNull();
  });

  it('重算换新真值后，上一份迟到的解读不得改写新记录', () => {
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    const saved = saveAstrologyHistoryRecord(baseForm, facts);
    // 新一次测算：真值换新（calculatedAt 前进），记录已指向新修订
    const newerFacts = { ...facts, calculatedAt: new Date(Date.parse(facts.calculatedAt) + 60_000).toISOString() };
    saveAstrologyHistoryRecord(baseForm, newerFacts);

    expect(updateAstrologyHistoryInterpretation(baseForm, facts, '上一份解读')).toBe(false);
    const after = useHistoryStore.getState().getItemById(saved.id) as DestinyHistoryItem;
    expect(after.preview).not.toBe('上一份解读');
  });
});

describe('restoreAstrologyFromHistory（从历史重开结果页）', () => {
  it('统一历史记录可恢复：结果页状态与真值一并还原', () => {
    useAuthStore.setState({ user: { isAnonymous: false } as never });
    const item = saveAstrologyHistoryRecord(baseForm, facts);

    expect(restoreAstrologyFromHistory(item.id)).toBe(true);
    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.step).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.chartFacts).toBe(facts);
    expect(state.formData.name).toBe('小宇');
  });

  it('匿名临时记录同样可恢复（会话内「继续查看」）', () => {
    useAuthStore.setState({ user: { isAnonymous: true } as never });
    const item = saveAstrologyHistoryRecord(baseForm, facts);
    expect(restoreAstrologyFromHistory(item.id)).toBe(true);
    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('result');
  });

  it('非星座寰宇记录或不存在的 id：不恢复', () => {
    expect(restoreAstrologyFromHistory('not-exist')).toBe(false);
    useHistoryStore.getState().addItem({
      ...buildAstrologyHistoryItem(baseForm, facts),
      id: 'other-module',
      subType: 'bazi',
    } as DestinyHistoryItem);
    expect(restoreAstrologyFromHistory('other-module')).toBe(false);
    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('form');
  });
});

// 类型冒烟：快照结构只读语义（不含嵌套 revisions）
const _snapshotCheck: AstrologyRevisionSnapshot | null = null;
void _snapshotCheck;
