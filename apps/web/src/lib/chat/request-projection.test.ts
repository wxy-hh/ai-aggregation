/**
 * 请求投影唯一出口测试（评审 C4 / ADR-0050 决策 4/5）。
 *
 * 覆盖 qa-plan TC07：send/reload/approval_resume/compare 四模式组装、
 * reload 能力包漂移修复、当前附件硬阻断、批量预留组装形状。
 */

import { describe, expect, it } from 'vitest';
import { buildBatchReserveRequestBody, buildChatRequestBody } from './request-projection';

describe('buildChatRequestBody 请求投影（评审 C4）', () => {
  it('TC07-1: send 模式——快照含审批卡片时输出 messages 不含凭证且顶层字段与入参一致', () => {
    const body = buildChatRequestBody({
      mode: 'send',
      messages: [
        { role: 'user', content: '帮我导出数据' },
        {
          role: 'assistant',
          content: '需要确认',
          approval: { status: 'pending', toolName: 'webhook-post', token: 'secret-token', callId: 'call-1' },
        },
        { role: 'user', content: '继续' },
      ],
      provider: 'xunfei',
      model: 'spark',
      thinking: true,
      agentMode: false,
    });
    expect(body.provider).toBe('xunfei');
    expect(body.model).toBe('spark');
    expect(body.thinking).toBe(true);
    expect(JSON.stringify(body.messages)).not.toContain('secret-token');
    expect(body.messages[0]).toEqual({ role: 'user', content: '帮我导出数据' });
  });

  it('TC07-2: reload 模式——携带 capabilityPack 与 disabledToolKeys（漂移修复）且 messages 不含附件', () => {
    const body = buildChatRequestBody({
      mode: 'reload',
      messages: [
        { role: 'user', content: '看图说话', attachments: [{ type: 'image', imageUrl: 'data:image/png;base64,AAA' }] },
      ],
      provider: 'doubao',
      model: 'lite',
      thinking: false,
      agentMode: true,
      conversationId: 'conv-1',
      capabilityPackKey: 'research',
      disabledToolKeys: ['k1'],
    });
    expect(body.capabilityPack).toBe('research');
    expect(body.disabledToolKeys).toEqual(['k1']);
    expect(body.agent).toBe(true);
    expect(body.approvalScope).toBe('conv-1');
    expect(body.messages[0]).toEqual({ role: 'user', content: '看图说话' });
    expect(JSON.stringify(body.messages)).not.toContain('imageUrl');
  });

  it('TC03-0: send/reload/approval_resume 模式的 conversationId 原样进入请求体', () => {
    for (const mode of ['send', 'reload', 'approval_resume'] as const) {
      const body = buildChatRequestBody({
        mode,
        messages: [{ role: 'user', content: '普通消息' }],
        provider: 'xunfei',
        thinking: false,
        agentMode: false,
        conversationId: 'conv-1700000000000',
      });
      expect(body.conversationId).toBe('conv-1700000000000');
    }
  });

  it('TC03-1: send/reload/approval_resume 模式的 turnId 原样进入请求体', () => {
    for (const mode of ['send', 'reload', 'approval_resume'] as const) {
      const body = buildChatRequestBody({
        mode,
        messages: [{ role: 'user', content: '普通消息' }],
        provider: 'xunfei',
        thinking: false,
        agentMode: false,
        turnId: 'user-1700000000000',
      });
      expect(body.turnId).toBe('user-1700000000000');
    }
  });

  it('TC03-2: 对比模式即使传入 turnId 也不进入请求体', () => {
    const body = buildChatRequestBody({
      mode: 'compare',
      messages: [{ role: 'user', content: '同一个问题' }],
      provider: 'xunfei',
      thinking: false,
      agentMode: false,
      turnId: 'user-1700000000000',
    });
    expect(body.turnId).toBeUndefined();
  });

  it('TC03-3: 未提供 turnId 时请求体不带该字段', () => {
    const body = buildChatRequestBody({
      mode: 'send',
      messages: [{ role: 'user', content: '普通消息' }],
      provider: 'xunfei',
      thinking: false,
      agentMode: false,
    });
    expect(body.turnId).toBeUndefined();
  });

  it('TC07-3: 对比模式 models 入参含 UI 字段时输出每项恰含 provider 与 model 两键', () => {
    const models = [
      { provider: 'xunfei', model: 'spark', label: '讯飞星火', providerLabel: '科大讯飞' },
      { provider: 'doubao', model: 'lite', label: '豆包', supportsReasoning: true },
    ] as never;
    const body = buildBatchReserveRequestBody('对比一下', models);
    expect(body).toEqual({
      messages: [{ role: 'user', content: '对比一下' }],
      models: [
        { provider: 'xunfei', model: 'spark' },
        { provider: 'doubao', model: 'lite' },
      ],
    });
  });

  it('TC07-4: 当前发送附件投影失败时抛出中文错误且不产生请求体', () => {
    expect(() =>
      buildChatRequestBody({
        mode: 'send',
        messages: [
          { role: 'user', content: '看图', attachments: [{ type: 'image' }] },
        ],
        provider: 'doubao',
        model: 'lite',
        thinking: false,
        agentMode: false,
      })
    ).toThrow('附件尚未上传完成或已损坏');
  });

  it('TC07-5: 批量预留组装——单 prompt + models 输出约定形状', () => {
    const body = buildBatchReserveRequestBody(
      '对比一下',
      [{ provider: 'xunfei', model: 'spark' }] as never
    );
    expect(body).toEqual({
      messages: [{ role: 'user', content: '对比一下' }],
      models: [{ provider: 'xunfei', model: 'spark' }],
    });
  });

  it('TC01-3: chatScene 按模式投影为 compare 或 single', () => {
    const compare = buildChatRequestBody({
      mode: 'compare',
      messages: [{ role: 'user', content: '同一个问题' }],
      provider: 'xunfei',
      thinking: false,
      agentMode: false,
    });
    expect(compare.chatScene).toBe('compare');

    for (const mode of ['send', 'reload', 'approval_resume'] as const) {
      const body = buildChatRequestBody({
        mode,
        messages: [{ role: 'user', content: '普通消息' }],
        provider: 'xunfei',
        thinking: false,
        agentMode: false,
      });
      expect(body.chatScene).toBe('single');
    }
  });

  it('附加覆盖：approval_resume 模式——历史投影 + 计划检查点 + 审批载荷', () => {
    const body = buildChatRequestBody({
      mode: 'approval_resume',
      messages: [
        { role: 'user', content: '帮我导出数据' },
        {
          role: 'assistant',
          content: '',
          approval: { status: 'pending', toolName: 'web_fetch', token: 'tk' },
        },
      ],
      planCheckpoint: { role: 'system', content: '此前已完成的计划步骤' },
      provider: 'xunfei',
      model: 'spark',
      thinking: false,
      agentMode: true,
      conversationId: 'conv-9',
      approvalResume: { token: 'tk', callId: 'c1', toolName: 'web_fetch', params: { url: 'https://a.com' } },
    });
    expect(body.agent).toBe(true);
    expect(body.approvalScope).toBe('conv-9');
    expect(body.approvalResume?.token).toBe('tk');
    // 空内容审批消息被跳过，但用户消息与检查点保留
    expect(body.messages).toEqual([
      { role: 'user', content: '帮我导出数据' },
      { role: 'system', content: '此前已完成的计划步骤' },
    ]);
  });
});
