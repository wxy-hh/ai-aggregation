/**
 * interpretation.ts —— 星座寰宇 · 解读层契约与白话体系（客户端/服务端共用）
 *
 * 定位（03 工单）：本文件是解读层的唯一形状来源——服务端按同一形状产出（报告分区 JSON schema 见
 * app/api/destiny/astrology/_lib/），前端按同一形状渲染（结果页 / 生活模块 / 深度区）。
 * 只放类型、词汇表与纯函数，不含任何模型调用、网络时序或 mock 文案拼装。
 *
 * 与解读来源的分工（工单 03 硬约束）：解读链路（结果页 / 生活模块 / 深度区 / 报告路由）
 * 一律 import 本文件；AI 只产出文案值，形状与词汇表由本文件唯一确定。前端先行期的
 * mock 模板拼装（mock-interpretation.ts）与 mock 问答（mock-qa.ts）已在 03/04 工单退出
 * 生产路径，并在 T5 工单随 mock 退役一并删除。
 *
 * 文案铁律（设计文档 §8.0/§9/§10）：先生活语言后专业证据；用「倾向/可能/练习」而非命定措辞；
 * 不出现「一定/必然/注定/绝对/永远」；只引用已确认稳定的事实层字段。
 */

import type {
  AspectFact,
  AspectType,
  AstrologyChartFacts,
  PlanetBody,
  TransitFact,
  ZodiacSign,
} from './chart-facts';
import { ASPECT_CN, PLANET_CN } from './zh-names';

/* ---------- 基础映射（展示层白话词汇，事实层只存代码标识） ---------- */

/** 四元素归属：火/土/风/水 */
export type ZodiacElement = 'fire' | 'earth' | 'air' | 'water';

export const SIGN_ELEMENT: Record<ZodiacSign, ZodiacElement> = {
  aries: 'fire',
  leo: 'fire',
  sagittarius: 'fire',
  taurus: 'earth',
  virgo: 'earth',
  capricorn: 'earth',
  gemini: 'air',
  libra: 'air',
  aquarius: 'air',
  cancer: 'water',
  scorpio: 'water',
  pisces: 'water',
};

/** 行星主题词（白话）：这颗星主管你人生的哪个议题 */
export const PLANET_THEME: Record<PlanetBody, string> = {
  sun: '核心自我',
  moon: '情绪需要',
  mercury: '思考与表达',
  venus: '爱与审美',
  mars: '行动与欲望',
  jupiter: '信念与机遇',
  saturn: '责任与边界',
  uranus: '独立与改变',
  neptune: '梦想与直觉',
  pluto: '转化与深度',
};

/** 星座方式短语（白话）：能量倾向以什么方式呈现 */
export const SIGN_STYLE: Record<ZodiacSign, string> = {
  aries: '直接而急切',
  taurus: '缓慢而持久',
  gemini: '灵活而好奇',
  cancer: '细腻而保护',
  leo: '明亮而骄傲',
  virgo: '细致而务实',
  libra: '优雅而权衡',
  scorpio: '深刻而强烈',
  sagittarius: '自由而乐观',
  capricorn: '克制而有计划',
  aquarius: '独立而前瞻',
  pisces: '柔软而共情',
};

/** 相位白话：两颗星之间的能量关系 */
export const ASPECT_PLAIN: Record<AspectType, string> = {
  conjunction: '两种能量叠在一起，彼此强化',
  sextile: '两种能量容易配合，属于机会型连接',
  square: '两种能量互相较劲，是成长的摩擦点',
  trine: '两种能量自然同频，是你的舒适天赋',
  opposition: '两种能量在拔河，需要在两端之间找平衡',
};

/** 行星落座白话句：「你的情绪需要，倾向以细腻而保护的方式呈现。」 */
export function planetPlainSentence(body: PlanetBody, sign: ZodiacSign): string {
  return `你的${PLANET_THEME[body]}，倾向以${SIGN_STYLE[sign]}的方式呈现。`;
}

/** 相位白话句 */
export function aspectPlainSentence(type: AspectType): string {
  return ASPECT_PLAIN[type];
}

/* ---------- 大三要素（术语层由真值渲染，解读只补白话层与行为层） ---------- */

