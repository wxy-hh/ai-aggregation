/**
 * astrology-prompt.ts —— 星座寰宇 · 解读提示词与事实层负载（03 工单）
 *
 * 事实层过滤（降级忠实，工单硬约束）：
 * - 只把已确认稳定的字段写进提示词：星座不稳的行星整颗剔除，度数/宫位不稳的只给星座，
 *   无宫位档不给上升、天顶与任何宫位；
 * - 不准进入提示词的内容写进 hiddenFacts，并明令模型不得编造或以模糊措辞暗示；
 * - 行运先按紧密度筛 Top N（≤8 条），行动三角只能引用筛后行运。
 *
 * 提示词组装：
 * - system：角色 + 合规边界 + 铁律（不重算、不编造、只引用白名单键、不绝对化）+ 四分区结构要求
 *   + 黄金主轴样例 few-shot（28 条，迁自 mock 层）；
 * - user：用户出生资料 + 盘面口径 + 确定性事实负载 + 允许引用键表 + 禁止提及清单。
 * DeepSeek 的弱约束由模型客户端把 JSON schema 序列化后追加到 system 末尾（injectJsonSchemaSample）。
 */

import type { AspectType, AstrologyChartFacts, PlanetBody, TimePrecision, ZodiacSign } from '@/lib/astrology/chart-facts';
import {
  ASPECT_CN,
  PLANET_CN,
  ZODIAC_CN,
} from '@/lib/astrology/zh-names';
import { aspectRefKey, buildFactReferenceKeys } from '@/lib/astrology/interpretation';
import type { SelectedTransit } from '@/lib/astrology/transit-selection';
import { buildGoldenHeadlinePromptSection } from './golden-headlines';

/* ---------- 事实层负载（进提示词的部分） ---------- */

export interface PromptPlanetPlacement {
  body: PlanetBody;
  label: string;
  sign: ZodiacSign;
  signLabel: string;
  /** 度数不稳定（约时档）时为 null，模型不得推测具体度数 */
  degree: number | null;
  /** 无宫位档（或宫位不稳定）时为 null */
  house: number | null;
  retrograde: boolean;
}

export interface PromptAngle {
  point: 'ascendant' | 'midheaven';
  label: string;
  sign: ZodiacSign;
  signLabel: string;
  degree: number | null;
}

export interface PromptHouse {
  number: number;
  sign: ZodiacSign;
  signLabel: string;
}

export interface PromptAspect {
  refKey: string;
  label: string;
  type: AspectType;
  typeLabel: string;
  orb: number;
  strength: number;
}

export interface PromptTransit {
  refKey: string;
  label: string;
  theme: string;
  /** 行运落在容许度内的时段（UTC ISO，已与自然周窗口取交集） */
  window: string;
  /** 估算最小偏差（度）；0 = 本周内精确成相 */
  orb: number;
  /** 整周都在容许度内的持续性行运 */
  coversWeek: boolean;
}

export interface AstrologyPromptPayload {
  timePrecision: TimePrecision;
  dataCompleteness: AstrologyChartFacts['dataCompleteness'];
  houseSystemLabel: string;
  /** 被降级隐藏、禁止提及的内容（提示词明令不得编造） */
  hiddenFacts: string[];
  planets: PromptPlanetPlacement[];
  angles: PromptAngle[];
  houses: PromptHouse[];
  aspects: PromptAspect[];
  transits: PromptTransit[];
  /** 唯一允许被引用的键 → 中文释义（模型必须逐字引用键本身） */
  factReferenceKeys: Record<string, string>;
}

/** 进入提示词的相位条数上限（按强度降序；再多只会稀释注意力） */
export const MAX_PROMPT_ASPECTS = 12;

