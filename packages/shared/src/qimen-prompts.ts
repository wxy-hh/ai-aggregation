/**
 * 奇门分析 prompt 构建层（评审 C3 内部分段）。
 * 只做「盘局 → 文本 / 请求 → 系统提示词」的纯字符串拼装，不触模型调用。
 * 对外仅暴露编排层使用到的 build*；formatChartForPrompt 为内部实现。
 */
import type { QimenAnalysisBaseResult, QimenAnalyzeRequest } from './qimen-types';

const categoryLabelMap = {
  career: '事业发展',
  wealth: '财务与投资',
  love: '感情关系',
  health: '健康状态',
  decision: '重要决策',
  study: '学业进修',
  other: '综合问题',
} as const;

const focusLabelMap = {
  short_term: '短期策略',
  long_term: '长期布局',
  risk_control: '风险规避',
} as const;

const chartMethodLabelMap = {
  time: '时家奇门',
  daily: '日家奇门',
} as const;

const outputStyleLabelMap = {
  professional: '专业术语风格',
  plain: '通俗易懂风格',
} as const;

const outputLengthLabelMap = {
  brief: '简版',
  detailed: '详版',
} as const;

/**
 * 将盘局数据格式化为 Prompt 中的表格
 */
function formatChartForPrompt(chart: QimenAnalysisBaseResult): string {
  const m = chart.chartMeta;

  let out = '## 盘局基本信息\n';
  out += `- 局数：${m.dun}${m.ju}局\n`;
  out += `- 旬首：${m.xunshou} | 日干：${m.riGan}（代表求测人）| 时干：${m.shiGan}（代表所问之事）\n`;
  out += `- 值符：${m.valueSymbol}（当前时空的主导星曜）| 值使：${m.valueDoor}（事态发展的关键门户）\n`;
  out += `- 空亡：${m.jiaziXunkong}（能量减半、事情虚而不实的宫位）\n`;
  if (m.horsePosition) out += `- 马星：${m.horsePosition}（主变动、奔波的宫位）\n`;
  if (m.trueSolarTime) out += `- 真太阳时：${m.trueSolarTime}（已校准当地时间）\n`;

  out += '\n## 九宫盘局数据（每个宫位的完整配置）\n';
  out += '| 宫位 | 方位·五行 | 八神 | 九星 | 八门 | 天盘干 | 地盘干 | 格局 | 标记 |\n';
  out += '|------|-----------|------|------|------|--------|--------|------|------|\n';

  for (const cell of chart.board) {
    const tags = [
      cell.isValueSymbol ? '⭐值符宫' : '',
      cell.isValueDoor ? '🚪值使宫' : '',
      cell.isVoid ? '○空亡' : '',
      cell.isHorse ? '🐎驿马' : '',
    ]
      .filter(Boolean)
      .join(' ');

    out += `| ${cell.palace} | ${cell.direction}·${cell.wuxing || '-'} | ${cell.god} | ${cell.star} | ${cell.door} | ${cell.heavenStem} | ${cell.earthStem} | ${cell.pattern || '-'} | ${tags || '-'} |\n`;
  }

  return out;
}

export function buildUserPrompt(input: QimenAnalyzeRequest, chart?: QimenAnalysisBaseResult) {
  const lines = [];

  if (chart) {
    // 本地排盘模式：LLM 只做分析，接收完整的盘局数据
    lines.push('请根据以下已计算好的奇门遁甲盘局数据，进行专业分析解读。');
    lines.push('');
    lines.push(formatChartForPrompt(chart));
    lines.push('');
    lines.push('## 用户问题');
    lines.push(`起局时间：${input.context.datetime}`);
    if (chart.chartMeta.trueSolarTime) {
      lines.push(`真太阳时：${chart.chartMeta.trueSolarTime}`);
    }
    lines.push(`地点：${input.context.location}`);
    lines.push(`起局方式：${chartMethodLabelMap[input.context.chartMethod]}`);
    lines.push(`问题类别：${categoryLabelMap[input.question.category]}`);
    lines.push(`问题描述：${input.question.description}`);
    lines.push(`分析侧重：${focusLabelMap[input.question.focus]}`);
    lines.push(`语言风格：${outputStyleLabelMap[input.question.outputStyle]}`);
    lines.push(`结果长度：${outputLengthLabelMap[input.question.outputLength]}`);
  } else {
    // 兼容旧模式：LLM 自行排盘
    lines.push('请根据以下信息输出奇门基础盘面 JSON：');
    lines.push(`起局时间：${input.context.datetime}`);
    lines.push(`地点：${input.context.location}`);
    lines.push(`起局方式：${chartMethodLabelMap[input.context.chartMethod]}`);
    lines.push(`问题类别：${categoryLabelMap[input.question.category]}`);
    lines.push(`问题描述：${input.question.description}`);
    lines.push(`分析侧重：${focusLabelMap[input.question.focus]}`);
    lines.push(`语言风格：${outputStyleLabelMap[input.question.outputStyle]}`);
    lines.push(`结果长度：${outputLengthLabelMap[input.question.outputLength]}`);
  }

  return lines.join('\n');
}