export interface ElementReading {
  /** 白话层：一句说得像你自己的描述 */
  plain: string;
  /** 行为层：一个本周就能试的可练习动作 */
  action: string;
}

/**
 * 太阳：核心气质（你是谁）× 12 星座。
 * 自 03 工单随白话体系一并迁入：事实卡的「选中太阳/月亮」白话段落与历史恢复的旧结果
 * 都仍按此库渲染（这部分是展示层词汇，不是 AI 产出，不随解读层接入而消失）。
 */
export const SUN_READINGS: Record<ZodiacSign, ElementReading> = {
  aries: { plain: '你习惯先做再说，冲在前面是你的舒适区。', action: '练习在开口前先数三秒，让判断追上行动。' },
  taurus: { plain: '你要的是看得见摸得着的踏实，慢，但不是拖延。', action: '练习每周留一件不为结果、只为喜欢的事。' },
  gemini: { plain: '你的脑子一直在转，好奇是你和世界之间的连接线。', action: '练习把一个想法讲完，再开始下一个话题。' },
  cancer: { plain: '你用照顾别人来表达在乎，也容易把自己排在最后。', action: '练习每天问一次自己：我现在感觉怎么样。' },
  leo: { plain: '你需要被看见，也愿意为认可的人全力以赴。', action: '练习把掌声分一半给幕后，包括那个努力的自己。' },
  virgo: { plain: '你看得见别人忽略的细节，习惯用把事情做好来证明价值。', action: '练习接受「足够好」，把挑剔留一半给温柔。' },
  libra: { plain: '你习惯先照顾气氛，再照顾自己。', action: '练习在附和别人之前，先说一句「我的想法是」。' },
  scorpio: { plain: '你爱得深、记得久，信任对你来说很贵。', action: '练习把「我没事」换成「我需要一点时间」。' },
  sagittarius: { plain: '你需要意义感，自由对你不是选项，而是氧气。', action: '练习把远方拆成这一周就能做的一小步。' },
  capricorn: { plain: '你习惯用扛住一切来证明可靠，很少喊累。', action: '练习把「我自己来」换成「帮我一下」。' },
  aquarius: { plain: '你站在人群里，心里保持着一点清醒的距离。', action: '练习在表达观点时，也说一句自己的感受。' },
  pisces: { plain: '你天生能感知别人的情绪，也容易把自己弄丢。', action: '练习每天留十分钟，分清哪些情绪是自己的。' },
};

/** 月亮：内在情绪（你需要什么才安心）× 12 星座 */
export const MOON_READINGS: Record<ZodiacSign, ElementReading> = {
  aries: { plain: '情绪来得快也去得快，你需要立刻被回应。', action: '练习发火前先说：我现在有点急。' },
  taurus: { plain: '稳定的关系和熟悉的味道，最能安抚你。', action: '练习在变化里给自己留一个不变的小仪式。' },
  gemini: { plain: '把感受说出来、聊清楚，你的情绪才算真的过去。', action: '练习找一个能听你讲完再回应的人。' },
  cancer: { plain: '你需要一个完全放松的角落，和少数真正亲近的人。', action: '练习直接说「陪我一下」，而不是等别人发现。' },
  leo: { plain: '被夸奖和被重视，是你的情绪充电宝。', action: '练习先自己肯定自己，再等别人的掌声。' },
  virgo: { plain: '把东西收拾整齐、把问题想清楚，你才会安心。', action: '练习允许房间乱一天，观察不安其实会过去。' },
  libra: { plain: '和谐的关系是你的氧气，冲突会让你内耗很久。', action: '练习把「随便」换成「我更想要这个」。' },
  scorpio: { plain: '你需要的是深度连接，浅寒暄满足不了你。', action: '练习在信任的人面前，先说出一点点真话。' },
  sagittarius: { plain: '空间感对你很重要，被管太多会觉得闷。', action: '练习告诉亲近的人：我需要的是信任，不是监督。' },
  capricorn: { plain: '把情绪转化成事情做，是你熟悉的安全感。', action: '练习难过时先不解决问题，先安静坐一会儿。' },
  aquarius: { plain: '你需要被理解，但更需要被允许不一样。', action: '练习直接说出你的特别，而不是等别人猜。' },
  pisces: { plain: '你吸收周围的情绪像海绵，需要一个排水的出口。', action: '练习用写、画或散步，放掉不属于自己的情绪。' },
};

