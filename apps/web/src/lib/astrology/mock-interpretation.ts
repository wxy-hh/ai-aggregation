/**
 * mock-interpretation.ts —— 星座寰宇 · mock 解读层（06 工单）
 *
 * 定位：前端先行期的解读数据源与文案基准。真值（AstrologyChartFacts）由 02 接缝
 * 即时产出；本文件把真值映射为「先生活语言、后专业证据」的解读内容：
 *
 * - 黄金主轴样例库（28 条，验收口径 20–30 条）：每条 18–28 字、不绝对化、
 *   至少由两项真值共同支持（factReferences 逐项可溯）。
 * - 大三要素文案库：太阳/月亮/上升 × 12 星座，各一句白话 + 一个可练习动作。
 * - 事实卡白话体系：行星主题词 × 星座方式短语 + 相位白话，点选星体时组合生成。
 *
 * 文案铁律（设计文档 §8.0/§9）：用「倾向/可能/练习」而非命定措辞；
 * 不出现「一定/必然/注定/绝对/永远」；先结论后术语；不虚构不稳定事实。
 * 真实 AI 解读接入后仅需替换 buildMockInterpretation 的实现绑定，消费方不改。
 */

import type {
  AspectFact,
  AspectType,
  AstrologyChartFacts,
  PlanetBody,
  ZodiacSign,
} from './chart-facts';
import { approximateSunLongitude } from './solar-longitude';
import { separation, signOfLongitude } from './mock-chart-facts';
import { ASPECT_CN, PLANET_CN, ZODIAC_CN, ZODIAC_ORDER } from './zh-names';

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

/* ---------- 黄金主轴样例库（28 条：16 日月元素 + 8 相位主题 + 4 太阳元素兜底） ---------- */

/**
 * 主轴样例：每条含适用条件说明（注释）与文案本体；
 * 选择逻辑见 pickHeadline，factReferences 在选择时按真实盘面生成。
 */
export interface GoldenHeadline {
  id: string;
  text: string;
}

/** 日月元素组合 16 条（太阳元素 × 月亮元素，两项真值：太阳星座 + 月亮星座） */
export const SUN_MOON_HEADLINES: Record<`${ZodiacElement}-${ZodiacElement}`, GoldenHeadline> = {
  'fire-fire': { id: 'sm-fire-fire', text: '心里那团火是真的，练习把它慢慢烧，而不是一次点亮全场。' },
  'fire-earth': { id: 'sm-fire-earth', text: '想冲的时候也想要稳，练习在行动前先给自己三秒落地。' },
  'fire-air': { id: 'sm-fire-air', text: '灵感跑得比行动快，练习先做完一件事，再追下一个想法。' },
  'fire-water': { id: 'sm-fire-water', text: '外表一直向前冲，心里其实很柔软，两种状态都值得被允许。' },
  'earth-fire': { id: 'sm-earth-fire', text: '稳是你的底色，别忽略心里那阵忽然想烧起来的冲动。' },
  'earth-earth': { id: 'sm-earth-earth', text: '你习惯把一切都扛稳，练习偶尔把重量分给值得的人。' },
  'earth-air': { id: 'sm-earth-air', text: '一边想落地，一边想透气，这两个你都需要被认真对待。' },
  'earth-water': { id: 'sm-earth-water', text: '你用稳定保护着敏感，练习把感受也写进计划里。' },
  'air-fire': { id: 'sm-air-fire', text: '想法转得快，情绪来得急，练习让表达跟上心跳的速度。' },
  'air-earth': { id: 'sm-air-earth', text: '脑子里的想法很多，心里的不安也不少，练习把聊天变成依靠。' },
  'air-air': { id: 'sm-air-air', text: '你活在信息与灵感里，练习每天留一段不被打扰的安静。' },
  'air-water': { id: 'sm-air-water', text: '理性分析的背后藏着细腻，练习先说感受，再讲道理。' },
  'water-fire': { id: 'sm-water-fire', text: '温柔的外表下有股倔劲，练习直接说出你真正想要的。' },
  'water-earth': { id: 'sm-water-earth', text: '共情很强又要求稳，练习在照顾别人之前先照顾自己。' },
  'water-air': { id: 'sm-water-air', text: '感受很深，表达很轻，练习把情绪翻译成别人懂的话。' },
  'water-water': { id: 'sm-water-water', text: '你像深水一样感受世界，练习给情绪找一个稳定的出口。' },
};

