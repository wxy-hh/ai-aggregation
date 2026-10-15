'use client';

/**
 * Chat 内可用工具面板与会话级临时启停（SessionToolsPanel）— ADR-0014 / 工单 02
 *
 * 规范与特性：
 * 1. 触发器入口（[data-testid="session-tools-trigger"]）：
 *    - 常驻 Agent 模式输入坞，展示可用工具数量徽标（[data-testid="session-tools-count"]）；
 *    - 触控热区严格保证 ≥44×44px（DESIGN.md §8.1）；
 * 2. 分端自适应交互：
 *    - 桌面端：轻量悬浮 Popover；
 *    - 移动端：底部升起 Drawer（带手势抓手条与平滑遮罩，支持点击与关闭按钮）；
 * 3. 分组呈现与白名单收敛：
 *    - 内置工具：严格受当前绑定的场景能力包（CapabilityPack）白名单限定，杜绝越权；
 *    - 用户自定义工具：作为扩展插槽呈现并支持按需临时勾选；
 * 4. 状态持久化与差异传参：
 *    - 启停即时同步至 chat-store 与 conversations-store，随会话写入 localStorage。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Globe,
  FileText,
  Image as ImageIcon,
  Webhook,
  X,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat-store';
import { getCapabilityPack } from '@repo/shared';
import {
  fetchAgentTools,
  type SanitizedAgentTool,
} from '@/lib/api/agent-tools';
import { useIsMobile } from '@/hooks/use-is-mobile';

/** 平台内置工具元数据定义 */
export interface BuiltinToolDefinition {
  key: string;
  name: string;
  description: string;
  icon: 'Globe' | 'FileText' | 'Image';
}

export const BUILTIN_TOOLS_DEFINITIONS: Record<string, BuiltinToolDefinition> = {
  web_search: {
    key: 'web_search',
    name: '联网搜索',
    description: '实时搜索权威资讯与最新公开信息',
    icon: 'Globe',
  },
  web_fetch: {
    key: 'web_fetch',
    name: '网页深度阅读',
    description: '深度抓取网页正文并提炼结构化事实',
    icon: 'FileText',
  },
  image_generate: {
    key: 'image_generate',
    name: 'AI 图像生成',
    description: '根据文字描述构思并生成高质量配图',
    icon: 'Image',
  },
};

/** 计算工具项的展现模型 */
export interface ComputedToolItem {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  isBuiltin: boolean;
  iconType?: string;
}

export interface AvailableToolsCalculationResult {
  builtinTools: ComputedToolItem[];
  userTools: ComputedToolItem[];
  enabledCount: number;
}

/**
 * 纯函数计算：当前能力包约束下的可用工具列表与启停状态（测试接缝）
 */
export function getAvailableToolsList(options: {
  capabilityPackKey?: string | null;
  toolOverrides: Record<string, boolean>;
  userTools: SanitizedAgentTool[];
}): AvailableToolsCalculationResult {
  const { capabilityPackKey, toolOverrides, userTools: rawUserTools } = options;
  const pack = getCapabilityPack(capabilityPackKey);

  // 1. 内置工具：受能力包白名单限定；未选包时开放全量 3 个内置能力
  const allowedBuiltinKeys = pack
    ? pack.toolWhitelist
    : ['web_search', 'web_fetch', 'image_generate'];

  const builtinTools = allowedBuiltinKeys
    .map((key) => {
      const def = BUILTIN_TOOLS_DEFINITIONS[key];
      if (!def) return null;
      // 会话级临时覆盖：未显式设为 false 则默认启用
      const isEnabled = toolOverrides[key] !== false;
      const item: ComputedToolItem = {
        key: def.key,
        name: def.name,
        description: def.description,
        enabled: isEnabled,
        isBuiltin: true,
        iconType: def.icon,
      };
      return item;
    })
    .filter((t): t is ComputedToolItem => t !== null);

  // 2. 用户自定义 Webhook 工具插槽：保留所有已登记工具，默认按后台启用态或会话覆盖判定
  const userTools: ComputedToolItem[] = (rawUserTools || []).map((tool) => {
    // 若在后台已停用，则默认为 false；若在当前会话显式覆盖，则以会话覆盖为准
    const override =
      toolOverrides[tool.callName] !== undefined
        ? toolOverrides[tool.callName]
        : toolOverrides[tool.id];
    const isEnabled = override !== undefined ? override : tool.enabled !== false;

    return {
      key: tool.callName || tool.id,
      name: tool.name,
      description: tool.description || `自定义 Webhook 扩展 (${tool.method})`,
      enabled: isEnabled,
      isBuiltin: false,
      iconType: 'Webhook',
    };
  });

  // 3. 统计当前会话所有处于启用态的工具总数
  const enabledBuiltin = builtinTools.filter((t) => t.enabled).length;
  const enabledUser = userTools.filter((t) => t.enabled).length;
  const enabledCount = enabledBuiltin + enabledUser;

  return {
    builtinTools,
    userTools,
    enabledCount,
  };
}

