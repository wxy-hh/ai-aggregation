/**
 * astrology-qa-answer.test.ts —— 星语问答 · 模型输出解析（04 工单）
 *
 * 锁定的规则：
 * - 正文扫描器从流式 JSON 里增量提取 text 字段的正文：跨分块切割（含转义序列、
 *   \uXXXX 编码被切开）都必须逐字还原；其余字段（citations 等）一律跳过；
 * - 终局解析：容忍 JSON 前后的说明文字与代码围栏，正文缺失或整体不是 JSON 时诚实报错
 *   （绝不拼装兜底回答），citations 缺省为空数组。
 */

import { describe, expect, it } from 'vitest';
import {
  AstrologyQaAnswerError,
  createAnswerTextScanner,
  parseAnswerJson,
} from './astrology-qa-answer';

const SAMPLE = {
  text: '你先把感受说清楚，关系里的回应就会跟上。\n可以练习：先说感受，再谈事情。',
  citations: ['planet:moon:sign', 'module:love'],
};

/** 把整串按固定切分推进扫描器，返回累计正文 */
function scanInChunks(raw: string, size: number): string {
  const scanner = createAnswerTextScanner();
  let out = '';
  for (let i = 0; i < raw.length; i += size) {
    out += scanner.push(raw.slice(i, i + size));
  }
  return out;
}

describe('createAnswerTextScanner（流式正文提取）', () => {
  it('整段一次推入：提取 text 字段正文', () => {
    const scanner = createAnswerTextScanner();
    expect(scanner.push(JSON.stringify(SAMPLE))).toBe(SAMPLE.text);
  });

  it('任意切分位置都能逐字还原（含转义与 \\uXXXX 被切开）', () => {
    const raws = [
      JSON.stringify(SAMPLE),
      JSON.stringify({ citations: [...SAMPLE.citations], text: '先看依据，再看结论。' }),
      '{"text":"第一行\\n第二行 \\"带引号\\" 与反斜杠 \\\\ 结束","citations":[]}',
      '{"text":"\\u4f60\\u597d，这是编码过的中文","citations":["planet:sun:sign"]}',
    ];
    const expected = [
      SAMPLE.text,
      '先看依据，再看结论。',
      '第一行\n第二行 "带引号" 与反斜杠 \\ 结束',
      '你好，这是编码过的中文',
    ];

    for (const [index, raw] of raws.entries()) {
      const whole = scanInChunks(raw, raw.length * 2);
      expect(whole, `第 ${index} 组整段推入`).toBe(expected[index]);
      for (let size = 1; size <= 7; size += 1) {
        expect(scanInChunks(raw, size), `第 ${index} 组按 ${size} 字符切分`).toBe(expected[index]);
      }
    }
  });

  it('citations 在 text 之前也照常提取；字段缺失时返回空串', () => {
    expect(scanInChunks('{"citations":["planet:sun:sign"],"text":"先给引用再给正文"}', 3)).toBe(
      '先给引用再给正文'
    );
    expect(scanInChunks('{"citations":["planet:sun:sign"]}', 4)).toBe('');
    expect(scanInChunks('模型说：这不是 JSON', 5)).toBe('');
  });
});

describe('parseAnswerJson（终局解析与校验）', () => {
  it('解析出正文与引用键，容忍前后说明文字与代码围栏', () => {
    const raw = `好的，以下是回答：\n\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\`\n希望有帮助。`;
    expect(parseAnswerJson(raw)).toEqual(SAMPLE);
  });

  it('citations 缺省为空数组', () => {
    expect(parseAnswerJson('{"text":"只有正文"}')).toEqual({ text: '只有正文', citations: [] });
  });

  it('正文缺失 / 空串 / 非 JSON：诚实报错，不拼装兜底内容', () => {
    for (const raw of ['不是 JSON', '{"citations":["planet:sun:sign"]}', '{"text":"   "}']) {
      expect(() => parseAnswerJson(raw), raw).toThrow(AstrologyQaAnswerError);
    }
  });
});
