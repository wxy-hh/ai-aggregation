'use client';

/**
 * 我的工具工作台 (/tools)
 *
 * 页面契约：
 * 1. 承载两类供给侧扩展配置——私有 Webhook 工具与个人远程 MCP 服务器，二者同属
 *    「给智能体接外部能力」，由同一批用户在同一段旅程中配置，故合并为一个工作台。
 * 2. 两个分区各带稳定锚点（webhook / mcp），对话页可用工具面板的跳转链接携带锚点，
 *    使「从对话找到配置」一跳到位。
 * 3. 页面采用客户端动态导入分包；原生 hash 定位在组件挂载前不生效，故由本组件
 *    在挂载后主动滚动定位到目标分区。
 * 4. 锚点定位避让移动端固定顶栏，滚动动效尊重 prefers-reduced-motion 偏好。
 */

import React, { useCallback, useEffect, useRef } from 'react';

import { ToolsSection } from './tools-section';
import { McpServersSection } from './mcp-servers-section';

/** 分区锚点标识：与对话页跳转链接的 hash 值一一对应 */
export const TOOLS_SECTION_ANCHOR = {
  webhook: 'webhook',
  mcp: 'mcp',
} as const;

export type ToolsSectionAnchor = (typeof TOOLS_SECTION_ANCHOR)[keyof typeof TOOLS_SECTION_ANCHOR];

/**
 * 锚点落位时预留的顶部偏移：移动端固定顶栏高度约 4.5rem（含安全区），留出余量避免标题被遮挡
 */
const ANCHOR_SCROLL_OFFSET = 96;

