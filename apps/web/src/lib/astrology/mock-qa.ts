/**
 * mock-qa.ts —— 星座寰宇 · 星语问答 mock 引擎（10 工单，设计文档 §6.7）
 *
 * 规则（全部可被测试锁定）：
 * - 敏感主题（医疗/财务/法律）拦截：固定话术「不能据此作出医疗、财务或法律判断」+
 *   可讨论的自我观察方向；拦截回答也至少携带一个模块引用。
 * - 普通回答按主题路由到生活模块或关键相位，回答必须引用盘面模块名称或事实标签；
 *   措辞「倾向/可能/练习」不绝对化，不含英文占星术语。
 * - 只读已确认事实：模块解读与关键相位本就只由稳定事实构建；模块缺项（事实不足）
 *   时回退到可用模块，绝不虚构引用——降级路径不泄露上升/天顶/宫位等隐藏事实。
 * - 确定性：同一问题 + 同一份真值 → 同一回答（真实 AI 接入后替换本文件绑定即可）。
 */

import type { AstrologyChartFacts, PlanetBody } from './chart-facts';
import {
  buildKeyAspects,
  type ModuleId,
  type ModuleReading,
} from './mock-interpretation';
import { ASPECT_CN, PLANET_CN, ZODIAC_CN } from './zh-names';

/* ---------- 敏感主题识别（§6.7：医疗 / 财务 / 法律） ---------- */

export type SensitiveTopic = 'medical' | 'financial' | 'legal';

const SENSITIVE_RULES: Array<{ topic: SensitiveTopic; label: string; re: RegExp }> = [
  { topic: 'medical', label: '医疗', re: /病|癌|肿瘤|手术|医|药|抑郁|焦虑|治疗|诊断|体检|健康|怀孕|流产/ },
  { topic: 'financial', label: '财务', re: /投资|股|基金|理财|买房|房贷|贷款|借钱|欠债|债务|彩票|赌|暴富|发财|财运/ },
  { topic: 'legal', label: '法律', re: /官司|诉讼|起诉|被告|合同|离婚|犯法|犯罪|坐牢|律师|法庭|违法|判刑/ },
];

/** 命中敏感主题返回其类型，否则 null（普通话题不误伤） */
export function detectSensitiveTopic(question: string): SensitiveTopic | null {
  for (const rule of SENSITIVE_RULES) {
    if (rule.re.test(question)) return rule.topic;
  }
  return null;
}

/* ---------- 引用（模块名称或事实标签；可携带定位目标） ---------- */

export interface QaCitation {
  /** 展示标签：模块名（如「关系如何运作」）或事实标签（如「月亮 · 白羊座」） */
  label: string;
  /** 模块引用：点击可定位到对应生活模块 */
  moduleId?: ModuleId;
  /** 事实引用：点击可定位到星盘轮星体（angle/house 不带） */
  body?: PlanetBody | null;
}

export interface AstrologyQaAnswer {
  kind: 'answer' | 'blocked';
  /** 多段文本以 \n 分隔 */
  text: string;
  citations: QaCitation[];
}

/** 事实引用键 → 展示标签 + 轮上定位目标（与结果页/生活模块同口径） */
function refToCitation(ref: string, facts: AstrologyChartFacts): QaCitation | null {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = facts.planets.find((p) => p.body === body);
    const base = PLANET_CN[body] ?? body;
    if (parts[2] === 'retrograde') return { label: `${base} 逆行`, body };
    return { label: placement?.sign ? `${base} · ${ZODIAC_CN[placement.sign]}` : base, body };
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return {
      label: `${PLANET_CN[source as PlanetBody] ?? source} ${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type} ${PLANET_CN[target as PlanetBody] ?? target}`,
      body: source as PlanetBody,
    };
  }
  if (parts[0] === 'house') {
    const house = facts.houses.find((h) => h.number === Number(parts[1]));
    // 宫位引用只作展示标签（无宫位档不会产出此引用）
    return { label: house ? `第 ${house.number} 宫 · ${ZODIAC_CN[house.sign]}` : `第 ${parts[1]} 宫`, body: null };
  }
  return null; // angle 等其余键不作为问答引用
}

