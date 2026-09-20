/**
 * astrology-qa.test.tsx —— 星语问答面板（04 工单：接缝从 mock 规则引擎切到真实问答路由）
 *
 * 锁定的外部行为（面板/抽屉结构不动，只有回答来源换实现）：
 * - 发送后用户气泡立即入列、等待气泡锁住输入；回答到达即替换等待气泡并渲染引用片；
 * - 流式正文增量在等待气泡内逐字浮现（「正在思考…」随之让位）；
 * - 失败给中文提示并解开输入锁（额度不足沿用服务端提示）；
 * - 次数不设每报告上限：徽章只反映可用额度（够则报次数、不受限说不限次数、不够说额度不足），
 *   输入区永远可用——额度不够时由服务端 402 + 全局额度弹框提示，面板不私自拦人。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/astrology/qa-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/astrology/qa-request')>();
  return { ...actual, requestAstrologyAnswer: vi.fn() };
});

// 可用额度来自 /api/profile/usage：本用例集只替换取数，折算口径走真实实现
vi.mock('@/lib/api/profile', () => ({ fetchProfileUsageSummary: vi.fn() }));

import type { ProfileUsageSummary } from '@repo/shared';
import { AstrologyQaEntry } from './astrology-qa';
import { AstrologyQaRequestError, requestAstrologyAnswer } from '@/lib/astrology/qa-request';
import { ASTROLOGY_QA_QUESTION_UNITS, type AstrologyQaAnswer } from '@/lib/astrology/qa-events';
import { computeChartFacts } from '@/lib/astrology/chart-engine';
import { SAMPLE_PROFILE_ACCURATE } from '@/lib/astrology/sample-chart';
import type { ModuleReading } from '@/lib/astrology/interpretation';
import { fetchProfileUsageSummary } from '@/lib/api/profile';

const requestAstrologyAnswerMock = vi.mocked(requestAstrologyAnswer);
const fetchProfileUsageSummaryMock = vi.mocked(fetchProfileUsageSummary);

/** 额度查询的最小返回（只用到 tokenRemaining；null = 管理员不受额度限制） */
function quotaSummary(tokenRemaining: number | null): ProfileUsageSummary {
  return { totalTokens: 0, totalAudioSeconds: 0, totalTaskCount: 0, features: [], tokenRemaining };
}
/** 额度充裕：徽章按额度折算报次数（100 次） */
const ABUNDANT_QUOTA = quotaSummary(ASTROLOGY_QA_QUESTION_UNITS * 100);

const FACTS = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
/** 生活模块夹具：真实报告里由模型产出，面板只把它们透传给问答接缝 */
const MODULES: ModuleReading[] = [
  { id: 'who', title: '我是谁', summary: '核心气质偏向先照顾气氛。', tags: ['太阳 天秤'], action: '先说自己的想法。', factReferences: ['planet:sun:sign'] },
  { id: 'love', title: '关系如何运作', summary: '在关系里需要被稳定回应。', tags: ['月亮 白羊'], action: '先说感受，再谈事情。', factReferences: ['planet:moon:sign'] },
];
const QUESTION = '我在亲密关系里最需要被理解的是什么？';
const ANSWER: AstrologyQaAnswer = {
  kind: 'answer',
  text: '你在关系里最需要的是被认真回应。\n可以练习：先说感受，再谈事情。',
  citations: [{ label: '关系如何运作', moduleId: 'love' }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

function renderEntry() {
  return render(
    <AstrologyQaEntry
      facts={FACTS}
      modules={MODULES}
      onLocateBody={vi.fn()}
      onLocateModule={vi.fn()}
    />
  );
}

/** 打开问答面板（桌面内联或移动端抽屉，两条路径都渲染同一份对话体） */
async function openConversation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '开始提问' }));
  return screen.getByLabelText('星语问答输入框');
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByLabelText('星语问答输入框');
  await user.type(input, text);
  await user.click(screen.getByRole('button', { name: '发送问题' }));
}

