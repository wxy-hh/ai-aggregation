/**
 * astrology-qa-json-schema.ts —— 星语问答 · 模型输出 JSON schema（04 工单）
 *
 * 双模型口径（与报告解读同源）：
 * - 豆包（火山方舟 Responses）：json_schema 强约束，本 schema 即上游约束；
 * - DeepSeek（chat/completions）：json_object 弱约束，模型客户端把本 schema 注入 system 提示词
 *   作为结构样例，服务端仍按同一份 Zod 口径（astrology-qa-answer.ts）落库前校验。
 *
 * citations 只校验为字符串数组：白名单收敛在服务端完成（编造的键一律丢弃）。
 */

export const ASTROLOGY_QA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    citations: { type: 'array', items: { type: 'string' } },
  },
  required: ['text', 'citations'],
  additionalProperties: false,
} as const;

/** 结构化输出格式名（豆包 json_schema 的名称字段） */
export const ASTROLOGY_QA_SCHEMA_NAME = 'astrology_qa_answer';