export interface SessionToolsPanelProps {
  /** 可强制指定分端模式（用于测试或独立视口覆盖） */
  isMobile?: boolean;
  /** 触发按钮外部定制样式 */
  className?: string;
  /** 外部直接注入用户自定义工具列表（避免上层组件重复网络请求） */
  userTools?: SanitizedAgentTool[];
}

export function SessionToolsPanel({
  isMobile: isMobileProp,
  className,
  userTools: userToolsProp,
}: SessionToolsPanelProps) {
  const detectedIsMobile = useIsMobile();
  const isMobile = isMobileProp !== undefined ? isMobileProp : detectedIsMobile;

  const [isOpen, setIsOpen] = useState(false);
  const [internalUserTools, setInternalUserTools] = useState<SanitizedAgentTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  // 从 chat-store 读取当前能力包与工具覆盖
  const activeCapabilityPackKey = useChatStore((s) => s.activeCapabilityPackKey);
  const toolOverrides = useChatStore((s) => s.toolOverrides);
  const setToolOverride = useChatStore((s) => s.setToolOverride);

  const pack = useMemo(
    () => getCapabilityPack(activeCapabilityPackKey),
    [activeCapabilityPackKey]
  );

  // 若外部未传入 userToolsProp，才发起网络请求
  useEffect(() => {
    if (userToolsProp !== undefined) return;
    let cancelled = false;
    async function load() {
      try {
        setLoadingTools(true);
        const tools = await fetchAgentTools();
        if (!cancelled) {
          setInternalUserTools(tools || []);
        }
      } catch {
        if (!cancelled) {
          setInternalUserTools([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTools(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userToolsProp]);

  const effectiveRawUserTools = userToolsProp !== undefined ? userToolsProp : internalUserTools;

  // 响应式计算可用工具集与计数
  const { builtinTools, userTools, enabledCount } = useMemo(() => {
    return getAvailableToolsList({
      capabilityPackKey: activeCapabilityPackKey,
      toolOverrides,
      userTools: effectiveRawUserTools,
    });
  }, [activeCapabilityPackKey, toolOverrides, effectiveRawUserTools]);

  const handleToggle = useCallback(
    (key: string, currentEnabled: boolean) => {
      setToolOverride(key, !currentEnabled);
    },
    [setToolOverride]
  );

  const renderToolIcon = (iconType?: string) => {
    switch (iconType) {
      case 'Globe':
        return <Globe className="h-4 w-4 text-blue-500" />;
      case 'FileText':
        return <FileText className="h-4 w-4 text-emerald-500" />;
      case 'Image':
        return <ImageIcon className="h-4 w-4 text-purple-500" />;
      default:
        return <Webhook className="h-4 w-4 text-amber-500" />;
    }
  };

  /** 面板主体内容渲染函数 */
  const renderPanelContent = () => (
    <div className="flex flex-col gap-4">
      {/* 头部标题与场景包上下文 */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              当前会话可用工具
            </h3>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {pack ? (
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-blue-500 inline" />
                已受「{pack.name}」白名单限定 ({pack.maxSteps} 步上限)
              </span>
            ) : (
              '通用 Agent 模式 · 可会话级临时开启或关闭特定工具'
            )}
          </p>
        </div>

        {isMobile && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="session-tools-close"
            onClick={() => setIsOpen(false)}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 h-11 w-11 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="关闭面板"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 分组一：平台内置工具 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            平台内置工具
          </span>
          <span className="text-[11px] text-slate-400">
            {builtinTools.filter((t) => t.enabled).length}/{builtinTools.length} 已启用
          </span>
        </div>

        <div className="space-y-1">
          {builtinTools.map((tool) => (
            <div
              key={tool.key}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors',
                'min-h-[44px]', // 触控热区严格保证 ≥44px
                tool.enabled
                  ? 'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70'
                  : 'bg-slate-50/30 opacity-60 hover:opacity-80 dark:bg-slate-800/20'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs border border-slate-100 dark:border-slate-700 dark:bg-slate-800">
                  {renderToolIcon(tool.iconType)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {tool.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {tool.description}
                  </p>
                </div>
              </div>

              <div className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2">
                <Switch
                  data-testid={`tool-switch-${tool.key}`}
                  checked={tool.enabled}
                  onCheckedChange={() => handleToggle(tool.key, tool.enabled)}
                  aria-label={`开关 ${tool.name}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 分组二：我的自定义扩展工具 */}
      <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            我的自定义工具 (Webhook)
          </span>
          <Link
            href="/profile"
            onClick={() => setIsOpen(false)}
            className="group flex items-center gap-0.5 text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <span>管理工具</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {userTools.length > 0 ? (
          <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
            {userTools.map((tool) => (
              <div
                key={tool.key}
                className={cn(
                  'flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors',
                  'min-h-[44px]',
                  tool.enabled
                    ? 'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70'
                    : 'bg-slate-50/30 opacity-60 hover:opacity-80 dark:bg-slate-800/20'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs border border-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    <Webhook className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate block">
                      {tool.name}
                    </span>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {tool.description}
                    </p>
                  </div>
                </div>

                <div className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2">
                  <Switch
                    data-testid={`tool-switch-${tool.key}`}
                    checked={tool.enabled}
                    onCheckedChange={() => handleToggle(tool.key, tool.enabled)}
                    aria-label={`开关 ${tool.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center dark:border-slate-800">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {loadingTools ? '正在加载自定义工具…' : '暂无配置 Webhook 工具'}
            </p>
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <span>前往个人中心添加</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  // 触发按钮元素（包含徽标角标）
  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="session-tools-trigger"
      aria-label="查看与设置可用工具"
      onClick={() => setIsOpen((prev) => !prev)}
      className={cn(
        'group relative min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-9 px-2 sm:px-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 select-none transition-all',
        'hover:bg-slate-100/80 dark:hover:bg-slate-800/60 active:scale-95',
        isOpen && 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">可用工具</span>
        <Badge
          data-testid="session-tools-count"
          variant="secondary"
          className="ml-0.5 h-4.5 min-w-[18px] px-1 text-[10px] font-semibold leading-none rounded-full bg-blue-100/80 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0"
        >
          {enabledCount}
        </Badge>
      </div>
    </Button>
  );

  // 移动端：底部升起 Drawer（抽屉）
  if (isMobile) {
    return (
      <>
        {triggerButton}
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* 半透明遮罩层 */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-fast"
              onClick={() => setIsOpen(false)}
            />
            {/* 底部抽屉容器 */}
            <div
              data-testid="session-tools-drawer"
              className={cn(
                'relative z-50 w-full max-w-lg rounded-t-[28px] border-t border-white/50 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95',
                'animate-in slide-in-from-bottom duration-fast ease-out-expo'
              )}
            >
              {/* 顶部居中手势抓手 */}
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
              {renderPanelContent()}
            </div>
          </div>
        )}
      </>
    );
  }

  // 桌面端：轻量 Popover 悬浮浮层
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-80 rounded-2xl border-slate-200/80 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-fast"
      >
        {renderPanelContent()}
      </PopoverContent>
    </Popover>
  );
}
