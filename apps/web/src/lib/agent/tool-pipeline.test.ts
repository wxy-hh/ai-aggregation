/**
 * 工具执行管道测试（主接缝：ToolExecutionPipeline 窄接口）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 接缝策略（spec §Testing / ADR-0008）：
 * - 只测外部行为：假工具规格（execute 为 spy）经真实 createToolRegistry 注册、
 *   假合规检查器、注入时钟——零框架级 mock（不 mock `ai` / 不搭 handler 脚手架）。
 * - 行为基线：与重构前 agent-runner 内联治理逐字等价；9 条已知不对称见 ADR-0008。
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createToolRegistry, type AgentToolSpec, type ToolExecutionContext } from './registry';
import {
  createToolExecutionPipeline,
  type ToolExecutionLimits,
  type ToolExecutionPipeline,
} from './tool-pipeline';

/** 默认限值：与生产 agent-config 一致（10 / 3 / 3 / 3） */
const DEFAULT_LIMITS: ToolExecutionLimits = {
  maxTotalCalls: 10,
  maxCallsPerRound: 3,
  maxImageGenerates: 3,
  maxConsecutiveFailures: 3,
};

const DEFAULT_CTX: ToolExecutionContext = {
  userId: 'u1',
  signal: new AbortController().signal,
  errorId: 'e1',
};

interface PipelineHarness {
  pipeline: ToolExecutionPipeline;
  /** 合规检查器的调用记录（默认原样透传并记录） */
  guardCalls: Array<{ content: string; toolName: string }>;
}

/** 构造管道：默认宽容时间预算（1e6 ms）+ 固定时钟（恒 0），各测试按需覆盖 */
function makePipeline(overrides: {
  registry?: ReturnType<typeof createToolRegistry>;
  limits?: Partial<ToolExecutionLimits>;
  ctx?: ToolExecutionContext;
  startedAt?: number;
  runTimeBudgetMs?: number;
  now?: () => number;
  guardContent?: (content: string, toolName: string) => string;
} = {}): PipelineHarness {
  const guardCalls: PipelineHarness['guardCalls'] = [];
  // 自定义 guard 也包一层记录，便于断言「过检是否发生、入参是什么」
  const userGuard = overrides.guardContent ?? ((content: string) => content);
  const guardContent = (content: string, toolName: string) => {
    guardCalls.push({ content, toolName });
    return userGuard(content, toolName);
  };
  const pipeline = createToolExecutionPipeline({
    registry: overrides.registry ?? createToolRegistry([]),
    ctx: overrides.ctx ?? DEFAULT_CTX,
    limits: { ...DEFAULT_LIMITS, ...overrides.limits },
    startedAt: overrides.startedAt ?? 0,
    runTimeBudgetMs: overrides.runTimeBudgetMs ?? 1_000_000,
    now: overrides.now ?? (() => 0),
    guardContent,
  });
  return { pipeline, guardCalls };
}

/** 构造假工具规格；parameters 默认宽松对象 schema */
function makeSpec(
  name: string,
  execute: AgentToolSpec['execute'],
  parameters: z.ZodType = z.object({})
): AgentToolSpec {
  return {
    name,
    description: `测试假工具 ${name}`,
    parameters,
    execute,
  };
}

/** 成功执行的最小返回 */
function okResult(overrides: Partial<{ contentForModel: string; summaryForDisplay: string }> = {}) {
  return {
    ok: true,
    contentForModel: overrides.contentForModel ?? '工具结果内容',
    summaryForDisplay: overrides.summaryForDisplay ?? '完成',
  };
}

