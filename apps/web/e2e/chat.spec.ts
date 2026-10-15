import { test, expect, type Page } from '@playwright/test';
import { seedFixedDevice } from './fixtures';

/**
 * 冒烟测试：智能对话主链路（P0）。
 *
 * 覆盖：进入 /chat → 输入消息 → 发送 → 用户消息上屏 → 流式 AI 回复完整渲染。
 *
 * 打桩口径（不打真实 LLM）：用 Playwright 网络拦截替换 POST /api/chat，返回确定性
 * SSE 帧（text-delta + done），帧格式与 packages/shared/src/chat-stream-contract.ts 一致；
 * 客户端要求流以 done / error 结尾，否则报「回答流被中断」（lib/utils/chat-stream.ts）。
 * 认证走真实匿名设备认证（固定设备指纹，见 fixtures.ts）。
 */

/** 桩文案：只用于链路与可见状态断言，真实措辞由模型产出（不打真实 API） */
const AI_ANSWER = '这是一段桩回答。';

/** 聊天流桩：两个 text-delta + done 收尾（done 的 usage 可省略） */
async function stubChatStream(page: Page): Promise<void> {
  await page.route('**/api/chat', async (route) => {
    const frames = [
      { type: 'text-delta', text: AI_ANSWER },
      { type: 'done' },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
      body: frames,
    });
  });
}

test.describe('智能对话 · 冒烟', () => {
  // 减少动态：断言只等状态、不等动效
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await seedFixedDevice(page);
    await stubChatStream(page);
  });

  test('发送消息后流式回复完整渲染', async ({ page }) => {
    await page.goto('/chat');

    // 匿名认证就绪后输入框才可用，首屏渲染放宽超时到 15 秒
    const input = page.getByPlaceholder('输入消息…');
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill('你好，请介绍一下自己');
    await page.getByRole('button', { name: '发送' }).click();

    // 同一段文本会同时出现在侧栏会话项、会话标题与用户气泡，定位到气泡容器避免多义
    await expect(
      page.locator('div.whitespace-pre-wrap', { hasText: '你好，请介绍一下自己' })
    ).toBeVisible();
    await expect(page.getByText(AI_ANSWER)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('AI 助手').first()).toBeVisible();
  });

  test('空输入时发送按钮禁用', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder('输入消息…');
    await expect(input).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
  });
});