/** 事实键 → 中文释义（依据片与提示词共用同一口径） */
function describeFactReference(
  ref: string,
  facts: AstrologyChartFacts,
  transitByKey: Map<string, SelectedTransit>
): string {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    if (parts[2] === 'retrograde') return `${PLANET_CN[body]}逆行`;
    const placement = facts.planets.find((p) => p.body === body);
    return placement?.sign ? `${PLANET_CN[body]}落${ZODIAC_CN[placement.sign]}` : PLANET_CN[body];
  }
  if (parts[0] === 'angle') {
    const isAsc = parts[1] === 'ascendant';
    const sign = isAsc ? facts.angles.ascendant.sign : facts.angles.midheaven.sign;
    return `${isAsc ? '上升' : '天顶'}${sign ? `落${ZODIAC_CN[sign]}` : ''}`;
  }
  if (parts[0] === 'house') {
    const house = facts.houses.find((h) => h.number === Number(parts[1]));
    return house ? `第 ${house.number} 宫（宫头${ZODIAC_CN[house.sign]}）` : `第 ${parts[1]} 宫`;
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return `${PLANET_CN[source as PlanetBody]} ${ASPECT_CN[type as AspectType]} ${PLANET_CN[target as PlanetBody]}`;
  }
  if (parts[0] === 'transit') {
    const selected = transitByKey.get(ref);
    const [, transiting, type, target] = parts;
    const base = `行运${PLANET_CN[transiting as PlanetBody]} ${ASPECT_CN[type as AspectType]} 本命${PLANET_CN[target as PlanetBody]}`;
    return selected ? `${base}（本时段估算偏差约 ${selected.orb.toFixed(1)}°）` : base;
  }
  return ref;
}

/** 降级档禁止提及的清单（诚实性口径：不猜测、不补算、不暗示） */
function buildHiddenFacts(facts: AstrologyChartFacts, timePrecision: TimePrecision): string[] {
  const hidden: string[] = [];
  if (facts.dataCompleteness === 'without-houses') {
    hidden.push(
      timePrecision === 'unknown'
        ? '出生时间未知：上升星座、天顶、十二宫宫位及其依赖结论全部不可得'
        : '所选时段内上升、天顶与宫位不稳定：这些字段已隐藏'
    );
  }
  const unstable = facts.planets.filter((p) => p.stability === 'unstable').map((p) => PLANET_CN[p.body]);
  if (unstable.length > 0) hidden.push(`时段内跨星座、已隐藏的行星：${unstable.join('、')}`);
  const signOnly = facts.planets.filter((p) => p.stability === 'signOnly').map((p) => PLANET_CN[p.body]);
  if (signOnly.length > 0) hidden.push(`度数不稳定、只可讲星座不讲度数的行星：${signOnly.join('、')}`);
  if (facts.factStability.aspects.displayable === false) hidden.push('相位在时段内不稳定，已隐藏');
  if (facts.transits.length === 0) hidden.push('本周行运数据不可用：不得编造本周天象或行星位置');
  return hidden;
}

/**
 * 事实层 → 提示词负载（唯一出口：所有进入模型的事实都必须经过本函数过滤）。
 */