describe('基础执行路径', () => {
  it('成功执行：过检后内容回注、summary 与附件原样透传', async () => {
    const attachment = { kind: 'image' as const, url: 'https://cdn.example.com/a.png' };
    const execute = vi.fn(async () => ({
      ok: true,
      contentForModel: '原始内容',
      summaryForDisplay: '完成',
      attachment,
    }));
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline, guardCalls } = makePipeline({
      registry,
      guardContent: (content, toolName) => `[过检:${toolName}]${content}`,
    });

    const outcome = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 'https://example.com' },
    });

    // 最小四字段的精确形状：内容为过检后、附件透传、无多余字段
    expect(outcome).toEqual({
      ok: true,
      contentForModel: '[过检:web_fetch]原始内容',
      summaryForDisplay: '完成',
      attachment,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(guardCalls).toEqual([{ content: '原始内容', toolName: 'web_fetch' }]);
  });

  it('工具不存在：可读文案回注（仍过合规），execute 无可调用对象', async () => {
    const { pipeline, guardCalls } = makePipeline();

    const outcome = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'ghost_tool',
      input: {},
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.contentForModel).toBe('工具「ghost_tool」不存在，请使用已提供的工具。');
    expect(outcome.summaryForDisplay).toBe('工具不存在');
    // 已知不对称 #2：无效调用同样过合规（检查器被调用）
    expect(guardCalls).toEqual([
      { content: '工具「ghost_tool」不存在，请使用已提供的工具。', toolName: 'ghost_tool' },
    ]);
  });

  it('参数校验失败：给出可修正原因，execute 不被调用', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([
      makeSpec('web_fetch', execute, z.object({ url: z.string() })),
    ]);
    const { pipeline } = makePipeline({ registry });

    const outcome = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 12345 },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.contentForModel).toMatch(/^工具参数不合法：.+。请修正参数后重试。$/);
    expect(outcome.summaryForDisplay).toMatch(/^参数不合法：.+/);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('去重缓存（退化保护 1）', () => {
  const DEDUP_HINT = '该调用已执行过，结果同前，请基于现有信息作答或调整参数。';

  it('重复调用：不重执行、附软提示、不重发 attachment、不重复过检', async () => {
    const attachment = { kind: 'image' as const, url: 'https://cdn.example.com/a.png' };
    const execute = vi.fn(async () => ({
      ok: true,
      contentForModel: '原始内容',
      summaryForDisplay: '完成',
      attachment,
    }));
    const registry = createToolRegistry([makeSpec('image_generate', execute)]);
    const { pipeline, guardCalls } = makePipeline({ registry });

    const first = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'image_generate',
      input: { prompt: '猫' },
    });
    const second = await pipeline.executeCall({
      toolCallId: 'c2',
      toolName: 'image_generate',
      input: { prompt: '猫' },
    });

    // 首次真实执行且带附件
    expect(first).toEqual({
      ok: true,
      contentForModel: '原始内容',
      summaryForDisplay: '完成',
      attachment,
    });
    // 重复调用：吃缓存（不重执行）、内容追加软提示、不重发 attachment
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      ok: true,
      contentForModel: `原始内容\n\n${DEDUP_HINT}`,
      summaryForDisplay: '完成',
    });
    // 已知不对称 #5：合规检查只在首次执行跑一次（不重复过检）
    expect(guardCalls).toHaveLength(1);
  });

  it('缓存键为参数稳定序列化：键序不同的同参对象命中同一缓存', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry });

    await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 'https://example.com', method: 'GET' },
    });
    const second = await pipeline.executeCall({
      toolCallId: 'c2',
      toolName: 'web_fetch',
      input: { method: 'GET', url: 'https://example.com' },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.contentForModel).toBe(`工具结果内容\n\n${DEDUP_HINT}`);
  });

  it('失败结果同样进缓存：重复的失败调用不重执行、附软提示', async () => {
    const execute = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline, guardCalls } = makePipeline({ registry });

    const first = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 'https://down.example.com' },
    });
    const second = await pipeline.executeCall({
      toolCallId: 'c2',
      toolName: 'web_fetch',
      input: { url: 'https://down.example.com' },
    });

    expect(first.ok).toBe(false);
    expect(first.summaryForDisplay).toBe('执行失败：目标服务器拒绝连接');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.ok).toBe(false);
    expect(second.summaryForDisplay).toBe('执行失败：目标服务器拒绝连接');
    expect(second.contentForModel).toBe(`${first.contentForModel}\n\n${DEDUP_HINT}`);
    expect(guardCalls).toHaveLength(1);
  });

  it('工具不存在的结果也进缓存（已知不对称 #2）：重复无效调用不再重新判定', async () => {
    const { pipeline, guardCalls } = makePipeline();

    const first = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'ghost_tool',
      input: { x: 1 },
    });
    const second = await pipeline.executeCall({
      toolCallId: 'c2',
      toolName: 'ghost_tool',
      input: { x: 1 },
    });

    expect(first.contentForModel).toBe('工具「ghost_tool」不存在，请使用已提供的工具。');
    expect(second.contentForModel).toBe(
      `工具「ghost_tool」不存在，请使用已提供的工具。\n\n${DEDUP_HINT}`
    );
    expect(second.ok).toBe(false);
    expect(second.summaryForDisplay).toBe('工具不存在');
    expect(guardCalls).toHaveLength(1);
  });
});

