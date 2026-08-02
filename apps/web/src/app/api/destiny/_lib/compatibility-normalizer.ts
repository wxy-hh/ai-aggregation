import {
  FORBIDDEN_PHRASES,
  DIMENSIONS_BY_RELATION,
  RELATION_LABEL,
} from '@/app/destiny/_components/compatibility/constants';
import type {
  CompatibilityChartFacts,
  CompatibilityViewPayload,
  RelationType,
} from '@/app/destiny/_components/compatibility/types';
import { emptyDimensions } from './compatibility-chart';

function scrubText(input: string): string {
  let text = input.trim();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.includes(phrase)) {
      text = text.split(phrase).join('需要更多协商');
    }
  }
  // 去掉过于绝对的句式
  text = text.replace(/一定(?:会|要|能)/g, '更适合尝试');
  return text;
}

function scrubList(items: string[] | undefined, fallback: string[]): string[] {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback;
  return source.map((item) => scrubText(String(item))).filter(Boolean).slice(0, 4);
}

/** 各视角用户核心诉求的默认兜底（模型失败或字段缺失时仍可读、可执行） */
function relationDefaults(relationType: RelationType, facts: CompatibilityChartFacts) {
  const band = facts.scoreBand;
  if (relationType === 'marriage') {
    return {
      oneLiner:
        band === 'high'
          ? '你们有把日子过顺的底色，把分工、边界和钱说清楚会更稳。'
          : band === 'mid'
            ? '日常互补也有摩擦点，优先谈清高频家务与财务节奏会更有效。'
            : '差异需要被看见，先用小协作建立可预期的节奏，比一次谈完所有问题更稳。',
      needsSelf: [
        { text: '家务与决策有明确分工', why: '减少“默认该谁做”的隐性消耗' },
        { text: '个人空间被尊重', why: '边界清楚后更愿意共同投入' },
      ],
      needsPartner: [
        { text: '财务与规划先对齐再行动', why: '对不确定性更敏感，需要可预期安排' },
        { text: '冲突后有修复仪式', why: '比起对错，更在意关系是否还在同一边' },
      ],
      attractions: [
        {
          title: '互补托底',
          detail: '一方更擅长发起与推进，另一方更擅长稳住节奏与收尾。',
        },
        {
          title: '共同生活潜力',
          detail: '在低压力的日常协作里更容易看见彼此可靠的一面。',
        },
      ],
      frictions: [
        {
          trigger: '家务或钱的默认分工不清',
          reaction: '一方默默扛、一方觉得被指责',
          action: '本周只定一项「谁主责、谁协助、何时复盘」的小规则，先跑两周',
        },
        {
          trigger: '原生家庭或个人边界被越过',
          reaction: '一方想立刻解决，另一方先回避',
          action: '用“我需要/我可以”句式谈边界，不上升到人格评价',
        },
      ],
      rhythm: [
        { when: '近1-2个月', tone: 'warm' as const, advice: '先做一件双方都轻松的共同家务或周末安排，建立“我们在一起做事”的体感' },
        { when: '第3-6个月', tone: 'patience' as const, advice: '谈清财务节奏与家庭边界：月度开销、探亲频率、个人独处时间' },
        { when: '下半年', tone: 'advance' as const, advice: '对齐一件中期安排（居住/节奏/重大开支），用书面小清单代替情绪拉扯' },
      ],
      weeklyActions: [
        {
          id: 'a1',
          text: '本周共同完成一件小事（采购/打扫/做饭），结束后用三分钟各说一句“我需要你怎样配合”',
        },
      ],
    };
  }

  if (relationType === 'friendship') {
    return {
      oneLiner:
        band === 'high'
          ? '你们相处底色舒服，把联系节奏和边界说清会更长久。'
          : band === 'mid'
            ? '有共鸣也有节奏差，先约定怎么联系、如何托底，比硬拉近更有效。'
            : '差异值得被看见，友谊适合轻量互助与明确边界，而不是情绪绑架。',
      needsSelf: [
        { text: '联系有回应但不被绑架', why: '需要可预期的节奏，而不是随时待命' },
        { text: '可以说真话不被评判', why: '信任建立在被接住，而不是被纠正' },
      ],
      needsPartner: [
        { text: '需要时有人托底', why: '更在意关键时刻是否靠得住' },
        { text: '共同兴趣里轻松相处', why: '低压力互动比深度拷问更舒服' },
      ],
      attractions: [
        {
          title: '气场合得来',
          detail: '轻松话题里容易接得上，不必时刻用力维持。',
        },
        {
          title: '互助而不绑架',
          detail: '在需要时能给支持，也尊重彼此的生活节奏。',
        },
      ],
      frictions: [
        {
          trigger: '联系频率预期不一致',
          reaction: '一方觉得被冷落，另一方觉得被催促',
          action: '约定一个双方都能做到的联系频率（如每周一句近况），再按需加码',
        },
        {
          trigger: '帮忙与边界模糊',
          reaction: '一方不好意思拒绝，另一方默认会帮到底',
          action: '用“这次我能帮到哪一步”说清边界，避免用沉默代替拒绝',
        },
      ],
      rhythm: [
        { when: '近1-2个月', tone: 'warm' as const, advice: '安排一次轻松的共同体验（散步/看展/运动），先积累舒服的相处记忆' },
        { when: '第3-6个月', tone: 'patience' as const, advice: '把“多久联系一次、忙碌时怎么说”说开，减少猜测' },
        { when: '下半年', tone: 'advance' as const, advice: '在信任基础上做一次有温度的互助，同时保留各自空间' },
      ],
      weeklyActions: [
        {
          id: 'a1',
          text: '本周主动发一条不求立刻回复的近况或兴趣分享，并说明“忙的话晚点回也完全没问题”',
        },
      ],
    };
  }

  if (relationType === 'partnership') {
    return {
      oneLiner:
        band === 'high'
          ? '你们有互补成事的底色，先把决策与利益边界写清会更稳。'
          : band === 'mid'
            ? '目标大体同向，但决策与执行节奏不同，优先固化小闭环规则。'
            : '差异明显，适合先共做一个可验收的小目标，再谈更大协作。',
      needsSelf: [
        { text: '目标与优先级对齐后再开干', why: '避免做完才发现方向不一致' },
        { text: '反馈对事不对人', why: '需要可改进的信息，而不是人身评价' },
      ],
      needsPartner: [
        { text: '决策有明确拍板人与时限', why: '讨厌悬而不决拖慢推进' },
        { text: '利益与信用边界事先说清', why: '安全感来自可预期的规则' },
      ],
      attractions: [
        {
          title: '互补战力',
          detail: '一方偏战略与发起，另一方偏落地与质控，合在一起更容易闭环。',
        },
        {
          title: '执行张力',
          detail: '在共同目标下，节奏差异可以变成互相补位，而不是互相消耗。',
        },
      ],
      frictions: [
        {
          trigger: '决策权与时限不清',
          reaction: '一方催、一方拖，会议反复却不落地',
          action: '每个议题写清“谁拍板、何时答复、若超时默认方案”',
        },
        {
          trigger: '风险与利益边界模糊',
          reaction: '出问题后互相甩锅或不敢推进',
          action: '先共写一页：投入、分成、退出与风险承担，再扩大合作范围',
        },
      ],
      rhythm: [
        { when: '近1-2个月', tone: 'warm' as const, advice: '共做一个可验收的小闭环（一周能完成），验证协作手感' },
        { when: '第3-6个月', tone: 'patience' as const, advice: '固化决策、反馈与周会节奏，减少临时拉扯' },
        { when: '下半年', tone: 'advance' as const, advice: '在规则跑通后再谈更大目标与资源投入' },
      ],
      weeklyActions: [
        {
          id: 'a1',
          text: '本周共定一个可验收的小目标（含负责人、截止日、完成标准），周五用15分钟复盘一次',
        },
      ],
    };
  }

  // romance 默认
  return {
    oneLiner:
      band === 'high'
        ? '你们有自然顺畅的相处底色，把差异说清楚会更稳。'
        : band === 'mid'
          ? '你们彼此吸引也有节奏差，先处理最高频的摩擦会更有效。'
          : '差异本身值得被看见，协商与边界比硬推进更重要。',
    needsSelf: [
      { text: '被理解后再给建议', why: '情绪被接住后才听得进方案' },
      { text: '有明确回应节奏', why: '不确定比负面回应更消耗' },
    ],
    needsPartner: [
      { text: '先有安全感再深入', why: '稳定节奏比强度更重要' },
      { text: '行动比口号更有用', why: '更信兑现，不信空话' },
    ],
    attractions: [
      {
        title: '节奏互补',
        detail: '一方更擅长发起，另一方更擅长稳住节奏。',
      },
    ],
    frictions: [
      {
        trigger: '沟通节奏不一致',
        reaction: '一方急着说清，另一方先沉默消化',
        action: '约定“需要冷静时说一句我晚点回复”，并给明确回话时间',
      },
    ],
    rhythm: [
      { when: '近1-2个月', tone: 'warm' as const, advice: '适合增加低压力的共同体验' },
      { when: '第3-6个月', tone: 'patience' as const, advice: '少用沉默测试对方，改用明确请求' },
      { when: '下半年', tone: 'advance' as const, advice: '适合对齐下一步安排，而不是一次性谈完所有问题' },
    ],
    weeklyActions: [
      {
        id: 'a1',
        text: '约一次不讨论输赢的沟通，只交换彼此需要的回应方式',
      },
    ],
  };
}

