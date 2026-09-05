import { test, expect, type Page } from '@playwright/test';

/**
 * 星座寰宇主链路 E2E（工单 13 验收）。
 *
 * 覆盖三条链路：
 * 1. 准确档主链路：入口 → 两步表单 → 加载仪式 → 结果页（主轴 / 大三要素 / 星盘轮 / 洞察轨）
 * 2. 完全未知档降级链路：同一表单流程产出无宫位报告，上升/宫位不出现
 * 3. 分享海报链路：脱敏弹层实时预览，匿名/仅主轴切换生效，海报不含出生日期
 *
 * 表单选择器口径与组件 aria-label 一一对应（astrology-form-step1/2）；
 * 仪式转场耗时较长，结果页断言统一放宽到 45 秒。
 */

/** 走完两步表单并提交（示例盘：1995-10-08 上海；withTime 时填 14:30） */
async function submitChartForm(
  page: Page,
  options: { name?: string; precision: '准确到分钟' | '大约时段' | '完全未知'; withTime?: boolean }
) {
  await page.goto('/destiny?tab=astrology');

  // 入口首页 → 进入表单（已恢复会话时直接落在表单/结果页，此处兼容两种落点）
  const yearSelect = page.locator('select[aria-label="出生年份"]');
  if (!(await yearSelect.isVisible().catch(() => false))) {
    // 入口首页 CTA：开始绘制（按钮文案以入口首页实际为准，用部分匹配兜底）
    await page
      .getByRole('button', { name: /开始绘制|绘制我的星盘|立即体验/ })
      .first()
      .click();
  }
  await expect(yearSelect).toBeVisible({ timeout: 15_000 });

  // 第一步：昵称（可选）+ 出生日期
  if (options.name) await page.fill('input[placeholder="例如：小宇"]', options.name);
  await yearSelect.selectOption('1995');
  await page.locator('select[aria-label="出生月份"]').selectOption('10');
  await page.locator('select[aria-label="出生日"]').selectOption('8');
  await page.getByRole('button', { name: '继续', exact: true }).click();

  // 第二步：时间精度 + （可选）时刻 + 出生城市精确选中
  const precisionGroup = page.locator('[aria-label="出生时间精度"]');
  await expect(precisionGroup).toBeVisible({ timeout: 8_000 });
  await precisionGroup.getByRole('radio', { name: options.precision }).click();
  if (options.withTime) {
    await page.locator('select[aria-label="出生小时"]').selectOption('14');
    await page.locator('select[aria-label="出生分钟"]').selectOption('30');
  }
  await page.fill('input[placeholder="搜索城市中文名或拼音，从候选中选择"]', '上海');
  await page.locator('ul li button').first().click();

  await page.getByRole('button', { name: '绘制我的星盘', exact: true }).click();
}

test.describe('星座寰宇 · 主链路', () => {
  test('准确档：完整本命盘流程产出结果页首屏四要素', async ({ page }) => {
    await submitChartForm(page, { name: '星野', precision: '准确到分钟', withTime: true });

    // 仪式转场后落定结果页：主轴、大三要素、星盘轮、洞察轨分享入口
    await expect(page.getByText('分享星语海报').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('大三要素').first()).toBeVisible();
    await expect(page.locator('#astrology-wheel-section')).toBeAttached();
    // 大三要素含上升（准确档）
    await expect(page.getByText('上升').first()).toBeVisible();
    // 结果页不出现出生地点等原始资料之外的泄露（出生资料摘要是护照头正常内容，此处断言无精度百分比等违禁口径）
    await expect(page.getByText(/精度\s*\d+%/)).toHaveCount(0);
  });

  test('完全未知档：降级为无宫位报告，上升/宫位不出现', async ({ page }) => {
    await submitChartForm(page, { precision: '完全未知' });

    await expect(page.getByText('分享星语海报').first()).toBeVisible({ timeout: 45_000 });
    // 无宫位降级：核心要素替代大三要素，盘面范围卡说明无宫位
    await expect(page.getByText(/无宫位/).first()).toBeVisible();
    // 上升不出现（要素卡/轮图角点均隐藏）
    await expect(page.getByText('上升星座')).toHaveCount(0);
  });

  test('分享海报：脱敏预览实时切换，不含出生日期', async ({ page }) => {
    await submitChartForm(page, { name: '星野', precision: '准确到分钟', withTime: true });

    await expect(page.getByText('分享星语海报').first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: '生成分享卡' }).click();

    // 弹层与海报卡渲染（二维码 dataURL 就绪）
    const card = page.locator('[data-testid="astrology-share-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator('img')).toBeVisible({ timeout: 20_000 });
    // 默认含昵称与大三要素
    await expect(card.getByText('星野', { exact: false })).toBeVisible();
    await expect(card.getByText('水瓶座')).toBeVisible();

    // 匿名切换：昵称立即消失、别名出现
    await page.getByRole('radio', { name: '匿名' }).click();
    await expect(card.getByText('星盘主人')).toBeVisible();
    await expect(card.getByText('星野', { exact: true })).toHaveCount(0);

    // 仅主轴切换：大三要素区整体移除
    await page.getByRole('radio', { name: '仅主轴' }).click();
    await expect(card.getByText('水瓶座')).toHaveCount(0);

    // 脱敏：海报不含出生日期/地点
    await expect(card.getByText('1995')).toHaveCount(0);
    await expect(card.getByText('上海')).toHaveCount(0);
  });
});
