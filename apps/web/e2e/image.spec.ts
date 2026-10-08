import { test, expect, type Page } from '@playwright/test';
import { seedFixedDevice } from './fixtures';

/**
 * 冒烟测试：图像生成主链路（P0）。
 *
 * 覆盖：进入 /image → 提交生成 → 结果图渲染；上游失败 → 中文失败态。
 *
 * 打桩口径（不打真实上游、不走外网）：必须同时拦截两处——
 * 1. POST /api/image/agnes：同步返回图片 URL（无轮询）；
 * 2. GET /api/image/proxy?url=...：前端随后经代理下载每张图（lib/api/agnes.ts），
 *    不拦会去真实外网拉图而失败。
 * 提示词输入框与「立即生成」按钮在桌面/移动面板各有一份节点（互斥隐藏），
 * 选择器统一过滤可见节点。
 */

/** 1x1 透明 PNG，供代理下载桩使用 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** 图像接口桩：agnes 返回桩 URL，代理返回 1 像素 PNG */
async function stubImageApi(page: Page): Promise<void> {
  await page.route('**/api/image/agnes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [{ url: 'https://stub.example.com/out.png' }] }),
    })
  );
  await page.route('**/api/image/proxy**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX })
  );
}

/** 提交一次生成（提示词自带模板初值，按钮初始即可点） */
async function submitGeneration(page: Page): Promise<void> {
  const prompt = page.getByPlaceholder('描述你想要生成的画面...').filter({ visible: true });
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '立即生成' }).filter({ visible: true }).first().click();
}

test.describe('图像生成 · 冒烟', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await seedFixedDevice(page);
  });

  test('提交生成后结果图渲染', async ({ page }) => {
    await stubImageApi(page);
    await page.goto('/image');

    await submitGeneration(page);

    await expect(page.locator('img[alt="生成结果"]')).toBeVisible({ timeout: 20_000 });
  });

  test('上游失败时展示中文失败态', async ({ page }) => {
    // 无 error 字段的 500：agnes.ts 抛「Agnes API error: ...」，workspace 命中 'API error' 分支
    // （image-workspace.tsx:206），映射为固定中文文案；若带 error 字段则原文回显
    await page.route('**/api/image/agnes', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    );
    await page.goto('/image');

    await submitGeneration(page);

    // 失败框在桌面/移动面板各渲染一份（互斥隐藏），过滤可见节点
    await expect(
      page.getByText('服务连接异常，请检查网络后重试').filter({ visible: true })
    ).toBeVisible({ timeout: 20_000 });
  });
});
