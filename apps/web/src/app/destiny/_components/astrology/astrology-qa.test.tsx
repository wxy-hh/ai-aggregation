/**
 * astrology-qa.test.tsx —— 星语问答面板（04 工单：接缝从 mock 规则引擎切到真实问答路由）
 *
 * 锁定的外部行为（面板/抽屉结构不动，只有回答来源换实现）：
 * - 发送后用户气泡立即入列、等待气泡锁住输入；回答到达即替换等待气泡并渲染引用片；
 * - 流式正文增量在等待气泡内逐字浮现（「正在思考…」随之让位）；
 * - 失败给中文提示并解开输入锁（超限 / 额度不足沿用服务端提示）；
 * - 每份报告 3 问上限在面板层拦截：达到上限后输入区替换为文档原文提示，不再发起请求。
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

import { AstrologyQaEntry } from './astrology-qa';
import { AstrologyQaRequestError, requestAstrologyAnswer } from '@/lib/astrology/qa-request';
import type { AstrologyQaAnswer } from '@/lib/astrology/qa-events';
import { computeChartFacts } from '@/lib/astrology/chart-engine';
import { SAMPLE_PROFILE_ACCURATE } from '@/lib/astrology/sample-chart';
import type { ModuleReading } from '@/lib/astrology/interpretation';

const requestAstrologyAnswerMock = vi.mocked(requestAstrologyAnswer);

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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('提问 → 等待气泡 → 回答与引用片替换等待气泡，已提问数随请求上行', async () => {
    const user = userEvent.setup();
    const pending = deferred<AstrologyQaAnswer>();
    let askedCount = -1;
    requestAstrologyAnswerMock.mockImplementation((_q, _f, _m, options) => {
      askedCount = options.askedCount;
      return pending.promise;
    });

    renderEntry();
    await openConversation(user);
    await ask(user, QUESTION);

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText('正在思考…')).toBeInTheDocument();
    expect(askedCount).toBe(0);
    expect(requestAstrologyAnswerMock.mock.calls[0][1]).toBe(FACTS);

    await act(async () => {
      pending.resolve(ANSWER);
    });

    expect(await screen.findByText('你在关系里最需要的是被认真回应。')).toBeInTheDocument();
    expect(screen.queryByText('正在思考…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关系如何运作' })).toBeInTheDocument();
    expect(screen.getAllByText('还可问 2 次').length).toBeGreaterThan(0);
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

  it('失败：给中文提示并解开输入锁（超限沿用服务端提示）', async () => {
    const user = userEvent.setup();
    requestAstrologyAnswerMock.mockRejectedValue(
      new AstrologyQaRequestError('limit', '本次星语问答已完成，可重新打开报告后继续探索。')
    );

    renderEntry();
    await openConversation(user);
    await ask(user, QUESTION);

    expect(
      await screen.findByText('本次星语问答已完成，可重新打开报告后继续探索。')
    ).toBeInTheDocument();
    expect(screen.queryByText('正在思考…')).not.toBeInTheDocument();
    // 失败后输入仍可用（不锁死在等待态）
    expect(screen.getByLabelText('星语问答输入框')).not.toBeDisabled();
  });

  it('3 问上限：面板层拦截，输入区替换为文档原文提示且不再发起请求', async () => {
    const user = userEvent.setup();
    requestAstrologyAnswerMock.mockResolvedValue(ANSWER);

    renderEntry();
    await openConversation(user);
    const questions = ['第一个问题', '第二个问题', '第三个问题'];
    for (const [index, question] of questions.entries()) {
      await ask(user, question);
      await vi.waitFor(() =>
        expect(screen.getAllByText('你在关系里最需要的是被认真回应。')).toHaveLength(index + 1)
      );
      expect(requestAstrologyAnswerMock).toHaveBeenCalledTimes(index + 1);
      expect(requestAstrologyAnswerMock.mock.calls[index][3]).toMatchObject({ askedCount: index });
    }

    expect(screen.getByText('本次星语问答已完成，可重新打开报告后继续探索。')).toBeInTheDocument();
    expect(screen.queryByLabelText('星语问答输入框')).not.toBeInTheDocument();
    expect(requestAstrologyAnswerMock).toHaveBeenCalledTimes(3);
    // 已达上限：提问不再被派发
    expect(screen.queryByRole('button', { name: '发送问题' })).not.toBeInTheDocument();
  });
});