/** 判断 hash 是否指向工作台内的分区锚点 */
function parseAnchor(hash: string): ToolsSectionAnchor | null {
  const value = hash.replace(/^#/, '');
  if (value === TOOLS_SECTION_ANCHOR.webhook) return TOOLS_SECTION_ANCHOR.webhook;
  if (value === TOOLS_SECTION_ANCHOR.mcp) return TOOLS_SECTION_ANCHOR.mcp;
  return null;
}

export function ToolsWorkspace() {
  const lastAnchoredRef = useRef<ToolsSectionAnchor | null>(null);
  const anchorTokenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * 把目标分区滚动到可视区。
   *
   * 时序：动态导入的工作区挂载时，工具与 MCP 板块的卡片内容尚未渲染完成，
   * 此刻量到的分区坐标不是最终位置。因此逐帧重试，直到容器可滚动
   * （内容已撑开）或重试用尽，再执行落位。
   */
  /**
   * 把目标分区滚动到可视区。
   *
   * 时序：动态导入的工作区挂载时，工具与 MCP 板块的卡片内容尚未渲染完成，
   * 此刻量到的分区坐标不是最终位置。因此逐帧重试，直到目标坐标连续若干帧不变
   * （列表加载是异步的，加载期间坐标会持续变化）。
   *
   * 每次定位持有一个令牌：组件卸载或锚点切换时旧令牌失效，未完成的帧回调随即停止，
   * 不会在已卸载的节点上继续空转，也不会让两次定位相互覆盖滚动位置。
   */
  const scrollToAnchor = useCallback((anchor: ToolsSectionAnchor) => {
    // 同一锚点不重复定位：挂载定位与 hashchange 监听可能在同一锚点上都触发
    if (lastAnchoredRef.current === anchor) return;

    const target = document.getElementById(anchor);
    if (!target) return;

    lastAnchoredRef.current = anchor;

    // 新令牌作废上一次未完成的定位
    const token = ++anchorTokenRef.current;

    // 减动效偏好须在本次滚动发生时同步判定：useReducedMotion 的初始状态恒为 false，
    // 其自身 effect 的异步更新要到下一次渲染才生效，直接读它会让锚点跳转
    // 在 prefers-reduced-motion: reduce 下仍走平滑滚动（DESIGN.md §6.5）。
    // 这里不引入 useReducedMotion：它的状态更新会触发一次重渲染，干扰本次定位。
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    // 桌面端（lg 断点及以上）main 是 h-screen + overflow-hidden，内容滚动发生在页面
    // 自带的滚动容器内；移动端 main 为 min-h-screen，容器随文档流撑开，滚动的是 window。
    // 用断点而非「容器是否溢出」判定：定位执行时容器可能尚未完成布局，
    // 此时 scrollHeight 与 clientHeight 同为 0，会把桌面端误判成移动端而滚错对象。
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const container = scrollRef.current;

    // 桌面端但容器已不可用（卸载竞态）：不做任何滚动，也不落到移动端分支
    if (isDesktop && !container) return;

    /** 滚动宿主：桌面端是页面自带的滚动容器，移动端是窗口 */
    const host = isDesktop
      ? {
          isScrollable: () => {
            const element = scrollRef.current;
            return element ? element.scrollHeight > element.clientHeight : false;
          },
          maxScroll: () => {
            const element = scrollRef.current;
            return element ? Math.max(element.scrollHeight - element.clientHeight, 0) : 0;
          },
          targetTop: () => {
            const element = scrollRef.current;
            if (!element) return 0;
            return (
              target.getBoundingClientRect().top - element.getBoundingClientRect().top
            );
          },
          scrollTop: () => scrollRef.current?.scrollTop ?? 0,
          scrollTo: (top: number) => {
            scrollRef.current?.scrollTo({ top, behavior: scrollBehavior });
          },
        }
      : {
          isScrollable: () => document.documentElement.scrollHeight > window.innerHeight,
          maxScroll: () =>
            Math.max(document.documentElement.scrollHeight - window.innerHeight, 0),
          targetTop: () => target.getBoundingClientRect().top,
          scrollTop: () => window.scrollY,
          scrollTo: (top: number) => {
            window.scrollTo({ top, behavior: scrollBehavior });
          },
        };

    const MAX_ATTEMPTS = 300; // 约 5 秒，覆盖列表接口往返与渲染
    const STABLE_FRAMES = 5; // 连续若干帧坐标不变才视为布局已稳定
    let attempts = 0;
    let previousTargetTop: number | null = null;
    let stableFrames = 0;

    const attempt = () => {
      // 令牌失效（组件卸载或锚点已切换）或目标已脱离文档：立即停止
      if (anchorTokenRef.current !== token || !target.isConnected) return;

      const targetTop = host.targetTop();
      stableFrames = previousTargetTop === targetTop ? stableFrames + 1 : 0;
      previousTargetTop = targetTop;

      const ready = host.isScrollable() && stableFrames >= STABLE_FRAMES;
      if (!ready && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        requestAnimationFrame(attempt);
        return;
      }

      const top = targetTop + host.scrollTop() - ANCHOR_SCROLL_OFFSET;
      host.scrollTo(Math.min(Math.max(top, 0), host.maxScroll()));
    };

    requestAnimationFrame(attempt);
  }, []);


  // 挂载后按 hash 主动定位到目标分区（原生锚点在动态导入的客户端组件挂载前不会生效）
  //
  // 这里不在 effect 的 cleanup 里取消帧回调：StrictMode 下 effect 会 mount→cleanup→mount
  // 双执行，cleanup 取消帧回调后，「已安排定位」标记已被置位，第二次执行又被守卫跳过，
  // 定位将彻底不执行。该回调是一次性且无副作用，无需清理。
  useEffect(() => {
    const anchor = parseAnchor(window.location.hash);
    if (!anchor) return;
    scrollToAnchor(anchor);
  }, [scrollToAnchor]);

  // 页面内切换锚点时同样定位：浏览器原生 hash 跳转不适用于本页的自定义滚动容器
  useEffect(() => {
    const handleHashChange = () => {
      const anchor = parseAnchor(window.location.hash);
      if (!anchor) return;
      scrollToAnchor(anchor);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [scrollToAnchor]);

  return (
    // 桌面端 main 是 h-screen + overflow-hidden，页面须自带滚动容器（与个人中心同口径）
    <div
      ref={scrollRef}
      className="relative isolate min-h-full w-full overflow-y-auto overflow-x-hidden custom-scrollbar bg-background px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:py-10"
    >
      {/* 环境光斑：保证玻璃卡后方「有色可磨」（DESIGN.md §4.1「折射内容统一」），与个人中心同款 */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(980px 540px at 14% 8%, rgba(219,234,254,0.50) 0%, rgba(219,234,254,0.20) 40%, transparent 72%),' +
            'radial-gradient(1040px 580px at 84% 16%, rgba(233,213,255,0.30) 0%, rgba(233,213,255,0.12) 35%, transparent 68%)',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(900px 460px at 18% 10%, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.05) 34%, rgba(37,99,235,0) 70%),' +
            'radial-gradient(960px 520px at 80% 18%, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.04) 30%, rgba(99,102,241,0) 62%)',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/40 via-white/15 to-transparent dark:from-blue-500/[0.08] dark:via-transparent" />

      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col">
        {/* 页头：与个人中心同口径的扁平处理，不与大内容卡争夺视觉重心 */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-[28px] font-bold tracking-tight text-foreground sm:text-[32px]">
              我的工具
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              接入私有 Webhook 接口与远程 MCP 服务，扩展智能体在对话中可自主调用的外部能力。
            </p>
          </div>
        </header>

        <div className="mt-8 space-y-6">
          {/* 分区一：Webhook 工具 */}
          <section id={TOOLS_SECTION_ANCHOR.webhook} className="scroll-mt-24">
            <ToolsSection />
          </section>

          {/* 分区二：MCP 服务 */}
          <section id={TOOLS_SECTION_ANCHOR.mcp} className="scroll-mt-24">
            <McpServersSection />
          </section>
        </div>
      </div>
    </div>
  );
}