/** 相位主题 8 条（强相位优先；两项以上真值：相位两端星体 + 相位本身） */
export type AspectThemeKey =
  | 'sun-moon'
  | 'sun-jupiter'
  | 'sun-saturn'
  | 'moon-venus'
  | 'moon-saturn'
  | 'mercury-venus'
  | 'venus-mars'
  | 'retrograde-cluster';

export const ASPECT_THEME_HEADLINES: Record<AspectThemeKey, GoldenHeadline> = {
  'sun-moon': { id: 'ax-sun-moon', text: '外在的选择和内心的需求常拉扯，而这正是你成长的燃料。' },
  'sun-jupiter': { id: 'ax-sun-jupiter', text: '你天生容易看见可能性，练习把乐观落成具体的下一步。' },
  'sun-saturn': { id: 'ax-sun-saturn', text: '你对自己的要求一直很高，练习把标准变成节奏，而不是压力。' },
  'moon-venus': { id: 'ax-moon-venus', text: '你对爱与美天生敏感，练习把这份敏感变成照顾自己的能力。' },
  'moon-saturn': { id: 'ax-moon-saturn', text: '情绪习惯先收起来，练习在信任的人面前先开口。' },
  'mercury-venus': { id: 'ax-mercury-venus', text: '你有把话说得好听的天赋，练习用它说出真正重要的事。' },
  'venus-mars': { id: 'ax-venus-mars', text: '爱和行动力在你身上住得很近，练习让喜欢变成具体的靠近。' },
  'retrograde-cluster': { id: 'ax-retro-cluster', text: '你的节奏比别人慢一点、深一点，练习不拿别人的速度要求自己。' },
};

/** 太阳元素兜底 4 条（月亮不稳定时使用；真值：太阳星座 + 上升或最强相位） */
export const SUN_ELEMENT_HEADLINES: Record<ZodiacElement, GoldenHeadline> = {
  fire: { id: 'se-fire', text: '你带着火象的直觉行事，练习给热情配一个可以落脚的计划。' },
  earth: { id: 'se-earth', text: '你习惯用踏实验证自己，练习相信过程，而不只看结果。' },
  air: { id: 'se-air', text: '你靠思考理解世界，练习偶尔让感受先于分析发言。' },
  water: { id: 'se-water', text: '你凭感受丈量世界，练习给直觉一个说出口的机会。' },
};

/** 黄金样例库全量（验收：20–30 条；当前 16 + 8 + 4 = 28 条） */
export const GOLDEN_HEADLINES: GoldenHeadline[] = [
  ...Object.values(SUN_MOON_HEADLINES),
  ...Object.values(ASPECT_THEME_HEADLINES),
  ...Object.values(SUN_ELEMENT_HEADLINES),
];

/* ---------- 大三要素文案库（太阳/月亮/上升 × 12 星座：白话层 + 行为层） ---------- */

export interface ElementReading {
  /** 白话层：一句说得像你自己的描述 */
  plain: string;
  /** 行为层：一个本周就能试的可练习动作 */
  action: string;
}

/** 太阳：核心气质（你是谁） */
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

/** 月亮：内在情绪（你需要什么才安心） */
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

/** 上升：外在表达（别人眼里的你） */
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

/* ---------- 事实卡白话组合（点选星体 / 等价文本清单共用） ---------- */

/** 行星落座白话句：「你的情绪需要，倾向以细腻而保护的方式呈现。」 */
export function planetPlainSentence(body: PlanetBody, sign: ZodiacSign): string {
  return `你的${PLANET_THEME[body]}，倾向以${SIGN_STYLE[sign]}的方式呈现。`;
}

/** 相位白话句：「月亮与金星自然同频：两种能量自然同频，是你的舒适天赋。」→ 组合在调用处完成 */
export function aspectPlainSentence(type: AspectType): string {
  return ASPECT_PLAIN[type];
}

/* ---------- 主轴选择（至少两项真值共同支持，不绝对化） ---------- */

export interface HeadlineResult {
  text: string;
  sampleId: string;
  /** 支持本主轴的真值引用键（≥2 项，供「展开依据」定位） */
  factReferences: string[];
}

