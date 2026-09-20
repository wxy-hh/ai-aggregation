/**
 * astrology-report-sections.test.ts —— 解读报告分区扫描与校验（03 工单）
 *
 * 锁定的外部行为：
 * - 流式扫描：模型文本按块到达时，分区一闭合就推送，且永不高过协议顺序（乱序输出被缓存后按序推送）；
 * - 容错：JSON 前的说明文字/代码围栏不影响解析；半截 JSON 不会被误当成完整分区；
 * - 校验：引用键白名单、无宫位档不接受上升文案、不稳定相位不进关键相位、三角只引用筛后行运、
 *   无可用行运时三角清空（界面据此隐藏三角）。
 */

import { describe, expect, it } from 'vitest';
import { computeChartFacts } from '@/lib/astrology/chart-engine';
import { ORB_TABLE } from '@/lib/astrology/chart-facts';
import { aspectRefKey, buildFactReferenceKeys } from '@/lib/astrology/interpretation';
import { selectActiveTransits } from '@/lib/astrology/transit-selection';
import { SAMPLE_PROFILE_ACCURATE, SAMPLE_PROFILE_UNKNOWN } from '@/lib/astrology/sample-chart';
import {
  ASTROLOGY_REPORT_SECTION_ORDER,
  AstrologyReportSectionError,
  createReportSectionScanner,
  parseBigThreeSection,
  parseHeadlineSection,
  parseModulesSection,
  parseTransitsSection,
  type SectionValidationContext,
} from './astrology-report-sections';

const ACCURATE = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
const UNKNOWN = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);

const WEEK_START = Date.UTC(2026, 7, 31);
const SELECTED = selectActiveTransits(ACCURATE, {
  weekStartMs: WEEK_START,
  weekEndMs: WEEK_START + 7 * 24 * 3600 * 1000,
});

function contextOf(facts = ACCURATE): SectionValidationContext {
  const transitRefs = new Set(SELECTED.map((s) => s.refKey));
  return {
    facts,
    allowedRefs: new Set(buildFactReferenceKeys(facts, { transitRefKeys: [...transitRefs] })),
    transitRefs,
    weekRange: '9 月 1 日 – 9 月 7 日',
    transitNote: '行运太阳正与本命金星成合相（偏差约 1.2°）',
  };
}

/** 合法报告（四分区）文本，供分块推送用例 */
function reportText(): string {
  return JSON.stringify({
    headline: { text: '在稳定与自由之间，练习把感受说清楚。', factReferences: ['planet:sun:sign', 'planet:moon:sign'] },
    bigThree: {
      sun: { plain: '你先做再说的底色很明显。', action: '开口前先数三秒。' },
      moon: { plain: '你需要被回应才安心。', action: '先说一句我现在有点急。' },
      ascendant: { plain: '你给人的第一印象是直接有劲。', action: '必要时展示柔软。' },
    },
    modules: [
      {
        id: 'who',
        title: '我是谁',
        summary: '你的核心气质偏稳，情绪来得直接，两种状态都是真的你。',
        tags: ['太阳天秤', '月亮巨蟹'],
        action: '每周留一件只为喜欢的小事。',
        factReferences: ['planet:sun:sign', 'planet:moon:sign'],
      },
    ],
    transits: {
      opportunity: '顺相位适合把一件事往前推一步。',
      caution: '紧张相位出现时先照顾情绪。',
      action: '本周写下一件今天做得不错的小事。',
      transitReferences: [SELECTED[0].refKey],
      keyAspects: [
        {
          refKey: aspectRefKey(ACCURATE.aspects.filter((a) => a.stability === 'stable')[0]),
          energy: '两颗星的能量关系说明。',
          life: '在生活里可能这样表现。',
          practice: '给自己一个小练习。',
        },
      ],
    },
  });
}

