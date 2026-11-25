import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_TOKEN_TTL_MS,
  ApprovalRejectedError,
  canonicalizeApprovalParams,
  consumeApprovalToken,
  issueApprovalToken,
  verifyApprovalToken,
} from '../approval-token';

const { redisSetMock, redisState } = vi.hoisted(() => {
  const used = new Set<string>();
  const state = { down: false };
  const setMock = vi.fn(async (key: string) => {
    if (state.down) throw new Error('redis down');
    if (used.has(key)) return null;
    used.add(key);
    return 'OK';
  });
  return { redisSetMock: setMock, redisState: { used, state } };
});

vi.mock('@repo/redis', () => ({
  getRedisClient: () => ({ set: redisSetMock }),
}));

const TEST_SECRET = 'approval-token-test-secret-0123456789abcdef';

describe('审批凭证与 MCP 配置指纹绑定（工单 05）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisState.used.clear();
    redisState.state.down = false;
    vi.stubEnv('APPROVAL_TOKEN_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Webhook 向后兼容：不传 mcp 绑定签发的凭证可按原约定验签，不可跨用于 MCP', () => {
    const baseNow = 1_700_000_000_000;
    const binding = {
      userId: 'u_1',
      scope: 'conv_1',
      toolName: 'wh_notify',
      toolId: 'wh_id_1',
      host: 'hooks.example.com',
      params: { b: 2, a: 1 },
    };

    const issued = issueApprovalToken(binding, baseNow);
    expect(issued.expiresAt).toBe(baseNow + APPROVAL_TOKEN_TTL_MS);

    // 键序不同但规范化相同应通过
    const verified = verifyApprovalToken(
      issued.token,
      { ...binding, params: { a: 1, b: 2 } },
      baseNow + 5000
    );
    expect(verified.nonce).toBeTruthy();

    // 不可冒充为 MCP 绑定凭证
    expect(() =>
      verifyApprovalToken(
        issued.token,
        {
          ...binding,
          mcp: { serverId: 'srv_1', snapshotVersion: 1, configFingerprint: 'fp_1' },
        },
        baseNow + 5000
      )
    ).toThrow(ApprovalRejectedError);
  });

  it('MCP 绑定校验：serverId / snapshotVersion / configFingerprint 任一变化即拒绝', () => {
    const baseNow = 1_700_000_000_000;
    const binding = {
      userId: 'u_1',
      scope: 'conv_1',
      toolName: 'mcp_srv_1_write_value',
      toolId: 'srv_1:write_value',
      host: 'mcp.example.com',
      params: { key: 'k', value: 'v' },
      mcp: {
        serverId: 'srv_1',
        snapshotVersion: 2,
        configFingerprint: 'fp_alpha',
      },
    };

    const issued = issueApprovalToken(binding, baseNow);
    const ok = verifyApprovalToken(issued.token, binding, baseNow + 1000);
    expect(ok.nonce).toBeTruthy();

    expect(() =>
      verifyApprovalToken(issued.token, { ...binding, mcp: undefined }, baseNow + 1000)
    ).toThrow(ApprovalRejectedError);

    expect(() =>
      verifyApprovalToken(
        issued.token,
        { ...binding, mcp: { ...binding.mcp, serverId: 'srv_2' } },
        baseNow + 1000
      )
    ).toThrow(ApprovalRejectedError);

    expect(() =>
      verifyApprovalToken(
        issued.token,
        { ...binding, mcp: { ...binding.mcp, snapshotVersion: 3 } },
        baseNow + 1000
      )
    ).toThrow(ApprovalRejectedError);

    expect(() =>
      verifyApprovalToken(
        issued.token,
        { ...binding, mcp: { ...binding.mcp, configFingerprint: 'fp_beta' } },
        baseNow + 1000
      )
    ).toThrow(ApprovalRejectedError);

    // 超过 10 分钟有效期应报 expired (410)
    try {
      verifyApprovalToken(issued.token, binding, baseNow + APPROVAL_TOKEN_TTL_MS + 1);
      expect.unreachable('应当抛出 expired');
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalRejectedError);
      expect((error as ApprovalRejectedError).kind).toBe('expired');
      expect((error as ApprovalRejectedError).status).toBe(410);
    }
  });

  it('MCP 审批参数规范化序列化：8,000 字符可签发，8,001 字符拒绝签发', () => {
    const baseBinding = {
      userId: 'u_1',
      scope: 'conv_1',
      toolName: 'mcp_srv_1_write_value',
      toolId: 'srv_1:write_value',
      host: 'mcp.example.com',
      mcp: { serverId: 'srv_1', snapshotVersion: 1, configFingerprint: 'fp_1' },
    };

    // 精确构造恰好 8,000 字符的参数对象（外层 {"v":"..."} 为 8 字符 + 内部 len）
    const exactPayload = { v: 'a'.repeat(8000 - 8) };
    expect(canonicalizeApprovalParams(exactPayload).length).toBe(8000);
    expect(() => issueApprovalToken({ ...baseBinding, params: exactPayload })).not.toThrow();

    const overPayload = { v: 'a'.repeat(8001 - 8) };
    expect(canonicalizeApprovalParams(overPayload).length).toBe(8001);
    expect(() => issueApprovalToken({ ...baseBinding, params: overPayload })).toThrow(/8,000|8000/);
  });

  it('一次性消费与失败关闭：重放报 409、Redis 故障报 503、缺密钥报 503', async () => {
    await consumeApprovalToken('nonce-1');
    await expect(consumeApprovalToken('nonce-1')).rejects.toMatchObject({
      kind: 'used',
      status: 409,
    });

    redisState.state.down = true;
    await expect(consumeApprovalToken('nonce-2')).rejects.toMatchObject({
      kind: 'unavailable',
      status: 503,
    });

    vi.stubEnv('APPROVAL_TOKEN_SECRET', 'too-short');
    expect(() =>
      issueApprovalToken({
        userId: 'u_1',
        scope: '',
        toolName: 'wh_1',
        toolId: 'id_1',
        host: 'example.com',
        params: {},
      })
    ).toThrow(ApprovalRejectedError);
  });
});