/** 模块引用 citation（仅当模块存在） */
function moduleCitation(m: ModuleReading | undefined): QaCitation | null {
  return m ? { label: m.title, moduleId: m.id } : null;
}

/** 模块回答统一组装：模块引用在前，其后最多两个事实标签引用 */
function moduleCitations(m: ModuleReading, facts: AstrologyChartFacts): QaCitation[] {
  const out: QaCitation[] = [{ label: m.title, moduleId: m.id }];
  for (const ref of m.factReferences) {
    const c = refToCitation(ref, facts);
    if (c) out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

/* ---------- 主题路由 ---------- */

/** 行星别名 → 星体（相位路由里「表达/情绪」等口语词的归属） */
const PLANET_ALIAS: Array<{ re: RegExp; body: PlanetBody }> = [
  { re: /表达|沟通|说话|写作|学习|思考/, body: 'mercury' },
  { re: /情绪|感受|心情|安全感/, body: 'moon' },
  { re: /爱|审美|关系|伴侣/, body: 'venus' },
  { re: /行动|冲动|脾气|欲望/, body: 'mars' },
  { re: /压力|责任|边界/, body: 'saturn' },
  { re: /改变|独立|叛逆/, body: 'uranus' },
  { re: /梦想|直觉|灵感/, body: 'neptune' },
  { re: /机会|信念|运气/, body: 'jupiter' },
  { re: /深度|转化|执念/, body: 'pluto' },
  { re: /自我|核心|气质/, body: 'sun' },
];

const RE_WEEK = /本周|这周|下周|最近|今天|今日/;
const RE_CAREER = /工作|事业|职业|职场|升职|跳槽|同事|领导|老板|面试|加班/;
const RE_LOVE = /亲密|恋爱|伴侣|婚姻|感情|相处|对象|桃花|暗恋|分手/;
const RE_STRENGTHS = /优势|缺点|盲点|天赋|擅长|短板|长处/;
const RE_ASPECT = /相位|合相|六合|刑相|拱相|对冲|拔河|较劲|同频/;
const RE_WHO = /性格|我是谁|自己|气质|底色|是个什么样/;

/** 敏感拦截的自我观察方向（按主题落到可用的模块上） */
function blockedDirection(topic: SensitiveTopic, available: ModuleId[]): { text: string; prefer: ModuleId } {
  const has = (id: ModuleId) => available.includes(id);
  if (topic === 'legal') {
    return has('love')
      ? { prefer: 'love', text: '你在冲突里习惯站在什么位置？「关系如何运作」模块也许能帮你看清自己的模式。' }
      : { prefer: 'who', text: '你在压力下的节奏是什么样的？「我是谁」模块也许能提供一面镜子。' };
  }
  if (topic === 'financial') {
    return has('who')
      ? { prefer: 'who', text: '你在安全感与自由之间习惯怎么取舍？「我是谁」模块的核心气质或许是一面镜子。' }
      : { prefer: 'week', text: '这周可以先做哪件让心更稳的小事？「本周宇宙提示」里有一个可执行的切口。' };
  }
  // medical
  return has('who')
    ? { prefer: 'who', text: '最近什么时刻你觉得身体或情绪紧绷？「我是谁」模块里的节奏线索，也许能帮你说清感受。' }
    : { prefer: 'week', text: '这周可以怎么照顾自己的节奏？「本周宇宙提示」里有一个可执行的切口。' };
}

/**
 * 星语问答主入口：输入用户问题 + 盘面真值 + 生活模块解读，输出回答。
 * 模块缺项时按可用性回退，绝不引用不存在的模块或隐藏事实。
 */
export function answerAstrologyQuestion(
  question: string,
  facts: AstrologyChartFacts,
  modules: ModuleReading[]
): AstrologyQaAnswer {
  const byId = (id: ModuleId) => modules.find((m) => m.id === id);
  const available = modules.map((m) => m.id);

  // 1. 敏感主题拦截（文档固定话术 + 自我观察方向）
  const sensitive = detectSensitiveTopic(question);
  if (sensitive) {
    const rule = SENSITIVE_RULES.find((r) => r.topic === sensitive)!;
    const dir = blockedDirection(sensitive, available);
    const target = byId(dir.prefer);
    return {
      kind: 'blocked',
      text:
        `这个问题触及${rule.label}话题——星盘解读不能据此作出医疗、财务或法律判断。\n` +
        `如果你想多了解自己一点，可以观察：${dir.text}`,
      citations: [moduleCitation(target)].filter((c): c is QaCitation => c !== null),
    };
  }

  const week = byId('week');
  const career = byId('career');
  const love = byId('love');
  const strengths = byId('strengths');
  const who = byId('who');
  // 通用回退：who → week → 第一个可用模块
  const fallback = who ?? week ?? modules[0];

  // 2. 本周 + 工作复合主题（引导问题「本周工作中适合主动争取什么？」）
  if (RE_WEEK.test(question) && RE_CAREER.test(question) && week?.weekly && career) {
    return {
      kind: 'answer',
      text:
        `本周的机会点：${week.weekly.opportunity}\n` +
        `落到工作上：${career.action}`,
      citations: [
        { label: week.title, moduleId: week.id },
        { label: career.title, moduleId: career.id },
      ],
    };
  }

  // 3. 本周/近期 → 本周宇宙提示
  if (RE_WEEK.test(question) && week?.weekly) {
    return {
      kind: 'answer',
      text: `${week.summary}\n可以带走的行动：${week.weekly.action}`,
      citations: moduleCitations(week, facts),
    };
  }

  // 4. 相位主题 → 关键相位（优先匹配问题里点名的星体/别名）
  if (RE_ASPECT.test(question) || PLANET_ALIAS.some((a) => a.re.test(question) && RE_ASPECT.test(question))) {
    const { top } = buildKeyAspects(facts);
    if (top.length > 0) {
      const alias = PLANET_ALIAS.find((a) => a.re.test(question));
      const hit = alias ? top.find((a) => a.source === alias.body || a.target === alias.body) : undefined;
      const a = hit ?? top[0];
      return {
        kind: 'answer',
        text: `${a.energy}\n${a.life}\n${a.practice}`,
        citations: [
          { label: '关键相位' },
          { label: `${PLANET_CN[a.source]} ${ASPECT_CN[a.type]} ${PLANET_CN[a.target]}`, body: a.source },
        ],
      };
    }
    // 无稳定相位：落到回退模块如实说明
    if (fallback) {
      return {
        kind: 'answer',
        text: `当前资料下没有可确认的主要相位，先从「${fallback.title}」聊起：\n${fallback.summary}`,
        citations: moduleCitations(fallback, facts),
      };
    }
  }

  // 5. 单主题路由（模块缺项即回退，不虚构）
  const routed =
    (RE_LOVE.test(question) && love) ||
    (RE_CAREER.test(question) && career) ||
    (RE_STRENGTHS.test(question) && strengths) ||
    (RE_WHO.test(question) && who) ||
    null;
  const m = routed ?? fallback;
  if (!m) {
    // 极端情况：没有任何可用模块（理论上不会发生——week 恒存在）
    return {
      kind: 'answer',
      text: '这份报告暂时没有可引用的解读模块，可以先回到星盘轮看看行星落点。',
      citations: [],
    };
  }
  const prefix = routed ? `从「${m.title}」来看：` : `这个问题我先从你的核心气质聊起：`;
  return {
    kind: 'answer',
    text: `${prefix}${m.summary}\n可以带走的练习：${m.action}`,
    citations: moduleCitations(m, facts),
  };
}