/** 上升：外在表达（别人眼里的你）× 12 星座（无宫位档不出现） */
export const ASCENDANT_READINGS: Record<ZodiacSign, ElementReading> = {
  aries: { plain: '你给人的第一印象是直接、有劲、不太好惹。', action: '练习在必要时展示柔软，它不会让你变弱。' },
  taurus: { plain: '你看起来稳、可靠、慢条斯理，让人想依靠。', action: '练习偶尔让人看到：你也会紧张。' },
  gemini: { plain: '你显得健谈、机灵，什么话题都接得住。', action: '练习让对话偶尔停在严肃的地方，不急着岔开。' },
  cancer: { plain: '你给人温和、好亲近的感觉，像可以倾诉的对象。', action: '练习在不想听的时候，温和地说「改天聊」。' },
  leo: { plain: '你出场自带存在感，容易成为目光的焦点。', action: '练习把舞台偶尔让给别人，做一次鼓掌的人。' },
  virgo: { plain: '你看起来干练、细致、井井有条。', action: '练习让别人看到你手忙脚乱的一面，那也很可爱。' },
  libra: { plain: '你举止得体、好相处，容易给人留下好印象。', action: '练习不怕破坏气氛，说出那个不同的意见。' },
  scorpio: { plain: '你的气场偏冷静神秘，让人觉得你有故事。', action: '练习在想靠近的人面前，主动递一个台阶。' },
  sagittarius: { plain: '你显得开朗、直率，像永远有下一站。', action: '练习让别人看到你也有安静下来的时候。' },
  capricorn: { plain: '你给人成熟、靠谱的第一印象，像天生的大人。', action: '练习偶尔示弱，真正的关系从麻烦彼此开始。' },
  aquarius: { plain: '你看起来有点特别、有点距离，不容易被归类。', action: '练习在想融入时，先给一个微笑而不是观点。' },
  pisces: { plain: '你给人柔软、温和、有点梦幻的感觉。', action: '练习在被误解成好欺负时，清楚地说一次「不」。' },
};

export interface AstrologyBigThree {
  sun: ElementReading | null;
  moon: ElementReading | null;
  /** 无宫位档（时间未知 / 约时不稳定）恒为 null，绝不虚构 */
  ascendant: ElementReading | null;
}

/* ---------- 一句主轴 ---------- */

export interface AstrologyHeadline {
  /** 18–28 字（不计标点），第二人称，不绝对化 */
  text: string;
  /** 支持本主轴的事实引用键（≥2 项，可定位回盘面） */
  factReferences: string[];
}

/* ---------- 五大生活模块 ---------- */

/** 生活模块 id（数组顺序即展示顺序，对齐设计文档 §6.5 表格排序） */
export type ModuleId = 'who' | 'love' | 'career' | 'strengths' | 'week';

/** 模块固定顺序（服务端校验落位、前端排序共用同一顺序） */
export const ASTROLOGY_MODULE_ORDER: ModuleId[] = ['who', 'love', 'career', 'strengths', 'week'];

/** 模块中文标题（week 模块由系统组装，标题固定） */
export const ASTROLOGY_MODULE_TITLE: Record<ModuleId, string> = {
  who: '我是谁',
  love: '关系如何运作',
  career: '事业如何发挥',
  strengths: '我的优势与盲点',
  week: '本周宇宙提示',
};

/** 本周行动三角数据（week 模块携带；含明确起止日期与依据行运） */
export interface WeeklyGuidance {
  /** 本周区间，如「9 月 1 日 – 9 月 7 日」（按出生城市时区格式化） */
  weekRange: string;
  /** 依据行运说明（事实层筛后的最紧密行运，确定性文案） */
  transitNote: string;
  opportunity: string;
  caution: string;
  action: string;
  /** 只引用筛后行运（transit: 前缀引用键） */
  factReferences: string[];
}

