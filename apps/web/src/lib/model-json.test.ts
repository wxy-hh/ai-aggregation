import { describe, it, expect } from 'vitest';
import {
  extractJsonBlock,
  extractJsonObject,
  extractArkOutputText,
} from '@repo/shared';

describe('model-json 抽取原语（评审 C2 收敛）', () => {
  describe('extractJsonBlock', () => {
    it('去除 json 围栏', () => {
      expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('围栏不带 json 标记也识别', () => {
      expect(extractJsonBlock('```\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('无围栏时原样返回并 trim', () => {
      expect(extractJsonBlock('  {"a":1}  ')).toBe('{"a":1}');
    });
  });

  describe('extractJsonObject', () => {
    it('从围栏前文噪声中抽取最外层对象', () => {
      expect(extractJsonObject('我看看```json\n{"a":1,"b":[2,3]}\n```')).toEqual({
        a: 1,
        b: [2, 3],
      });
    });

    it('找不到对象时抛错', () => {
      expect(() => extractJsonObject('没有对象')).toThrow();
    });
  });

  describe('extractArkOutputText', () => {
    it('顶层 output_text 优先', () => {
      expect(extractArkOutputText({ output_text: ' hello ' })).toBe('hello');
    });

    it('从 output 数组 message 的 output_text 内容提取', () => {
      expect(
        extractArkOutputText({
          output: [
            { type: 'message', content: [{ type: 'output_text', text: ' 你好 ' }] },
          ],
        })
      ).toBe('你好');
    });

    it('output_json 内容序列化返回', () => {
      expect(
        extractArkOutputText({
          output: [{ type: 'message', content: [{ type: 'output_json', json: { a: 1 } }] }],
        })
      ).toBe('{"a":1}');
    });

    it('空响应抛错', () => {
      expect(() => extractArkOutputText(null)).toThrow();
    });
  });
});