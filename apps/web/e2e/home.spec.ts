import { test, expect } from '@playwright/test';

/**
 * 冒烟测试：全站登录拦截墙与未认证重定向。
 *
 * 下线匿名认证后，未登录访客访问根路径或 /home 统一被拦截并重定向到 /login。
 */
test.describe('全站登录墙冒烟', () => {
  test('未认证访问 / 干净重定向到 /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /登 录/ })).toBeVisible();
  });

  test('未认证访问 /home 拦截重定向到 /login?redirect=%2Fhome', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fhome/);
    await expect(page.getByRole('button', { name: /登 录/ })).toBeVisible();
  });
});