describe('三重上限（计数拦截）', () => {
  it('单轮上限：第 4 个起跳过（未执行文案），skip 不过合规、不进缓存', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline, guardCalls } = makePipeline({ registry });

    const skippedMessage =
      '工具「web_fetch」未执行：本轮工具调用数量超过上限（3 次）。请在回答中如实告知用户这次调用未执行。';
    const skippedSummary = '未执行：本轮工具调用数量超过上限（3 次）';

    // 前 3 个各自执行；第 4、5 个用相同参数（证明 skip 不写缓存：若写，第 5 个会带软提示）
    for (let i = 1; i <= 3; i++) {
      const outcome = await pipeline.executeCall({ toolCallId: `c${i}`, toolName: 'web_fetch', input: { i } });
      expect(outcome.ok).toBe(true);
    }
    const fourth = await pipeline.executeCall({ toolCallId: 'c4', toolName: 'web_fetch', input: { i: 4 } });
    const fifth = await pipeline.executeCall({ toolCallId: 'c5', toolName: 'web_fetch', input: { i: 4 } });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(fourth).toEqual({ ok: false, contentForModel: skippedMessage, summaryForDisplay: skippedSummary });
    // 第 5 个是独立 skip（未执行文案原样），而非第 4 个的缓存命中（无软提示）
    expect(fifth.contentForModel).toBe(skippedMessage);
    // skip 路径不过合规：只有 3 次首次执行过检
    expect(guardCalls).toHaveLength(3);
  });

  it('beginRound 重置轮内计数：上一轮用满不影响下一轮', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry });

    for (let i = 1; i <= 3; i++) {
      await pipeline.executeCall({ toolCallId: `r1c${i}`, toolName: 'web_fetch', input: { round: 1, i } });
    }
    pipeline.beginRound();
    const nextRound = await pipeline.executeCall({
      toolCallId: 'r2c1',
      toolName: 'web_fetch',
      input: { round: 2, i: 1 },
    });

    expect(nextRound.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('全局上限：超限调用跳过（文案带配置值）；被跳过与被去重的调用同样计数', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry, limits: { maxTotalCalls: 2 } });

    await pipeline.executeCall({ toolCallId: 'c1', toolName: 'web_fetch', input: { i: 1 } });
    await pipeline.executeCall({ toolCallId: 'c2', toolName: 'web_fetch', input: { i: 2 } });
    const third = await pipeline.executeCall({ toolCallId: 'c3', toolName: 'web_fetch', input: { i: 3 } });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(third).toEqual({
      ok: false,
      contentForModel:
        '工具「web_fetch」未执行：本次请求累计工具调用数量已达上限（2 次）。请在回答中如实告知用户这次调用未执行。',
      summaryForDisplay: '未执行：本次请求累计工具调用数量已达上限（2 次）',
    });
  });

  it('出图专项上限：第 4 次起专属文案（带配置值）；非出图调用不消耗出图额度', async () => {
    const imageExecute = vi.fn(async () => okResult({ summaryForDisplay: '已生成' }));
    const fetchExecute = vi.fn(async () => okResult());
    const registry = createToolRegistry([
      makeSpec('image_generate', imageExecute),
      makeSpec('web_fetch', fetchExecute),
    ]);
    const { pipeline } = makePipeline({ registry });

    for (let i = 1; i <= 3; i++) {
      const o = await pipeline.executeCall({ toolCallId: `img${i}`, toolName: 'image_generate', input: { prompt: `猫${i}` } });
      expect(o.ok).toBe(true);
    }
    // 换轮（绕开单轮上限，否则第 4 个会先被「本轮上限」拦截而非出图专项上限）
    pipeline.beginRound();
    // 夹一次非出图调用：不消耗出图额度
    await pipeline.executeCall({ toolCallId: 'f1', toolName: 'web_fetch', input: { url: 'https://example.com' } });
    const fourth = await pipeline.executeCall({ toolCallId: 'img4', toolName: 'image_generate', input: { prompt: '猫4' } });

    expect(imageExecute).toHaveBeenCalledTimes(3);
    expect(fourth).toEqual({
      ok: false,
      contentForModel: '本次对话的出图次数已用完（3 次），请基于已有内容作答',
      summaryForDisplay: '未执行：本次对话的出图次数已用完（3 次）',
    });
  });

  it('出图计数仅在前四类检查全过后才自增：被时间预算跳过的出图不消耗额度', async () => {
    const imageExecute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('image_generate', imageExecute)]);
    let clock = 0;
    const { pipeline } = makePipeline({
      registry,
      limits: { maxImageGenerates: 1 },
      startedAt: 0,
      runTimeBudgetMs: 100,
      now: () => clock,
    });

    // 第 1 轮：时间预算耗尽 → 以「执行时间超出预算」跳过（不是出图上限）——不应消耗出图额度
    clock = 200;
    const skipped = await pipeline.executeCall({ toolCallId: 'a', toolName: 'image_generate', input: { prompt: '猫A' } });
    expect(skipped.summaryForDisplay).toBe('未执行：执行时间超出预算');

    // 预算恢复（模拟仅作时钟控制的单测手段）后再来一次：出图额度完好，可真实执行
    clock = 0;
    pipeline.beginRound();
    const second = await pipeline.executeCall({ toolCallId: 'b', toolName: 'image_generate', input: { prompt: '猫B' } });

    expect(imageExecute).toHaveBeenCalledTimes(1);
    expect(second.ok).toBe(true);
  });
});