describe('流式分区扫描', () => {
  it('分区一闭合即推送，不等待整段输出完成', () => {
    const scanner = createReportSectionScanner();
    const full = reportText();
    // 只推送前半段（含完整 headline、未闭合的 bigThree）
    const cut = full.indexOf('"bigThree"') + 40;
    expect(scanner.push(full.slice(0, cut)).map((s) => s.key)).toEqual(['headline']);
    expect(scanner.missingKeys()).toEqual(['bigThree', 'modules', 'transits']);
  });

  it('按协议顺序推送：模型乱序输出时缓存并按序释放', () => {
    const scanner = createReportSectionScanner();
    const full = reportText();
    const head = full.slice(0, full.indexOf('"bigThree"'));
    const rest = full.slice(full.indexOf('"bigThree"'));

    expect(scanner.push(head).map((s) => s.key)).toEqual(['headline']);
    // 逐块推送剩余部分：任何时候新推送的分区都必须紧跟已推送顺序
    const pushed: string[] = [];
    for (let i = 0; i < rest.length; i += 37) {
      pushed.push(...scanner.push(rest.slice(i, i + 37)).map((s) => s.key));
    }
    expect(pushed).toEqual(['bigThree', 'modules', 'transits']);
    expect(scanner.push('')).toEqual([]);
  });

  it('半截 JSON 不被当成完整分区（转义与控制字符不误判）', () => {
    const scanner = createReportSectionScanner();
    // 第一块停在未闭合的字符串中间（含转义引号与结尾反斜杠）
    expect(scanner.push('{"headline": {"text": "带\\"引号\\"与\\')).toEqual([]);
    // 值闭合在同一块内也不误判：真正闭合的那一次才推送
    expect(scanner.push('\\反斜杠的主轴文案", "factReferences": ["planet:sun:sign"]')).toEqual([]);
    // 补上真正闭合的括号才推送
    const closed = scanner.push('}');
    expect(closed.map((s) => s.key)).toEqual(['headline']);
    expect(closed[0].raw).toContain('planet:sun:sign');
  });

  it('容忍模型输出前的说明文字与代码围栏', () => {
    const scanner = createReportSectionScanner();
    const sections = scanner.push(`好的，这是报告：\n\`\`\`json\n${reportText()}\n\`\`\``);
    expect(sections.map((s) => s.key)).toEqual(ASTROLOGY_REPORT_SECTION_ORDER);
  });
});

describe('分区校验：主轴', () => {
  it('引用键只留白名单内的键，编造键被丢弃', () => {
    const headline = parseHeadlineSection(
      JSON.stringify({ text: '练习把感受说清楚。', factReferences: ['planet:sun:sign', 'planet:pluto:house', 'planet:sun:sign'] }),
      contextOf()
    );
    expect(headline.factReferences).toEqual(['planet:sun:sign']);
  });

  it('没有任何可核对依据时整分区失败（界面依据层不允许空证据）', () => {
    expect(() =>
      parseHeadlineSection(JSON.stringify({ text: '练习把感受说清楚。', factReferences: ['planet:neptune:house'] }), contextOf())
    ).toThrow(AstrologyReportSectionError);
  });

  it('文案非法（空串/非字符串）判失败', () => {
    expect(() =>
      parseHeadlineSection(JSON.stringify({ text: '   ', factReferences: ['planet:sun:sign'] }), contextOf())
    ).toThrow(AstrologyReportSectionError);
  });
});

describe('分区校验：大三要素（降级忠实）', () => {
  it('含宫位档：三项照常落库', () => {
    const bigThree = parseBigThreeSection(
      JSON.stringify({
        sun: { plain: '白话', action: '动作' },
        moon: { plain: '白话', action: '动作' },
        ascendant: { plain: '白话', action: '动作' },
      }),
      contextOf()
    );
    expect(bigThree.sun?.plain).toBe('白话');
    expect(bigThree.ascendant?.plain).toBe('白话');
  });

  it('无宫位档：模型硬写上升文案也被清空（不得编造被隐藏字段）', () => {
    const bigThree = parseBigThreeSection(
      JSON.stringify({
        sun: { plain: '白话', action: '动作' },
        moon: null,
        ascendant: { plain: '编造的上升', action: '编造的上升动作' },
      }),
      contextOf(UNKNOWN)
    );
    expect(bigThree.ascendant).toBeNull();
  });
});

