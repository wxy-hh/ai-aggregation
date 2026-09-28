import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldWarnLowBalance,
  checkAndWarnLowBalance,
  resetBalanceWarningCache,
  LOW_BALANCE_THRESHOLD,
} from './balance-warning';
import { authFetch } from '@/lib/api/client';
import { toast } from 'sonner';

vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

const mockedAuthFetch = vi.mocked(authFetch);
const mockedToastWarning = vi.mocked(toast.warning);

describe('balance-warning 低余额预警', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBalanceWarningCache();
  });

  describe('shouldWarnLowBalance 纯函数判定', () => {
    it('低于阈值时返回 true', () => {
      expect(shouldWarnLowBalance(1999)).toBe(true);
      expect(shouldWarnLowBalance(0)).toBe(true);
      expect(shouldWarnLowBalance(-10)).toBe(true);
    });

    it('大于等于阈值时返回 false', () => {
      expect(shouldWarnLowBalance(2000)).toBe(false);
      expect(shouldWarnLowBalance(5000)).toBe(false);
    });

    it('自定义阈值判定正确', () => {
      expect(shouldWarnLowBalance(499, 500)).toBe(true);
      expect(shouldWarnLowBalance(500, 500)).toBe(false);
    });

    it('非数值（null、undefined、NaN、Infinity）返回 false', () => {
      expect(shouldWarnLowBalance(null)).toBe(false);
      expect(shouldWarnLowBalance(undefined)).toBe(false);
      expect(shouldWarnLowBalance(Number.NaN)).toBe(false);
      expect(shouldWarnLowBalance(Number.POSITIVE_INFINITY)).toBe(false);
    });
  });

  describe('checkAndWarnLowBalance 检查与预警', () => {
    it('余额充足时不触发 toast 且不缓存', async () => {
      mockedAuthFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ tokenRemaining: 5000 }), { status: 200 })
      );

      await checkAndWarnLowBalance('conv-1');

      expect(mockedToastWarning).not.toHaveBeenCalled();
    });

    it('余额不足时触发 toast 并去重', async () => {
      mockedAuthFetch.mockImplementation(async () =>
        new Response(JSON.stringify({ tokenRemaining: 1500 }), { status: 200 })
      );

      // 第一次：应触发预警
      await checkAndWarnLowBalance('conv-1');
      expect(mockedToastWarning).toHaveBeenCalledTimes(1);
      expect(mockedToastWarning).toHaveBeenCalledWith(
        '额度剩余不足（约剩 1,500 tokens），请联系管理员充值'
      );

      // 第二次相同 conversationId：被去重，不重复发请求也不重复 toast
      await checkAndWarnLowBalance('conv-1');
      expect(mockedToastWarning).toHaveBeenCalledTimes(1);
      expect(mockedAuthFetch).toHaveBeenCalledTimes(1);

      // 另一个 conversationId：应触发
      await checkAndWarnLowBalance('conv-2');
      expect(mockedToastWarning).toHaveBeenCalledTimes(2);
      expect(mockedAuthFetch).toHaveBeenCalledTimes(2);
    });

    it('无 conversationId 时使用全局 key 去重', async () => {
      mockedAuthFetch.mockResolvedValue(
        new Response(JSON.stringify({ tokenRemaining: 800 }), { status: 200 })
      );

      await checkAndWarnLowBalance(null);
      expect(mockedToastWarning).toHaveBeenCalledTimes(1);
      expect(mockedToastWarning).toHaveBeenCalledWith(
        '额度剩余不足（约剩 800 tokens），请联系管理员充值'
      );

      await checkAndWarnLowBalance(undefined);
      expect(mockedToastWarning).toHaveBeenCalledTimes(1);
      expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    });

    it('接口返回错误或异常时静默失败，不抛出异常也不弹窗', async () => {
      mockedAuthFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: '系统异常' }), { status: 500 })
      );
      await expect(checkAndWarnLowBalance('conv-err')).resolves.toBeUndefined();
      expect(mockedToastWarning).not.toHaveBeenCalled();

      mockedAuthFetch.mockRejectedValueOnce(new Error('网络断开'));
      await expect(checkAndWarnLowBalance('conv-err-2')).resolves.toBeUndefined();
      expect(mockedToastWarning).not.toHaveBeenCalled();
    });
  });
});
