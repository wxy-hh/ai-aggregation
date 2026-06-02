import type { BaziChartBasis, BaziChartDecadeFortune } from './bazi-chart';

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

const STEM_ELEMENT: Record<string, string> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};

const BRANCH_HIDDEN_STEMS: Record<string, string[]> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
};

const BRANCH_CLASH: Record<string, string> = {
  子: '午',
  午: '子',
  丑: '未',
  未: '丑',
  寅: '申',
  申: '寅',
  卯: '酉',
  酉: '卯',
  辰: '戌',
  戌: '辰',
  巳: '亥',
  亥: '巳',
};

const BRANCH_COMBINE: Record<string, string> = {
  子: '丑',
  丑: '子',
  寅: '亥',
  亥: '寅',
  卯: '戌',
  戌: '卯',
  辰: '酉',
  酉: '辰',
  巳: '申',
  申: '巳',
  午: '未',
  未: '午',
};

const PILLAR_DOMAIN: Record<string, string> = {
  年柱: '家庭与早年',
  月柱: '事业与社会',
  日柱: '自我与伴侣',
  时柱: '习惯与晚年',
};

const ELEMENT_PRODUCES: Record<string, string> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木',
};

const ELEMENT_CONTROLS: Record<string, string> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木',
};

/** 单步大运解读（由模型生成文案 + 本地排盘补齐十神） */
export type BaziDecadeFortuneInsight = {
  index: number;
  name: string;
  stemTenGod: string;
  branchMainTenGod: string;
  summary: string;
  stemPhase: string;
  branchPhase: string;
  natalNotes: string[];
};

/** 模型只需返回的可读文案字段 */
export type BaziDecadeFortuneInsightDraft = {
  name: string;
  summary: string;
  stemPhase: string;
  branchPhase: string;
  natalNotes?: string[];
};

export type BaziDecadeFortuneFact = {
  index: number;
  name: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  active: boolean;
  decadeStem: string;
  decadeBranch: string;
  stemTenGod: string;
  branchMainTenGod: string;
  natalNotes: string[];
};

/** 计算天干十神（排盘真值，前后端一致） */
export function computeStemTenGod(dayStem: string, otherStem: string): string | null {
  if (!dayStem || !otherStem) return null;
  const dmEl = STEM_ELEMENT[dayStem];
  const otEl = STEM_ELEMENT[otherStem];
  if (!dmEl || !otEl) return null;

  const sameYinYang = YANG_STEMS.has(dayStem) === YANG_STEMS.has(otherStem);

  if (dmEl === otEl) return sameYinYang ? '比肩' : '劫财';
  if (ELEMENT_PRODUCES[dmEl] === otEl) return sameYinYang ? '食神' : '伤官';
  if (ELEMENT_PRODUCES[otEl] === dmEl) return sameYinYang ? '偏印' : '正印';
  if (ELEMENT_CONTROLS[dmEl] === otEl) return sameYinYang ? '偏财' : '正财';
  if (ELEMENT_CONTROLS[otEl] === dmEl) return sameYinYang ? '七杀' : '正官';
  return null;
}

function findNatalInteractionNotes(
  basis: BaziChartBasis,
  decadeStem: string,
  decadeBranch: string,
): string[] {
  const notes: string[] = [];

  for (const pillar of basis.pillars) {
    const domain = PILLAR_DOMAIN[pillar.label] ?? pillar.label;
    if (BRANCH_CLASH[decadeBranch] === pillar.branch) {
      notes.push(`${domain}起伏会更明显`);
    }
    if (BRANCH_COMBINE[decadeBranch] === pillar.branch) {
      notes.push(`${domain}易有合作契机`);
    }
    if (decadeStem && decadeStem !== pillar.stem && pillar.label !== '日柱') {
      // 天干合化提示留给模型结合 domain 写，此处只记柱位
      const stemCombine = {
        甲: '己',
        己: '甲',
        乙: '庚',
        庚: '乙',
        丙: '辛',
        辛: '丙',
        丁: '壬',
        壬: '丁',
        戊: '癸',
        癸: '戊',
      } as Record<string, string>;
      if (stemCombine[decadeStem] === pillar.stem) {
        notes.push(`${domain}主题易被激活`);
      }
    }
  }

  const monthPillar = basis.pillars.find((item) => item.label === '月柱');
  if (monthPillar) {
    const monthStemGod = computeStemTenGod(basis.dayMaster.stem, decadeStem);
    if (monthStemGod === monthPillar.stemTenGod) {
      notes.push('事业节奏与这步运更同步');
    }
  }

  return notes.slice(0, 2);
}