export interface ModuleReading {
  id: ModuleId;
  title: string;
  /** 默认正文（≤120 字） */
  summary: string;
  /** 2–3 个短标签 */
  tags: string[];
  /** 具体行动建议（week 模块的行动即三角之「行动」） */
  action: string;
  /** 展开依据引用的真值键（可定位回星盘轮） */
  factReferences: string[];
  /** 「你可能会这样表现」真实场景（仅 who 模块） */
  scenario?: string;
  /** 行动三角（仅 week 模块；行运不可用时为 null，界面隐藏三角并说明） */
  weekly?: WeeklyGuidance | null;
}

/** 模块正文字数上限（设计文档 §6.5「默认正文不超过 120 字」） */
export const MAX_MODULE_SUMMARY_CHARS = 120;

/**
 * week 模块由模型书写的正文预算（字）：系统会在其前面拼接确定性的「区间：行运说明。」前缀，
 * 两者合计不超过 MAX_MODULE_SUMMARY_CHARS；提示词按本预算约束模型。
 */
export const WEEK_MODULE_SUMMARY_MAX_CHARS = 60;

/** 稳定相位按强度降序（strength null 排最后） */
function stableAspectsDesc(facts: AstrologyChartFacts): AspectFact[] {
  return facts.aspects
    .filter((a) => a.stability === 'stable')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
}

/* ---------- 引用键（事实层定位用，服务端校验与前端渲染同源） ---------- */

/** 相位引用键：两端星体按字母序固定，保证可复现 */
export function aspectRefKey(a: Pick<AspectFact, 'source' | 'target' | 'type'>): string {
  const [first, second] = [a.source, a.target].sort();
  return `aspect:${first}:${a.type}:${second}`;
}

/** 行运引用键：行运星体 → 本命星体（与相位键区分，界面标注「行运」） */
export function transitRefKey(t: Pick<TransitFact, 'transitingBody' | 'aspect' | 'natalTarget'>): string {
  return `transit:${t.transitingBody}:${t.aspect}:${t.natalTarget}`;
}

/**
 * 允许被解读引用的事实键全集（服务端据此白名单校验模型输出，前端据此渲染依据片）。
 * 只登记已确认稳定、可定位的字段：星座稳定的行星、含宫位档的角点与宫位、稳定相位、筛后行运。
 */
export function buildFactReferenceKeys(
  facts: AstrologyChartFacts,
  options: { transitRefKeys?: string[] } = {}
): string[] {
  const keys: string[] = [];
  for (const placement of facts.planets) {
    if (placement.sign === null) continue;
    keys.push(`planet:${placement.body}:sign`);
    if (placement.retrograde === true) keys.push(`planet:${placement.body}:retrograde`);
  }
  if (facts.angles.ascendant.sign) keys.push('angle:ascendant:sign');
  if (facts.angles.midheaven.sign) keys.push('angle:midheaven:sign');
  for (const house of facts.houses) keys.push(`house:${house.number}`);
  for (const aspect of stableAspectsDesc(facts)) keys.push(aspectRefKey(aspect));
  for (const ref of options.transitRefKeys ?? []) keys.push(ref);
  return keys;
}

/* ---------- 模块排序与反向定位（消费方共用） ---------- */

/**
 * 反向定位（设计文档 §6.6）：返回 factReferences 中引用了该星体的模块 id
 * （行星直引、其参与的本命相位或行运相位）。
 */
export function moduleIdsForBody(modules: ModuleReading[], body: PlanetBody): ModuleId[] {
  const planetPrefix = `planet:${body}:`;
  return modules
    .filter((m) =>
      m.factReferences.some((ref) => {
        if (ref.startsWith(planetPrefix)) return true;
        if (ref.startsWith('aspect:')) {
          const [, source, , target] = ref.split(':');
          return source === body || target === body;
        }
        if (ref.startsWith('transit:')) {
          const [, transiting, , natalTarget] = ref.split(':');
          return transiting === body || natalTarget === body;
        }
        return false;
      })
    )
    .map((m) => m.id);
}

/**
 * 关注主题排序（表单 step1 承诺「只调整报告的阅读顺序，不改变盘面」）：
 * 把 priority 指定的模块提到首位，其余保持原有相对顺序；priority 为 null 或不在列表中时原样返回。
 */
