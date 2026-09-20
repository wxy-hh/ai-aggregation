/**
 * golden-headlines.ts —— 星座寰宇 · 黄金主轴样例库（28 条，03 工单自 mock 层迁入）
 *
 * 迁移来源：前端先行期 mock 解读文案库（`lib/astrology/mock-interpretation.ts`，T5 已退役）
 * 的 SUN_MOON_HEADLINES / ASPECT_THEME_HEADLINES / SUN_ELEMENT_HEADLINES
 * （共 16 + 8 + 4 = 28 条，验收口径 20–30 条）。
 * 本文件是它们唯一的家：既作为解读提示词的 few-shot 样例（buildGoldenHeadlinePromptSection），
 * 也作为主轴文案的验收基准（字数、不绝对化、第二人称）。
 *
 * 文案铁律（设计文档 §8.0/§10.1）：18–28 字（不计标点）、有个人张力、第二人称、
 * 不含绝对化措辞，能被用户记住。
 */

export interface GoldenHeadline {
  id: string;
  /** 适用条件与文案本体（条件写在分组注释里，不参与提示词输出） */
  text: string;
}

/** 日月元素组合 16 条（太阳元素 × 月亮元素，两项真值：太阳星座 + 月亮星座） */
export const SUN_MOON_HEADLINES: Record<`${string}-${string}`, GoldenHeadline> = {
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
export const SUN_ELEMENT_HEADLINES: Record<'fire' | 'earth' | 'air' | 'water', GoldenHeadline> = {
  fire: { id: 'se-fire', text: '你带着火象的直觉行事，练习给热情配一个可以落脚的计划。' },
  earth: { id: 'se-earth', text: '你习惯用踏实验证自己，练习相信过程，而不只看结果。' },
  air: { id: 'se-air', text: '你靠思考理解世界，练习偶尔让感受先于分析发言。' },
  water: { id: 'se-water', text: '你凭感受丈量世界，练习给直觉一个说出口的机会。' },
};

/** 黄金样例库全量（验收：20–30 条；当前 16 + 8 + 4 = 28 条） */
export const GOLDEN_HEADLINE_SAMPLES: GoldenHeadline[] = [
  ...Object.values(SUN_MOON_HEADLINES),
  ...Object.values(ASPECT_THEME_HEADLINES),
  ...Object.values(SUN_ELEMENT_HEADLINES),
];

/**
 * few-shot 文本块（注入系统提示词）：只给文案本体，不给适用条件——
 * 适用条件会诱导模型按元素对做机械查表，而真实主轴应当从整盘事实里长出来。
 */
export function buildGoldenHeadlinePromptSection(): string {
  return GOLDEN_HEADLINE_SAMPLES.map((sample) => `- ${sample.text}`).join('\n');
}
