/**
 * tool-policy 表驱动测试（spec §7 + §9「截断边界」）
 *
 * 接缝：tool-policy 的纯函数（截断 / 参数摘要 / 错误归一化）与策略包装。
 * 先例：同目录 url-guard.test.ts 的表驱动风格。
 *
 * 重点覆盖 spec §9 明文要求的**截断边界**——`truncate` 用的是
 * `text.length <= maxChars` 放行，边界落在「等于」与「等于 +1」之间，
 * 差一个字符就会把用户可见的结果悄悄砍掉或多留一段。
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_TOOL_POLICY,
  normalizeToolError,
  runToolWithPolicy,
  summarizeArgs,
  truncate,
} from './tool-policy';
import { ToolError, type AgentToolSpec } from './tools/registry';

describe('truncate — 截断边界', () => {
  it.each([
    { name: '短于上限', input: 'abc', max: 5, expected: 'abc' },
    // 边界：等于上限必须原样放行（<= 而非 <）
    { name: '恰好等于上限', input: 'abcde', max: 5, expected: 'abcde' },
    { name: '超出上限一个字符', input: 'abcdef', max: 5, expected: 'abcde…（已截断）' },
    { name: '远超上限', input: 'a'.repeat(20), max: 5, expected: 'aaaaa…（已截断）' },
    { name: '空串', input: '', max: 5, expected: '' },
    { name: '上限为 0', input: 'abc', max: 0, expected: '…（已截断）' },
    // 按 UTF-16 长度计，中文一字算 1（emoji 算 2，属于已知取舍）
    { name: '中文恰好等于上限', input: '中文五个字', max: 5, expected: '中文五个字' },
    { name: '中文超出上限', input: '中文六个字了', max: 5, expected: '中文六个字…（已截断）' },
  ])('$name：truncate(…, $max)', ({ input, max, expected }) => {
    expect(truncate(input, max)).toBe(expected);
  });

  it('截断标记不参与上限计算（超出后总长 = max + 标记长度）', () => {
    const out = truncate('a'.repeat(10), 4);
    expect(out.startsWith('aaaa')).toBe(true);
    expect(out.length).toBeGreaterThan(4);
  });
});

describe('summarizeArgs — 参数摘要（tool_call 事件下发用）', () => {
  it('无参数 → 占位文案', () => {
    expect(summarizeArgs(undefined)).toBe('（无参数）');
    expect(summarizeArgs(null)).toBe('（无参数）');
  });

  it('字符串参数原样透传', () => {
    expect(summarizeArgs('https://example.com')).toBe('https://example.com');
  });

  it('对象参数序列化为 JSON', () => {
    expect(summarizeArgs({ url: 'https://example.com' })).toBe('{"url":"https://example.com"}');
  });

  it('不可序列化的对象不抛异常，降级为 String()', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => summarizeArgs(circular)).not.toThrow();
    expect(summarizeArgs(circular)).toBe('[object Object]');
  });

  it('超长参数按 maxArgsSummaryChars 截断', () => {
    const long = { url: `https://example.com/${'a'.repeat(500)}` };
    const out = summarizeArgs(long);
    // 上限 200 + '…（已截断）' 标记
    expect(out).toContain('已截断');
    expect(out.length).toBeLessThanOrEqual(DEFAULT_TOOL_POLICY.maxArgsSummaryChars + 10);
  });

  it('自定义上限生效（边界：等于上限不截断）', () => {
    expect(summarizeArgs({ a: 1 }, 7)).toBe('{"a":1}'); // 恰好 7 字符
    expect(summarizeArgs({ a: 1 }, 6)).toBe('{"a":1…（已截断）');
  });
});

describe('normalizeToolError — 异常归一化为用户可读中文', () => {
  it('ToolError 的文案原样透传（工具自己写好的用户可读文案）', () => {
    expect(normalizeToolError(new ToolError('该地址不允许访问'))).toBe('该地址不允许访问');
  });

  it.each([
    { name: '中止', error: new Error('The operation was aborted'), expected: '已取消' },
    { name: '超时', error: new Error('connect ETIMEDOUT'), expected: '连接超时，请稍后重试' },
    { name: 'DNS', error: new Error('getaddrinfo ENOTFOUND bad.host'), expected: '域名无法解析，请检查网址是否正确' },
    { name: '拒绝连接', error: new Error('connect ECONNREFUSED 127.0.0.1:80'), expected: '目标服务器拒绝连接' },
    { name: '连接重置', error: new Error('socket hang up'), expected: '连接被中断，请稍后重试' },
    { name: '证书', error: new Error('unable to verify the first certificate'), expected: '目标网站证书校验失败，无法访问' },
    { name: '网络不可达', error: new Error('ENETUNREACH'), expected: '目标网络不可达' },
  ])('$name → 中文文案', ({ error, expected }) => {
    expect(normalizeToolError(error)).toBe(expected);
  });

  it('未知错误不透原始文案（可能是内部配置细节），统一为通用话术', () => {
    // B-6：如「AGNES_API_KEY is not configured」这类内部细节不得透给用户
    expect(normalizeToolError('boom')).toBe('工具暂时不可用，请稍后重试');
    expect(normalizeToolError(new Error('AGNES_API_KEY is not configured'))).toBe(
      '工具暂时不可用，请稍后重试'
    );
    expect(normalizeToolError(new Error('x'.repeat(500)))).toBe('工具暂时不可用，请稍后重试');
  });
});

describe('runToolWithPolicy — 结果按策略截断 + 超时/异常都收敛为可结算结果', () => {
  function makeSpec(execute: AgentToolSpec['execute']): AgentToolSpec {
    return {
      name: 'web_fetch',
      description: '测试替身',
      parameters: z.object({ url: z.string() }),
      execute,
    };
  }

  const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'e1' };

  it('成功结果按 maxContentChars / maxSummaryChars 各自截断', async () => {
    const spec = makeSpec(async () => ({
      ok: true,
      contentForModel: 'content-'.repeat(2000), // 远超 8000
      summaryForDisplay: 's'.repeat(1000), // 远超 240
    }));

    const result = await runToolWithPolicy(spec, { url: 'https://example.com' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('已截断');
    expect(result.summaryForDisplay).toContain('已截断');
    expect(result.contentForModel.length).toBeLessThanOrEqual(
      DEFAULT_TOOL_POLICY.maxContentChars + 10
    );
    expect(result.summaryForDisplay.length).toBeLessThanOrEqual(
      DEFAULT_TOOL_POLICY.maxSummaryChars + 10
    );
  });

  it('恰好等于上限时不截断', async () => {
    const content = 'c'.repeat(DEFAULT_TOOL_POLICY.maxContentChars);
    const spec = makeSpec(async () => ({
      ok: true,
      contentForModel: content,
      summaryForDisplay: 'ok',
    }));

    const result = await runToolWithPolicy(spec, { url: 'https://example.com' }, ctx);
    expect(result.contentForModel).toBe(content);
  });

  it('工具抛异常 → 收敛为 ok:false 且要求模型如实转述失败（不抛给编排层）', async () => {
    const spec = makeSpec(async () => {
      throw new ToolError('该地址不允许访问');
    });

    const result = await runToolWithPolicy(spec, { url: 'http://127.0.0.1' }, ctx);

    expect(result.ok).toBe(false);
    expect(result.summaryForDisplay).toBe('执行失败：该地址不允许访问');
    // 失败指令必须带上，否则模型会用自身知识替答（T07 F4 实测）
    expect(result.contentForModel).toContain('如实告知用户');
  });

  it('工具超时 → 报「用时过长」（不带内部工具名），并真正中止工具 I/O', async () => {
    vi.useFakeTimers();
    try {
      let observed: AbortSignal | undefined;
      const spec = makeSpec((_args, toolCtx) => {
        observed = toolCtx.signal; // 永不返回，等超时
        return new Promise(() => {});
      });
      const promise = runToolWithPolicy(spec, { url: 'https://slow.example.com' }, ctx, {
        ...DEFAULT_TOOL_POLICY,
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1001);
      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.summaryForDisplay).toBe('执行失败：用时过长，请重试');
      // 不再向用户透出内部工具名
      expect(result.summaryForDisplay).not.toContain('web_fetch');
      // 超时必须真正中止工具拿到的信号：Promise.race 本身不会取消输的一方，
      // 只靠它会让上游请求在后台跑完（成本已产生、结果被丢弃）
      expect(observed?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('声明了 timeoutMs 的工具用自身预算，而不是策略的通用值', async () => {
    // 真实场景：出图工具声明 40s，而策略默认 15s
    const spec: AgentToolSpec = {
      ...makeSpec(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ok: true, contentForModel: 'ok', summaryForDisplay: 'ok' };
      }),
      timeoutMs: 3000,
    };

    const result = await runToolWithPolicy(spec, { url: 'https://example.com' }, ctx, {
      ...DEFAULT_TOOL_POLICY,
      timeoutMs: 100, // 通用值远小于工具耗时，若被采用必然超时
    });

    expect(result.ok).toBe(true);
  });

  it('未声明 timeoutMs 的工具回落到策略通用值', async () => {
    const spec = makeSpec(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { ok: true, contentForModel: 'ok', summaryForDisplay: 'ok' };
    });

    const result = await runToolWithPolicy(spec, { url: 'https://example.com' }, ctx, {
      ...DEFAULT_TOOL_POLICY,
      timeoutMs: 100,
    });

    expect(result.ok).toBe(false);
    expect(result.summaryForDisplay).toBe('执行失败：用时过长，请重试');
  });

  it('用户取消 ≠ 超时：父信号中断时报「已取消」，不得报成超时', async () => {
    const ac = new AbortController();
    // 工具挂起，派生信号一 abort 就结束（复刻真实的 I/O 行为）
    const spec = makeSpec(
      (_args, toolCtx) =>
        new Promise((_resolve, reject) => {
          toolCtx.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        })
    );

    const pending = runToolWithPolicy(
      spec,
      { url: 'https://example.com' },
      { userId: 'u1', signal: ac.signal, errorId: 'e1' },
      // 超时故意设得比取消晚，确保走到的是「取消」而不是「超时」
      { ...DEFAULT_TOOL_POLICY, timeoutMs: 5000 }
    );
    ac.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.summaryForDisplay).toBe('执行失败：已取消');
  });

  it('附件原样透传，成功时保留', async () => {
    const attachment = { kind: 'image' as const, url: 'https://cdn.example.com/a.png' };
    const spec = makeSpec(async () => ({
      ok: true,
      contentForModel: 'done',
      summaryForDisplay: 'done',
      attachment,
    }));

    const result = await runToolWithPolicy(spec, { url: 'https://example.com' }, ctx);
    expect(result.attachment).toEqual(attachment);
  });
});