describe('AstrologyQaEntry（真实问答接缝）', () => {
  beforeEach(() => {
    requestAstrologyAnswerMock.mockReset();
    // 默认额度充裕：徽章按额度折算报次数，额度场景各自覆盖
    fetchProfileUsageSummaryMock.mockReset();
    fetchProfileUsageSummaryMock.mockResolvedValue(ABUNDANT_QUOTA);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('提问 → 等待气泡 → 回答与引用片替换等待气泡，请求携带报告上下文', async () => {
    const user = userEvent.setup();
    const pending = deferred<AstrologyQaAnswer>();
    requestAstrologyAnswerMock.mockImplementation(() => pending.promise);

    renderEntry();
    await openConversation(user);
    await ask(user, QUESTION);

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText('正在思考…')).toBeInTheDocument();
    expect(requestAstrologyAnswerMock.mock.calls[0][1]).toBe(FACTS);
    expect(requestAstrologyAnswerMock.mock.calls[0][0]).toBe(QUESTION);

    await act(async () => {
      pending.resolve(ANSWER);
    });

    expect(await screen.findByText('你在关系里最需要的是被认真回应。')).toBeInTheDocument();
    expect(screen.queryByText('正在思考…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关系如何运作' })).toBeInTheDocument();
    // 额度未变（100 次）：问过一轮后徽章报剩余额度次数，不设每报告上限
    expect(screen.getAllByText('还可问 100 次').length).toBeGreaterThan(0);
  });

  it('流式正文增量在等待气泡内逐字浮现（「正在思考…」让位）', async () => {
    const user = userEvent.setup();
    const pending = deferred<AstrologyQaAnswer>();
    let onDelta: ((text: string) => void) | undefined;
    requestAstrologyAnswerMock.mockImplementation((_q, _f, _m, options) => {
      onDelta = options.onDelta;
      return pending.promise;
    });

    renderEntry();
    await openConversation(user);
    await ask(user, QUESTION);

    act(() => onDelta?.('你先看关系里的节奏'));
    expect(screen.getByText('你先看关系里的节奏')).toBeInTheDocument();
    expect(screen.queryByText('正在思考…')).not.toBeInTheDocument();

    act(() => onDelta?.('，再决定要不要加速。'));
    expect(screen.getByText('你先看关系里的节奏，再决定要不要加速。')).toBeInTheDocument();

    await act(async () => {
      pending.resolve({ kind: 'answer', text: '你先看关系里的节奏，再决定要不要加速。', citations: [] });
    });
    expect(await screen.findByText('你先看关系里的节奏，再决定要不要加速。')).toBeInTheDocument();
  });

  it('失败：给中文提示并解开输入锁（额度不足沿用服务端提示）', async () => {
    const user = userEvent.setup();
    requestAstrologyAnswerMock.mockRejectedValue(
      new AstrologyQaRequestError('quota', '当前额度不足以处理本次对话')
    );

    renderEntry();
    await openConversation(user);
    await ask(user, QUESTION);

    expect(await screen.findByText('当前额度不足以处理本次对话')).toBeInTheDocument();
    expect(screen.queryByText('正在思考…')).not.toBeInTheDocument();
    // 失败后输入仍可用（不锁死在等待态）
    expect(screen.getByLabelText('星语问答输入框')).not.toBeDisabled();
  });

  it('不设每报告上限：连问多轮都照常派发请求，输入区一直在', async () => {
    const user = userEvent.setup();
    requestAstrologyAnswerMock.mockResolvedValue(ANSWER);

    renderEntry();
    await openConversation(user);
    const questions = ['第一个问题', '第二个问题', '第三个问题', '第四个问题'];
    for (const [index, question] of questions.entries()) {
      await ask(user, question);
      await vi.waitFor(() =>
        expect(screen.getAllByText('你在关系里最需要的是被认真回应。')).toHaveLength(index + 1)
      );
      expect(requestAstrologyAnswerMock).toHaveBeenCalledTimes(index + 1);
    }

    // 次数只由额度决定：没有「已完成 3 问」这类按报告封顶的拦截面
    expect(screen.queryByText(/已完成/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('星语问答输入框')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeInTheDocument();
  });

  it('剩余次数按可用额度折算：额度只够再问一次时按 1 次呈现', async () => {
    const user = userEvent.setup();
    fetchProfileUsageSummaryMock.mockResolvedValue(quotaSummary(ASTROLOGY_QA_QUESTION_UNITS));

    renderEntry();
    // 额度取到即按额度折算：还没提问就已经如实说明只够一次
    expect(await screen.findByText('还可问 1 次')).toBeInTheDocument();

    await openConversation(user);
    expect(screen.getAllByText('还可问 1 次').length).toBeGreaterThan(0);
    expect(screen.queryByText(/每份报告/)).not.toBeInTheDocument();
  });

  it('额度见底：徽章如实说「额度不足」，输入区照常可用（由服务端 402 + 全局弹框提示）', async () => {
    const user = userEvent.setup();
    fetchProfileUsageSummaryMock.mockResolvedValue(quotaSummary(100));

    renderEntry();
    expect(await screen.findByText('额度不足')).toBeInTheDocument();

    await openConversation(user);
    // 与对话 / 语音等模块同一条链路：面板不藏输入、不私自拦人，提交后由服务端与全局弹框裁决
    expect(screen.getByLabelText('星语问答输入框')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeInTheDocument();
  });

  it('额度取不到时不越权提示：徽章报「不限次数」，提问照常可行（服务端仍是裁决方）', async () => {
    const user = userEvent.setup();
    fetchProfileUsageSummaryMock.mockRejectedValue(new Error('额度查询失败'));

    renderEntry();
    expect(await screen.findByText('不限次数')).toBeInTheDocument();

    await openConversation(user);
    expect(screen.getByLabelText('星语问答输入框')).not.toBeDisabled();
  });

  it('额度不受限（管理员 / tokenRemaining 为 null）：徽章显示「不限次数」', async () => {
    const user = userEvent.setup();
    fetchProfileUsageSummaryMock.mockResolvedValue(quotaSummary(null));

    renderEntry();
    expect(await screen.findByText('不限次数')).toBeInTheDocument();

    await openConversation(user);
    expect(screen.getAllByText('不限次数').length).toBeGreaterThan(0);
  });
});