export function orderModulesByTopic(modules: ModuleReading[], priority: ModuleId | null): ModuleReading[] {
  if (!priority) return modules;
  const idx = modules.findIndex((m) => m.id === priority);
  if (idx <= 0) return modules;
  return [modules[idx], ...modules.slice(0, idx), ...modules.slice(idx + 1)];
}

/* ---------- 报告分区（服务端流式推送的形状，协议见 ./report-events.ts） ---------- */

/** modules 分区（模型产出；week 模块的三角由系统组装，见 attachWeeklyGuidance） */
export type AstrologyModulesSection = ModuleReading[];

/** 关键相位三段式文案（模型产出；与真值相位按 refKey 合并渲染） */
export interface AstrologyKeyAspectCopy {
  refKey: string;
  /** 能量关系：两颗星的主题词 + 相位白话 */
  energy: string;
  /** 生活表现：这股能量在生活里可能长什么样 */
  life: string;
  /** 练习建议：一个当下可做的小动作 */
  practice: string;
}

/**
 * transits 分区：本周行运与关键相位。
 * weekRange / transitNote 由服务端按筛后行运确定性生成，opportunity/caution/action 与
 * keyAspects 由模型基于筛后行运与稳定相位产出（模型不得引用被筛掉的行运）。
 */
export interface AstrologyTransitsSection {
  weekRange: string;
  transitNote: string;
  opportunity: string;
  caution: string;
  action: string;
  /** 引用的筛后行运键（transit: 前缀） */
  transitReferences: string[];
  /** 关键相位三段式（3–5 条，只允许稳定相位） */
  keyAspects: AstrologyKeyAspectCopy[];
}

/** 解读报告（四分区累计到达；未到达的分区为 null / 空数组，界面按分区骨架占位） */
export interface AstrologyInterpretationReport {
  headline: AstrologyHeadline | null;
  bigThree: AstrologyBigThree | null;
  modules: ModuleReading[];
  transits: AstrologyTransitsSection | null;
}

/* ---------- 关键相位合并（真值 + 模型文案） ---------- */

/** 相位事实 + 可复现引用键（深度区完整列表用，无需模型文案） */
export interface KeyAspectReference extends AspectFact {
  refKey: string;
}

/** 关键相位卡（继承相位事实本体，附加三段式解读） */
export interface KeyAspectReading extends KeyAspectReference {
  energy: string;
  life: string;
  practice: string;
}

/** 深度区展示条数上限（设计文档 §6.6：优先展示 3 至 5 条最有解释力的相位） */
export const KEY_ASPECT_TOP_LIMIT = 5;

/** 给单条稳定相位附上引用键 */
function toAspectReference(a: AspectFact): KeyAspectReference {
  return { ...a, refKey: aspectRefKey(a) };
}

/**
 * 模型文案 → 关键相位卡：只认盘面上确实稳定存在的相位（按 refKey 对齐），
 * 模型编造或指向不稳定相位的条目一律丢弃，重复引用只取第一条。
 */
export function buildKeyAspectReadings(
  facts: AstrologyChartFacts,
  copies: AstrologyKeyAspectCopy[]
): KeyAspectReading[] {
  const stableByKey = new Map(stableAspectsDesc(facts).map((a) => [aspectRefKey(a), a]));
  const seen = new Set<string>();
  const readings: KeyAspectReading[] = [];
  for (const copy of copies) {
    const fact = stableByKey.get(copy.refKey);
    if (!fact || seen.has(copy.refKey)) continue;
    seen.add(copy.refKey);
    readings.push({
      ...fact,
      refKey: copy.refKey,
      energy: copy.energy,
      life: copy.life,
      practice: copy.practice,
    });
  }
  // 深度区按强度降序呈现「最有解释力的 3–5 条」（与事实层相位总表同一口径）
  return readings.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
}

/** 深度区两个列表：top = 有模型三段式解读的稳定相位（强度降序，最多 5 条）；
 *  rest = 其余稳定相位（仅事实，供「展开完整列表」）。两者并集即全部稳定相位。 */
