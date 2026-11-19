/**
 * 章节补丁离线评测用例集（ADR-0037 / 工单 10）
 *
 * 12 条用例覆盖八类场景，文档全部由确定性函数构造（无随机、无外部读取），
 * 保证每次评测的输入逐字节一致，前后两次提示词改动才可对照。
 *
 * 用例只声明「期望」，不预设任何通过门槛：
 * - patch：模型应只改动 sections 所列章节（含其子章节），其余章节字节级保持；
 * - new-artifact：用户要求另起独立文档，模型应使用全新 identifier，原产物完全不变。
 */

import { ARTIFACT_MARKDOWN_INJECT_LIMIT } from '@repo/shared';

/** 用例场景类别（八类，每类至少 1 条） */
export type PatchEvalCategory =
  | 'single'
  | 'adjacent'
  | 'subsections'
  | 'fullwidth-title'
  | 'duplicate-title'
  | 'fence-hash'
  | 'long-doc'
  | 'new-document';

/** 期望行为 */
export type ExpectedBehavior =
  | { kind: 'patch'; sections: string[] }
  | { kind: 'new-artifact' };

export interface PatchEvalCase {
  id: string;
  category: PatchEvalCategory;
  /** 原产物标题 */
  title: string;
  /** 原产物 identifier（模型修改时应沿用） */
  artifactId: string;
  /** 原产物 v1 全文（Markdown） */
  document: string;
  /** 用户指令 */
  instruction: string;
  expect: ExpectedBehavior;
  /** 设计说明：为什么这样设定期望 */
  note?: string;
}

/** 八类场景的固定清单，供覆盖度断言与报告分组使用 */
export const PATCH_EVAL_CATEGORIES: readonly PatchEvalCategory[] = [
  'single',
  'adjacent',
  'subsections',
  'fullwidth-title',
  'duplicate-title',
  'fence-hash',
  'long-doc',
  'new-document',
];

const ARTIFACT_ID = 'report';

/** 拼接 Markdown 文档：块之间空一行，文末单个换行 */
function join(blocks: string[]): string {
  return `${blocks.join('\n\n')}\n`;
}

// ==================== 文档构造 ====================

/** 五章研报：单章、相邻两章、新建场景共用 */
const BASIC_TITLE = '新能源汽车行业研究';
const BASIC_REPORT = join([
  '# 新能源汽车行业研究',
  '本报告概述国内新能源汽车市场的现状、竞争格局与风险，并给出后续跟踪建议。',
  '## 第一章 行业概况',
  '2024 年国内新能源汽车年销量突破 1,000 万辆，终端渗透率首次超过 40%，行业从政策驱动转向产品驱动。',
  '产业链上游的电池材料价格持续回落，中游整车厂的规模效应开始显现，下游充换电网络覆盖率稳步提升。',
  '## 第二章 市场规模',
  '乘用车细分市场中，纯电与插混车型的销量占比约为 6:4，插混车型在三线及以下城市增速更快。',
  '商用车领域的电动化进度慢于乘用车，但城配物流与公交场景的渗透率已经超过 50%。',
  '## 第三章 竞争格局',
  '头部品牌的市场份额合计接近 60%，价格带集中在 10 万至 25 万元，同质化竞争推动降价预期上升。',
  '新势力品牌分化明显，具备自研智驾与供应链整合能力的企业毛利率更稳定。',
  '## 第四章 风险提示',
  '补贴退坡与以旧换新政策的节奏变化，可能造成阶段性的需求前置与后置。',
  '原材料价格反弹、海外关税与贸易壁垒会压缩出口业务的利润空间。',
  '## 第五章 结论与建议',
  '综合来看，行业仍处在高景气区间，但竞争加剧将使盈利向少数头部企业集中。',
  '建议持续跟踪渗透率、单车盈利与海外拓展三项核心指标，并按季度复核假设。',
]);

/** 含三级子章节的方案文档 */
const SUBSECTION_TITLE = '云原生迁移方案';
const SUBSECTION_DOC = join([
  '# 云原生迁移方案',
  '## 第一章 背景与目标',
  '现有业务部署在自建机房，扩容周期长、资源利用率偏低，计划分阶段迁移到容器平台。',
  '## 第二章 技术方案',
  '本章说明迁移的整体技术路线，包含架构、数据与风险三个方面。',
  '### 2.1 架构设计',
  '采用多可用区部署，无状态服务容器化，有状态服务保留托管数据库，入口统一经网关接入。',
  '### 2.2 数据迁移',
  '先全量同步再增量追平，切换窗口控制在 30 分钟内，切换前后各做一次数据校验。',
  '### 2.3 风险控制',
  '每个迁移批次都设置灰度比例与熔断阈值，异常时 5 分钟内可回切至原环境。',
  '## 第三章 实施计划',
  '分三个批次推进：非核心业务先行，核心业务随后，最后迁移对账与报表类业务。',
]);

