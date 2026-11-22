/**
 * 路由重定向与纯多模态实验室集成测试
 *
 * 覆盖用例：TC05 (Covers US 10, 11)
 * 断言：
 * 1. next.config.ts 中 /destiny 与 /destiny/:path* 307 临时重定向至 /chat；
 * 2. middleware.ts 中站点根路径 / 请求重定向至 /chat；
 * 3. /labs 页面成功渲染 Agnes 文生图与智谱 CogVideoX 卡片，严禁命理排盘词汇。
 */

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import React from 'react';
import { render, screen } from '@testing-library/react';
import nextConfig from '../../next.config';
import { middleware } from '../middleware';
import LabsPage from '../app/labs/page';

// 模拟布局容器，隔离与测试无关的鉴权与侧边栏逻辑
vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'app-layout' }, children),
}));

describe('TC05: 命理旧路由 307 重定向与纯多模态实验室', () => {
  it('断言 1: next.config.ts 将 /destiny 与 /destiny/:path* 临时重定向至 /chat (HTTP 307)', async () => {
    expect(nextConfig.redirects).toBeDefined();
    const redirects = await nextConfig.redirects!();

    const destinyWildcard = redirects.find((r) => r.source === '/destiny/:path*');
    expect(destinyWildcard).toBeDefined();
    expect(destinyWildcard?.destination).toBe('/chat');
    expect(destinyWildcard?.permanent).toBe(false);

    const destinyExact = redirects.find((r) => r.source === '/destiny');
    expect(destinyExact).toBeDefined();
    expect(destinyExact?.destination).toBe('/chat');
    expect(destinyExact?.permanent).toBe(false);

    const homeRedirect = redirects.find((r) => r.source === '/home');
    expect(homeRedirect).toBeDefined();
    expect(homeRedirect?.destination).toBe('/chat');
    expect(homeRedirect?.permanent).toBe(false);
  });

  it('断言 2: 中间件对站点根路径 / 的已登录请求统一重定向至 /chat', () => {
    const authRequest = new NextRequest('http://localhost/');
    authRequest.cookies.set('refresh_token', 'test-session-token');
    const authResponse = middleware(authRequest);

    expect(authResponse.status).toBe(307);
    expect(authResponse.headers.get('location')).toBe('http://localhost/chat');

    const guestRequest = new NextRequest('http://localhost/');
    const guestResponse = middleware(guestRequest);

    expect(guestResponse.status).toBe(307);
    expect(guestResponse.headers.get('location')).toBe('http://localhost/login');
  });

  it('断言 3: /labs 页面渲染 Agnes 与 CogVideoX 实验卡片，且绝不包含命理排盘词汇', () => {
    const { container } = render(React.createElement(LabsPage));

    expect(screen.getByText('多模态实验室')).toBeDefined();
    expect(screen.getByText(/Agnes 文生图与灵感绘图/i)).toBeDefined();
    expect(screen.getByText(/智谱 CogVideoX 视频生成/i)).toBeDefined();

    const pageText = container.textContent || '';
    const forbiddenKeywords = ['八字', '紫微', '奇门', '占星', '算命', '排盘', '运势'];

    for (const keyword of forbiddenKeywords) {
      expect(pageText).not.toContain(keyword);
    }
  });
});
