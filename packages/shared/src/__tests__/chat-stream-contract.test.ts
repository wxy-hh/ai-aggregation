/**
 * chat-stream-contract.test.ts —— tool_approval_request 事件契约测试（AGENT-HITL-ACTION / ADR-0041）
 *
 * 覆盖 qa-plan TC01：
 * 1. 合法帧解析且字段原样保留；
 * 2. 缺审批凭证的帧作废；
 * 3. 调用 ID 为空的帧作废；
 * 4. 未知事件类型解析为 null 且不抛错（旧端前向兼容）。
 */

import { describe, expect, it } from 'vitest';
import { parseChatStreamEvent } from '../chat-stream-contract';

const validApproval = {
  callId: 'call-1',
  toolName: 'wh_notify',
  host: 'hooks.example.com',
  params: { message: '你好', count: 2, urgent: true },
  token: 'signed-token-abc',
  expiresAt: 1_790_000_000_000,
};

describe('tool_approval_request 事件契约', () => {
  it('1. 合法帧解析为同名事件，字段原样保留 (TC01-1)', () => {
    const event = parseChatStreamEvent({ type: 'tool_approval_request', approval: validApproval });
    expect(event).toEqual({ type: 'tool_approval_request', approval: validApproval });
  });

  it('2. 缺少审批凭证的帧解析为 null (TC01-2)', () => {
    const { token: _token, ...withoutToken } = validApproval;
    expect(
      parseChatStreamEvent({ type: 'tool_approval_request', approval: withoutToken })
    ).toBeNull();
  });

  it('3. 调用 ID 为空串的帧解析为 null (TC01-3)', () => {
    expect(
      parseChatStreamEvent({
        type: 'tool_approval_request',
        approval: { ...validApproval, callId: '' },
      })
    ).toBeNull();
  });

  it('4. 未知事件类型解析为 null 且不抛错 (TC01-4)', () => {
    expect(() => parseChatStreamEvent({ type: 'some_future_event', foo: 1 })).not.toThrow();
    expect(parseChatStreamEvent({ type: 'some_future_event', foo: 1 })).toBeNull();
  });
});
