import { test, expect } from '@playwright/test';

/**
 * 冒烟测试：首页重定向与核心内容渲染。
 *
 * 未登录访问 /home 会由 AuthGuard 触发匿名设备认证，
 * 断言功能卡片标题出现即代表「重定向 → 匿名认证 → 内容渲染」整条链路通畅。
 */
test.describe('首页冒烟', () => {
  test('访问 / 重定向到 /home 并渲染功能入口', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/home/);

    // 匿名认证需要调用后端接口，首屏渲染放宽超时到 15 秒
    await expect(page.getByRole('heading', { name: '智能对话' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: '语音转写' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '灵感绘图' })).toBeVisible();
  });
});
