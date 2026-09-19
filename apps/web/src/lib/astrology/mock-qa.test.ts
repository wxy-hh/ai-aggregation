/**
 * mock-qa.test.ts —— 星座寰宇 · 星语问答 mock 引擎测试（10 工单）
 *
 * 锁定的规则（设计文档 §6.7）：
 * - 敏感主题（医疗/财务/法律）拦截态必须含「不能据此作出医疗、财务或法律判断」；
 * - 回答必须引用盘面模块名称或事实标签（citations ≥ 1）；
 * - 措辞不绝对化、不含英文占星术语；
 * - 不泄露不稳定或已隐藏的盘面事实（无宫位档引用不得含上升/天顶/宫位）。
 */

import { describe, expect, it } from 'vitest';
import {
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_UNKNOWN,
  computeChartFacts,
} from './mock-chart-facts';
import { buildModuleReadings } from './mock-interpretation';
import { answerAstrologyQuestion, detectSensitiveTopic, requestAstrologyAnswer } from './mock-qa';

const ABSOLUTE_WORDS = ['一定', '必然', '注定', '绝对', '永远', '必定', '肯定会', '命定'];

const accurateFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
const unknownFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
const accurateModules = buildModuleReadings(accurateFacts, new Date(2026, 8, 1));
const unknownModules = buildModuleReadings(unknownFacts, new Date(2026, 8, 1));

describe('敏感主题识别 detectSensitiveTopic', () => {
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

describe('敏感拦截态', () => {
  it('话术含文档原文且提供自我观察方向，仍带引用', () => {
    const a = answerAstrologyQuestion('我该不该去看病？', accurateFacts, accurateModules);
    expect(a.kind).toBe('blocked');
    expect(a.text).toContain('不能据此作出医疗、财务或法律判断');
    expect(a.text).toContain('观察'); // 自我观察方向
    expect(a.citations.length).toBeGreaterThanOrEqual(1);
  });
});

describe('主题路由与引用', () => {
  it('亲密关系问题 → 引用「关系如何运作」', () => {
    const a = answerAstrologyQuestion('我在亲密关系里最需要被理解的是什么？', accurateFacts, accurateModules);
    expect(a.kind).toBe('answer');
    expect(a.citations.some((c) => c.label === '关系如何运作')).toBe(true);
  });

  it('本周工作问题 → 同时引用「本周宇宙提示」与「事业如何发挥」', () => {
    const a = answerAstrologyQuestion('本周工作中适合主动争取什么？', accurateFacts, accurateModules);
    const labels = a.citations.map((c) => c.label);
    expect(labels).toContain('本周宇宙提示');
    expect(labels).toContain('事业如何发挥');
  });

  it('相位问题 → 引用关键相位事实标签（含星体中文名）', () => {
    const a = answerAstrologyQuestion('这个相位如何影响我的表达？', accurateFacts, accurateModules);
    expect(a.kind).toBe('answer');
    expect(a.citations.some((c) => c.label === '关键相位')).toBe(true);
    // 「表达」应优先定位到水星参与的相位（若存在）
    expect(a.citations.some((c) => /水星|月亮|太阳/.test(c.label))).toBe(true);
  });

  it('性格问题 → 引用「我是谁」', () => {
    const a = answerAstrologyQuestion('我的性格底色是什么样的？', accurateFacts, accurateModules);
    expect(a.citations.some((c) => c.label === '我是谁')).toBe(true);
  });
});

describe('文案约束', () => {
  const samples = [
    '我在亲密关系里最需要被理解的是什么？',
    '本周工作中适合主动争取什么？',
    '这个相位如何影响我的表达？',
    '我的优势与盲点是什么？',
    '随便聊聊我自己',
  ];

  it('回答不绝对化、不含英文、引用 ≥1', () => {
    for (const q of samples) {
      const a = answerAstrologyQuestion(q, accurateFacts, accurateModules);
      expect(a.citations.length, q).toBeGreaterThanOrEqual(1);
      expect(/[a-zA-Z]/.test(a.text), `${q} 含英文`).toBe(false);
      for (const w of ABSOLUTE_WORDS) {
        expect(a.text.includes(w), `${q} 含「${w}」`).toBe(false);
      }
    }
  });

  it('同一问题两次回答一致（确定性，可复现）', () => {
    const a1 = answerAstrologyQuestion('我的优势是什么', accurateFacts, accurateModules);
    const a2 = answerAstrologyQuestion('我的优势是什么', accurateFacts, accurateModules);
    expect(a1.text).toBe(a2.text);
    expect(a1.citations).toEqual(a2.citations);
  });
});

describe('降级路径不泄露隐藏事实（09 联动）', () => {
  it('无宫位档：所有回答的引用不含上升/天顶/宫位', () => {
    const samples = [
      '我在亲密关系里最需要被理解的是什么？',
      '本周工作中适合主动争取什么？',
      '这个相位如何影响我的表达？',
      '我的性格底色是什么样的？',
      '我的优势与盲点是什么？',
    ];
    for (const q of samples) {
      const a = answerAstrologyQuestion(q, unknownFacts, unknownModules);
      for (const c of a.citations) {
        expect(c.label, `${q} 引用泄露：${c.label}`).not.toMatch(/上升|天顶|第 \d+ 宫/);
      }
      // 回答正文不得出现隐藏事实的具体值（允许「宫位已隐藏」类政策说明词）
      expect(a.text, q).not.toMatch(/上升[白羊金双巨蟹狮处秤蝎射摩水双鱼]{2}座/);
    }
  });
});

/* ---------- 12 工单：问答异步接缝 ---------- */

describe('requestAstrologyAnswer（异步问答接缝）', () => {
  it('延迟后返回，且与同步引擎的确定性回答完全一致', async () => {
    const question = '我的优势是什么';
    const startedAt = Date.now();
    const answer = await requestAstrologyAnswer(question, accurateFacts, accurateModules);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(350);
    expect(answer).toEqual(answerAstrologyQuestion(question, accurateFacts, accurateModules));
    // 同一问题连问两次：延迟不改变确定性
    const again = await requestAstrologyAnswer(question, accurateFacts, accurateModules);
    expect(again.text).toBe(answer.text);
    expect(again.citations).toEqual(answer.citations);
  });

  it('敏感主题经异步接缝仍走拦截态话术', async () => {
    const answer = await requestAstrologyAnswer('我该不该去看病？', accurateFacts, accurateModules);
    expect(answer.kind).toBe('blocked');
    expect(answer.text).toContain('不能据此作出医疗、财务或法律判断');
  });
});
