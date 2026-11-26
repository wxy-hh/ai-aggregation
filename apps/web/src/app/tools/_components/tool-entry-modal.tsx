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
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DIALOG_OVERLAY } from '@/lib/constants/surface-styles';
import {
  TOOL_TEMPLATE_LIST,
  type ToolTemplate,
} from './tool-templates';
import {
  parseCurl,
  type ParsedCurlDto,
  MAX_CURL_INPUT_LENGTH,
} from '@/lib/agent/parse-curl';
import { validateWebhookUrl } from '@/lib/webhook/validation';
import { authFetch } from '@/lib/api/client';
import { toast } from 'sonner';

type EntryStep = 'entry_selection' | 'ai_draft' | 'template_selection' | 'curl_placeholder';

interface ToolEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectTemplate: (template: ToolTemplate) => void;
  onSelectCurl?: (dto: ParsedCurlDto) => void;
  onSelectDraft?: (draft: ParsedCurlDto & { securityWarning?: string }) => void;
}

type CurlParseState =
  | { status: 'idle' }
  | {
      status: 'success';
      dto: ParsedCurlDto;
      warnings: string[];
      urlValid: boolean;
      urlError?: string;
    }
  | { status: 'error'; reason: string };

export function ToolEntryModal({
  open,
  onOpenChange,
  onSelectManual,
  onSelectTemplate,
  onSelectCurl,
  onSelectDraft,
}: ToolEntryModalProps) {
  const [step, setStep] = useState<EntryStep>('entry_selection');
  const [curlInput, setCurlInput] = useState('');
  const [parseState, setParseState] = useState<CurlParseState>({ status: 'idle' });
  const [promptInput, setPromptInput] = useState('');
  const [generating, setGenerating] = useState(false);

  // 弹层打开或关闭时，自动重置回初始入口状态与解析输入
  useEffect(() => {
    if (open) {
      setStep('entry_selection');
      setCurlInput('');
      setPromptInput('');
      setParseState({ status: 'idle' });
    }
  }, [open]);

  // 调用自然语言生成草稿接口（ADR-0015 / 工单 03）
  const handleGenerateDraft = async () => {
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    setGenerating(true);
    try {
      const res = await authFetch('/api/agent-tools/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '生成配置草稿失败');
      }

      const json = await res.json();
      const draft = json.data.draft;

      if (draft.securityWarning) {
        toast.warning(draft.securityWarning);
      } else {
        toast.success('配置草稿已生成，请核对信息');
      }

      onOpenChange(false);
      if (onSelectDraft) {
        onSelectDraft(draft);
      } else if (onSelectCurl) {
        onSelectCurl(draft);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '智能生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  // 执行 cURL 文本解析并立即跑 validateWebhookUrl 网址校验
  const handleParseCurl = () => {
    const trimmed = curlInput.trim();
    if (!trimmed) {
      setParseState({
        status: 'error',
        reason: '无法识别，请手动填写',
      });
      return;
    }

    const result = parseCurl(trimmed);
    if (!result.ok) {
      setParseState({
        status: 'error',
        reason: result.reason,
      });
      return;
    }

    // 解析成功，立即运行 Webhook 网址合规性检查（https 协议与内网/敏感地址阻断）
    const urlValidation = validateWebhookUrl(result.dto.url);
    if (!urlValidation.ok) {
      setParseState({
        status: 'success',
        dto: result.dto,
        warnings: result.warnings,
        urlValid: false,
        urlError: urlValidation.reason,
      });
    } else {
      setParseState({
        status: 'success',
        dto: result.dto,
        warnings: result.warnings,
        urlValid: true,
      });
    }
  };

  // 确认使用当前解析出的配置进入表单抽屉
  const handleConfirmUseCurl = () => {
    if (parseState.status === 'success' && parseState.urlValid) {
      onSelectCurl?.(parseState.dto);
    }
  };

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
                  {step === 'ai_draft' && '智能生成工具配置'}
                  {step === 'template_selection' && '选择工具模板'}
                  {step === 'curl_placeholder' && '粘贴 cURL 导入'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  {step === 'entry_selection' && '请选择创建路径，快速完成 AI 智能体工具接入'}
                  {step === 'ai_draft' && '一句话描述需求，AI 自动生成名称、URL、方法与参数草稿'}
                  {step === 'template_selection' && '预置开箱即用模板，用户仅需提供 Webhook 网址'}
                  {step === 'curl_placeholder' && '自动解析 cURL 命令行中的 URL、鉴权头及请求参数'}
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
          {/* 状态 1：四入口主列表 */}
          {step === 'entry_selection' && (
            <div className="space-y-3.5">
              {/* 入口 0：智能生成 */}
              <button
                type="button"
                data-testid="entry-ai-draft"
                onClick={() => setStep('ai_draft')}
                className={cn(
                  'group flex w-full items-start gap-4 rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/70 to-indigo-50/40 p-4 text-left shadow-sm transition-all',
                  'hover:border-blue-500 hover:shadow-md active:scale-[0.99]',
                  'dark:border-blue-900/40 dark:bg-blue-950/20 dark:hover:border-blue-500/50'
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      智能生成
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      推荐
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                    一句话自然语言描述功能，AI 自动推导生成 URL、请求方法与参数结构
                  </p>
                </div>
                <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
              </button>

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
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      从模板创建
                    </h3>
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
                    <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:bg-purple-400/10 dark:text-purple-300">
                      自动解析
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

          {/* 状态 0：自然语言生成视图（ADR-0015 / 工单 03） */}
          {step === 'ai_draft' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="prompt-input"
                    className="text-xs font-semibold text-[#0F172A] dark:text-white"
                  >
                    功能需求描述 <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {promptInput.length} / 500 字符
                  </span>
                </div>
                <Textarea
                  id="prompt-input"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="描述您需要的工具功能，例如：输入快递单号查询物流轨迹..."
                  className="min-h-[120px] rounded-xl border-slate-200/90 bg-white p-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400">试一试：</span>
                  {['查询手机号码归属地和运营商', '城市天气预报查询', '查询快递物流跟踪轨迹'].map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => setPromptInput(hint)}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-white/10">
                <Button
                  type="button"
                  disabled={generating || !promptInput.trim()}
                  onClick={handleGenerateDraft}
                  className="h-11 min-w-[120px] rounded-xl shadow-sm"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    '生成配置'
                  )}
                </Button>
              </div>
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

          {/* 状态 3：cURL 真实解析与即时校验视图（工单 06） */}
          {step === 'curl_placeholder' && (
            <div className="space-y-4">
              {/* 输入区域 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="curl-input"
                    className="text-xs font-semibold text-[#0F172A] dark:text-white"
                  >
                    粘贴 cURL 命令行
                  </label>
                  <span
                    className={cn(
                      'text-[11px] font-mono',
                      curlInput.length > MAX_CURL_INPUT_LENGTH
                        ? 'font-bold text-rose-600 dark:text-rose-400'
                        : 'text-slate-400 dark:text-slate-500'
                    )}
                  >
                    {curlInput.length} / {MAX_CURL_INPUT_LENGTH} 字符
                  </span>
                </div>

                <Textarea
                  id="curl-input"
                  rows={4}
                  value={curlInput}
                  onChange={(e) => {
                    setCurlInput(e.target.value);
                    if (parseState.status !== 'idle') {
                      setParseState({ status: 'idle' });
                    }
                  }}
                  placeholder="例如：curl -X POST https://api.example.com/webhook -H &quot;Authorization: Bearer key_xxx&quot; -d '{&quot;msg&quot;:&quot;hello&quot;}'"
                  className={cn(
                    'font-mono text-xs leading-relaxed transition-all',
                    'border-slate-200/90 bg-white placeholder:text-slate-400',
                    'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
                    'dark:border-white/10 dark:bg-white/[0.04] dark:placeholder:text-slate-500'
                  )}
                />

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    支持自动提取方法、网址、鉴权头及顶层请求参数
                  </p>
                  <Button
                    type="button"
                    onClick={handleParseCurl}
                    disabled={
                      !curlInput.trim() ||
                      curlInput.length > MAX_CURL_INPUT_LENGTH
                    }
                    className="h-11 rounded-xl px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
                  >
                    解析并导入
                  </Button>
                </div>
              </div>

              {/* 状态 A：解析成功 */}
              {parseState.status === 'success' && (
                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <h4 className="text-sm font-bold text-[#0F172A] dark:text-white">
                        解析成功
                      </h4>
                    </div>
                    <span className="rounded-md bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                      {parseState.dto.method}
                    </span>
                  </div>

                  {/* URL 与即时网址校验提示 */}
                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 text-xs dark:border-white/10 dark:bg-slate-900/50">
                    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      请求目标 URL
                    </div>
                    <div className="mt-1 break-all font-mono font-medium text-[#0F172A] dark:text-slate-200">
                      {parseState.dto.url}
                    </div>

                    {!parseState.urlValid && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/80 p-2 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <div className="text-[11px] leading-relaxed">
                          <span className="font-semibold">网址校验提示：</span>
                          {parseState.urlError || '禁止访问内网或保留地址'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 提取到的鉴权头信息 */}
                  {parseState.dto.authHeaderName && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <KeyRound className="h-3.5 w-3.5 text-blue-500" />
                        <span>鉴权请求头：</span>
                        <code className="font-mono font-semibold text-[#0F172A] dark:text-white">
                          {parseState.dto.authHeaderName}
                        </code>
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        已提取凭证
                      </span>
                    </div>
                  )}

                  {/* 参数声明信息 */}
                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 text-xs dark:border-white/10 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      <span>已识别参数（{parseState.dto.params.length} 个）</span>
                    </div>
                    {parseState.dto.params.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {parseState.dto.params.map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-300"
                          >
                            {p.name} ({p.type})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-400">
                        无请求体参数
                      </div>
                    )}
                  </div>

                  {/* 警告列表（非鉴权头忽略、嵌套对象忽略等） */}
                  {parseState.warnings.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>导入提示与过滤记录</span>
                      </div>
                      <ul className="list-inside list-disc space-y-0.5 pl-1 leading-relaxed text-amber-700 dark:text-amber-400">
                        {parseState.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 底部按钮栏 */}
                  <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onSelectManual}
                      className="h-11 rounded-xl px-4 text-xs font-semibold"
                    >
                      改为手动填写
                    </Button>
                    <Button
                      type="button"
                      disabled={!parseState.urlValid}
                      onClick={handleConfirmUseCurl}
                      className="h-11 rounded-xl px-5 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
                    >
                      使用此配置
                    </Button>
                  </div>
                </div>
              )}

              {/* 状态 B：解析失败降级态 */}
              {parseState.status === 'error' && (
                <div className="space-y-3.5 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
                  <div className="flex flex-col items-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
                      <AlertCircle className="h-5 w-5" />
                    </span>
                    <h4 className="mt-2 text-sm font-bold text-rose-800 dark:text-rose-200">
                      解析失败
                    </h4>
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                      {parseState.reason}
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setParseState({ status: 'idle' })}
                      className="h-11 rounded-xl px-4 text-xs font-semibold"
                    >
                      重新输入
                    </Button>
                    <Button
                      type="button"
                      onClick={onSelectManual}
                      className="h-11 rounded-xl px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
                    >
                      改为手动填写
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
