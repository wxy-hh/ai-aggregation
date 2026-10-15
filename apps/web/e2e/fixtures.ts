import type { Page } from '@playwright/test';

/**
 * 固定设备指纹：整套 e2e 复用同一个匿名用户。
 *
 * 匿名账号按 IP 限流（新建每小时 30 次，见 api/auth/anonymous），每次运行都刷新设备
 * 会在密集回归时触发 429，进而被 AuthGuard 引向 /login——固定设备可复现且不消耗该配额。
 * （与 constellation-universe.spec.ts 同口径；localStorage 键名见 src/lib/constants/device.ts）
 */
export const E2E_DEVICE_ID =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** 在页面加载前写入固定设备指纹，匿名认证链路仍走真实服务端 */
export async function seedFixedDevice(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, id]) => window.localStorage.setItem(key, id),
    ['ai-device-id', E2E_DEVICE_ID] as const
  );
}
