import { z } from 'zod';
import type {
  DestinyModule,
  DestinyReport,
  DestinyReportRequest,
  DestinyTimelineItem,
  FiveElementKey,
} from '@/app/destiny/_components/types';

const fiveElementTuple = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
const fiveElementOrder: FiveElementKey[] = [...fiveElementTuple];

const ProfileSchema = z.object({
  name: z.string().min(1).optional(),
  genderLabel: z.string().min(1).optional(),
  birthText: z.string().min(1).optional(),
  locationText: z.string().min(1).optional(),
});

const PillarSchema = z.object({
  stem: z.string().min(1),
  branch: z.string().min(1),
  label: z.string().min(1),
  element: z.enum(fiveElementTuple),
  tooltip: z.string().min(1),
});

const ElementSchema = z.object({
  key: z.enum(fiveElementTuple),
  label: z.string().min(1).optional(),
  value: z.number(),
});

const TenGodSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  tooltip: z.string().min(1).optional(),
});

const ModuleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
});

const TimelineItemSchema = z.object({
  year: z.number().optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  detail: z
    .object({
      opportunities: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      actions: z.array(z.string()).optional(),
    })
    .optional(),
});

function convertLooseRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const source = raw as Record<string, unknown>;

  const profileSource = (source.profile ?? {}) as Record<string, unknown>;
  const profile = {
    name: asString(profileSource.name),
    genderLabel: asString(profileSource.genderLabel) || asString(profileSource.gender),
    birthText: asString(profileSource.birthText) || asString(profileSource.birth),
    locationText: asString(profileSource.locationText) || asString(profileSource.birthPlace),
  };

  const pillars = normalizeLoosePillars(source.pillars);
  const elements = normalizeLooseElements(source.elements);
  const tenGods = normalizeLooseTenGods(source.tenGods);
  const modules = normalizeLooseModules(source.modules);
  const timeline = normalizeLooseTimeline(source.timeline);

  return {
    profile,
    pillars,
    elements,
    tenGods,
    modules,
    timeline,
  };
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function normalizeLoosePillars(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  if (raw.length === 0) return raw;
  if (typeof raw[0] === 'string') {
    return (raw as unknown[])
      .slice(0, 4)
      .map((item, index) => {
        const value = typeof item === 'string' ? item.trim() : '';
        const stem = value[0] || defaultPillars()[index]?.stem || '甲';
        const branch = value[1] || defaultPillars()[index]?.branch || '子';
        return {
          stem,
          branch,
          label: ['年柱', '月柱', '日柱', '时柱'][index],
          element: guessElementByStem(stem),
          tooltip: `${['年柱', '月柱', '日柱', '时柱'][index]}命理解读`,
        };
      })
      .filter((item) => item.stem && item.branch);
  }
  if (typeof raw[0] === 'object') {
    return (raw as Array<Record<string, unknown>>).slice(0, 4).map((item, index) => {
      const stem = asString(item.stem) || defaultPillars()[index]?.stem || '甲';
      const branch = asString(item.branch) || defaultPillars()[index]?.branch || '子';
      const elementFromField = mapLooseElement(asString(item.element));
      return {
        stem,
        branch,
        label: asString(item.label) || ['年柱', '月柱', '日柱', '时柱'][index],
        element: elementFromField || guessElementByStem(stem),
        tooltip: asString(item.tooltip) || `${['年柱', '月柱', '日柱', '时柱'][index]}命理解读`,
      };
    });
  }
  return raw;
}

function normalizeLooseElements(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const mapping: Record<string, FiveElementKey> = {
    金: 'metal',
    metal: 'metal',
    木: 'wood',
    wood: 'wood',
    水: 'water',
    water: 'water',
    火: 'fire',
    fire: 'fire',
    土: 'earth',
    earth: 'earth',
  };

  const list: Array<{ key: FiveElementKey; value: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = mapping[k];
    if (!key) continue;
    const num = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(num)) continue;
    list.push({ key, value: num });
  }
  return list.length > 0 ? list : raw;
}

function mapLooseElement(value: string): FiveElementKey | null {
  if (!value) return null;
  if (value.includes('金') || /metal/i.test(value)) return 'metal';
  if (value.includes('木') || /wood/i.test(value)) return 'wood';
  if (value.includes('水') || /water/i.test(value)) return 'water';
  if (value.includes('火') || /fire/i.test(value)) return 'fire';
  if (value.includes('土') || /earth/i.test(value)) return 'earth';
  return null;
}

