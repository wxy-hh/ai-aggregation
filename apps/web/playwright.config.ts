import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置。
 *
 * - 用例放在 `e2e/` 目录，命名 `*.spec.ts`；vitest.config.ts 已排除该目录，不会与单元测试互相吞并。
 * - 本地运行时自动启动 `next dev -p 3030`；若 3030 端口已有 dev server 在跑则直接复用。
 *   注意：不经过 tooling/scripts/next-dev.mjs（它会自动挑空闲端口），e2e 需要端口确定。
 * - 项目按移动端优先设计，因此除桌面 Chromium 外同步覆盖 Pixel 7 移动视口。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm exec next dev -p 3030',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