export function normalizeCompatibilityView(
  raw: unknown,
  relationType: RelationType,
  facts: CompatibilityChartFacts
): CompatibilityViewPayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dimsDef = DIMENSIONS_BY_RELATION[relationType];
  const rawDims = Array.isArray(data.dimensions) ? data.dimensions : [];
  const defaults = relationDefaults(relationType, facts);

  const dimensions = dimsDef.map((def, index) => {
    const found =
      (rawDims as Array<Record<string, unknown>>).find((d) => d.key === def.key) ??
      (rawDims as Array<Record<string, unknown>>)[index];
    const valueRaw = Number(found?.value);
    const value = Number.isFinite(valueRaw)
      ? Math.max(0, Math.min(100, Math.round(valueRaw)))
      : 50 + ((facts.score - 50) / 5) * (index % 3 === 0 ? 1 : -1);
    return {
      key: def.key,
      label: def.label,
      value: Math.max(20, Math.min(95, Math.round(value))),
      note: found?.note ? scrubText(String(found.note)) : undefined,
    };
  });

  const needsRaw = (data.needs && typeof data.needs === 'object' ? data.needs : {}) as {
    self?: unknown;
    partner?: unknown;
  };

  const mapNeeds = (
    items: unknown,
    fallback: Array<{ text: string; why?: string }>
  ) => {
    if (!Array.isArray(items) || items.length === 0) {
      return fallback.map((item) => ({
        text: scrubText(item.text),
        why: item.why ? scrubText(item.why) : undefined,
      }));
    }
    return items
      .slice(0, 2)
      .map((item) => {
        if (typeof item === 'string') return { text: scrubText(item) };
        const rec = item as Record<string, unknown>;
        return {
          text: scrubText(String(rec.text ?? rec.content ?? '')),
          why: rec.why ? scrubText(String(rec.why)) : undefined,
        };
      })
      .filter((x) => x.text);
  };

  const attractionsRaw = Array.isArray(data.attractions) ? data.attractions : [];
  const frictionsRaw = Array.isArray(data.frictions) ? data.frictions : [];
  const rhythmRaw = Array.isArray(data.rhythm) ? data.rhythm : [];
  const actionsRaw = Array.isArray(data.weeklyActions) ? data.weeklyActions : [];

  const disclaimers = scrubList(
    Array.isArray(data.disclaimers) ? (data.disclaimers as string[]) : undefined,
    buildDefaultDisclaimers(relationType)
  );

  return {
    relationType,
    oneLiner: scrubText(String(data.oneLiner ?? defaults.oneLiner)),
    needs: {
      self: mapNeeds(needsRaw.self, defaults.needsSelf),
      partner: mapNeeds(needsRaw.partner, defaults.needsPartner),
    },
    attractions: (attractionsRaw.length ? attractionsRaw : defaults.attractions)
      .slice(0, 3)
      .map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          title: scrubText(String(rec.title ?? '互补点')),
          detail: scrubText(String(rec.detail ?? rec.content ?? '')),
          why: rec.why ? scrubText(String(rec.why)) : undefined,
        };
      })
      .filter((x) => x.detail),
    frictions: (frictionsRaw.length ? frictionsRaw : defaults.frictions)
      .slice(0, 2)
      .map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          trigger: scrubText(String(rec.trigger ?? '容易卡住的场景')),
          reaction: scrubText(String(rec.reaction ?? '双方惯性反应')),
          action: scrubText(
            String(rec.action ?? '先暂停升级，再约一次对事不对人的沟通')
          ),
          why: rec.why ? scrubText(String(rec.why)) : undefined,
        };
      }),
    dimensions: dimensions.length ? dimensions : emptyDimensions(relationType),
    rhythm: (rhythmRaw.length ? rhythmRaw : defaults.rhythm)
      .slice(0, 3)
      .map((item) => {
        const rec = item as Record<string, unknown>;
        const toneRaw = String(rec.tone ?? 'patience');
        const tone =
          toneRaw === 'warm' || toneRaw === 'advance' || toneRaw === 'patience'
            ? toneRaw
            : 'patience';
        return {
          when: scrubText(String(rec.when ?? '接下来')),
          tone,
          advice: scrubText(String(rec.advice ?? rec.text ?? '')),
        };
      }),
    weeklyActions: (actionsRaw.length ? actionsRaw : defaults.weeklyActions)
      .slice(0, 2)
      .map((item, index) => {
        if (typeof item === 'string') {
          return { id: `a${index + 1}`, text: scrubText(item) };
        }
        const rec = item as Record<string, unknown>;
        return {
          id: String(rec.id ?? `a${index + 1}`),
          text: scrubText(String(rec.text ?? rec.content ?? '')),
          done: Boolean(rec.done),
        };
      })
      .filter((x) => x.text),
    disclaimers,
  };
}

