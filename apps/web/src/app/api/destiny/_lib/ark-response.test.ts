import { describe, expect, it } from 'vitest';
import { extractArkOutputText, extractJsonBlock } from './ark-response';

describe('extractArkOutputText', () => {
  it('should extract output_text from response payload', () => {
    const text = extractArkOutputText({
      output: [
        { type: 'reasoning', content: [] },
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"ok":true}' }],
        },
      ],
    });

    expect(text).toBe('{"ok":true}');
  });

  it('should throw when no message text', () => {
    expect(() => extractArkOutputText({ output: [{ type: 'reasoning' }] })).toThrow(
      'ARK 未返回有效文本'
    );
  });

  it('should extract output_json payload', () => {
    const text = extractArkOutputText({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_json', json: { ok: true } }],
        },
      ],
    });
    expect(text).toBe('{"ok":true}');
  });
});

describe('extractJsonBlock', () => {
  it('should return fenced json content', () => {
    const text = extractJsonBlock('```json\n{"hello":"world"}\n```');
    expect(text).toBe('{"hello":"world"}');
  });
});
