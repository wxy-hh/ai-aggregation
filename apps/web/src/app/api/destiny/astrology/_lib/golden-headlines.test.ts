/**
 * golden-headlines.test.ts —— 黄金主轴样例库（03 工单自 mock 层迁入）
 *
 * 锁定的外部行为（迁移自前端先行期 mock 解读文案库被删前的同名断言，验收基准不因搬家而放松）：
 * - 规模 20–30 条（当前 28 条）、id 全局唯一；
 * - 每条 18–28 字（不计标点）、不含绝对化措辞；
 * - few-shot 文本块逐条注入（提示词采样基准与库本体同源）。
 */

import { describe, expect, it } from 'vitest';
import {
  buildGoldenHeadlinePromptSection,
  GOLDEN_HEADLINE_SAMPLES,
  SUN_ELEMENT_HEADLINES,
  SUN_MOON_HEADLINES,
} from './golden-headlines';

/** 去标点后的字数（验收口径「不超 28 字」指汉字本体） */
function charCount(text: string): number {
  return text.replace(/[，。、「」；：？！\s]/g, '').length;
}

/** 绝对化禁用词（设计文档 §9：不绝对化） */
const ABSOLUTE_WORDS = ['一定', '必然', '注定', '绝对', '永远', '必定', '肯定会', '命定'];

describe('黄金主轴样例库（服务端提示词资产）', () => {
  it('规模在 20–30 条之间（16 日月元素 + 8 相位主题 + 4 太阳元素兜底）', () => {
    expect(Object.keys(SUN_MOON_HEADLINES)).toHaveLength(16);
    expect(Object.keys(SUN_ELEMENT_HEADLINES)).toHaveLength(4);
    expect(GOLDEN_HEADLINE_SAMPLES.length).toBeGreaterThanOrEqual(20);
    expect(GOLDEN_HEADLINE_SAMPLES.length).toBeLessThanOrEqual(30);
  });

  it('每条 18–28 字（不计标点）', () => {
    for (const h of GOLDEN_HEADLINE_SAMPLES) {
      expect(charCount(h.text), `${h.id} 超长/过短：${h.text}`).toBeGreaterThanOrEqual(18);
      expect(charCount(h.text), `${h.id} 超长/过短：${h.text}`).toBeLessThanOrEqual(28);
    }
  });

  it('不含绝对化措辞', () => {
    for (const h of GOLDEN_HEADLINE_SAMPLES) {
      for (const w of ABSOLUTE_WORDS) {
        expect(h.text.includes(w), `${h.id} 含禁用词「${w}」`).toBe(false);
      }
    }
  });

  it('id 全局唯一', () => {
    const ids = GOLDEN_HEADLINE_SAMPLES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('few-shot 文本块逐条包含（注入提示词的采样基准与库本体同源）', () => {
    const section = buildGoldenHeadlinePromptSection();
    for (const h of GOLDEN_HEADLINE_SAMPLES) {
      expect(section).toContain(h.text);
    }
    expect(section.split('\n')).toHaveLength(GOLDEN_HEADLINE_SAMPLES.length);
  });
});