export function buildAstrologyPromptPayload(
  facts: AstrologyChartFacts,
  options: { timePrecision: TimePrecision; selectedTransits: SelectedTransit[] }
): AstrologyPromptPayload {
  const transitByKey = new Map(options.selectedTransits.map((s) => [s.refKey, s]));

  const planets: PromptPlanetPlacement[] = facts.planets
    .filter((p) => p.sign !== null)
    .map((p) => ({
      body: p.body,
      label: PLANET_CN[p.body],
      sign: p.sign!,
      signLabel: ZODIAC_CN[p.sign!],
      degree: p.stability === 'stable' ? p.degree : null,
      house: facts.dataCompleteness === 'with-houses' ? p.house : null,
      retrograde: p.retrograde === true,
    }));

  const angles: PromptAngle[] = [];
  const { ascendant, midheaven } = facts.angles;
  if (ascendant.sign) {
    angles.push({
      point: 'ascendant',
      label: '上升',
      sign: ascendant.sign,
      signLabel: ZODIAC_CN[ascendant.sign],
      degree: ascendant.stability === 'stable' ? ascendant.degree : null,
    });
  }
  if (midheaven.sign) {
    angles.push({
      point: 'midheaven',
      label: '天顶',
      sign: midheaven.sign,
      signLabel: ZODIAC_CN[midheaven.sign],
      degree: midheaven.stability === 'stable' ? midheaven.degree : null,
    });
  }

  const houses: PromptHouse[] =
    facts.dataCompleteness === 'with-houses'
      ? facts.houses.map((h) => ({ number: h.number, sign: h.sign, signLabel: ZODIAC_CN[h.sign] }))
      : [];

  const aspects: PromptAspect[] = facts.aspects
    .filter((a) => a.stability === 'stable' && a.orb !== null && a.strength !== null)
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, MAX_PROMPT_ASPECTS)
    .map((a) => ({
      refKey: aspectRefKey(a),
      label: `${PLANET_CN[a.source]} ${ASPECT_CN[a.type]} ${PLANET_CN[a.target]}`,
      type: a.type,
      typeLabel: ASPECT_CN[a.type],
      orb: a.orb!,
      strength: a.strength!,
    }));

  const transits: PromptTransit[] = options.selectedTransits.map((selected) => ({
    refKey: selected.refKey,
    label: `${PLANET_CN[selected.fact.transitingBody]} ${ASPECT_CN[selected.fact.aspect]} 本命${PLANET_CN[selected.fact.natalTarget]}`,
    theme: selected.fact.theme,
    window: `${selected.fact.startsAt} ~ ${selected.fact.endsAt}`,
    orb: selected.orb,
    coversWeek: selected.coversWeek,
  }));

  const allowedKeys = buildFactReferenceKeys(facts, {
    transitRefKeys: options.selectedTransits.map((s) => s.refKey),
  });
  const factReferenceKeys: Record<string, string> = {};
  for (const key of allowedKeys) {
    factReferenceKeys[key] = describeFactReference(key, facts, transitByKey);
  }

  return {
    timePrecision: options.timePrecision,
    dataCompleteness: facts.dataCompleteness,
    houseSystemLabel:
      facts.houseSystem === 'placidus' ? '普拉西德制' : facts.houseSystem === 'whole-sign' ? '整宫制' : '无宫位',
    hiddenFacts: buildHiddenFacts(facts, options.timePrecision),
    planets,
    angles,
    houses,
    aspects,
    transits,
    factReferenceKeys,
  };
}

/* ---------- 提示词 ---------- */

