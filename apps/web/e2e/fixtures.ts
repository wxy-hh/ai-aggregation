import type { Page } from '@playwright/test';

/**
 * E2E 认证测试夹具。
 *
 * 匿名设备认证已彻底下线，此处保留 seedFixedDevice 兼容桩以避免既有调用断裂。
 */
export async function seedFixedDevice(_page: Page): Promise<void> {
  // 匿名认证已下线，受保护路径由登录流程或测试账号接管
}