/** 标题含全角标点（冒号、括号、破折号）的文档 */
const FULLWIDTH_TITLE = '智能客服项目方案';
const FULLWIDTH_HEADING = '## 第三章：方案设计（试行）——成本与收益';
const FULLWIDTH_DOC = join([
  '# 智能客服项目方案',
  '## 第一章：项目背景',
  '人工客服的咨询量逐季上升，高峰时段排队时间过长，用户满意度出现下滑。',
  '## 第二章：目标与范围',
  '首期覆盖售前咨询与订单查询两类场景，目标是将一线人工咨询量降低三成。',
  FULLWIDTH_HEADING,
  '成本方面，首年包含模型调用、知识库建设与运维三项支出，其中知识库建设为一次性投入。',
  '收益方面，预计首年节省人工工时约 2,000 小时，并缩短平均响应时间。',
  '## 第四章：里程碑（草案）',
  '第一个月完成知识库整理，第二个月完成联调，第三个月进入灰度上线。',
]);

/** 同一标题（### 小结）在不同章节下重复出现的文档 */
const DUPLICATE_TITLE = '产品季度复盘';
const DUPLICATE_DOC = join([
  '# 产品季度复盘',
  '## 第一章 增长表现',
  '本季度新增用户环比增长 12%，其中自然流量占比提升，投放渠道的获客成本小幅下降。',
  '### 小结',
  '第一章小结：增长主要来自自然流量，投放效率有所改善，但新用户首周活跃度偏低。',
  '## 第二章 留存表现',
  '次日留存与七日留存均有提升，主要得益于新手引导改版与消息提醒策略调整。',
  '### 小结',
  '第二章小结：留存改善集中在新手引导环节，老用户的月度留存基本持平，仍需关注流失原因。',
  '## 第三章 下季度计划',
  '下季度重点是提升新用户首周活跃，并验证会员体系对老用户留存的拉动作用。',
]);

/** 代码围栏内含 `#` 开头行（形似标题但不是标题）的文档 */
const FENCE_TITLE = '部署手册';
const FENCE_DOC = join([
  '# 部署手册',
  '## 第一章 环境准备',
  '部署前请确认服务器已开放 3000 端口，并已配置好数据库连接串与必要的环境变量。',
  '## 第二章 安装步骤',
  '在项目根目录依次执行以下命令完成依赖安装与服务启动：',
  [
    '```bash',
    '# 安装依赖',
    'pnpm install',
    '# 启动服务',
    'pnpm dev',
    '```',
  ].join('\n'),
  '## 第三章 常见问题',
  '若端口被占用，请先停止占用进程再重新启动；若依赖安装失败，请检查网络与镜像源配置。',
]);

/** 长文章节段落：内容带章节号与段号，保证每个分段的文本唯一 */
function longParagraph(chapter: number, para: number): string {
  return (
    `第 ${chapter} 章第 ${para} 段：围绕专题 ${chapter}-${para} 展开讨论，梳理当期业务数据、同比变化与主要驱动因素，` +
    `并结合公开信息给出判断依据。该部分强调统计口径一致、数据来源可追溯，对异常波动逐项说明原因与后续跟进动作，` +
    `避免只给结论不给过程。`
  );
}

/**
 * 构造接近注入上限的长文：固定 12 章，每章段数取「总长不超过目标」的最大值。
 * 目标略低于全文注入上限（30,000 字符），保证服务端复核仍会注入全文。
 */
const LONG_CHAPTERS = 12;
const LONG_TARGET_CHARS = 29_500;
const LONG_TITLE = '年度业务分析报告';

function buildLongDocument(): string {
  const build = (parasPerChapter: number): string => {
    const blocks: string[] = ['# 年度业务分析报告'];
    for (let chapter = 1; chapter <= LONG_CHAPTERS; chapter++) {
      blocks.push(`## 第${chapter}章 专题分析（${chapter}）`);
      for (let para = 1; para <= parasPerChapter; para++) {
        blocks.push(longParagraph(chapter, para));
      }
    }
    return join(blocks);
  };
  let parasPerChapter = 1;
  while (build(parasPerChapter + 1).length <= LONG_TARGET_CHARS) parasPerChapter++;
  return build(parasPerChapter);
}

const LONG_DOC = buildLongDocument();

// ==================== 用例集 ====================

