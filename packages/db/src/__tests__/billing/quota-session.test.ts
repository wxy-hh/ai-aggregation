/**
 * QuotaSession.finalize 三态决策矩阵单测
 *
 * 覆盖评审 C1 的核心断言：success/partial/failed 三态在
 * 有预留（普通用户）与无预留（admin）两条路径下的行为，
 * 以及幂等守卫与 partial 兜底口径（输入估算 + 输出估算）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserveChatQuota: vi.fn(),
  releaseAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
  useExistingAiQuota: vi.fn(),
  safeRecordAiUsage: vi.fn(),
}));

vi.mock('../../billing/quota-service', () => ({
  reserveChatQuota: mocks.reserveChatQuota,
  releaseAiQuota: mocks.releaseAiQuota,
  settleAiQuota: mocks.settleAiQuota,
  useExistingAiQuota: mocks.useExistingAiQuota,
}));
// safeRecordAiUsage 换 spy（避免真连 DB）；normalizeUsage 保留真实实现（兜底口径依赖它识别 total_tokens）
vi.mock('../../billing/ai-usage', () => ({ safeRecordAiUsage: mocks.safeRecordAiUsage }));

import { QuotaSession } from '../../billing/quota-session';

function makeReservedSession(inputUnits = 100, outputLimit = 2048): Promise<QuotaSession> {
  mocks.reserveChatQuota.mockResolvedValue({
    reservation: { id: 'res_1' },
    inputUnits,
    outputLimit,
  });
  return QuotaSession.reserve({
    userId: 'user_1',
    requestId: 'req_1',
    feature: 'destiny',
    provider: 'doubao',
    model: 'doubao-pro',
    messages: [{ content: 'hello' }],
  });
}

function makeAdminSession(): Promise<QuotaSession> {
  return QuotaSession.reserve(
    {
      userId: 'user_1',
      requestId: 'req_1',
      feature: 'destiny',
      messages: [{ content: 'hello' }],
    },
    'admin'
  );
}

describe('QuotaSession.finalize 三态决策矩阵', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.releaseAiQuota.mockResolvedValue(undefined);
    mocks.settleAiQuota.mockResolvedValue(undefined);
    mocks.safeRecordAiUsage.mockResolvedValue(undefined);
  });

  describe('有预留（普通用户）', () => {
    it('success → 按 usage 结算 status=success', async () => {
      const session = await makeReservedSession();
      await session.finalize('success', {
        requestId: 'req_1',
        action: 'destiny-report',
        endpoint: '/api/destiny/report',
        usage: { total_tokens: 500, output_tokens: 300 },
        outputText: '报告内容',
        provider: 'doubao',
        model: 'doubao-pro',
        userId: 'user_1',
        feature: 'destiny',
      });

      expect(mocks.settleAiQuota).toHaveBeenCalledTimes(1);
      expect(mocks.settleAiQuota.mock.calls[0][0]).toMatchObject({
        reservationId: 'res_1',
        status: 'success',
      });
      // usage 有效时 measurement.sourceUnits 应为上游 total_tokens，而非估算兜底
      expect(mocks.settleAiQuota.mock.calls[0][0].measurement.sourceUnits).toBe(500);
      expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
      expect(mocks.safeRecordAiUsage).not.toHaveBeenCalled();
    });

    it('partial → 按 usage 结算 status=partial（不退款）', async () => {
      const session = await makeReservedSession();
      await session.finalize('partial', {
        requestId: 'req_1',
        action: 'destiny-copilot',
        usage: { total_tokens: 400 },
        outputText: '部分输出',
        provider: 'doubao',
        model: 'doubao-pro',
        userId: 'user_1',
      });

      expect(mocks.settleAiQuota).toHaveBeenCalledTimes(1);
      expect(mocks.settleAiQuota.mock.calls[0][0]).toMatchObject({
        reservationId: 'res_1',
        status: 'partial',
      });
      expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
    });

    it('usage 为 null 时按 输入估算+输出文本估算 兜底结算（统一兜底口径）', async () => {
      const session = await makeReservedSession(100, 2048);
      await session.finalize('success', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: null,
        // 足够长的输出文本使估算 > 0
        outputText: '输出'.repeat(200),
        userId: 'user_1',
      });

      const call = mocks.settleAiQuota.mock.calls[0][0];
      expect(call.measurement.source).toBe('local_estimate');
      // 兜底 = inputUnits(100) + estimateOutputTokens(text)，必须大于输入估算
      expect(call.measurement.sourceUnits).toBeGreaterThan(100);
    });

    it('failed → 释放预留（取消应退款），不结算', async () => {
      const session = await makeReservedSession();
      await session.finalize('failed', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: null,
        outputText: '',
        reason: '流式失败',
        userId: 'user_1',
      });

      expect(mocks.releaseAiQuota).toHaveBeenCalledTimes(1);
      expect(mocks.releaseAiQuota.mock.calls[0][0]).toMatchObject({
        reservationId: 'res_1',
        reason: '流式失败',
      });
      expect(mocks.settleAiQuota).not.toHaveBeenCalled();
    });
  });

  describe('无预留（admin）', () => {
    it('success → 降级为 safeRecordAiUsage 归档，不 settle/release', async () => {
      const session = await makeAdminSession();
      expect(session.hasReservation).toBe(false);

      await session.finalize('success', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: { total_tokens: 300 },
        outputText: '内容',
        userId: 'user_1',
      });

      expect(mocks.safeRecordAiUsage).toHaveBeenCalledTimes(1);
      // 审计字段与 settle 路径对齐：requestId（upsert 幂等键）/ meterType / billableUnits / billingStatus / status
      expect(mocks.safeRecordAiUsage.mock.calls[0][0]).toMatchObject({
        requestId: 'req_1',
        meterType: 'tokens',
        billableUnits: 300,
        billingStatus: 'settled',
        status: 'success',
      });
      expect(mocks.settleAiQuota).not.toHaveBeenCalled();
      expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
    });

    it('partial → 同样归档用量', async () => {
      const session = await makeAdminSession();
      await session.finalize('partial', {
        requestId: 'req_1',
        action: 'destiny-copilot',
        usage: null,
        outputText: '部分输出',
        userId: 'user_1',
      });

      expect(mocks.safeRecordAiUsage).toHaveBeenCalledTimes(1);
      expect(mocks.safeRecordAiUsage.mock.calls[0][0]).toMatchObject({
        requestId: 'req_1',
        status: 'partial',
        billableUnits: null,
      });
      expect(mocks.settleAiQuota).not.toHaveBeenCalled();
    });

    it('failed → 无产出不归档，全部跳过', async () => {
      const session = await makeAdminSession();
      await session.finalize('failed', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: null,
        outputText: '',
        reason: '失败',
        userId: 'user_1',
      });

      expect(mocks.safeRecordAiUsage).not.toHaveBeenCalled();
      expect(mocks.settleAiQuota).not.toHaveBeenCalled();
      expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
    });
  });

  describe('幂等与边界', () => {
    it('finalize 后再次 finalize 不重复结算（settled 守卫）', async () => {
      const session = await makeReservedSession();
      await session.finalize('success', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: { total_tokens: 100 },
        outputText: 'x',
        userId: 'user_1',
      });
      await session.finalize('failed', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: null,
        outputText: '',
        userId: 'user_1',
      });

      expect(mocks.settleAiQuota).toHaveBeenCalledTimes(1);
      expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
    });

    it('settle 抛错时不置 settled 标志，后续仍可重试或释放', async () => {
      const session = await makeReservedSession();
      mocks.settleAiQuota.mockRejectedValueOnce(new Error('db down'));

      await session.finalize('success', {
        requestId: 'req_1',
        action: 'destiny-report',
        usage: { total_tokens: 100 },
        outputText: 'x',
        userId: 'user_1',
      });

      // 失败后 release 仍可执行（不因结算失败而卡死预留）
      await session.release({ reason: '兜底释放' });
      expect(mocks.releaseAiQuota).toHaveBeenCalledTimes(1);
    });

    it('无预留且无 userId 时 finalize 归档跳过不抛错', async () => {
      const session = await makeAdminSession();
      await expect(
        session.finalize('success', {
          requestId: 'req_1',
          action: 'destiny-report',
          usage: null,
          outputText: 'x',
          // 未传 userId
        })
      ).resolves.toBeUndefined();
      expect(mocks.safeRecordAiUsage).not.toHaveBeenCalled();
    });
  });
});