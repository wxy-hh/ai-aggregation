import { test, expect } from '@playwright/test';
import { seedFixedDevice } from './fixtures';

/**
 * 冒烟测试：历史记录页（P0，纯客户端存储链路）。
 *
 * 覆盖：播种两条对话记录 → /history 列表渲染 → 页签筛选（对话有记录 / 图片空态）。
 *
 * 数据来源：Dexie/IndexedDB（库 ai-history-db，表 kv），页面不请求服务端 API
 * （stores/history-store.ts 经 createDexieStorage 持久化 ai-history-store）。
 * 播种利用适配器内置的 localStorage 一次性迁移（lib/storage/zustand-dexie-storage.ts）：
 * addInitScript 写入 localStorage，首次读取时自动搬进 IndexedDB 并删除原 key。
 * 记录形状见 src/types/history.ts，下列字段即卡片实际读取的最小集合。
 */

const CHAT_ITEMS = [
  {
    id: 'chat-e2e-1',
    type: 'chat',
    title: '帮我写一份周报',
    preview: '好的，这是周报框架……',
    date: '刚刚',
    createdAt: '2026-10-08T02:00:00.000Z',
    updatedAt: '2026-10-08T02:00:10.000Z',
    model: 'lite',
    provider: 'xunfei',
    messages: [
      { role: 'user', content: '帮我写一份周报' },
      { role: 'assistant', content: '好的，这是周报框架……' },
    ],
    tags: ['产品'],
  },
  {
    id: 'chat-e2e-2',
    type: 'chat',
    title: '季度复盘提纲',
    preview: '可以从目标达成、亮点与不足三方面展开……',
    date: '昨天',
    createdAt: '2026-10-07T02:00:00.000Z',
    updatedAt: '2026-10-07T02:00:10.000Z',
    model: 'lite',
    provider: 'xunfei',
    messages: [
      { role: 'user', content: '季度复盘提纲' },
      { role: 'assistant', content: '可以从目标达成、亮点与不足三方面展开……' },
    ],
    tags: [],
  },
];

test.describe('历史记录 · 冒烟', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await seedFixedDevice(page);
    // 播种两条对话记录（zustand persist 默认 version: 0，state 只放 items 即与 partialize 同形）
    await page.addInitScript((payload) => {
      window.localStorage.setItem('ai-history-store', payload);
    }, JSON.stringify({ state: { items: CHAT_ITEMS }, version: 0 }));
  });

  test('列表渲染与页签筛选', async ({ page }) => {
    await page.goto('/history');

    // 匿名认证 + IndexedDB 水合就绪后首屏渲染，放宽超时到 15 秒
    await expect(page.getByRole('heading', { name: /生成历史/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('2 条记录')).toBeVisible();
    await expect(page.getByRole('heading', { name: '帮我写一份周报' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '季度复盘提纲' })).toBeVisible();

    // 图片页签：无记录时给出可操作空态
    const tabs = page.getByTestId('history-tabs');
    await tabs.getByRole('button', { name: /^图片/ }).click();
    await expect(page.getByText('没有找到相关历史记录')).toBeVisible();

    // 对话页签：两条播种记录都在
    await tabs.getByRole('button', { name: /^对话/ }).click();
    await expect(page.getByRole('heading', { name: '帮我写一份周报' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '季度复盘提纲' })).toBeVisible();
  });
});