function buildDefaultDisclaimers(relationType: RelationType): string[] {
  const base = ['内容仅供传统文化参考，不构成关系判决。'];
  if (relationType === 'marriage') {
    base.push(
      '关系困扰涉及安全、暴力、控制或严重心理压力时，请优先向可信赖的人和专业机构求助。'
    );
  }
  if (relationType === 'friendship') {
    base.push('本页仅提供友谊相处风格参考，不构成对任何人际关系的最终判定。');
  }
  if (relationType === 'partnership') {
    base.push(
      '本页仅提供相处与协作风格参考，不构成投资、用工、法律或商业决策建议。'
    );
  }
  if (relationType === 'romance') {
    base.push('本报告仅为恋爱相处参考，不构成任何情感决策的绝对依据。');
    base.push('不对关系的最终走向做判定，实际相处质量以双方真实交互感受为准。');
  }
  return base;
}

function relationFocusGuide(relationType: RelationType): string[] {
  if (relationType === 'marriage') {
    return [
      '用户核心诉求：日子怎么过顺——日常分工、财务协作、家庭/个人边界、冲突不升级、共同愿景。',
      'needs 写「把日子过顺」所需：谁主责家务、钱怎么商量、边界怎么守、冲突后如何修复。',
      'attractions 写互补托底与共同生活潜力；frictions 写家务/钱/边界等高频卡住场景 + 可执行动作。',
      'rhythm：近月做小协作 → 3-6 月谈清边界与财务 → 下半年对齐中期安排。',
      'weeklyActions 必须是本周能完成的一件家务/沟通/规划小事。',
    ];
  }
  if (relationType === 'friendship') {
    return [
      '用户核心诉求：联系会不会尴尬、能否托底、边界与互惠、分歧后还能不能处。',
      'needs 写互相充电方式：联系节奏、情绪支持、共同兴趣、不被绑架的边界。',
      'attractions 写为什么合得来；frictions 写联系频率差、帮忙边界模糊等 + 可执行动作。',
      '禁止写成恋爱/婚姻判决语气；保持友谊尺度。',
      'rhythm：轻松共同体验 → 约定联系频率 → 深化互助但不绑架。',
    ];
  }
  if (relationType === 'partnership') {
    return [
      '用户核心诉求：能不能成事——目标对齐、谁拍板、执行推进、反馈方式、风险与利益边界。',
      'needs 写「谁更适合负责什么」：决策、执行、反馈、风险共担偏好。',
      'attractions 写互补战力；frictions 写决策拖延、权责不清、利益模糊 + 可执行规则动作。',
      'rhythm：先共做一个可验收小闭环 → 固化决策/反馈规则 → 再谈更大目标。',
      '禁止投资收益承诺或法律用工建议；weeklyActions 必须可验收（负责人+截止日或完成标准）。',
    ];
  }
  return [
    '用户核心诉求：如何靠近、表达与节奏、亲密需求、冲突修复、关系稳定感。',
    'needs 写「如何感到被爱」：回应节奏、安全感、表达方式。',
    'attractions 写互补特质；frictions 写高频摩擦场景 + 可执行动作。',
    'rhythm：升温共同体验 → 耐心谈清节奏 → 推进下一步安排。',
  ];
}

