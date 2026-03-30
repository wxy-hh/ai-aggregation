'use client';

import type { OnboardingInput } from '../onboarding/onboarding-modal';

export type FiveElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type DestinyProfile = {
  name: string;
  genderLabel: string;
  birthText: string;
  locationText: string;
};

export type BaZiPillar = {
  stem: string;
  branch: string;
  label: string;
  element: FiveElementKey;
  tooltip: string;
};

export type DestinyReport = {
  profile: DestinyProfile;
  pillars: BaZiPillar[];
  tenGods: { key: string; label: string; value: number; tooltip: string }[];
  elements: { key: FiveElementKey; label: string; value: number }[];
  modules: {
    career: { title: string; summary: string; bullets: string[] };
    love: { title: string; summary: string; bullets: string[] };
    wealth: { title: string; summary: string; bullets: string[] };
    health: { title: string; summary: string; bullets: string[] };
    personality: { title: string; summary: string; bullets: string[] };
  };
  timeline: {
    year: number;
    title: string;
    summary: string;
    detail: { opportunities: string[]; risks: string[]; actions: string[] };
  }[];
};

function formatBirthText(input: OnboardingInput | null) {
  if (!input) return '请输入生辰信息以开启精准排盘';
  const { birthDate, birthTime } = input;
  return `${birthDate.year}年${birthDate.month}月${birthDate.day}日 ${birthTime.hour}:${birthTime.minute}`;
}

export function getMockDestinyReport(input: OnboardingInput | null): DestinyReport {
  const name = input?.name?.trim() || '乾造（男命）';
  const genderLabel = input?.gender === 'female' ? '坤造（女命）' : '乾造（男命）';

  const locationText =
    input?.location?.name && input.location.lat && input.location.lon
      ? `${input.location.name}（${input.location.lat.toFixed(2)}, ${input.location.lon.toFixed(2)}）`
      : input?.location?.name
        ? input.location.name
        : '出生地待确认';

  return {
    profile: {
      name,
      genderLabel,
      birthText: formatBirthText(input),
      locationText,
    },
    pillars: [
      { stem: '甲', branch: '子', label: '年柱', element: 'wood', tooltip: '年柱：外在环境与早年基调' },
      { stem: '丙', branch: '寅', label: '月柱', element: 'fire', tooltip: '月柱：事业根基与社会关系' },
      { stem: '戊', branch: '辰', label: '日柱', element: 'earth', tooltip: '日柱：自我与核心驱动力' },
      { stem: '庚', branch: '申', label: '时柱', element: 'metal', tooltip: '时柱：行动方式与未来趋势' },
    ],
    elements: [
      { key: 'metal', label: '金', value: 22 },
      { key: 'wood', label: '木', value: 18 },
      { key: 'water', label: '水', value: 26 },
      { key: 'fire', label: '火', value: 14 },
      { key: 'earth', label: '土', value: 20 },
    ],
    tenGods: [
      { key: 'piancai', label: '偏财', value: 32, tooltip: '偏财：机会型收入与资源整合' },
      { key: 'shishen', label: '食神/伤官', value: 25, tooltip: '食神/伤官：表达力与创造力' },
      { key: 'zhengcai', label: '正财/偏财', value: 20, tooltip: '正财：稳健收入与长期积累' },
      { key: 'zhengguan', label: '正官/七杀', value: 23, tooltip: '正官/七杀：规则、压力与目标感' },
    ],
    modules: {
      personality: {
        title: '性格底色与优势',
        summary: '你更偏向“目标清晰 + 结构化执行”，适合做长期价值的积累型项目。',
        bullets: ['遇到不确定时，先做拆解与验证，再做决策', '强烈的责任感，容易把自己推到高压区'],
      },
      career: {
        title: '事业发展潜力解析',
        summary: '当前阶段适合在技术、产品、运营等“需要方法论沉淀”的赛道深耕。',
        bullets: ['今年更利“换环境/换项目”带来的上升', '适合与强执行力伙伴协作，效率更高'],
      },
      wealth: {
        title: '财运结构与节奏',
        summary: '稳健财更优于激进财。适合以长期现金流与复利思维配置。',
        bullets: ['短期投机回撤风险更高', '把预算优先投在“能力资产”更划算'],
      },
      love: {
        title: '感情模式与边界',
        summary: '关系里你更看重“共同成长”和“价值观一致”。',
        bullets: ['表达需求要更具体，不要只讲结论', '避免在压力大时做情绪化承诺'],
      },
      health: {
        title: '健康关注点',
        summary: '注意睡眠质量与久坐带来的颈肩与代谢压力。',
        bullets: ['每周 3 次低强度有氧更适配', '优先把作息稳定下来，再谈强度训练'],
      },
    },
    timeline: [
      {
        year: 2024,
        title: '甲辰年 · 势运升格',
        summary: '换场景更利于打开局面，适合上台阶与承担更大职责。',
        detail: {
          opportunities: ['更容易遇到关键贵人/关键项目', '学习与证书类投入回报更高'],
          risks: ['承诺过多导致精力透支', '在变动期容易焦虑、睡眠波动'],
          actions: ['把目标拆成 90 天里程碑', '把高频消耗型会议砍掉 30%'],
        },
      },
      {
        year: 2025,
        title: '乙巳年 · 官印相生',
        summary: '有利于建立规则与体系，适合管理化、标准化与长期布局。',
        detail: {
          opportunities: ['更适合做“流程/系统/方法论”建设', '容易获得更正式的认可'],
          risks: ['过度追求完美导致推进变慢', '与强势角色沟通摩擦增大'],
          actions: ['把交付拆成可验收的最小单元', '关键沟通先写清“对齐点”再开会'],
        },
      },
      {
        year: 2026,
        title: '丙午年 · 火旺生土',
        summary: '爆发力强，但节奏易过快。适合集中打一场“关键战役”。',
        detail: {
          opportunities: ['适合发声、做影响力与品牌', '项目推进阻力更小'],
          risks: ['情绪与冲动决策概率提升', '身体炎症/上火类信号更明显'],
          actions: ['建立复盘机制：每两周一次', '减少咖啡因，增加睡眠深度'],
        },
      },
    ],
  };
}

