'use client';

/**
 * 创建工具三入口选择弹层（工单 05 / spec §E2）
 *
 * 核心功能与规格：
 * 1. 提供「从模板创建 / 粘贴 cURL 导入 / 手动填写」三入口；
 * 2. 移动端采用底部抽屉形态，桌面端为居中对话框（DESIGN.md §8.4）；
 * 3. 模板入口展示飞书群机器人与钉钉群机器人，选中后回传模板实体；
 * 4. cURL 入口当前展示占位态（工单 06 填充真实解析）；
 * 5. 手动填写直接进入空白表单；
 * 6. 交互热区 ≥44px，支持键盘导航与安全区内边距。
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Terminal,
  Sliders,
  ChevronRight,
  ArrowLeft,
  X,
  Bot,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DIALOG_OVERLAY } from './profile-shell';
import {
  TOOL_TEMPLATE_LIST,
  type ToolTemplate,
} from './profile-tool-templates';

type EntryStep = 'entry_selection' | 'template_selection' | 'curl_placeholder';

interface ProfileToolEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectTemplate: (template: ToolTemplate) => void;
}

export function ProfileToolEntryModal({
  open,
  onOpenChange,
  onSelectManual,
  onSelectTemplate,
}: ProfileToolEntryModalProps) {
  const [step, setStep] = useState<EntryStep>('entry_selection');

  // 弹层打开或关闭时，自动重置回初始三入口状态
  useEffect(() => {
    if (open) {
      setStep('entry_selection');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        contentAnimation="none"
        showClose={false}
        overlayClassName={DIALOG_OVERLAY}
        className={cn(
          // 移动端（lg 以下）：底部升起抽屉；lg 及以上：居中对话框（DESIGN.md §8.4）
          'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden p-0',
          'rounded-t-[28px] rounded-b-none border border-white/70 pb-[env(safe-area-inset-bottom)]',
          'bg-white/95 backdrop-blur-2xl backdrop-saturate-150',
          'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(59,130,246,0.15)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'duration-300',
          'lg:inset-x-auto lg:bottom-auto lg:left-[50%] lg:top-[50%] lg:w-[calc(100vw-2rem)] lg:max-w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2',
          'lg:rounded-[24px] lg:pb-0',
          'lg:data-[state=open]:slide-in-from-left-1/2 lg:data-[state=open]:slide-in-from-top-[48%] lg:data-[state=open]:zoom-in-95',
          'lg:data-[state=closed]:slide-out-to-left-1/2 lg:data-[state=closed]:slide-out-to-top-[48%] lg:data-[state=closed]:zoom-out-95',
          'dark:border-white/10 dark:bg-slate-900/95'
        )}
      >
        {/* 顶部抓手（移动端可见） */}
        <div className="flex justify-center pt-3 lg:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-900/15 dark:bg-white/20" />
        </div>

        {/* 头部区域 */}
        <div className="border-b border-slate-200/60 px-5 py-4 sm:px-7 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {step !== 'entry_selection' && (
                <button
                  type="button"
                  onClick={() => setStep('entry_selection')}
                  aria-label="返回上一步"
                  className="mr-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <DialogTitle className="font-[var(--font-space-grotesk)] text-lg font-bold tracking-tight text-[#0F172A] dark:text-white">
                  {step === 'entry_selection' && '新建自定义工具'}
                  {step === 'template_selection' && '选择工具模板'}
                  {step === 'curl_placeholder' && '粘贴 cURL 导入'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  {step === 'entry_selection' && '请选择创建路径，快速完成 AI 智能体工具接入'}
                  {step === 'template_selection' && '预置开箱即用模板，用户仅需提供 Webhook 网址'}
                  {step === 'curl_placeholder' && '即将支持从 cURL 命令自动提取 URL 与参数'}
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭弹层"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 主体内容视图区 */}
        <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-7 custom-scrollbar">
          {/* 状态 1：三入口主列表 */}
          {step === 'entry_selection' && (
            <div className="space-y-3.5">
              {/* 入口 1：从模板创建 */}
              <button
                type="button"
                onClick={() => setStep('template_selection')}
                className={cn(
                  'group flex w-full items-start gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all',
                  'hover:border-blue-500/50 hover:bg-blue-50/30 hover:shadow-md',
                  'active:scale-[0.99]',
                  'dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-blue-400/40 dark:hover:bg-blue-500/[0.06]'
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      从模板创建
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                      推荐
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                    预置飞书、钉钉群机器人配置，填入 Webhook 链接即可使用
                  </p>
                </div>
                <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
              </button>

              {/* 入口 2：粘贴 cURL 导入 */}
              <button
                type="button"
                onClick={() => setStep('curl_placeholder')}
                className={cn(
                  'group flex w-full items-start gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all',
                  'hover:border-purple-500/50 hover:bg-purple-50/30 hover:shadow-md',
                  'active:scale-[0.99]',
                  'dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-purple-400/40 dark:hover:bg-purple-500/[0.06]'
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:bg-purple-400/10 dark:text-purple-300">
                  <Terminal className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-400">
                      粘贴 cURL 导入
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      即将支持
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                    粘贴 cURL 命令自动提取 URL、参数与鉴权头
                  </p>
                </div>
                <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-purple-500" />
              </button>

              {/* 入口 3：手动填写 */}
              <button
                type="button"
                onClick={onSelectManual}
                className={cn(
                  'group flex w-full items-start gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all',
                  'hover:border-slate-400/60 hover:bg-slate-50/50 hover:shadow-md',
                  'active:scale-[0.99]',
                  'dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.06]'
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300">
                  <Sliders className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-slate-900 dark:text-white dark:group-hover:text-slate-100">
                    手动填写
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                    从空白表单开始自定义请求方法、URL、参数与鉴权信息
                  </p>
                </div>
                <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </button>
            </div>
          )}

          {/* 状态 2：模板选择 */}
          {step === 'template_selection' && (
            <div className="space-y-3.5">
              {TOOL_TEMPLATE_LIST.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  className={cn(
                    'group flex w-full items-start gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all',
                    'hover:border-blue-500/50 hover:bg-blue-50/20 hover:shadow-md',
                    'active:scale-[0.99]',
                    'dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-blue-400/40 dark:hover:bg-blue-500/[0.06]'
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[#0F172A] group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                        {tpl.title}
                      </h4>
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        POST
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                      {tpl.subtitle}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8] dark:text-slate-500">
                      <span>预置参数：</span>
                      {tpl.params.map((p) => (
                        <span
                          key={p.name}
                          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-white/10 dark:text-slate-300"
                        >
                          {p.name} (string/必填)
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                </button>
              ))}
            </div>
          )}

          {/* 状态 3：cURL 占位视图（工单 06 填充解析） */}
          {step === 'curl_placeholder' && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 p-6 text-center dark:border-white/10 sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:bg-purple-400/10 dark:text-purple-300">
                <Terminal className="h-6 w-6" />
              </span>
              <h4 className="mt-4 text-base font-bold text-[#0F172A] dark:text-white">
                cURL 一键导入即将支持
              </h4>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                支持自动解析 cURL 命令行中的 URL、请求方法、鉴权 Header 及请求体参数，敬请期待。
              </p>

              {/*
                TODO(工单 06): cURL 导入解析实现
                此处将在工单 06 接入 parseCurl 纯函数模块，包含 8KB 输入上限、安全红线与字段映射
              */}

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('entry_selection')}
                  className="h-10 rounded-xl px-4 text-xs font-semibold"
                >
                  返回上一步
                </Button>
                <Button
                  type="button"
                  onClick={onSelectManual}
                  className="h-10 rounded-xl px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
                >
                  改为手动填写
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
