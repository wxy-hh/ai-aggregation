/**
 * agent-intent.test.ts —— L0 意图识别纯函数单测（ADR-0012 / 工单 04）
 *
 * 验收标准锁定：
 * 1. 字符下限：草稿长度 < 4 字符一律返回 null；
 * 2. 16 关键词精确命中：最新/新闻/实时/价格/多少钱/天气/汇率/股价/官网/票房/排名/帮我查/查一下/查下/搜索/搜一下；
 * 3. URL 强信号优先：命中 URL 返回 { signal: 'url' }，且绝不带 keyword；
 * 4. URL 与关键词同时存在时，URL 优先级高于关键词；
 * 5. 已知误报用例断言（记录在测试中与模块注释中，确保取舍明确）。
 */

import { describe, it, expect } from 'vitest';
import {
  detectAgentIntent,
  AGENT_INTENT_KEYWORDS,
} from './agent-intent';

describe('detectAgentIntent - 字符下限与空值校验', () => {
  it('空字符串或全空格返回 null', () => {
    expect(detectAgentIntent('')).toBeNull();
    expect(detectAgentIntent('   ')).toBeNull();
  });

  it('草稿字符数 < 4 字符直接返回 null，即使包含关键词', () => {
    expect(detectAgentIntent('最新')).toBeNull(); // 2 字符
    expect(detectAgentIntent('天气')).toBeNull(); // 2 字符
    expect(detectAgentIntent('帮我查')).toBeNull(); // 3 字符
    expect(detectAgentIntent('  官网 ')).toBeNull(); // trim 后 2 字符
  });

  it('草稿字符数 >= 4 字符时方可触发检测', () => {
    expect(detectAgentIntent('帮我查下')).toEqual({
      signal: 'keyword',
      keyword: expect.stringMatching(/帮我查|查下/),
    });
    expect(detectAgentIntent('今天天气如何')).toEqual({
      signal: 'keyword',
      keyword: '天气',
    });
  });
});

describe('detectAgentIntent - 16 关键词完整覆盖', () => {
  it('16 关键词词表完整登记且正好 16 个', () => {
    const expected = [
      '最新', '新闻', '实时', '价格', '多少钱', '天气',
      '汇率', '股价', '官网', '票房', '排名', '帮我查',
      '查一下', '查下', '搜索', '搜一下',
    ];
    expect(AGENT_INTENT_KEYWORDS).toEqual(expected);
    expect(AGENT_INTENT_KEYWORDS).toHaveLength(16);
  });

  it.each(AGENT_INTENT_KEYWORDS)('包含关键词「%s」时能正确定位', (keyword) => {
    const draft = `请帮我了解一下${keyword}的情况`;
    const result = detectAgentIntent(draft);
    expect(result).not.toBeNull();
    expect(result?.signal).toBe('keyword');
    expect(result?.keyword).toBe(keyword);
  });

  it('无命中任何关键词且无 URL 时返回 null', () => {
    expect(detectAgentIntent('写一篇关于人工智能的哲学思考论文')).toBeNull();
    expect(detectAgentIntent('Hello world, please help me with React code')).toBeNull();
  });

  it('多个关键词命中时，返回在文本中最先出现的关键词', () => {
    const result = detectAgentIntent('请帮我查一下最新的电影票房排名');
    expect(result?.signal).toBe('keyword');
    // 最先出现的是「帮我查」或「查一下」
    expect(result?.keyword).toBe('帮我查');
  });
});

describe('detectAgentIntent - URL 检测与信号优先级', () => {
  it('匹配标准 http/https 链接，返回 signal: url 且无 keyword', () => {
    const result = detectAgentIntent('参考这个链接 https://github.com/trending 看看');
    expect(result).toEqual({ signal: 'url' });
    expect(result?.keyword).toBeUndefined();
  });

  it('匹配 http 链接', () => {
    const result = detectAgentIntent('http://example.com/test');
    expect(result).toEqual({ signal: 'url' });
  });

  it('匹配 www 开头的链接', () => {
    const result = detectAgentIntent('访问 www.google.com 获取资料');
    expect(result).toEqual({ signal: 'url' });
  });

  it('URL 与关键词共存时，URL 具有最高优先级（强信号）', () => {
    const result = detectAgentIntent('帮我查一下这个最新网站 https://openai.com');
    expect(result).toEqual({ signal: 'url' });
    expect(result?.keyword).toBeUndefined();
  });
});

describe('detectAgentIntent - 已知误报与边缘用例取舍断言', () => {
  it('误报案例 1（创作类混合意图）：预期命中，属于合理的用户能力发现', () => {
    // 包含「搜一下」，虽后半句为写作文，但前期资料搜集属于正向联网需求
    const result = detectAgentIntent('帮我搜一下资料写作文');
    expect(result).toEqual({
      signal: 'keyword',
      keyword: expect.stringMatching(/搜一下|搜索/),
    });
  });

  it('误报案例 2（代码实现请求）：预期命中，L0 宁宽勿漏已知取舍', () => {
    // 包含「价格」，虽然是写函数，但 L0 不做语义语法分析，接受此误报
    const result = detectAgentIntent('用代码实现一个价格计算函数');
    expect(result).toEqual({
      signal: 'keyword',
      keyword: '价格',
    });
  });

  it('误报案例 3（问答定义）：非 URL 的单纯 https 协议词汇不命中 URL', () => {
    // 单纯提到 https 并非链接
    const result = detectAgentIntent('请解释 https 和 http 的主要区别');
    expect(result).toBeNull();
  });
});
