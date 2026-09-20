/**
 * astrology-report-json-schema.ts —— 星座寰宇 · 解读报告 JSON schema（03 工单）
 *
 * 单次调用产出四个分区，顺序固定：headline → bigThree → modules → transits。
 * 服务端按同一顺序边流边解析推送（见 ./astrology-report-sections.ts），前端逐区渲染。
 *
 * 双模型口径：
 * - 豆包（火山方舟 Responses）：text.format = json_schema 强约束，本 schema 即上游约束；
 * - DeepSeek（chat/completions）：json_object 弱约束，模型客户端把本 schema 序列化后注入
 *   system 提示词作为结构样例（packages/shared 的 injectJsonSchemaSample），
 *   服务端仍按同一份 Zod 口径落库前校验。
 *
 * 字段长度不做 schema 级强约束：长度要求写在提示词里（json_schema 对 minLength/maxLength
 * 的支持度因上游而异），服务端只兜底拦截「明显跑偏」的取值（见 sections 模块）。
 */

/** 大三要素单卡（白话层 + 行为层；不可用项为 null，绝不编造） */
const elementReadingSchema = {
  type: ['object', 'null'],
  properties: {
    plain: { type: 'string' },
    action: { type: 'string' },
  },
  required: ['plain', 'action'],
  additionalProperties: false,
} as const;

export const ASTROLOGY_REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    // ── 分区一：一句主轴（18–28 字，至少两项真值支持） ──
    headline: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        factReferences: { type: 'array', items: { type: 'string' } },
      },
      required: ['text', 'factReferences'],
      additionalProperties: false,
    },
    // ── 分区二：大三要素（无宫位档 ascendant 必须为 null） ──
    bigThree: {
      type: 'object',
      properties: {
        sun: elementReadingSchema,
        moon: elementReadingSchema,
        ascendant: elementReadingSchema,
      },
      required: ['sun', 'moon', 'ascendant'],
      additionalProperties: false,
    },
    // ── 分区三：五大生活模块（固定 id 集合，正文 ≤120 字，2–3 个短标签） ──
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['who', 'love', 'career', 'strengths', 'week'] },
          title: { type: 'string' },
          summary: { type: 'string' },
          scenario: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          action: { type: 'string' },
          factReferences: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'summary', 'tags', 'action', 'factReferences'],
        additionalProperties: false,
      },
    },
    // ── 分区四：本周行运（行动三角）与关键相位（三段式） ──
    transits: {
      type: 'object',
      properties: {
        opportunity: { type: 'string' },
        caution: { type: 'string' },
        action: { type: 'string' },
        transitReferences: { type: 'array', items: { type: 'string' } },
        keyAspects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              refKey: { type: 'string' },
              energy: { type: 'string' },
              life: { type: 'string' },
              practice: { type: 'string' },
            },
            required: ['refKey', 'energy', 'life', 'practice'],
            additionalProperties: false,
          },
        },
      },
      required: ['opportunity', 'caution', 'action', 'transitReferences', 'keyAspects'],
      additionalProperties: false,
    },
  },
  required: ['headline', 'bigThree', 'modules', 'transits'],
  additionalProperties: false,
} as const;

/** 结构化输出格式名（豆包 json_schema 的名称字段） */
export const ASTROLOGY_REPORT_SCHEMA_NAME = 'astrology_interpretation_report';
