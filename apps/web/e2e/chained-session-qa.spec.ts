/**
 * Agent 链式会话模块真机验收（chained-session-qa.spec.ts）
 *
 * 遵循 docs/agents/qa-workflow.md 规范：
 * - 验证 TC-01：开启 Agent 模式、水合就绪锚点、提示条展示与截图落盘；
 * - 验证 TC-02：Agent 模式对话请求发送、界面状态与截图落盘。
 */

import { test, expect } from '@playwright/test';
import { seedFixedDevice } from './fixtures';
import * as path from 'node:path';
import * as fs from 'node:fs';

const SCREENSHOTS_DIR = path.resolve('../../.scratch/chained-message-session/screenshots');

test.describe('Agent 链式会话模块真机验收', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
    await seedFixedDevice(page);
  });

  test('TC-01 开启 Agent 模式并验证状态', async ({ page }) => {
    await page.goto('/chat');
    const input = page.getByPlaceholder('输入消息…');
    await expect(input).toBeVisible({ timeout: 15_000 });

    const agentBtn = page.getByRole('button', { name: /Agent 工具调用/i });
    await expect(agentBtn).toBeVisible();

    const isPressed = (await agentBtn.getAttribute('aria-pressed')) === 'true';
    if (!isPressed) {
      await agentBtn.click();
    }
    await expect(agentBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('agent-mode-notice')).toBeVisible();

    // 截取第 1 张图：Agent 模式已开启
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-agent-mode-on.png'),
    });
  });

  test('TC-02 Agent 模式交互与链式状态驱动', async ({ page }) => {
    await page.goto('/chat');
    const input = page.getByPlaceholder('输入消息…');
    await expect(input).toBeVisible({ timeout: 15_000 });

    const agentBtn = page.getByRole('button', { name: /Agent 工具调用/i });
    const isPressed = (await agentBtn.getAttribute('aria-pressed')) === 'true';
    if (!isPressed) {
      await agentBtn.click();
    }
    await expect(agentBtn).toHaveAttribute('aria-pressed', 'true');

    await input.fill('搜索一下最新的 AI 技术进展，简要列出两点');
    await page.getByRole('button', { name: '发送' }).click();

    // 等待消息进入界面与链路流式处理
    await page.waitForTimeout(4000);

    // 截取第 2 张图：Agent 交互执行中
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-chained-agent-chat.png'),
    });
  });
});
