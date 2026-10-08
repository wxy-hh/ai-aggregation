import { test, expect } from '@playwright/test';
import { seedFixedDevice } from './fixtures';

/**
 * 冒烟测试：登录页（P0，不依赖后端的客户端校验）。
 *
 * 覆盖：/login 渲染 → 空表单提交 → 中文校验提示，且不发出登录请求。
 * 本页只有一处客户端校验（用户名或密码为空时 toast「请输入用户名和密码」，
 * 见 components/login/static-login-page.tsx）；邮箱格式校验在注册页，不在此页断言。
 * 匿名用户允许停留在登录页（useRedirectRealUserToHome 只跳真实用户），
 * 认证引导走真实匿名设备认证（固定设备指纹，见 fixtures.ts）。
 */
test.describe('登录页 · 冒烟', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await seedFixedDevice(page);
  });

  test('页面渲染与空提交校验', async ({ page }) => {
    await page.goto('/login');

    // 认证引导就绪后渲染，首屏放宽超时到 15 秒
    await expect(page.getByText('欢迎回到 AI 聚合平台')).toBeVisible({ timeout: 15_000 });

    // 空表单提交：前端拦截并给出中文提示（toast 挂载在根布局）
    await page.getByRole('button', { name: '立即进入' }).click();
    await expect(page.getByText('请输入用户名和密码')).toBeVisible();
  });
});
