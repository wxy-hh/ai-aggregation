/**
 * profile-tools-utils.test.ts —— 工具辅助函数单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  suggestCallName,
  validateCallName,
  extractHostname,
  CALL_NAME_REGEX,
} from './profile-tools-utils';

describe('profile-tools-utils 辅助函数', () => {
  describe('suggestCallName 调用名建议', () => {
    it('英文名称转换为下划线连接的合法小写调用名', () => {
      expect(suggestCallName('Get Weather')).toBe('get_weather');
      expect(suggestCallName('Track My Order 2026')).toBe('track_my_order_2026');
    });

    it('以非法字符或纯中文开头时，生成以 tool_ 开头的随机调用名且符合正则', () => {
      const suggested = suggestCallName('天气查询');
      expect(suggested.startsWith('tool_')).toBe(true);
      expect(CALL_NAME_REGEX.test(suggested)).toBe(true);
    });

    it('空字符串返回空', () => {
      expect(suggestCallName('   ')).toBe('');
    });
  });

  describe('validateCallName 调用名校验', () => {
    it('合法的小写字母开头小写串校验通过', () => {
      expect(validateCallName('query_weather')).toBeNull();
      expect(validateCallName('my-tool-1')).toBeNull();
      expect(validateCallName('a1')).toBeNull();
    });

    it('非小写字母开头报错', () => {
      expect(validateCallName('123tool')).toBe('调用名必须以小写英文字母开头');
      expect(validateCallName('_hidden')).toBe('调用名必须以小写英文字母开头');
      expect(validateCallName('Tool')).toBe('调用名必须以小写英文字母开头');
    });

    it('长度不足或过长报错', () => {
      expect(validateCallName('a')).toBe('调用名长度必须在 2 到 31 个字符之间');
      expect(validateCallName('a'.repeat(32))).toBe('调用名长度必须在 2 到 31 个字符之间');
    });

    it('包含非法字符报错', () => {
      expect(validateCallName('tool*name')).toBe('调用名仅支持小写字母、数字、下划线及连字符');
      expect(validateCallName('tool name')).toBe('调用名仅支持小写字母、数字、下划线及连字符');
    });
  });

  describe('extractHostname 提取域名', () => {
    it('正确提取合法 URL 的主机名', () => {
      expect(extractHostname('https://api.example.com/v1/webhook?id=1')).toBe('api.example.com');
      expect(extractHostname('https://sub.domain.org:8080/path')).toBe('sub.domain.org');
    });

    it('非法 URL 返回原串', () => {
      expect(extractHostname('not-a-url')).toBe('not-a-url');
    });
  });
});