export function buildBaseSystemPrompt() {
  return `
你是奇门遁甲排盘助手。必须严格输出 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

你的任务是只生成首屏基础盘面，字段必须且仅能包含：
- chartTitle
- chartMeta: dun, ju, jiaziXunkong, horsePosition, valueSymbol, valueDoor
- board: 9项，宫位顺序必须是 [巽四宫,离九宫,坤二宫,震三宫,中五宫,兑七宫,艮八宫,坎一宫,乾六宫]
- score
- disclaimer

要求：
1. board 字段必须完整，不能省略宫位
2. 每个字段内容简洁，适合首屏直接展示
3. 不要输出 overallAssessment、riskAlerts、actionSuggestions、timingWindows、chartSummary
4. disclaimer 控制在一句话内
`.trim();
}

const YONGSHEN_GUIDE: Record<string, string> = {
  career: '以开门（工作机会）、值符（领导/平台）为主要用神，兼看日干落宫与开门的关系',
  wealth: '以生门（财运）、戊（资本）为主要用神，兼看日干落宫与生门的关系',
  love: '以六合（婚姻/合作）、乙（女方）、庚（男方）为主要用神',
  health: '以天芮星（疾病）、死门（严重程度）为主要用神，兼看日干落宫旺衰',
  decision: '以值符（大局趋势）、值使（推进方向）为主要用神，对比选项对应宫位的吉凶',
  study: '以天辅星（学业/贵人）、景门（文书/考试）为主要用神',
  other: '以日干落宫为出发点，结合值符值使通盘分析',
};

export function buildStrategySystemPrompt(input: QimenAnalyzeRequest, hasChart = false) {
  const maxListCount = input.question.outputLength === 'brief' ? 3 : 5;
  const yongShen = YONGSHEN_GUIDE[input.question.category] || YONGSHEN_GUIDE.other;

  const chartHint = hasChart
    ? '盘局数据已在上方提供（包含九宫位置、八神、九星、八门、天盘干、地盘干、格局、值符值使、空亡马星）。你的分析必须引用具体宫位和格局作为依据，禁止脱离盘局数据泛泛而谈。'
    : '';

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字、解释和 markdown。
禁止输出思考过程。

${chartHint}

## 用神指引（根据问题类别确定分析焦点）
${yongShen}

## 分析框架（请按此步骤逐项分析）
1. 定位日干${input.question.category === 'love' ? '和用神' : ''}所在宫位，分析其旺衰、格局、临星临门，判读求测人当前状态
2. 定位时干所在宫位，分析所问之事的状态和趋势
3. 检查值符宫（大局主导力）和值使宫（发展通道），判断整体有利还是不利
4. 单独检查空亡宫——空亡宫涉及的事情虚而不实、力量减半，需要特别提醒用户
5. 检查马星宫——如有变动信号需要告知用户
6. 综合分析：对比有利宫位和不利宫位，给出整体判断

## 输出要求
为前端右侧策略区生成最终定稿，必须且仅返回：
- overallAssessment: 一段完整综合判断，1-2 句
- riskAlerts: ${maxListCount} 条完整风险提醒
- actionSuggestions: ${maxListCount} 条完整行动建议

每条分析必须引用具体宫位作为依据，格式如：
- 综合："日干${input.question.category === 'career' ? '甲' : ''}落X宫临X星+X门，主…"
- 风险："X宫X神+X门+空亡，主…需注意…"
- 建议："X宫X门临X神，宜…"

返回格式：
{
  "overallAssessment": "string",
  "riskAlerts": ["string"],
  "actionSuggestions": ["string"]
}
`.trim();
}

export function buildTimingSystemPrompt(input: QimenAnalyzeRequest, hasChart = false) {
  const maxTimingCount = input.question.outputLength === 'brief' ? 2 : 4;

  const chartHint = hasChart
    ? `盘局数据已在上方提供。请按以下规则推演时间窗口：
1. 检查空亡宫——空亡逢冲或出空之时是关键节点（约10天一周期）
2. 检查马星宫——马星逢冲之时是变动节点
3. 检查值使宫——值使所落宫位对应的节气时段是事态推进期
4. 检查用神宫位（根据问题类别确定）——用神旺相之时为有利窗口，用神受克之时为不利窗口
5. period 格式为具体日期范围（年-月-日 至 年-月-日），需基于当前起局时间推算`
    : '';

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

${chartHint}

只生成”关键时间窗口”最终定稿，必须且仅返回：
{
  “timingWindows”: [
    { “period”: “string”, “guidance”: “string” }
  ]
}

要求：
1. 输出 ${maxTimingCount} 项以内的完整时间窗口，按时间先后排序
2. 每项 period 必须是具体的日期范围（如”2026年6月6日-6月21日”），不能是模糊描述
3. 每项 guidance 需包含：奇门依据（引用具体宫位）+ 具体行动建议
4. 禁止占位、禁止续写、禁止后续修订
5. 不要输出其他字段
`.trim();
}

export function buildSummarySystemPrompt(hasChart = false) {
  const chartHint = hasChart
    ? '盘局数据已在上方提供。请基于盘局中的关键格局（天盘干+地盘干的组合）、八门吉凶分布、值符值使位置进行总结。'
    : '';

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

${chartHint}

只生成”盘局摘要”最终定稿，必须且仅返回：
{
  “chartSummary”: “string”
}

要求：
1. 输出 1-2 句完整总结，直接点出核心结论
2. 简要引用关键宫位依据（如”开门临值符在坎一宫，主现有工作稳定有贵人”）
3. 可直接展示，禁止占位、禁止续写、禁止后续修订
4. 不要输出其他字段
`.trim();
}