function normalizeLooseTenGods(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  if (raw.length === 0) return raw;
  if (typeof raw[0] !== 'string') return raw;

  const freq = new Map<string, number>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const label = item.trim();
    if (!label) continue;
    freq.set(label, (freq.get(label) ?? 0) + 1);
  }

  const total = Array.from(freq.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count], index) => ({
      key: `ten-god-${index + 1}`,
      label,
      value: Math.round((count / total) * 100),
      tooltip: `${label}在当前命局中的作用解读`,
    }));
}

function normalizeLooseModules(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  const list = raw as Array<Record<string, unknown>>;
  const slots: Array<'personality' | 'career' | 'love' | 'wealth' | 'health'> = [
    'personality',
    'career',
    'love',
    'wealth',
    'health',
  ];
  const result: Record<string, { title: string; summary: string; bullets: string[] }> = {};
  list.slice(0, 5).forEach((item, index) => {
    const key = slots[index];
    const title = asString(item.name) || `${key}分析`;
    const content = asString(item.content) || '暂无分析';
    result[key] = {
      title,
      summary: content,
      bullets: [content],
    };
  });
  return Object.keys(result).length > 0 ? result : raw;
}

function normalizeLooseTimeline(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  return (raw as unknown[]).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = item as Record<string, unknown>;
    const fortune = asString(row.fortune);
    if (!fortune) return item;
    return {
      year: typeof row.year === 'number' ? row.year : undefined,
      title: `${typeof row.year === 'number' ? row.year : ''}年流年`,
      summary: fortune,
      detail: {
        opportunities: [fortune],
        risks: [],
        actions: ['将建议拆解为可执行的月度行动。'],
      },
    };
  });
}

function guessElementByStem(stem: string): FiveElementKey {
  if (['甲', '乙'].includes(stem)) return 'wood';
  if (['丙', '丁'].includes(stem)) return 'fire';
  if (['戊', '己'].includes(stem)) return 'earth';
  if (['庚', '辛'].includes(stem)) return 'metal';
  return 'water';
}

function formatBirthText(input: DestinyReportRequest): string {
  const { birthDate, birthTime } = input;
  return `${birthDate.year}年${birthDate.month}月${birthDate.day}日 ${birthTime.hour}:${birthTime.minute}`;
}

function safeModule(input: Partial<DestinyModule> | undefined, fallbackTitle: string): DestinyModule {
  const title = input?.title?.trim() || fallbackTitle;
  const summary = input?.summary?.trim() || '暂无分析，请重试后获取更完整解读。';
  const bullets = (input?.bullets ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    title,
    summary,
    bullets: bullets.length > 0 ? bullets : ['建议结合现实目标分阶段执行。'],
  };
}

function normalizeElements(raw: Array<{ key: FiveElementKey; label?: string; value: number }> | undefined) {
  const map = new Map<FiveElementKey, number>();
  for (const item of raw ?? []) {
    map.set(item.key, Math.max(0, Math.min(100, Math.round(item.value))));
  }

  return fiveElementOrder.map((key) => ({
    key,
    label: elementLabel(key),
    value: map.get(key) ?? 20,
  }));
}

function normalizeTimeline(raw: unknown, currentYear: number): DestinyTimelineItem[] {
  const list = Array.isArray(raw) ? raw.slice(0, 3) : [];
  const result: DestinyTimelineItem[] = [];

  for (let index = 0; index < 3; index += 1) {
    const source = (list[index] ?? {}) as {
      title?: string;
      summary?: string;
      detail?: { opportunities?: string[]; risks?: string[]; actions?: string[] };
    };
    const year = currentYear + index;
    result.push({
      year,
      title: source.title?.trim() || `${year}年运势`,
      summary: source.summary?.trim() || '该年度建议以稳中求进为主，避免情绪化决策。',
      detail: {
        opportunities: (source.detail?.opportunities ?? []).filter(Boolean).slice(0, 3),
        risks: (source.detail?.risks ?? []).filter(Boolean).slice(0, 3),
        actions: (source.detail?.actions ?? []).filter(Boolean).slice(0, 3),
      },
    });
  }

  return result.map((item) => ({
    ...item,
    detail: {
      opportunities:
        item.detail.opportunities.length > 0 ? item.detail.opportunities : ['聚焦一项关键机会进行突破。'],
      risks: item.detail.risks.length > 0 ? item.detail.risks : ['避免高压周期内做高风险决定。'],
      actions: item.detail.actions.length > 0 ? item.detail.actions : ['将年度目标拆解为季度里程碑。'],
    },
  }));
}

function elementLabel(key: FiveElementKey): string {
  switch (key) {
    case 'metal':
      return '金';
    case 'wood':
      return '木';
    case 'water':
      return '水';
    case 'fire':
      return '火';
    case 'earth':
      return '土';
  }
}

