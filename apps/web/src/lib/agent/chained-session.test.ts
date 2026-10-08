/**
 * 链式会话深模块单测（chained-session.test.ts）
 *
 * 架构接缝（Candidate 03 · ADR-0010）：
 * - 本测试位于 lib 层，零外部 Mock 与网络流依赖；
 * - 针对状态机（ChainedMessageSession）进行确定性单测；
 * - 验证链追踪、单轮与多轮增量载荷推演、断链回退全量、断链后自愈恢复、引导语注入与历史池隔离。
 */

import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import type { Message as ChatMessage } from '@/stores/chat-store';
import {
  createChainedMessageSession,
  type ChainedMessageSession,
} from './chained-session';

describe('ChainedMessageSession 链式会话状态机深模块', () => {
  it('首步无链状态：返回全量初始消息，previousResponseId 为 undefined，isChained 为 false', () => {
    const initialChatMessages: ChatMessage[] = [
      {
        id: 'msg_1',
        role: 'user',
        content: '请帮我查询天气',
      } as ChatMessage,
    ];

    const session: ChainedMessageSession = createChainedMessageSession({
      initialMessages: initialChatMessages,
    });

    const payload = session.getStepPayload();

    expect(payload.isChained).toBe(false);
    expect(payload.previousResponseId).toBeUndefined();
    expect(payload.messages).toEqual([{ role: 'user', content: '请帮我查询天气' }]);
    expect(session.getPreviousResponseId()).toBeNull();
  });

  it('正常建链与工具增量：记录带 ID 的响应后，返回单条增量消息且带 previousResponseId', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '北京今天的天气' }],
    });

    // 模型决策步响应，产出 assistant 消息与有效响应 ID
    session.recordResponse({
      id: 'resp_step1',
      messages: [{ role: 'assistant', content: '我正在为您调用天气工具' }],
    });

    const toolResultMsg: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'weather_fetch',
          output: { type: 'text', value: '晴朗 22 度' },
        },
      ],
    };

    session.appendToolResult(toolResultMsg);

    // 索取下一轮发送载荷
    const payload = session.getStepPayload();

    expect(payload.isChained).toBe(true);
    expect(payload.previousResponseId).toBe('resp_step1');
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toEqual(toolResultMsg);

    // 验证内部全量历史池已完整累积，保留中间过程
    expect(session.getCurrentMessages()).toEqual([
      { role: 'user', content: '北京今天的天气' },
      { role: 'assistant', content: '我正在为您调用天气工具' },
      toolResultMsg,
    ]);
  });

  it('多轮连续工具调用：状态机持续维持链式增量，每一轮正确推进 responseId', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '先查天气再查穿衣建议' }],
    });

    // 第 1 轮
    session.recordResponse({
      id: 'resp_1',
      messages: [{ role: 'assistant', content: '查天气中' }],
    });
    const toolMsg1: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: { type: 'text', value: '18度' },
        },
      ],
    };
    session.appendToolResult(toolMsg1);

    const payload1 = session.getStepPayload();
    expect(payload1.isChained).toBe(true);
    expect(payload1.previousResponseId).toBe('resp_1');
    expect(payload1.messages).toEqual([toolMsg1]);

    // 第 2 轮
    session.recordResponse({
      id: 'resp_2',
      messages: [{ role: 'assistant', content: '查穿衣建议中' }],
    });
    const toolMsg2: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c2',
          toolName: 'clothing',
          output: { type: 'text', value: '建议穿夹克' },
        },
      ],
    };
    session.appendToolResult(toolMsg2);

    const payload2 = session.getStepPayload();
    expect(payload2.isChained).toBe(true);
    expect(payload2.previousResponseId).toBe('resp_2');
    expect(payload2.messages).toEqual([toolMsg2]);

    // 验证全量历史池包含 5 条消息
    expect(session.getCurrentMessages()).toHaveLength(5);
  });

  it('断链自愈与全量回退：响应缺少 ID 时自动断链，回退全量累积历史且不带 previousResponseId', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '开始测试' }],
    });

    // 模拟某轮响应因上游原因缺少 ID（id 为 undefined）
    session.recordResponse({
      id: undefined,
      messages: [{ role: 'assistant', content: '生成了工具调用但未返回 ID' }],
    });

    const toolMsg: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c_orphan',
          toolName: 'calc',
          output: { type: 'text', value: '42' },
        },
      ],
    };
    session.appendToolResult(toolMsg);

    const payload = session.getStepPayload();

    // 预期断链：回退为全量发送，无 previousResponseId，防止协议 400
    expect(payload.isChained).toBe(false);
    expect(payload.previousResponseId).toBeUndefined();
    expect(payload.messages).toEqual([
      { role: 'user', content: '开始测试' },
      { role: 'assistant', content: '生成了工具调用但未返回 ID' },
      toolMsg,
    ]);
  });

  it('断链后自愈：断链回退全量发送后，若下一轮响应获得新 ID，状态机自愈恢复链式增量', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '测试自愈链路' }],
    });

    // 第 1 轮：异常缺少 ID，触发断链
    session.recordResponse({
      id: undefined,
      messages: [{ role: 'assistant', content: '第一轮断链' }],
    });
    const toolMsg1: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'tool_1',
          output: { type: 'text', value: 'res1' },
        },
      ],
    };
    session.appendToolResult(toolMsg1);

    // 第 2 轮请求为全量回退
    const payloadRound2 = session.getStepPayload();
    expect(payloadRound2.isChained).toBe(false);

    // 第 2 轮全量重发后，模型返回了正常的 ID
    session.recordResponse({
      id: 'resp_healed',
      messages: [{ role: 'assistant', content: '第二轮恢复' }],
    });
    const toolMsg2: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c2',
          toolName: 'tool_2',
          output: { type: 'text', value: 'res2' },
        },
      ],
    };
    session.appendToolResult(toolMsg2);

    // 第 3 轮请求自愈成功，恢复为链式增量
    const payloadRound3 = session.getStepPayload();
    expect(payloadRound3.isChained).toBe(true);
    expect(payloadRound3.previousResponseId).toBe('resp_healed');
    expect(payloadRound3.messages).toEqual([toolMsg2]);
  });

  it('引导语续跑增量注入（nudge 场景）：正确将系统引导语作为增量注入并维持链追踪', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '搜索内容' }],
    });

    // 服务端工具搜索执行完毕，响应有 ID
    session.recordResponse({
      id: 'resp_search_1',
    });

    const nudgeMsg: ModelMessage = {
      role: 'user',
      content: '请根据上述搜索结果，回答用户的原始问题。',
    };

    session.appendNudge(nudgeMsg);

    const payload = session.getStepPayload();
    expect(payload.isChained).toBe(true);
    expect(payload.previousResponseId).toBe('resp_search_1');
    expect(payload.messages).toEqual([nudgeMsg]);

    // 全量历史池包含用户消息与引导语
    expect(session.getCurrentMessages()).toEqual([
      { role: 'user', content: '搜索内容' },
      nudgeMsg,
    ]);
  });

  it('防御性拷贝隔离：外部修改返回的 messages 不会污染内部历史池', () => {
    const session = createChainedMessageSession({
      initialMessages: [{ role: 'user', content: '不可变测试' }],
    });

    const payload = session.getStepPayload();
    // 外部尝试向返回的数组 push 消息
    payload.messages.push({ role: 'user', content: '恶意篡改' });

    // 内部历史池不受影响
    expect(session.getCurrentMessages()).toHaveLength(1);
    expect(session.getCurrentMessages()[0]).toEqual({
      role: 'user',
      content: '不可变测试',
    });
  });
});
