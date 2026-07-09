import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEVICE_ID_REGEX, DEVICE_ID_STORAGE_KEY } from '@/lib/constants/device';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  load: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
});

async function loadModule() {
  return import('./device-fingerprint');
}

describe('getDeviceId', () => {
  it('优先返回 localStorage 缓存，不加载指纹库', async () => {
    const cached = 'a'.repeat(64);
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, cached);

    const { getDeviceId } = await loadModule();
    const id = await getDeviceId();

    expect(id).toBe(cached);
    const { load } = await import('@fingerprintjs/fingerprintjs');
    expect(load).not.toHaveBeenCalled();
  });

  it('无缓存时动态加载指纹库并保存 visitorId', async () => {
    const visitorId = 'b'.repeat(64);
    const { load } = await import('@fingerprintjs/fingerprintjs');
    vi.mocked(load).mockResolvedValueOnce({
      get: async () => ({ visitorId }),
    } as unknown as Awaited<ReturnType<typeof load>>);

    const { getDeviceId } = await loadModule();
    const id = await getDeviceId();

    expect(id).toBe(visitorId);
    expect(load).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(visitorId);
  });

  it('指纹库加载失败时降级为随机 ID 并保存', async () => {
    const { load } = await import('@fingerprintjs/fingerprintjs');
    vi.mocked(load).mockRejectedValueOnce(new Error('load failed'));

    const { getDeviceId } = await loadModule();
    const id = await getDeviceId();

    expect(id).toMatch(DEVICE_ID_REGEX);
    expect(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });
});

describe('clearDeviceId', () => {
  it('清除 localStorage 中的设备标识', async () => {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, 'c'.repeat(64));

    const { clearDeviceId } = await loadModule();
    clearDeviceId();

    expect(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBeNull();
  });
});