export function normalizeDestinyReport(
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number
): DestinyReport {
  const adapted = convertLooseRaw(raw);
  const source = adapted && typeof adapted === 'object' ? (adapted as Record<string, unknown>) : {};
  const profile = ProfileSchema.safeParse(source.profile);
  const pillars = z.array(PillarSchema).safeParse(source.pillars);
  const elements = z.array(ElementSchema).safeParse(source.elements);
  const tenGods = z.array(TenGodSchema).safeParse(source.tenGods);
  const timeline = z.array(TimelineItemSchema).safeParse(source.timeline);
  const modulesSource =
    source.modules && typeof source.modules === 'object' ? (source.modules as Record<string, unknown>) : {};
  const modules = {
    career: ModuleSchema.safeParse(modulesSource.career),
    love: ModuleSchema.safeParse(modulesSource.love),
    wealth: ModuleSchema.safeParse(modulesSource.wealth),
    health: ModuleSchema.safeParse(modulesSource.health),
    personality: ModuleSchema.safeParse(modulesSource.personality),
  };

  const locationText =
    input.location.name && input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat.toFixed(2)}, ${input.location.lon.toFixed(2)}）`
      : input.location.name || '出生地待确认';

  const defaultProfile = {
    name: input.name.trim() || '命主',
    genderLabel: input.gender === 'female' ? '坤造（女命）' : '乾造（男命）',
    birthText: formatBirthText(input),
    locationText,
  };

  const safePillars = (pillars.success ? pillars.data : []).slice(0, 4);
  const normalizedPillars = (safePillars.length === 4 ? safePillars : defaultPillars()).map((item, index) => ({
    ...item,
    label: ['年柱', '月柱', '日柱', '时柱'][index],
  }));

  const safeTenGods = (tenGods.success ? tenGods.data : [])
    .slice(0, 4)
    .map((item, index) => ({
      key: item.key || `ten-god-${index + 1}`,
      label: item.label,
      value: Math.max(0, Math.min(100, Math.round(item.value))),
      tooltip: item.tooltip?.trim() || `${item.label}与当前命局关系说明`,
    }));

  const normalizedTenGods =
    safeTenGods.length > 0
      ? safeTenGods
      : [
          { key: 'piancai', label: '偏财', value: 25, tooltip: '偏财代表机会型资源与整合能力。' },
          { key: 'zhengcai', label: '正财', value: 25, tooltip: '正财代表稳健收入与长期积累。' },
          { key: 'zhengguan', label: '正官', value: 25, tooltip: '正官代表秩序、责任与规则意识。' },
          { key: 'shishen', label: '食神', value: 25, tooltip: '食神代表表达、输出与创造。' },
        ];

  return {
    profile: {
      name: profile.success ? profile.data.name?.trim() || defaultProfile.name : defaultProfile.name,
      genderLabel: profile.success
        ? profile.data.genderLabel?.trim() || defaultProfile.genderLabel
        : defaultProfile.genderLabel,
      birthText: profile.success ? profile.data.birthText?.trim() || defaultProfile.birthText : defaultProfile.birthText,
      locationText: profile.success
        ? profile.data.locationText?.trim() || defaultProfile.locationText
        : defaultProfile.locationText,
    },
    pillars: normalizedPillars,
    elements: normalizeElements(elements.success ? elements.data : undefined),
    tenGods: normalizedTenGods,
    modules: {
      career: safeModule(modules.career.success ? modules.career.data : undefined, '事业发展潜力解析'),
      love: safeModule(modules.love.success ? modules.love.data : undefined, '感情模式与关系建议'),
      wealth: safeModule(modules.wealth.success ? modules.wealth.data : undefined, '财运结构与风险节奏'),
      health: safeModule(modules.health.success ? modules.health.data : undefined, '健康关注点与作息建议'),
      personality: safeModule(
        modules.personality.success ? modules.personality.data : undefined,
        '性格底色与优势'
      ),
    },
    timeline: normalizeTimeline(timeline.success ? timeline.data : undefined, currentYear),
  };
}

function defaultPillars() {
  return [
    { stem: '甲', branch: '子', label: '年柱', element: 'wood' as const, tooltip: '年柱：外在环境与早年基调。' },
    { stem: '丙', branch: '寅', label: '月柱', element: 'fire' as const, tooltip: '月柱：事业根基与社会关系。' },
    { stem: '戊', branch: '辰', label: '日柱', element: 'earth' as const, tooltip: '日柱：自我与核心驱动力。' },
    { stem: '庚', branch: '申', label: '时柱', element: 'metal' as const, tooltip: '时柱：行动方式与未来趋势。' },
  ];
}