export function resolveKeyAspectList(
  facts: AstrologyChartFacts,
  copies: AstrologyKeyAspectCopy[]
): { top: KeyAspectReading[]; rest: KeyAspectReference[] } {
  const top = buildKeyAspectReadings(facts, copies).slice(0, KEY_ASPECT_TOP_LIMIT);
  const topKeys = new Set(top.map((a) => a.refKey));
  const rest = stableAspectsDesc(facts)
    .filter((a) => !topKeys.has(aspectRefKey(a)))
    .map(toAspectReference);
  return { top, rest };
}

/** 深度区完整结果（top + rest）：mock 模板拼装与 AI 分区的消费方共用同一形状 */
export interface KeyAspectsResult {
  /** 最有解释力的 3–5 条（强度降序；不足时如实返回现有条数，不凑数） */
  top: KeyAspectReading[];
  /** 其余稳定相位（完整列表展开用），同样按强度降序 */
  rest: KeyAspectReference[];
}

/* ---------- 本周行动三角组装 ---------- */

/** 按出生城市时区把自然周窗口格式化为「8 月 31 日 – 9 月 6 日」（end 为开区间） */
export function formatWeekRange(startMs: number, endMs: number, timeZone: string): string {
  const dayMonth = (ms: number): string => {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(ms));
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${Number(month)} 月 ${Number(day)} 日`;
  };
  // 窗口为半开区间 [start, end)：结束时刻减 1 天取到最后一个自然日
  return `${dayMonth(startMs)} – ${dayMonth(endMs - 24 * 60 * 60 * 1000)}`;
}

/** 行运引用键 → 依据句子（「行运太阳正与本命金星成合相（偏差约 1.2°）」） */
export function buildTransitNote(input: {
  transitingBody: PlanetBody;
  natalTarget: PlanetBody;
  aspect: AspectType;
  orb: number;
}): string {
  const { transitingBody, natalTarget, aspect, orb } = input;
  return `行运${PLANET_CN[transitingBody]}正与本命${PLANET_CN[natalTarget]}成${ASPECT_CN[aspect]}（偏差约 ${orb.toFixed(1)}°）`;
}

/** 拼接并收敛到字数上限内：必填段先行，可选段超出预算时整体舍弃（绝不截断句子） */
function composeCapped(required: string, optional: string, maxChars: number): string {
  if (!optional) return required;
  return required.length + optional.length <= maxChars ? `${required}${optional}` : required;
}

/**
 * 把 transits 分区的三角组装进 week 模块（结果页在 transits 分区到达后调用）：
 * - 摘要 = 系统生成的「区间：行运说明。」+ 模型写明的本周关注点（超出 120 字则只留系统前缀，不截句）；
 * - 三角 = 机会 / 留意 / 行动 + 筛后行运引用；week 模块的 factReferences 只用筛后行运。
 * transits 分区未到达时原样返回（week 模块保持无三角，界面按既有的「行运不可用」分支说明）。
 */
export function attachWeeklyGuidance(
  modules: ModuleReading[],
  transits: AstrologyTransitsSection | null
): ModuleReading[] {
  if (!transits) return modules;
  const existing = modules.find((m) => m.id === 'week');
  const prefix = `${transits.weekRange}：${transits.transitNote}。`;
  const weekly: WeeklyGuidance = {
    weekRange: transits.weekRange,
    transitNote: transits.transitNote,
    opportunity: transits.opportunity,
    caution: transits.caution,
    action: transits.action,
    factReferences: transits.transitReferences,
  };
  const week: ModuleReading = {
    id: 'week',
    title: existing?.title?.trim() || ASTROLOGY_MODULE_TITLE.week,
    // 模型正文按提示词控制在预算内；超预算时舍弃模型段而不是截断句子
    summary: composeCapped(prefix, existing?.summary ?? '', MAX_MODULE_SUMMARY_CHARS),
    tags: existing?.tags?.length ? existing.tags.slice(0, 3) : ['本周', '行运'],
    action: transits.action,
    factReferences: transits.transitReferences,
    weekly,
  };
  const others = modules.filter((m) => m.id !== 'week');
  const ordered = [...others, week].sort(
    (a, b) => ASTROLOGY_MODULE_ORDER.indexOf(a.id) - ASTROLOGY_MODULE_ORDER.indexOf(b.id)
  );
  return ordered;
}
