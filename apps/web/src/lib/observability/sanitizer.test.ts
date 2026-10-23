import { describe, it, expect } from 'vitest';
import { sanitizeForTrace, sanitizeString } from './sanitizer';

describe('sanitizer (脱敏中间件)', () => {
  describe('sanitizeString', () => {
    it('对包含 sk- 开头的 API Key 进行脱敏', () => {
      const input = 'Call failed with sk-proj-1234567890abcdef1234567890 in header';
      const output = sanitizeString(input);
      expect(output).not.toContain('sk-proj-1234567890abcdef1234567890');
      expect(output).toContain('sk-***');
    });

    it('对 Bearer token 进行脱敏', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig';
      const output = sanitizeString(input);
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig');
      expect(output).toContain('Bearer [MASKED]');
    });

    it('对 URL 中包含敏感查询参数进行脱敏', () => {
      const url = 'https://api.example.com/v1/webhook?token=secretToken123456&code=abc';
      const output = sanitizeString(url);
      expect(output).not.toContain('secretToken123456');
      expect(output).toContain('token=[MASKED]');
    });

    it('普通文本不被误伤', () => {
      const normal = '这是一段正常的中文讨论，探讨关于自然语言处理与大模型应用架构。';
      expect(sanitizeString(normal)).toBe(normal);
    });
  });

  describe('sanitizeForTrace', () => {
    it('递归脱敏对象中敏感键名', () => {
      const data = {
        apiKey: 'real-api-key-123',
        api_key: 'another-key',
        token: 'token-abc',
        secret: 'my-super-secret',
        password: 'password123',
        webhookUrl: 'https://webhook.site/abc',
        authorization: 'Bearer xxx',
        normalField: 'hello world',
        nested: {
          privateToken: 'nest-token',
          safeList: ['apple', 'banana'],
        },
      };

      const result = sanitizeForTrace(data) as Record<string, any>;
      expect(result.apiKey).toBe('[MASKED]');
      expect(result.api_key).toBe('[MASKED]');
      expect(result.token).toBe('[MASKED]');
      expect(result.secret).toBe('[MASKED]');
      expect(result.password).toBe('[MASKED]');
      expect(result.webhookUrl).toBe('[MASKED]');
      expect(result.authorization).toBe('[MASKED]');
      expect(result.normalField).toBe('hello world');
      expect(result.nested.privateToken).toBe('[MASKED]');
      expect(result.nested.safeList).toEqual(['apple', 'banana']);
    });

    it('脱敏数组中的对象和字符串', () => {
      const list = [
        { key: 'sec-123', name: 'service A' },
        'Request with sk-test1234567890abcdef',
      ];
      const result = sanitizeForTrace(list) as any[];
      expect(result[0].key).toBe('[MASKED]');
      expect(result[0].name).toBe('service A');
      expect(result[1]).not.toContain('sk-test1234567890abcdef');
      expect(result[1]).toContain('sk-***');
    });

    it('处理循环引用与深度嵌套不崩溃', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      expect(() => sanitizeForTrace(circular)).not.toThrow();
    });

    it('处理 null/undefined/数字/布尔值原样透传', () => {
      expect(sanitizeForTrace(null)).toBeNull();
      expect(sanitizeForTrace(undefined)).toBeUndefined();
      expect(sanitizeForTrace(123)).toBe(123);
      expect(sanitizeForTrace(true)).toBe(true);
    });
  });
});
