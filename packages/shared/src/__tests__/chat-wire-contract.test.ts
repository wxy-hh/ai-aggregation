/**
 * 聊天请求传输契约（评审 C4）决策表测试。
 *
 * 覆盖 qa-plan TC04（合法形状/strip/门控归一化）、TC05（非法矩阵/上限/错误形状）、
 * TC06（审批剥离与历史自愈）。先行范本：同包 chat-stream-contract.test.ts 的决策表范式。
 */

import { describe, expect, it } from 'vitest';
import {
  parseBatchReserveBody,
  parseChatRequestBody,
  projectWireHistory,
  toWireAttachment,
} from '../chat-wire-contract';

/** 构造最小合法请求体 */
function minimalBody(overrides: Record<string, unknown> = {}) {
  return { messages: [{ role: 'user', content: '你好' }], ...overrides };
}

describe('parseChatRequestBody', () => {
  it('TC04-1: 最小合法请求解析通过且 role/content 与输入一致', () => {
    const result = parseChatRequestBody(minimalBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages).toHaveLength(1);
    expect(result.body.messages[0]).toEqual({ role: 'user', content: '你好' });
  });

  it('TC04-2: 空 content 带合法图片附件解析通过', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '', attachments: [{ type: 'image', imageUrl: 'data:image/png;base64,AAA' }] },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages[0].attachments).toEqual([{ type: 'image', imageUrl: 'data:image/png;base64,AAA' }]);
  });

  it('TC04-3: 附件窄化为契约四字段且快照字段被剥离', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          {
            role: 'user',
            content: '看图',
            attachments: [
              {
                type: 'image',
                imageUrl: 'data:image/png;base64,AAA',
                name: '截图.png',
                id: 'att-1',
                status: 'ready',
                sourceId: 'relay-1',
                error: undefined,
              },
            ],
          },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages[0].attachments).toEqual([
      { type: 'image', imageUrl: 'data:image/png;base64,AAA', name: '截图.png' },
    ]);
    expect(JSON.stringify(result.body.messages[0])).not.toContain('att-1');
  });

  it('TC04-4: 附件 name 300 字符截断为 255', () => {
    const longName = 'a'.repeat(300);
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '', attachments: [{ type: 'file', fileId: 'f-1', name: longName }] },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages[0].attachments?.[0].name).toHaveLength(255);
  });

  it('TC04-5: 未知字段（isStreaming/stopped/foo）被静默剥离', () => {
    const result = parseChatRequestBody(
      minimalBody({
        foo: 'bar',
        messages: [{ role: 'user', content: '你好', isStreaming: true, stopped: false }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('isStreaming');
    expect(serialized).not.toContain('stopped');
    expect(serialized).not.toContain('foo');
  });

  it('TC04-6: agent=1 且 thinking="yes" 归一化为 false', () => {
    const result = parseChatRequestBody(minimalBody({ agent: 1, thinking: 'yes' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.agent).toBe(false);
    expect(result.body.thinking).toBe(false);
  });

  it('TC04-7: agent=true 时 capabilityPack 与 disabledToolKeys 原样保留', () => {
    const result = parseChatRequestBody(
      minimalBody({ agent: true, capabilityPack: 'research', disabledToolKeys: ['k1', 'k2'] })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.capabilityPack).toBe('research');
    expect(result.body.disabledToolKeys).toEqual(['k1', 'k2']);
  });

  it('TC04-8: 非 agent 时 capabilityPack/disabledToolKeys/artifactContext/approvalResume 被剥离', () => {
    const result = parseChatRequestBody(
      minimalBody({
        capabilityPack: 'research',
        disabledToolKeys: ['k1'],
        artifactContext: { focus: {} },
        approvalResume: { token: 't', callId: 'c', toolName: 'n', params: {} },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('capabilityPack');
    expect(serialized).not.toContain('disabledToolKeys');
    expect(serialized).not.toContain('artifactContext');
    expect(serialized).not.toContain('approvalResume');
  });

  it('TC04-9: 500 条消息解析通过且无条数上限', () => {
    const messages = Array.from({ length: 500 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `第 ${i} 条`,
    }));
    const result = parseChatRequestBody(minimalBody({ messages }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages).toHaveLength(500);
  });

  it('TC04-10: 全部非 user 角色时解析拒绝', () => {
    const result = parseChatRequestBody(
      minimalBody({ messages: [{ role: 'assistant', content: '历史回答' }] })
    );
    expect(result.ok).toBe(false);
  });

  it('TC04-11: approvalScope 截断 200、conversationId 截断 128', () => {
    const result = parseChatRequestBody(
      minimalBody({ approvalScope: 's'.repeat(250), conversationId: 'c'.repeat(200) })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.approvalScope).toHaveLength(200);
    expect(result.body.conversationId).toHaveLength(128);
  });

  it('TC04-12: model 为全空白字符串时输出不含 model 字段', () => {
    const result = parseChatRequestBody(minimalBody({ model: '   ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('model' in result.body).toBe(false);
  });

  it('TC05-1: 末条消息空 content 且无附件时拒绝', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'user', content: '' },
        ],
      })
    );
    expect(result.ok).toBe(false);
  });

  it('TC05-2: role="tool" 拒绝且 details 含 messages.1.role', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'tool', content: '结果' },
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.some((d) => d.path === 'messages.1.role')).toBe(true);
  });

  it('TC05-3: content 为数字拒绝且 details 含 messages.0.content', () => {
    const result = parseChatRequestBody(minimalBody({ messages: [{ role: 'user', content: 123 }] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.some((d) => d.path === 'messages.0.content')).toBe(true);
  });

  it('TC05-4: 附件 type="video" 拒绝且 details 指向该附件', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [{ role: 'user', content: '', attachments: [{ type: 'video', imageUrl: 'x' }] }],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.some((d) => d.path === 'messages.0.attachments.0')).toBe(true);
  });

  it('TC05-13: 历史消息附件非法 type 拒绝且 details 指向该附件（自愈仅适用合法 type 缺载荷）', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '第一段' },
          { role: 'assistant', content: '回答', attachments: [{ type: 'video', imageUrl: 'x' }] },
          { role: 'user', content: '第二段' },
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.some((d) => d.path === 'messages.1.attachments.0')).toBe(true);
  });

  it('TC05-5: provider="openai" 拒绝', () => {
    const result = parseChatRequestBody(minimalBody({ provider: 'openai' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.some((d) => d.path === 'provider')).toBe(true);
  });

  it('TC05-6: content 64001 字符拒绝', () => {
    const result = parseChatRequestBody(
      minimalBody({ messages: [{ role: 'user', content: 'x'.repeat(64001) }] })
    );
    expect(result.ok).toBe(false);
  });

  it('TC05-7: 单消息 6 个附件拒绝', () => {
    const attachments = Array.from({ length: 6 }, (_, i) => ({
      type: 'image',
      imageUrl: `data:image/png;base64,${i}`,
    }));
    const result = parseChatRequestBody(minimalBody({ messages: [{ role: 'user', content: '看图', attachments }] }));
    expect(result.ok).toBe(false);
  });

  it('TC05-8: imageUrl 超 15MB 字符串拒绝', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [{ role: 'user', content: '', attachments: [{ type: 'image', imageUrl: 'x'.repeat(15_000_001) }] }],
      })
    );
    expect(result.ok).toBe(false);
  });

  it('TC05-9: approvalResume 缺 token 拒绝且文案为既有中文提示', () => {
    const result = parseChatRequestBody(
      minimalBody({
        agent: true,
        approvalResume: { callId: 'c', toolName: 'n', params: {} },
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('审批恢复请求格式不正确，请重新提出需求');
  });

  it('TC05-10: 历史消息附件缺载荷剥离且消息保留', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '第一段' },
          { role: 'assistant', content: '回答', attachments: [{ type: 'image' }] },
          { role: 'user', content: '第二段' },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.messages).toHaveLength(3);
    expect(result.body.messages[1].content).toBe('回答');
    expect(result.body.messages[1].attachments ?? []).toHaveLength(0);
  });

  it('TC05-11: 末条消息附件缺载荷拒绝', () => {
    const result = parseChatRequestBody(
      minimalBody({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'user', content: '看图', attachments: [{ type: 'image' }] },
        ],
      })
    );
    expect(result.ok).toBe(false);
  });

  it('TC05-12: 拒绝错误对象恰含 error（中文）、code、details 三键', () => {
    const result = parseChatRequestBody(minimalBody({ provider: 'openai' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.error).sort()).toEqual(['code', 'details', 'message']);
    expect(result.error.message.length).toBeGreaterThan(0);
    expect(/[\u4e00-\u9fa5]/.test(result.error.message)).toBe(true);
  });
});

