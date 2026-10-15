import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_PACKS,
  getCapabilityPack,
  isCapabilityPackKey,
  type CapabilityPack,
} from '../capability-pack';

describe('CapabilityPack 配置中心 (ADR-0014 / 工单 01)', () => {
  it('应包含 deep-research 与 visual-report 两大内置能力包', () => {
    const keys = CAPABILITY_PACKS.map((pack) => pack.key);
    expect(keys).toContain('deep-research');
    expect(keys).toContain('visual-report');
  });

  describe('deep-research (深度调研)', () => {
    it('应严格限制工具白名单为 web_search 与 web_fetch，步数上限为 8 步', () => {
      const pack = getCapabilityPack('deep-research');
      expect(pack).toBeDefined();
      expect(pack?.key).toBe('deep-research');
      expect(pack?.name).toBe('深度调研');
      expect(pack?.maxSteps).toBe(8);
      expect(pack?.toolWhitelist).toEqual(['web_search', 'web_fetch']);
      // 绝不出图：不得包含 image_generate
      expect(pack?.toolWhitelist).not.toContain('image_generate');
      // 必须包含专属系统提示词与提示模板
      expect(pack?.systemPrompt).toContain('深度调研');
      expect(pack?.promptTemplate.length).toBeGreaterThan(10);
    });
  });

  describe('visual-report (图文报告)', () => {
    it('应限制工具白名单为 image_generate 与 web_search，步数上限为 5 步', () => {
      const pack = getCapabilityPack('visual-report');
      expect(pack).toBeDefined();
      expect(pack?.key).toBe('visual-report');
      expect(pack?.name).toBe('图文报告');
      expect(pack?.maxSteps).toBe(5);
      expect(pack?.toolWhitelist).toEqual(['image_generate', 'web_search']);
      expect(pack?.systemPrompt).toContain('图文');
      expect(pack?.promptTemplate.length).toBeGreaterThan(10);
    });
  });

  describe('查询与类型守卫', () => {
    it('非合法 key 应返回 undefined，isCapabilityPackKey 正确判断', () => {
      expect(getCapabilityPack('unknown-pack')).toBeUndefined();
      expect(getCapabilityPack('')).toBeUndefined();
      expect(isCapabilityPackKey('deep-research')).toBe(true);
      expect(isCapabilityPackKey('visual-report')).toBe(true);
      expect(isCapabilityPackKey('general')).toBe(false);
      expect(isCapabilityPackKey('random')).toBe(false);
    });
  });
});