/** 相位主题匹配表：无序星体对 → 主题键（取盘面上最强的匹配相位） */
const ASPECT_THEME_PAIRS: Array<{ key: AspectThemeKey; pair: [PlanetBody, PlanetBody] }> = [
  { key: 'sun-moon', pair: ['sun', 'moon'] },
  { key: 'sun-jupiter', pair: ['sun', 'jupiter'] },
  { key: 'sun-saturn', pair: ['sun', 'saturn'] },
  { key: 'moon-venus', pair: ['moon', 'venus'] },
  { key: 'moon-saturn', pair: ['moon', 'saturn'] },
  { key: 'mercury-venus', pair: ['mercury', 'venus'] },
  { key: 'venus-mars', pair: ['venus', 'mars'] },
];

/** 相位引用键：两端星体按字母序固定，保证可复现 */
export function aspectRefKey(a: AspectFact): string {
  const [first, second] = [a.source, a.target].sort();
  return `aspect:${first}:${a.type}:${second}`;
}

/** 强相位阈值：strength ≥ 0.7 才够格当主轴依据（strength 为 null = 不稳定，不可用） */
const STRONG_ASPECT_STRENGTH = 0.7;

/** 个人行星逆行簇阈值：≥2 颗个人行星（日～土）逆行时启用「慢一点深一点」主题 */
const RETRO_CLUSTER_MIN = 2;
const PERSONAL_BODIES: PlanetBody[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/**
 * 从真值选出一句主轴。优先级：
 * 1) 强相位主题（strength ≥ 0.7 且命中主题表，最强者优先；逆行簇紧随其后）
 * 2) 太阳 × 月亮元素组合（两者星座均稳定）
 * 3) 太阳元素兜底（太阳稳定即可；第二真值取上升或最强稳定相位）
 * 真值不足以支持任何一条时返回 null（结果页此时隐藏主轴区，不虚构结论）。
 */
export function pickHeadline(facts: AstrologyChartFacts): HeadlineResult | null {
  const signOf = (body: PlanetBody) => facts.planets.find((p) => p.body === body)?.sign ?? null;

  // 1) 强相位主题：按强度降序找第一个命中主题表的稳定相位
  const stableAspects = facts.aspects
    .filter((a) => a.stability === 'stable' && a.strength !== null)
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  for (const aspect of stableAspects) {
    if ((aspect.strength ?? 0) < STRONG_ASPECT_STRENGTH) break;
    const hit = ASPECT_THEME_PAIRS.find(
      ({ pair }) =>
        (aspect.source === pair[0] && aspect.target === pair[1]) ||
        (aspect.source === pair[1] && aspect.target === pair[0])
    );
    if (hit) {
      const sample = ASPECT_THEME_HEADLINES[hit.key];
      return {
        text: sample.text,
        sampleId: sample.id,
        factReferences: [
          aspectRefKey(aspect),
          `planet:${aspect.source}:sign`,
          `planet:${aspect.target}:sign`,
        ],
      };
    }
  }

  // 1b) 逆行簇：≥2 颗个人行星稳定逆行（无强相位主题时）
  const retroBodies = facts.planets.filter(
    (p) => PERSONAL_BODIES.includes(p.body) && p.retrograde === true && p.stability !== 'unstable'
  );
  if (retroBodies.length >= RETRO_CLUSTER_MIN) {
    const sample = ASPECT_THEME_HEADLINES['retrograde-cluster'];
    const sunSign = signOf('sun');
    const refs = retroBodies.slice(0, 3).map((p) => `planet:${p.body}:retrograde`);
    if (sunSign) refs.push('planet:sun:sign');
    return { text: sample.text, sampleId: sample.id, factReferences: refs };
  }

  // 2) 太阳 × 月亮元素组合
  const sunSign = signOf('sun');
  const moonSign = signOf('moon');
  if (sunSign && moonSign) {
    const key = `${SIGN_ELEMENT[sunSign]}-${SIGN_ELEMENT[moonSign]}` as const;
    const sample = SUN_MOON_HEADLINES[key];
    return {
      text: sample.text,
      sampleId: sample.id,
      factReferences: ['planet:sun:sign', 'planet:moon:sign'],
    };
  }

  // 3) 太阳元素兜底：第二真值取上升星座或最强稳定相位
  if (sunSign) {
    const sample = SUN_ELEMENT_HEADLINES[SIGN_ELEMENT[sunSign]];
    const refs = ['planet:sun:sign'];
    if (facts.angles.ascendant.sign) {
      refs.push('angle:ascendant:sign');
    } else if (stableAspects[0]) {
      refs.push(aspectRefKey(stableAspects[0]));
    }
    if (refs.length < 2) return null; // 仅一项真值不出主轴，宁缺毋滥
    return { text: sample.text, sampleId: sample.id, factReferences: refs };
  }

  return null;
}

/* ---------- 组装：mock 解读输出 ---------- */

export interface AstrologyMockInterpretation {
  headline: HeadlineResult | null;
  /** 大三要素；不可用项为 null（不预留占位、不伪装待定） */
  bigThree: {
    sun: ElementReading | null;
    moon: ElementReading | null;
    ascendant: ElementReading | null;
  };
  /** 是否为完整盘（决定标题用「大三要素」还是「核心要素」） */
  withHouses: boolean;
}

/**
 * 把星盘真值映射为 mock 解读（同步即时返回，流式节奏由展示层负责）。
 * 所有分支只读稳定事实：星座为 null 的要素直接缺项，绝不编造。
 */
export function buildMockInterpretation(facts: AstrologyChartFacts): AstrologyMockInterpretation {
  const withHouses = facts.dataCompleteness === 'with-houses';
  const signOf = (body: PlanetBody) => facts.planets.find((p) => p.body === body)?.sign ?? null;
  const sunSign = signOf('sun');
  const moonSign = signOf('moon');
  const ascSign = facts.angles.ascendant.sign;
  return {
    headline: pickHeadline(facts),
    bigThree: {
      sun: sunSign ? SUN_READINGS[sunSign] : null,
      moon: moonSign ? MOON_READINGS[moonSign] : null,
      // 上升仅在完整盘且稳定时出现；无宫位档绝不虚构
      ascendant: withHouses && ascSign ? ASCENDANT_READINGS[ascSign] : null,
    },
    withHouses,
  };
}

/* ═══════════════════════ 07 工单：五大生活模块与本周行动三角 ═══════════════════════
 *
 * 模块文案由本文件白话体系（READINGS / SIGN_STYLE / PLANET_THEME / ASPECT_PLAIN）
 * 与盘面真值组合生成：先结论后依据、措辞「倾向/可能/可以尝试」、默认正文 ≤120 字。
 * 展开依据只引用 factReferences 里的已确认事实；行运来自真实近似天文计算
 * （approximateSunLongitude，误差 <0.1°），不是虚构数据。
 */

/** 生活模块 id（数组顺序即展示顺序，对齐设计文档 §6.5 表格排序） */
export type ModuleId = 'who' | 'love' | 'career' | 'strengths' | 'week';

/** 本周行动三角数据（week 模块携带；含明确起止日期与依据行运） */
export interface WeeklyGuidance {
  /** 本周区间，如「9 月 1 日 – 9 月 7 日」（周一为始） */
  weekRange: string;
  /** 依据行运说明（近似天文计算，标注口径） */
  transitNote: string;
  opportunity: string;
  caution: string;
  action: string;
  factReferences: string[];
}

export interface ModuleReading {
  id: ModuleId;
  title: string;
  /** 默认正文（≤120 字） */
  summary: string;
  /** 2–3 个短标签 */
  tags: string[];
  /** 具体行动建议 */
  action: string;
  /** 展开依据引用的真值键（可定位回星盘轮） */
  factReferences: string[];
  /** 「你可能会这样表现」真实场景（仅 who 模块） */
  scenario?: string;
  /** 行动三角（仅 week 模块；为 null 时界面隐藏三角并说明本命盘报告不受影响） */
  weekly?: WeeklyGuidance | null;
}

/** 拼接并收敛到 120 字内：必填段先行，可选段从尾部依次舍弃（绝不截断句子） */
function composeSummary(required: string, ...optional: Array<string | null | undefined>): string {
  let text = required;
  for (const part of optional) {
    if (part && (text + part).length <= 120) text += part;
  }
  return text;
}

/** 稳定相位按强度降序（strength null 排最后） */
function stableAspectsDesc(facts: AstrologyChartFacts): AspectFact[] {
  return facts.aspects
    .filter((a) => a.stability === 'stable')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
}

/** 本周行动三角：周一为始的真实日期区间 + 行运太阳近似（真实天文，周中正午取值） */
export function buildWeeklyGuidance(facts: AstrologyChartFacts, now: Date = new Date()): WeeklyGuidance {
  const dow = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  const weekRange = `${fmt(monday)} – ${fmt(sunday)}`;

  // 行运太阳近似视黄经（取本周三周中，日内变化 <1°）
  const mid = new Date(monday);
  mid.setDate(monday.getDate() + 3);
  const sunLon = approximateSunLongitude({ year: mid.getFullYear(), month: mid.getMonth() + 1, day: mid.getDate() });
  const sunSignNow = signOfLongitude(sunLon);

  // 行运太阳与本命行星的合相（容许度 6°，取最近者；只碰稳定事实）
  let best: { body: PlanetBody; sep: number } | null = null;
  for (const p of facts.planets) {
    if (p.sign === null || p.degree === null || p.stability !== 'stable') continue;
    const lon = ZODIAC_ORDER.indexOf(p.sign) * 30 + p.degree;
    const sep = separation(sunLon, lon);
    if (sep <= 6 && (best === null || sep < best.sep)) best = { body: p.body, sep };
  }

  const withHouses = facts.dataCompleteness === 'with-houses';
  let transitNote: string;
  if (best) {
    transitNote = `行运太阳正与本命${PLANET_CN[best.body]}相聚（偏差约 ${best.sep.toFixed(1)}°）`;
  } else if (withHouses && facts.angles.ascendant.sign) {
    const ascIdx = ZODIAC_ORDER.indexOf(facts.angles.ascendant.sign);
    const house = ((ZODIAC_ORDER.indexOf(sunSignNow) - ascIdx + 12) % 12) + 1;
    transitNote = `行运太阳正经过你的第 ${house} 宫（${ZODIAC_CN[sunSignNow]}）`;
  } else {
    transitNote = `行运太阳正经过${ZODIAC_CN[sunSignNow]}`;
  }

  const stable = stableAspectsDesc(facts);
  const harmony = stable.find((a) => a.type === 'trine' || a.type === 'sextile' || a.type === 'conjunction');
  const tension = stable.find((a) => a.type === 'square' || a.type === 'opposition');

  const opportunity = harmony
    ? `${PLANET_CN[harmony.source]}与${PLANET_CN[harmony.target]}本周容易自然同频：适合把「${PLANET_THEME[harmony.target]}」相关的事往前推一步。`
    : '本周相位温和，适合主动创造一次小的新鲜体验，给能量一个出口。';
  const caution = tension
    ? `${PLANET_CN[tension.source]}与${PLANET_CN[tension.target]}的拉扯本周可能更明显：先照顾情绪，再处理问题。`
    : '本周没有明显的拉扯相位，留意别因为太顺而透支休息。';
  const action = best
    ? `趁行运太阳点亮本命${PLANET_CN[best.body]}，本周可以主动做一件与「${PLANET_THEME[best.body]}」有关的小事。`
    : '本周可以尝试：睡前写下三件今天做得不错的小事。';

  const factReferences = [
    harmony ? aspectRefKey(harmony) : null,
    tension ? aspectRefKey(tension) : null,
    best ? `planet:${best.body}:sign` : null,
  ].filter((r): r is string => r !== null);

  return { weekRange, transitNote, opportunity, caution, action, factReferences };
}

/* ---------- 五个模块构建器（各自只读稳定事实，缺项即缺，不虚构） ---------- */

function buildWhoModule(facts: AstrologyChartFacts): ModuleReading | null {
  const signOf = (body: PlanetBody) => facts.planets.find((p) => p.body === body)?.sign ?? null;
  const sun = signOf('sun');
  if (!sun) return null;
  const moon = signOf('moon');
  const asc = facts.dataCompleteness === 'with-houses' ? facts.angles.ascendant.sign : null;
  return {
    id: 'who',
    title: '我是谁',
    summary: composeSummary(
      SUN_READINGS[sun].plain,
      moon ? MOON_READINGS[moon].plain : null,
      asc ? ASCENDANT_READINGS[asc].plain : null
    ),
    scenario:
      asc && moon
        ? `你可能这样：在人群里${SIGN_STYLE[asc]}，独处时情绪来得${SIGN_STYLE[moon]}——两种状态都是真的你。`
        : undefined,
    action: SUN_READINGS[sun].action,
    tags: [
      `太阳 ${ZODIAC_CN[sun]}`,
      moon ? `月亮 ${ZODIAC_CN[moon]}` : null,
      asc ? `上升 ${ZODIAC_CN[asc]}` : null,
    ].filter((t): t is string => t !== null),
    factReferences: [
      'planet:sun:sign',
      moon ? 'planet:moon:sign' : null,
      asc ? 'angle:ascendant:sign' : null,
    ].filter((r): r is string => r !== null),
  };
}

function buildLoveModule(facts: AstrologyChartFacts): ModuleReading | null {
  const signOf = (body: PlanetBody) => facts.planets.find((p) => p.body === body)?.sign ?? null;
  const moon = signOf('moon');
  const venus = signOf('venus');
  const mars = signOf('mars');
  if (!moon && !venus) return null;
  // 冲突触发点：触及月亮/金星/火星的最强紧张相位
  const tension = stableAspectsDesc(facts).find(
    (a) =>
      (a.type === 'square' || a.type === 'opposition') &&
      [a.source, a.target].some((b) => b === 'moon' || b === 'venus' || b === 'mars')
  );
  const house7 = facts.dataCompleteness === 'with-houses' ? facts.houses.find((h) => h.number === 7) : undefined;
  return {
    id: 'love',
    title: '关系如何运作',
    summary: composeSummary(
      moon ? `在关系里，你的情绪需要倾向${SIGN_STYLE[moon]}。` : `你表达在乎的方式偏向${SIGN_STYLE[venus!]}。`,
      moon && venus ? `表达在乎的方式偏向${SIGN_STYLE[venus]}。` : null,
      tension
        ? `当${PLANET_CN[tension.source]}与${PLANET_CN[tension.target]}较劲时，容易把小事放大成情绪——留意它，而不是责怪自己。`
        : null,
      facts.dataCompleteness === 'without-houses' ? '时间未知时本模块不引用宫位结论。' : null
    ),
    action: moon ? MOON_READINGS[moon].action : '练习在关系里先说感受，再谈事情。',
    tags: [
      venus ? `金星 ${ZODIAC_CN[venus]}` : null,
      mars ? `火星 ${ZODIAC_CN[mars]}` : null,
      house7 ? `第七宫 ${ZODIAC_CN[house7.sign]}` : null,
    ]
      .filter((t): t is string => t !== null)
      .slice(0, 3),
    factReferences: [
      moon ? 'planet:moon:sign' : null,
      venus ? 'planet:venus:sign' : null,
      mars ? 'planet:mars:sign' : null,
      house7 ? 'house:7' : null,
      tension ? aspectRefKey(tension) : null,
    ].filter((r): r is string => r !== null),
  };
}

function buildCareerModule(facts: AstrologyChartFacts): ModuleReading | null {
  const signOf = (body: PlanetBody) => facts.planets.find((p) => p.body === body)?.sign ?? null;
  const sun = signOf('sun');
  const mercury = signOf('mercury');
  const saturn = signOf('saturn');
  if (!sun) return null;
  const withHouses = facts.dataCompleteness === 'with-houses';
  const mc = withHouses ? facts.angles.midheaven.sign : null;
  const house10 = withHouses ? facts.houses.find((h) => h.number === 10) : undefined;
  return {
    id: 'career',
    title: '事业如何发挥',
    summary: mc
      ? composeSummary(
          `你的优势场景偏向需要${SIGN_STYLE[mc]}的舞台。`,
          mercury ? `推进工作时${SIGN_STYLE[mercury]}。` : null,
          saturn ? `压力对你更像节奏问题：${SIGN_STYLE[saturn]}的责任感值得被善用，而不是硬扛。` : null
        )
      : composeSummary(
          `不引用宫位：你的核心驱动力倾向${SIGN_STYLE[sun]}。`,
          mercury ? `思考与表达${SIGN_STYLE[mercury]}。` : null,
          saturn ? `面对责任的方式${SIGN_STYLE[saturn]}。` : null
        ),
    action: '本周期可以尝试：把一件重要的事拆成今天就能完成的最小一步，先让它发生。',
    tags: [
      mc ? `天顶 ${ZODIAC_CN[mc]}` : `太阳 ${ZODIAC_CN[sun]}`,
      house10 ? `第十宫 ${ZODIAC_CN[house10.sign]}` : null,
      mercury ? `水星 ${ZODIAC_CN[mercury]}` : null,
    ]
      .filter((t): t is string => t !== null)
      .slice(0, 3),
    factReferences: [
      mc ? 'angle:midheaven:sign' : 'planet:sun:sign',
      mercury ? 'planet:mercury:sign' : null,
      saturn ? 'planet:saturn:sign' : null,
      house10 ? 'house:10' : null,
    ].filter((r): r is string => r !== null),
  };
}

function buildStrengthsModule(facts: AstrologyChartFacts): ModuleReading | null {
  const stable = stableAspectsDesc(facts);
  const gifts = stable.filter((a) => a.type === 'trine' || a.type === 'sextile' || a.type === 'conjunction').slice(0, 3);
  const drain = stable.find((a) => a.type === 'square' || a.type === 'opposition');
  const saturn = facts.planets.find((p) => p.body === 'saturn' && p.sign !== null);
  if (gifts.length === 0 && !drain) return null;
  return {
    id: 'strengths',
    title: '我的优势与盲点',
    summary: composeSummary(
      gifts.length > 0
        ? `三项天赋：${gifts.map((a) => `${PLANET_CN[a.source]}与${PLANET_CN[a.target]}的同频`).join('、')}。`
        : '你的盘面相位分布温和，天赋更依赖主动调用。',
      drain ? `高频消耗：当${PLANET_CN[drain.source]}与${PLANET_CN[drain.target]}较劲，你可能在两端之间反复内耗。` : null,
      saturn?.sign ? `边界提示：责任边界倾向${SIGN_STYLE[saturn.sign]}，值得观察它何时变成自我苛求。` : null
    ),
    action: '练习每周记录一个「毫不费力却做得好」的瞬间，那就是天赋在工作。',
    tags: [
      ...gifts.slice(0, 2).map((a) => `${PLANET_CN[a.source]}·${PLANET_CN[a.target]} ${ASPECT_CN[a.type]}`),
      drain ? `留意 ${PLANET_CN[drain.source]}·${PLANET_CN[drain.target]}` : null,
    ]
      .filter((t): t is string => t !== null)
      .slice(0, 3),
    factReferences: [...gifts.map(aspectRefKey), ...(drain ? [aspectRefKey(drain)] : [])],
  };
}

function buildWeekModule(facts: AstrologyChartFacts, now: Date): ModuleReading {
  const weekly = buildWeeklyGuidance(facts, now);
  return {
    id: 'week',
    title: '本周宇宙提示',
    summary: composeSummary(
      `${weekly.weekRange}：${weekly.transitNote}。`,
      '机会、留意与行动都只基于你盘面已确认的事实。'
    ),
    action: weekly.action,
    tags: ['本周', '行运太阳'],
    factReferences: weekly.factReferences,
    weekly,
  };
}

/**
 * 五大生活模块（固定顺序：我是谁 / 关系如何运作 / 事业如何发挥 / 我的优势与盲点 / 本周宇宙提示）。
 * 事实不足的模块直接缺项（返回数组不含它），界面不渲染占位。
 */
export function buildModuleReadings(facts: AstrologyChartFacts, now: Date = new Date()): ModuleReading[] {
  return [
    buildWhoModule(facts),
    buildLoveModule(facts),
    buildCareerModule(facts),
    buildStrengthsModule(facts),
    buildWeekModule(facts, now),
  ].filter((m): m is ModuleReading => m !== null);
}

/* ═══════════════════════ 08 工单：P0 深度区（关键相位 + 反向定位） ═══════════════════════
 *
 * 关键相位卡三段式文案（能量关系 / 生活表现 / 练习建议）由相位类型模板 + 行星主题词
 * 组合生成：只读稳定相位，强度降序取前 5 条为「最有解释力」，其余进完整列表。
 * 措辞延续铁律：倾向/可能/练习，不绝对化，不虚构不稳定事实。
 */

/** 相位的生活表现模板（{a}=source 主题词，{b}=target 主题词） */
const ASPECT_LIFE: Record<AspectType, (a: string, b: string) => string> = {
  conjunction: (a, b) =>
    `「${a}」与「${b}」几乎长在一起：你很难把它们分开看待，相关场景里它们总是一同出现、一同发力。`,
  sextile: (a, b) =>
    `「${a}」与「${b}」之间有一条顺手的通道：只要你愿意主动一点，它们很容易互相配合、彼此成就。`,
  square: (a, b) =>
    `「${a}」与「${b}」互相较劲：在两者都重要的场景里，你可能感到紧绷，像被两股力同时拉扯。`,
  trine: (a, b) =>
    `「${a}」与「${b}」天然同频：相关的事你做起来毫不费力，以至于你可能一直没把它当作天赋。`,
  opposition: (a, b) =>
    `「${a}」与「${b}」在拔河：你可能在两端之间摆荡，先成全一端、再补偿另一端。`,
};

/** 相位的练习建议模板（具体、当下可做） */
const ASPECT_PRACTICE: Record<AspectType, (a: string, b: string) => string> = {
  conjunction: (a, b) => `练习：这周找一件能同时用上「${a}」和「${b}」的小事，观察它们怎样互相加分。`,
  sextile: (a, b) => `练习：主动给「${b}」安排一个小机会，「${a}」倾向帮你把它接住。`,
  square: (a, b) => `练习：紧绷时先问自己——此刻是「${a}」还是「${b}」在喊话？先回应声音大的那一端。`,
  trine: (a, b) => `练习：留意那些「毫不费力却做得好」的瞬间，这周刻意多用一次。`,
  opposition: (a, b) => `练习：别急着选边站，给「${a}」与「${b}」各留一点空间——平衡比胜负重要。`,
};

/** 关键相位卡（继承相位事实本体，附加三段式解读与可复现引用键） */
export interface KeyAspectReading extends AspectFact {
  /** 与生活模块同口径的引用键（aspectRefKey） */
  refKey: string;
  /** 能量关系：两颗星的主题词 + 相位白话 */
  energy: string;
  /** 生活表现：这股能量在生活里可能长什么样 */
  life: string;
  /** 练习建议：一个当下可做的小动作 */
  practice: string;
}

export interface KeyAspectsResult {
  /** 最有解释力的 3–5 条（强度降序；稳定相位不足 3 条时如实返回现有条数，不凑数） */
  top: KeyAspectReading[];
  /** 其余稳定相位（完整列表展开用），同样按强度降序 */
  rest: KeyAspectReading[];
}

/** 给单条稳定相位附上三段式解读 */
function toKeyAspectReading(a: AspectFact): KeyAspectReading {
  const themeA = PLANET_THEME[a.source];
  const themeB = PLANET_THEME[a.target];
  return {
    ...a,
    refKey: aspectRefKey(a),
    energy: `${PLANET_CN[a.source]}的「${themeA}」 × ${PLANET_CN[a.target]}的「${themeB}」：${ASPECT_PLAIN[a.type]}。`,
    life: ASPECT_LIFE[a.type](themeA, themeB),
    practice: ASPECT_PRACTICE[a.type](themeA, themeB),
  };
}

/**
 * 关键相位（设计文档 §6.6）：优先展示 3 至 5 条最有解释力的相位，
 * 每条说明能量关系、生活表现、练习建议；可展开完整列表。
 */
export function buildKeyAspects(facts: AstrologyChartFacts): KeyAspectsResult {
  const stable = stableAspectsDesc(facts).map(toKeyAspectReading);
  return { top: stable.slice(0, 5), rest: stable.slice(5) };
}

/**
 * 反向定位（§6.6：事实卡的已验证依据可定位到对应生活模块）：
 * 返回 factReferences 中引用了该星体的模块 id（行星直引或其参与相位的引用）。
 */
export function moduleIdsForBody(modules: ModuleReading[], body: PlanetBody): ModuleId[] {
  const planetPrefix = `planet:${body}:`;
  return modules
    .filter((m) =>
      m.factReferences.some((ref) => {
        if (ref.startsWith(planetPrefix)) return true;
        if (!ref.startsWith('aspect:')) return false;
        const [, source, , target] = ref.split(':');
        return source === body || target === body;
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