describe('projectWireHistory', () => {
  it('TC06-1: 待确认审批卡片投影后输出不含 token/callId', () => {
    const output = projectWireHistory([
      { role: 'user', content: '帮我导出数据' },
      {
        role: 'assistant',
        content: '需要确认',
        approval: { status: 'pending', toolName: 'webhook-post', token: 'secret-token', callId: 'call-1' },
      },
    ] as never);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('call-1');
    expect(output[0]).toEqual({ role: 'user', content: '帮我导出数据' });
    expect(output).toHaveLength(2);
  });

  it('TC06-2: 空 content 审批消息投影后不产生该条', () => {
    const output = projectWireHistory([
      { role: 'user', content: '帮我导出数据' },
      {
        role: 'assistant',
        content: '',
        approval: { status: 'pending', toolName: 'webhook-post' },
      },
    ]);
    expect(output).toHaveLength(1);
    expect(output[0].role).toBe('user');
  });

  it('TC06-3: rejected 投影后追加 system 拒绝提示', () => {
    const output = projectWireHistory([
      { role: 'user', content: '帮我导出数据' },
      {
        role: 'assistant',
        content: '请确认',
        approval: { status: 'rejected', toolName: 'webhook-post' },
      },
    ]);
    expect(output).toHaveLength(3);
    expect(output[2]).toEqual({
      role: 'system',
      content: '用户拒绝了执行 webhook-post',
    });
  });

  it('TC06-4: 历史残缺附件投影剥离且消息保留', () => {
    const output = projectWireHistory([
      { role: 'user', content: '你好', attachments: [{ type: 'image' }] },
      { role: 'user', content: '再看这张', attachments: [{ type: 'image', imageUrl: 'data:image/png;base64,BBB' }] },
    ]);
    expect(output).toHaveLength(2);
    expect(output[0].attachments ?? []).toHaveLength(0);
    expect(output[1].attachments).toEqual([{ type: 'image', imageUrl: 'data:image/png;base64,BBB' }]);
  });

  it('TC06-5: toWireAttachment 窄化完整附件为契约四字段', () => {
    const wire = toWireAttachment({
      type: 'file',
      fileId: 'f-9',
      name: '报告.xlsx',
      id: 'a-1',
      status: 'ready',
      sourceId: 's-1',
    });
    expect(wire).toEqual({ type: 'file', fileId: 'f-9', name: '报告.xlsx' });
  });
});

describe('parseBatchReserveBody', () => {
  it('批量预留解析：空 models 拒绝、超 8 拒绝、逐元素 provider 校验、无 user 消息拒绝', () => {
    const base = { messages: [{ role: 'user', content: '对比' }] };
    expect(parseBatchReserveBody({ ...base, models: [] }).ok).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ provider: 'xunfei', model: `m${i}` }));
    expect(parseBatchReserveBody({ ...base, models: nine }).ok).toBe(false);
    expect(
      parseBatchReserveBody({ ...base, models: [{ provider: 'openai', model: 'gpt' }] }).ok
    ).toBe(false);
    // P-M2：与单聊解析器同一安全门控——messages 必须至少含一条 user 消息
    expect(
      parseBatchReserveBody({
        messages: [{ role: 'assistant', content: '只有助手' }],
        models: [{ provider: 'xunfei', model: 'spark' }],
      }).ok
    ).toBe(false);
    const ok = parseBatchReserveBody({ ...base, models: [{ provider: 'xunfei', model: 'spark' }] });
    expect(ok.ok).toBe(true);
  });
});
