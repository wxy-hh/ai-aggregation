import {
  buildDecadeFortuneFacts,
  computeStemTenGod,
  mergeDecadeFortuneInsights,
  type BaziChartBasis,
  type BaziChartDecadeFortune,
  type BaziDecadeFortuneInsight,
  type BaziDecadeFortuneInsightDraft,
} from '@repo/shared';

export type DecadeFortuneInsight = BaziDecadeFortuneInsight;

export { computeStemTenGod, mergeDecadeFortuneInsights };

/** 规则兜底：模型未返回或字段为空时使用（保证 UI 可展示） */
export function fillDecadeFortuneInsightFallbacks(
  basis: BaziChartBasis,
  insights: BaziDecadeFortuneInsight[],
): BaziDecadeFortuneInsight[] {
  const facts = buildDecadeFortuneFacts(basis);

  return insights.map((item, index) => {
    const fact = facts[index];
    if (!fact) return item;

    const summary =
      item.summary.trim() ||
      buildFallbackSummary(basis, fact.stemTenGod, fact.branchMainTenGod, fact.natalNotes);
    const stemPhase = item.stemPhase.trim() || buildFallbackStemPhase(fact.stemTenGod);
    const branchPhase = item.branchPhase.trim() || buildFallbackBranchPhase(fact.branchMainTenGod);

    return {
      ...item,
      summary,
      stemPhase,
      branchPhase,
      natalNotes: item.natalNotes.length > 0 ? item.natalNotes : fact.natalNotes,
    };
  });
}

/** 完全离线兜底（无模型分区时） */
export function buildDecadeFortuneInsights(basis: BaziChartBasis): BaziDecadeFortuneInsight[] {
  const facts = buildDecadeFortuneFacts(basis);
  const drafts: BaziDecadeFortuneInsightDraft[] = facts.map((fact) => ({
    name: fact.name,
    summary: buildFallbackSummary(basis, fact.stemTenGod, fact.branchMainTenGod, fact.natalNotes),
    stemPhase: buildFallbackStemPhase(fact.stemTenGod),
    branchPhase: buildFallbackBranchPhase(fact.branchMainTenGod),
    natalNotes: fact.natalNotes,
  }));
  return mergeDecadeFortuneInsights(basis, drafts);
}

export function buildDecadeFortuneInsight(
  basis: BaziChartBasis,
  decade: BaziChartDecadeFortune,
): DecadeFortuneInsight {
  const all = buildDecadeFortuneInsights(basis);
  return all[decade.index] ?? all[0]!;
}

export function getDecadePhaseLabel(
  decade: BaziChartDecadeFortune,
  currentAge: number | null,
): '前五年' | '后五年' | null {
  if (currentAge == null) return null;
  if (currentAge < decade.startAge || currentAge > decade.endAge) return null;
  const midAge = decade.startAge + 4;
  return currentAge <= midAge ? '前五年' : '后五年';
}

function buildFallbackSummary(
  basis: BaziChartBasis,
  stemTenGod: string,
  branchMainTenGod: string,
  natalNotes: string[],
): string {
  const dominant = [...basis.tenGodStats].sort((a, b) => b.value - a.value)[0];
  const dominantHint = dominant ? `你命局${dominant.label}偏显，` : '';
  const natal = natalNotes[0];
  if (natal) {
    return `${dominantHint}这步运天干${stemTenGod}、地支藏${branchMainTenGod}，${natal}。`;
  }
  return `${dominantHint}这步运主外${stemTenGod}、主内${branchMainTenGod}，节奏与命局既有优势会重新组合。`;
}

function buildFallbackStemPhase(stemTenGod: string): string {
  const map: Record<string, string> = {
    比肩: '主动争取位置',
    劫财: '合作先定规则',
    食神: '多输出多展示',
    伤官: '试新方法、控措辞',
    正财: '深耕主业',
    偏财: '筛选副业机会',
    正官: '守规矩攒口碑',
    七杀: '拆目标逐个攻坚',
    正印: '进修或对接导师',
    偏印: '深耕小众技能',
  };
  return map[stemTenGod] ?? '按外在节奏调整';
}

function buildFallbackBranchPhase(branchMainTenGod: string): string {
  const map: Record<string, string> = {
    比肩: '维护核心圈子',
    劫财: '减少无效社交',
    食神: '作品做成系列',
    伤官: '收敛锋芒落地',
    正财: '优化开支结构',
    偏财: '只抓高确定性机会',
    正官: '做长期布局',
    七杀: '留出恢复时间',
    正印: '整理方法论',
    偏印: '研究转成产品',
  };
  return map[branchMainTenGod] ?? '调整内在重心';
}
