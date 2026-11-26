'use client';

/**
 * 个人中心的「我的工具」静态入口卡片
 *
 * 设计约束（见 docs/features/2026-11-25-tools-workbench-ia-migration/spec.md）：
 * 1. 纯静态展示——不展示配置计数、不展示统计、不发起任何工具或 MCP 相关接口请求，
 *    保证个人中心不因这两类配置迁移而增加加载成本。
 * 2. 整卡可点击跳转工具工作台（DESIGN.md §8.3：可点击卡片必须整卡是链接）。
 * 3. 无动作的悬停不制造假交互位移；此处为跳转卡，hover 仅做静默抬升。
 */

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SOLID_CARD } from '@/lib/constants/surface-styles';

export function ProfileToolsEntryCard() {
  return (
    <Link
      href="/tools"
      aria-label="前往我的工具工作台"
      className={cn(SOLID_CARD, 'flex items-center gap-4 p-6')}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
        <Wrench className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-xl font-bold tracking-tight text-foreground">
          我的工具
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">
          管理私有 Webhook 接口与 MCP 服务，扩展智能体可调用的外部能力
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
