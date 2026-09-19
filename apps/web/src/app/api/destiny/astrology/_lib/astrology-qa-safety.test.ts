/**
 * astrology-qa-safety.test.ts —— 星语问答 · 敏感话题前置拦截规则（04 工单迁移自 mock 问答）
 *
 * 锁定的规则（设计文档 §6.7 / 上游 story 43）：
 * - 医疗 / 财务 / 法律三类话题必须被确定性规则识别，普通话题不误伤；
 * - 拦截话术必须含文档原文「不能据此作出医疗、财务或法律判断」，并给出可讨论的自我观察方向；
 * - 自我观察方向按主题落到报告里确实存在的模块上（缺项即回退，绝不引用不存在的模块）。
 */

import { describe, expect, it } from 'vitest';
import { buildBlockedAnswer, detectSensitiveTopic } from './astrology-qa-safety';

describe('detectSensitiveTopic（医疗 / 财务 / 法律）', () => {
  it('医疗类', () => {
    expect(detectSensitiveTopic('我最近身体不好，会不会生病？')).toBe('medical');
    expect(detectSensitiveTopic('星盘能看出来我需要手术吗')).toBe('medical');
    expect(detectSensitiveTopic('我抑郁了怎么办')).toBe('medical');
  });

  it('财务类', () => {
    expect(detectSensitiveTopic('我适合投资股票吗？')).toBe('financial');
    expect(detectSensitiveTopic('今年能发财吗')).toBe('financial');
    expect(detectSensitiveTopic('现在买房合适吗')).toBe('financial');
  });

  it('法律类', () => {
    expect(detectSensitiveTopic('我这场官司能赢吗')).toBe('legal');
    expect(detectSensitiveTopic('我适合离婚吗？')).toBe('legal');
    expect(detectSensitiveTopic('这个合同能签吗')).toBe('legal');
  });

  it('普通话题不误伤', () => {
    expect(detectSensitiveTopic('我在亲密关系里最需要被理解的是什么？')).toBeNull();
    expect(detectSensitiveTopic('本周工作中适合主动争取什么？')).toBeNull();
    expect(detectSensitiveTopic('我的性格优势在哪里')).toBeNull();
  });
});

describe('buildBlockedAnswer（安全话术 + 自我观察方向）', () => {
  const modules = [
    { id: 'who' as const, title: '先稳后亮的表达者' },
    { id: 'love' as const, title: '在关系里说清楚' },
    { id: 'week' as const, title: '本周宇宙提示' },
  ];

  it('话术含文档原文与自我观察方向，引用模块的真实标题', () => {
    const answer = buildBlockedAnswer('medical', modules);
    expect(answer.kind).toBe('blocked');
    expect(answer.text).toContain('不能据此作出医疗、财务或法律判断');
    expect(answer.text).toContain('观察');
    // 方向文案用模块固定名（不随 AI 个性化标题漂移），引用片用模块真实标题（可点击定位）
    expect(answer.text).toContain('「我是谁」');
    expect(answer.citations).toEqual([{ label: '先稳后亮的表达者', moduleId: 'who' }]);
  });

  it('法律话题优先落在关系模块上', () => {
    const answer = buildBlockedAnswer('legal', modules);
    expect(answer.text).toContain('「关系如何运作」');
    expect(answer.citations).toEqual([{ label: '在关系里说清楚', moduleId: 'love' }]);
  });

  it('偏好模块缺项时按可用性回退', () => {
    const onlyWho = buildBlockedAnswer('legal', [{ id: 'who' as const, title: '我是谁' }]);
    expect(onlyWho.citations).toEqual([{ label: '我是谁', moduleId: 'who' }]);
    expect(onlyWho.text).toContain('「我是谁」');

    // 偏好链上的模块都不在报告里：不带引用，也不承诺不存在的模块
    const onlyWeek = buildBlockedAnswer('legal', [{ id: 'week' as const, title: '本周宇宙提示' }]);
    expect(onlyWeek.citations).toEqual([]);
    expect(onlyWeek.text).not.toContain('「我是谁」');
    expect(onlyWeek.text).toContain('观察');
  });

  it('没有任何可用模块时不带引用，但仍给出安全话术', () => {
    const answer = buildBlockedAnswer('financial', []);
    expect(answer.citations).toEqual([]);
    expect(answer.text).toContain('不能据此作出医疗、财务或法律判断');
  });
});