/** 系统提示词（角色 + 合规边界 + 铁律 + 四分区要求 + 黄金主轴 few-shot） */
export function buildAstrologySystemPrompt(): string {
  return `
你是深耕占星文化的解读者，熟悉本命盘、宫位、相位与行运的传统读法，擅长把术语翻译成生活语言。

【合规声明】你的内容是基于文化传统的娱乐化自我探索参考，不得出现宿命论表述，不得声称能预测具体事件、
疾病、财务结果或法律结果，不得制造焦虑；医疗、财务、法律话题只给自我观察方向并建议寻求合格专业人士。

【事实层铁律】
1. 你拿到的星盘事实（行星落座、度数、宫位、相位、本周行运）已由本地星历算法确定性算好：只做解释，
   不得重算、不得改写、不得补充任何未被给出的事实。
2. hiddenFacts 列出的内容全部不可得：不得提及、不得猜测、不得用「大概/可能是/偏向」的方式暗示。
3. factReferenceKeys 是唯一允许引用的事实键表：headline.factReferences、modules[].factReferences、
   transits.transitReferences 里的每个字符串都必须逐字取自该表，且只引用与该段结论真正相关的事实。
4. 措辞一律使用「倾向、可能、适合留意、可以尝试」，禁止「一定、必然、注定、绝对、永远」。
5. 只输出一个 JSON 对象：不要 markdown 代码块、不要解释文字、不要思考过程。

【输出结构】必须是一个包含四个属性、顺序固定的 JSON 对象：
{
  "headline": { "text": "string", "factReferences": ["string"] },
  "bigThree": {
    "sun": { "plain": "string", "action": "string" } | null,
    "moon": { "plain": "string", "action": "string" } | null,
    "ascendant": { "plain": "string", "action": "string" } | null
  },
  "modules": [
    { "id": "who", "title": "string", "summary": "string", "scenario": "string", "tags": ["string"],
      "action": "string", "factReferences": ["string"] }
  ],
  "transits": {
    "opportunity": "string", "caution": "string", "action": "string",
    "transitReferences": ["string"],
    "keyAspects": [ { "refKey": "string", "energy": "string", "life": "string", "practice": "string" } ]
  }
}

【分区要求】
1. headline：一句主轴，18–28 字（不计标点），第二人称、有个人张力、能被记住，至少由两项事实共同支持
   （factReferences 至少两个键）。先给结论，不堆术语。参照下方黄金样例的语气与结构，但必须写这个人这张盘的专属结论，
   禁止直接抄用样例句子。
2. bigThree：只写白话层（plain，30–60 字，说得像他本人）与行为层（action，一个本周就能试的小动作，20–40 字）。
   术语层由系统按事实渲染，不要在文案里重复度数。
   - 事实里没有对应项的（无宫位档的上升、不稳定的月亮等）必须写 null，不得虚构。
   - ascendant 非 null 时，只允许引用事实里给出的上升星座。
3. modules：固定五个 id 与顺序 who（我是谁）/ love（关系如何运作）/ career（事业如何发挥）/
   strengths（我的优势与盲点）/ week（本周宇宙提示）。
   - title：该模块的个性化短标题（如「先稳后亮的表达者」），不要写模块名本身；week 的 title 写「本周宇宙提示」。
   - summary：≤120 字（week ≤60 字，系统会在前面补上本周区间与依据行运说明）；先结论后术语，落到现实场景。
   - who 额外写 scenario：一句「你可能会这样表现」的真实场景（40–80 字）。
   - tags：2–3 个短标签（每个 ≤8 字，如「太阳天秤」「月亮巨蟹」）。
   - action：一句本周可执行的动作（≤40 字）。
   - factReferences：至少一条允许键；无宫位档不得引用 angle: 与 house: 开头的键。
4. transits：只依据 transits 列表里给出的本周行运（这是筛后最紧密的行运），不得编造其他天象。
   - opportunity / caution / action：各 ≤50 字，分别写一件值得把握的事、一项可能的摩擦消耗、一件一周内可执行的动作。
   - transitReferences：至少一条 transits 键（无行运数据时留空数组）。
   - keyAspects：3–5 条，refKey 逐字取自 aspects 列表（本命稳定相位），按最有解释力挑选；
     energy 写能量关系（≤50 字，点出两颗星各自的主题），life 写生活表现（≤70 字），
     practice 写练习建议（≤40 字，具体可做）。

【黄金主轴样例】（语气与结构基准，禁止照抄）
${buildGoldenHeadlinePromptSection()}

全部文案使用简体中文，不出现英文单词与英文占星术语。
`.trim();
}

/** 用户提示词（出生资料 + 盘面口径 + 事实负载 + 允许引用键表 + 禁止提及清单） */
export function buildAstrologyUserPrompt(input: {
  profile: { name: string | null; birthDate: { year: number; month: number; day: number } };
  timePrecisionLabel: string;
  cityLabel: string;
  payload: AstrologyPromptPayload;
}): string {
  const { profile, payload } = input;
  const name = profile.name?.trim() || '星盘主人';
  return [
    '请只基于以下已经完成的本地星盘真值撰写解读，不要重算、不要改写任何星座、度数、宫位、相位或行运。',
    '用户原始信息（仅供你把握称呼与生活语境，不要在文案里复述出生资料）：',
    `称呼：${name}`,
    `出生日期：${profile.birthDate.year}-${profile.birthDate.month}-${profile.birthDate.day}`,
    `出生地：${input.cityLabel}`,
    `时间精度：${input.timePrecisionLabel}`,
    '',
    `盘面范围：${payload.dataCompleteness === 'with-houses' ? '含宫位完整盘' : '无宫位行星盘'} · ${payload.houseSystemLabel}`,
    '',
    'deterministicFacts（必须严格沿用）：',
    JSON.stringify(
      {
        planets: payload.planets,
        angles: payload.angles,
        houses: payload.houses,
        aspects: payload.aspects,
        transits: payload.transits,
      },
      null,
      2
    ),
    '',
    'factReferenceKeys（唯一允许引用的事实键表，键必须逐字引用）：',
    JSON.stringify(payload.factReferenceKeys, null, 2),
    '',
    payload.hiddenFacts.length > 0
      ? `hiddenFacts（以下内容不可得，禁止提及、猜测或暗示）：\n- ${payload.hiddenFacts.join('\n- ')}`
      : 'hiddenFacts：无（本盘所有字段均已确认稳定）。',
  ].join('\n');
}