export const PATCH_EVAL_CASES: readonly PatchEvalCase[] = [
  {
    id: 'single-01',
    category: 'single',
    title: BASIC_TITLE,
    artifactId: ARTIFACT_ID,
    document: BASIC_REPORT,
    instruction: '请把「第三章 竞争格局」改得更简洁，保留核心结论即可。',
    expect: { kind: 'patch', sections: ['## 第三章 竞争格局'] },
  },
  {
    id: 'single-02',
    category: 'single',
    title: BASIC_TITLE,
    artifactId: ARTIFACT_ID,
    document: BASIC_REPORT,
    instruction: '请重写最后一章「第五章 结论与建议」，语气更坚定，并增加一条可执行建议。',
    expect: { kind: 'patch', sections: ['## 第五章 结论与建议'] },
    note: '末章的区间终点是文档末尾，用于观察结尾处理是否影响前文。',
  },
  {
    id: 'adjacent-01',
    category: 'adjacent',
    title: BASIC_TITLE,
    artifactId: ARTIFACT_ID,
    document: BASIC_REPORT,
    instruction:
      '请分别精简第二章「市场规模」和第三章「竞争格局」，两章各保留不超过三句话，章节标题保持不变。',
    expect: { kind: 'patch', sections: ['## 第二章 市场规模', '## 第三章 竞争格局'] },
    note: '期望输出两个独立的补丁块；相邻章节容易被模型并成一个块或漏掉其一。',
  },
  {
    id: 'subsections-01',
    category: 'subsections',
    title: SUBSECTION_TITLE,
    artifactId: ARTIFACT_ID,
    document: SUBSECTION_DOC,
    instruction: '请重写「第二章 技术方案」整章，包括其下的各小节，改成更偏向成本视角。',
    expect: { kind: 'patch', sections: ['## 第二章 技术方案'] },
    note: '章节区间含全部子章节，补丁须连同 2.1 / 2.2 / 2.3 一并输出。',
  },
  {
    id: 'subsections-02',
    category: 'subsections',
    title: SUBSECTION_TITLE,
    artifactId: ARTIFACT_ID,
    document: SUBSECTION_DOC,
    instruction: '只修改「2.2 数据迁移」这一小节，补充回滚预案，其他部分不要动。',
    expect: { kind: 'patch', sections: ['### 2.2 数据迁移'] },
    note: '目标是三级标题，区间止于下一个同级或更高级标题。',
  },
  {
    id: 'fullwidth-01',
    category: 'fullwidth-title',
    title: FULLWIDTH_TITLE,
    artifactId: ARTIFACT_ID,
    document: FULLWIDTH_DOC,
    instruction: '请把「第三章：方案设计（试行）——成本与收益」改得更简短，只保留成本和收益两个要点。',
    expect: { kind: 'patch', sections: [FULLWIDTH_HEADING] },
    note: '标题含全角冒号、括号与破折号，考察模型是否原样抄写而不改成半角。',
  },
  {
    id: 'duplicate-01',
    category: 'duplicate-title',
    title: DUPLICATE_TITLE,
    artifactId: ARTIFACT_ID,
    document: DUPLICATE_DOC,
    instruction: '把第二章里的「小结」改得更简短，只写结论。',
    expect: { kind: 'patch', sections: ['## 第二章 留存表现'] },
    note:
      '「### 小结」在文档中出现两次，以它作 section 必判重复失败。期望的可行路径是改补其父章节' +
      '（标题唯一，区间含小结）；本用例观察模型是否会选择唯一的父标题。',
  },
  {
    id: 'fence-hash-01',
    category: 'fence-hash',
    title: FENCE_TITLE,
    artifactId: ARTIFACT_ID,
    document: FENCE_DOC,
    instruction: '在「第二章 安装步骤」末尾补充一句说明：Node.js 版本需 20 及以上，代码块保持原样。',
    expect: { kind: 'patch', sections: ['## 第二章 安装步骤'] },
    note: '代码块内的「# 安装依赖」不是标题，不应出现在标题目录里，也不能被当作章节边界。',
  },
  {
    id: 'long-01',
    category: 'long-doc',
    title: LONG_TITLE,
    artifactId: ARTIFACT_ID,
    document: LONG_DOC,
    instruction: '请精简「第7章 专题分析（7）」，压缩到原来的一半篇幅，其他章节不要动。',
    expect: { kind: 'patch', sections: ['## 第7章 专题分析（7）'] },
    note: '全文接近 30,000 字符注入上限，观察长上下文下标题抄写与未改章节保持。',
  },
  {
    id: 'long-02',
    category: 'long-doc',
    title: LONG_TITLE,
    artifactId: ARTIFACT_ID,
    document: LONG_DOC,
    instruction: '请分别精简第1章和第12章，各压缩到原来的一半篇幅，其他章节不要动。',
    expect: { kind: 'patch', sections: ['## 第1章 专题分析（1）', '## 第12章 专题分析（12）'] },
    note: '两个补丁位于文档首尾，间隔很远。',
  },
  {
    id: 'new-01',
    category: 'new-document',
    title: BASIC_TITLE,
    artifactId: ARTIFACT_ID,
    document: BASIC_REPORT,
    instruction: '请另起一份英文版的执行摘要（独立文档），不要改动现有报告。',
    expect: { kind: 'new-artifact' },
  },
  {
    id: 'new-02',
    category: 'new-document',
    title: BASIC_TITLE,
    artifactId: ARTIFACT_ID,
    document: BASIC_REPORT,
    instruction: '再新建一份面向管理层的一页纸摘要，作为单独的文档，原报告保持不变。',
    expect: { kind: 'new-artifact' },
  },
];

/** 长文用例的字符数范围，供测试断言「贴近但不超过」全文注入上限 */
export const LONG_DOC_CHARS = LONG_DOC.length;
export { ARTIFACT_MARKDOWN_INJECT_LIMIT };