describe('分区校验：生活模块', () => {
  it('按固定顺序落位、未知 id 丢弃、重复 id 只取第一条、标签截到 3 个', () => {
    const common = {
      title: '标题',
      summary: '正文',
      action: '行动',
      factReferences: ['planet:sun:sign'],
    };
    const modules = parseModulesSection(
      JSON.stringify([
        { ...common, id: 'week', tags: ['本周'] },
        { id: 'pro', ...common, tags: ['a', 'b', 'c', 'd'] },
        { id: 'who', ...common, tags: ['太阳'] },
        { id: 'who', ...common, tags: ['重复'], summary: '重复模块' },
      ]),
      contextOf()
    );
    expect(modules.map((m) => m.id)).toEqual(['who', 'week']);
    expect(modules[0].summary).toBe('正文');
  });

  it('模块没有任何可核对依据时整分区失败', () => {
    expect(() =>
      parseModulesSection(
        JSON.stringify([
          {
            id: 'who',
            title: '标题',
            summary: '正文',
            tags: ['标签'],
            action: '行动',
            factReferences: ['planet:pluto:house'],
          },
        ]),
        contextOf()
      )
    ).toThrow(AstrologyReportSectionError);
  });
});

describe('分区校验：行运与关键相位', () => {
  const stableAspect = ACCURATE.aspects.filter((a) => a.stability === 'stable')[0];
  const stableRef = aspectRefKey(stableAspect);
  const triangle = {
    opportunity: '机会',
    caution: '留意',
    action: '行动',
    transitReferences: [SELECTED[0].refKey],
    keyAspects: [{ refKey: stableRef, energy: 'e', life: 'l', practice: 'p' }],
  };

  it('三角只引用筛后行运；其它行运键被丢弃后若无引用则整分区失败', () => {
    const ok = parseTransitsSection(JSON.stringify(triangle), contextOf());
    expect(ok.transitReferences).toEqual([SELECTED[0].refKey]);
    expect(ok.weekRange).toBe('9 月 1 日 – 9 月 7 日');
    expect(ok.transitNote).toContain('行运');

    expect(() =>
      parseTransitsSection(
        JSON.stringify({ ...triangle, transitReferences: ['transit:pluto:conjunction:neptune'] }),
        contextOf()
      )
    ).toThrow(AstrologyReportSectionError);
  });

  it('关键相位只认稳定相位键，编造与不稳定相位的文案被丢弃', () => {
    const unstable = ACCURATE.aspects.find((a) => a.stability !== 'stable');
    const raw = JSON.stringify({
      ...triangle,
      keyAspects: [
        { refKey: 'aspect:sun:trine:pluto', energy: '编造', life: '编造', practice: '编造' },
        ...(unstable
          ? [{ refKey: aspectRefKey(unstable), energy: '不稳定', life: '不稳定', practice: '不稳定' }]
          : []),
        { refKey: stableRef, energy: 'e', life: 'l', practice: 'p' },
      ],
    });
    const section = parseTransitsSection(raw, contextOf());
    expect(section.keyAspects).toHaveLength(1);
    expect(section.keyAspects[0].refKey).toBe(stableRef);
  });

  it('关键相位一条都不可用时整分区失败（深度区必须给出解释力相位的解读）', () => {
    expect(() =>
      parseTransitsSection(
        JSON.stringify({ ...triangle, keyAspects: [{ refKey: 'aspect:sun:trine:pluto', energy: 'e', life: 'l', practice: 'p' }] }),
        contextOf()
      )
    ).toThrow(AstrologyReportSectionError);
  });

  it('无可用行运（时间未知档）：三角文案与引用一律清空，上升/宫位不被夹带', () => {
    const unknownCtx: SectionValidationContext = {
      ...contextOf(UNKNOWN),
      transitRefs: new Set(),
      transitNote: '',
    };
    const section = parseTransitsSection(
      JSON.stringify({
        opportunity: '模型硬写的机会',
        caution: '模型硬写的留意',
        action: '模型硬写的行动',
        transitReferences: ['transit:sun:conjunction:venus'],
        keyAspects: [
          {
            refKey: aspectRefKey(UNKNOWN.aspects.filter((a) => a.stability === 'stable')[0]),
            energy: 'e',
            life: 'l',
            practice: 'p',
          },
        ],
      }),
      unknownCtx
    );
    expect(section.opportunity).toBe('');
    expect(section.caution).toBe('');
    expect(section.action).toBe('');
    expect(section.transitReferences).toEqual([]);
    expect(section.transitNote).toBe('');
    expect(section.keyAspects).toHaveLength(1);
  });

  it('相位容许度表口径来自事实层（引用键不因容许度差异漂移）', () => {
    expect(Object.keys(ORB_TABLE)).toHaveLength(5);
    expect(stableAspect.orb).not.toBeNull();
  });
});