export function buildCompatibilitySystemPrompt(relationType: RelationType): string {
  const dims = DIMENSIONS_BY_RELATION[relationType]
    .map((d) => `${d.key}:${d.label}`)
    .join('、');
  return [
    '你是温和、务实的关系观察助手，基于双方八字事实给出可执行相处建议。',
    `当前关系视角：${RELATION_LABEL[relationType]}。`,
    '本视角必须抓住用户核心诉求：',
    ...relationFocusGuide(relationType).map((line, i) => `${i + 1}. ${line}`),
    '硬性规则：',
    '1. 禁止绝对化：不得使用注定、绝配、必然分开、正缘、劫缘、一定会结婚/分手等措辞。',
    '2. 每条重要建议尽量包含：观察、可能场景、可做动作。',
    '3. 不得提供医疗、法律、投资、婚姻成败判决。',
    '4. 若标注对方无时柱，不得编造时柱相关细节。',
    '5. 只输出 JSON，不要 Markdown。',
    `6. dimensions 必须且仅包含这些 key：${dims}，value 为 0-100 整数。`,
    '7. 每个 dimension 必须带 note：一句可执行、贴合该维度的解释（15–40 字），说明分数高低在相处上意味着什么，禁止空泛套话。',
    '8. 文案必须贴合当前关系视角，禁止把恋爱话术原样套到婚姻/朋友/合作。',
    'JSON 结构：',
    JSON.stringify(
      {
        oneLiner: '一句可验证的关系摘要（贴合当前视角）',
        needs: {
          self: [{ text: '我更在意…', why: '可选依据' }],
          partner: [{ text: 'TA 更需要…', why: '可选依据' }],
        },
        attractions: [{ title: '吸引/互补点', detail: '说明', why: '可选' }],
        frictions: [
          {
            trigger: '场景',
            reaction: '惯性',
            action: '可做动作',
            why: '可选',
          },
        ],
        dimensions: DIMENSIONS_BY_RELATION[relationType].map((d) => ({
          key: d.key,
          label: d.label,
          value: 60,
          note: '一句解释该维度分数在相处上的含义',
        })),
        rhythm: [
          { when: '近1-2个月', tone: 'warm', advice: '…' },
          { when: '第3-6个月', tone: 'patience', advice: '…' },
          { when: '下半年', tone: 'advance', advice: '…' },
        ],
        weeklyActions: [{ id: 'a1', text: '本周可做的一件事' }],
        disclaimers: ['…'],
      },
      null,
      2
    ),
  ].join('\n');
}