/** 为每一步大运生成排盘事实（写入 prompt，供模型个性化） */
export function buildDecadeFortuneFacts(basis: BaziChartBasis): BaziDecadeFortuneFact[] {
  const dayStem = basis.dayMaster.stem;

  return basis.decadeFortunes.map((decade) => {
    const decadeStem = decade.name[0] ?? '';
    const decadeBranch = decade.name[1] ?? '';
    const branchMainStem = BRANCH_HIDDEN_STEMS[decadeBranch]?.[0] ?? '';

    return {
      index: decade.index,
      name: decade.name,
      startAge: decade.startAge,
      endAge: decade.endAge,
      startYear: decade.startYear,
      endYear: decade.endYear,
      active: decade.active,
      decadeStem,
      decadeBranch,
      stemTenGod: computeStemTenGod(dayStem, decadeStem) ?? '未知',
      branchMainTenGod: branchMainStem
        ? computeStemTenGod(dayStem, branchMainStem) ?? '未知'
        : '未知',
      natalNotes: findNatalInteractionNotes(basis, decadeStem, decadeBranch),
    };
  });
}

function matchDraft(
  drafts: BaziDecadeFortuneInsightDraft[],
  decade: BaziChartDecadeFortune,
): BaziDecadeFortuneInsightDraft | undefined {
  return (
    drafts.find((item) => item.name === decade.name) ??
    drafts.find((item) => item.name.trim() === decade.sixtyCycle) ??
    drafts[decade.index]
  );
}

/** 格式化为 Copilot / 追问上下文（各步大运全文） */
export function formatDecadeFortuneInsightsForPrompt(basis: {
  decadeFortunes: BaziChartDecadeFortune[];
  decadeFortuneInsights?: BaziDecadeFortuneInsight[];
}): string {
  const insights = basis.decadeFortuneInsights;
  if (!insights?.length) return '';

  return insights
    .map((item) => {
      const decade =
        basis.decadeFortunes.find((entry) => entry.name === item.name) ??
        basis.decadeFortunes[item.index];
      const activeTag = decade?.active ? '【当前大运】' : '';
      const timeline = decade
        ? `${decade.startAge}-${decade.endAge}岁（${decade.startYear}-${decade.endYear}年）`
        : '';
      const natal =
        item.natalNotes.length > 0 ? `命局互动：${item.natalNotes.join('；')}。` : '';

      return [
        `${activeTag}${item.name}大运 ${timeline}`,
        `十神：天干${item.stemTenGod}，地支藏${item.branchMainTenGod}`,
        `整体：${item.summary}`,
        `前五年：${item.stemPhase}`,
        `后五年：${item.branchPhase}`,
        natal,
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

/** 将模型文案与排盘真值合并为最终大运解读 */
export function mergeDecadeFortuneInsights(
  basis: BaziChartBasis,
  drafts: BaziDecadeFortuneInsightDraft[],
): BaziDecadeFortuneInsight[] {
  const facts = buildDecadeFortuneFacts(basis);

  return facts.map((fact) => {
    const decade = basis.decadeFortunes[fact.index];
    const draft = decade ? matchDraft(drafts, decade) : undefined;
    const natalNotes =
      draft?.natalNotes && draft.natalNotes.length > 0
        ? draft.natalNotes.filter(Boolean).slice(0, 2)
        : fact.natalNotes;

    return {
      index: fact.index,
      name: fact.name,
      stemTenGod: fact.stemTenGod,
      branchMainTenGod: fact.branchMainTenGod,
      summary: draft?.summary?.trim() || '',
      stemPhase: draft?.stemPhase?.trim() || '',
      branchPhase: draft?.branchPhase?.trim() || '',
      natalNotes,
    };
  });
}