describe('判定顺序（互斥链）与连败熔断', () => {
  it('中断优先于全局上限：abort 时即使已超全局上限也报「已取消」', async () => {
    const ac = new AbortController();
    ac.abort();
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({
      registry,
      ctx: { ...DEFAULT_CTX, signal: ac.signal },
      limits: { maxTotalCalls: 0 },
    });

    const outcome = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 'https://example.com' },
    });

    expect(outcome.contentForModel).toBe(
      '工具「web_fetch」未执行：已取消。请在回答中如实告知用户这次调用未执行。'
    );
    expect(outcome.summaryForDisplay).toBe('未执行：已取消');
    expect(execute).not.toHaveBeenCalled();
  });

  it('中断不并入 shouldHalt：abort 后仅 skip 文案变化，停止判定仍只由治理三条件驱动', async () => {
    const ac = new AbortController();
    ac.abort();
    const registry = createToolRegistry([makeSpec('web_fetch', vi.fn(async () => okResult()))]);
    const { pipeline } = makePipeline({ registry, ctx: { ...DEFAULT_CTX, signal: ac.signal } });

    const outcome = await pipeline.executeCall({
      toolCallId: 'c1',
      toolName: 'web_fetch',
      input: { url: 'https://example.com' },
    });

    expect(outcome.ok).toBe(false);
    // 1 次 skip 计入连败 = 1 < 3；中断本身不由 shouldHalt 表达（编排器循环顶单独检查）
    expect(pipeline.shouldHalt()).toBe(false);
  });

  it('全局优先于单轮：两者同时命中时报全局上限', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({
      registry,
      limits: { maxTotalCalls: 1, maxCallsPerRound: 0 },
    });

    const first = await pipeline.executeCall({ toolCallId: 'c1', toolName: 'web_fetch', input: { i: 1 } });
    const second = await pipeline.executeCall({ toolCallId: 'c2', toolName: 'web_fetch', input: { i: 2 } });

    // 第 1 个：全局未超（1 > 1 为假）、单轮已超（1 > 0）→ 单轮文案
    expect(first.summaryForDisplay).toBe('未执行：本轮工具调用数量超过上限（0 次）');
    // 第 2 个：全局已超（2 > 1）→ 全局文案（即使单轮同样超限）
    expect(second.summaryForDisplay).toBe('未执行：本次请求累计工具调用数量已达上限（1 次）');
  });

  it('单轮优先于时间预算：两者同时命中时报本轮上限', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({
      registry,
      limits: { maxCallsPerRound: 0 },
      startedAt: 0,
      runTimeBudgetMs: 1,
      now: () => 1000, // 时间预算早已耗尽
    });

    const outcome = await pipeline.executeCall({ toolCallId: 'c1', toolName: 'web_fetch', input: { i: 1 } });

    expect(outcome.summaryForDisplay).toBe('未执行：本轮工具调用数量超过上限（0 次）');
  });

  it('连续 3 次失败 → shouldHalt 为真；任一成功即清零', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(okResult())
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry, limits: { maxConsecutiveFailures: 3 } });

    const call = (i: number) =>
      pipeline.executeCall({ toolCallId: `c${i}`, toolName: 'web_fetch', input: { i } });

    expect(pipeline.shouldHalt()).toBe(false);
    await call(1); // 1 连败
    await call(2); // 2 连败
    expect(pipeline.shouldHalt()).toBe(false);
    await call(3); // 成功 → 清零
    await call(4); // 1 连败
    await call(5); // 2 连败
    expect(pipeline.shouldHalt()).toBe(false);
    await call(6); // 3 连败 → 熔断
    expect(pipeline.shouldHalt()).toBe(true);
  });

  it('skip 同样计入连败（已知不对称 #1）：连续 3 次被跳过的调用触发熔断', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry, limits: { maxCallsPerRound: 0 } });

    for (let i = 1; i <= 3; i++) {
      await pipeline.executeCall({ toolCallId: `c${i}`, toolName: 'web_fetch', input: { i } });
    }

    expect(execute).not.toHaveBeenCalled();
    expect(pipeline.shouldHalt()).toBe(true);
  });

  it('全局上限的 shouldHalt 用 >=（第 2 个执行完即停），单次 skip 用 >（第 3 个才跳）', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    const { pipeline } = makePipeline({ registry, limits: { maxTotalCalls: 2 } });

    expect(pipeline.shouldHalt()).toBe(false);
    await pipeline.executeCall({ toolCallId: 'c1', toolName: 'web_fetch', input: { i: 1 } });
    expect(pipeline.shouldHalt()).toBe(false);
    await pipeline.executeCall({ toolCallId: 'c2', toolName: 'web_fetch', input: { i: 2 } });
    expect(pipeline.shouldHalt()).toBe(true); // 2 >= 2：第 2 个执行完即停循环

    const third = await pipeline.executeCall({ toolCallId: 'c3', toolName: 'web_fetch', input: { i: 3 } });
    expect(third.summaryForDisplay).toBe('未执行：本次请求累计工具调用数量已达上限（2 次）'); // 3 > 2：第 3 个才 skip
  });

  it('时间预算边界：严格大于才耗尽（等于不算）', async () => {
    const execute = vi.fn(async () => okResult());
    const registry = createToolRegistry([makeSpec('web_fetch', execute)]);
    let clock = 1000;
    const { pipeline } = makePipeline({
      registry,
      startedAt: 1000,
      runTimeBudgetMs: 100,
      now: () => clock,
    });

    // 恰好等于预算：未耗尽，可执行、不熔断
    clock = 1100;
    const onBoundary = await pipeline.executeCall({ toolCallId: 'c1', toolName: 'web_fetch', input: { i: 1 } });
    expect(onBoundary.ok).toBe(true);
    expect(pipeline.shouldHalt()).toBe(false);

    // 超出 1ms：耗尽，skip + shouldHalt
    clock = 1101;
    const exhausted = await pipeline.executeCall({ toolCallId: 'c2', toolName: 'web_fetch', input: { i: 2 } });
    expect(exhausted.summaryForDisplay).toBe('未执行：执行时间超出预算');
    expect(pipeline.shouldHalt()).toBe(true);
  });
});
