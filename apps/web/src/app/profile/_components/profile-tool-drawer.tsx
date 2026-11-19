'use client';

/**
 * 自定义 Webhook 工具新增/编辑抽屉表单（spec §4.3 / §4.6）
 *
 * 规范：
 * - 移动端底部抽屉升起（rounded-t-[28px] + 抓手 + 安全区），桌面端居中弹层（DESIGN.md §8.4）；
 * - 逐字段就地报错（支持前端本地校验与后端 zod flatten 错误映射）；
 * - 调用名自动建议并支持手动修改与就地校验；
 * - 鉴权头编辑态不回显明文，支持覆盖或一键清除；
 * - 参数列表动态增删行；
 * - 编辑态内嵌测试连接功能，三态反馈可见。
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  KeyRound,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  createAgentTool,
  updateAgentTool,
  testAgentToolConnection,
  AgentToolApiError,
  type SanitizedAgentTool,
  type ProbeConnectionResult,
} from '@/lib/api/agent-tools';
import type { WebhookParamItem } from '@/schemas/agent-tool.schema';
import type { ToolTemplate } from './profile-tool-templates';
import type { ParsedCurlDto } from '@/lib/agent/parse-curl';
import {
  suggestCallName,
  validateCallName,
  MAX_PARAMS_LIMIT,
} from './profile-tools-utils';
import { DIALOG_OVERLAY } from './profile-shell';
import { toast } from 'sonner';

interface ProfileToolDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool?: SanitizedAgentTool | null;
  initialTemplate?: ToolTemplate | null;
  initialPrefill?: (ParsedCurlDto & { securityWarning?: string }) | null;
  onSaved: (tool: SanitizedAgentTool) => void;
}

export function ProfileToolDrawer({
  open,
  onOpenChange,
  tool,
  initialTemplate,
  initialPrefill,
  onSaved,
}: ProfileToolDrawerProps) {
  const isEditing = Boolean(tool);

  // 表单核心字段状态
  const [name, setName] = useState('');
  const [callName, setCallName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('POST');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [authHeaderValue, setAuthHeaderValue] = useState('');
  const [clearAuthHeader, setClearAuthHeader] = useState(false);
  const [params, setParams] = useState<WebhookParamItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  // 调用前是否需要用户确认（AGENT-HITL-ACTION / ADR-0041）：默认随请求方法，用户手动拨动后不再被方法切换覆盖
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [isManualApproval, setIsManualApproval] = useState(false);

  // 用户是否手动编辑过调用名（手动编辑后不再随工具名自动变更）
  const [isManualCallName, setIsManualCallName] = useState(false);

  // 校验错误映射（字段名 -> 错误提示）
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // 测试连接状态
  const [testingStatus, setTestingStatus] = useState<
    'idle' | 'testing' | 'success' | 'failed'
  >('idle');
  const [testResult, setTestResult] = useState<ProbeConnectionResult | null>(null);

  // 打开抽屉或切换编辑对象时重置表单
  useEffect(() => {
    if (!open) {
      return;
    }
    if (tool) {
      setName(tool.name);
      setCallName(tool.callName);
      setDescription(tool.description);
      setUrl(tool.url);
      setMethod(tool.method);
      setAuthHeaderName(tool.authHeaderName || '');
      setAuthHeaderValue('');
      setClearAuthHeader(false);
      setParams(
        Array.isArray(tool.params)
          ? tool.params.map((p) => ({
              name: p.name,
              type: p.type,
              required: Boolean(p.required),
              description: p.description || '',
            }))
          : []
      );
      setEnabled(tool.enabled);
      setRequiresApproval(tool.requiresApproval);
      setIsManualApproval(true);
      setIsManualCallName(true);
    } else if (initialTemplate) {
      // 从模板创建：预填模板常量数据，URL 留待用户填写真实 Webhook 链接
      setName(initialTemplate.defaultName);
      setCallName(initialTemplate.defaultCallName);
      setDescription(initialTemplate.description);
      setUrl('');
      setMethod(initialTemplate.method);
      setAuthHeaderName(initialTemplate.authHeaderName || '');
      setAuthHeaderValue('');
      setClearAuthHeader(false);
      setParams(
        Array.isArray(initialTemplate.params)
          ? initialTemplate.params.map((p) => ({
              name: p.name,
              type: p.type,
              required: Boolean(p.required),
              description: p.description || '',
            }))
          : []
      );
      setEnabled(true);
      setRequiresApproval(initialTemplate.method === 'POST');
      setIsManualApproval(false);
      // 模板已预置合法英文调用名，标记为已确认，避免中文工具名自动转换为随机 tool_xxxx
      setIsManualCallName(true);
    } else if (initialPrefill) {
      // 从 cURL 导入：预填解析出的名称、调用名、描述、URL、方法、鉴权头明文及请求体参数
      setName(initialPrefill.name || 'cURL 导入工具');
      setCallName(initialPrefill.callName || '');
      setDescription(initialPrefill.description || '');
      setUrl(initialPrefill.url || '');
      setMethod(initialPrefill.method);
      setAuthHeaderName(initialPrefill.authHeaderName || '');
      setAuthHeaderValue(initialPrefill.authHeaderValue || '');
      setClearAuthHeader(false);
      setParams(
        Array.isArray(initialPrefill.params)
          ? initialPrefill.params.map((p) => ({
              name: p.name,
              type: p.type,
              required: Boolean(p.required),
              description: p.description || '',
            }))
          : []
      );
      setEnabled(true);
      setRequiresApproval(initialPrefill.method === 'POST');
      setIsManualApproval(false);
      setIsManualCallName(Boolean(initialPrefill.callName));
    } else {
      setName('');
      setCallName('');
      setDescription('');
      setUrl('https://');
      setMethod('POST');
      setAuthHeaderName('');
      setAuthHeaderValue('');
      setClearAuthHeader(false);
      setParams([]);
      setEnabled(true);
      setRequiresApproval(true);
      setIsManualApproval(false);
      setIsManualCallName(false);
    }
    setErrors({});
    setTestingStatus('idle');
    setTestResult(null);
  }, [open, tool, initialTemplate, initialPrefill]);

  // 切换请求方法：用户尚未手动调整确认开关时，开关随方法联动（POST 开 / GET 关）
  const handleMethodChange = (next: 'GET' | 'POST') => {
    setMethod(next);
    if (!isManualApproval) {
      setRequiresApproval(next === 'POST');
    }
  };

  // 工具名称修改时，自动生成调用名建议
  const handleNameChange = (val: string) => {
    setName(val);
    if (errors.name) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        return next;
      });
    }

    if (!isEditing && !isManualCallName) {
      const suggested = suggestCallName(val);
      if (suggested) {
        setCallName(suggested);
        if (errors.callName) {
          setErrors((prev) => {
            const next = { ...prev };
            delete next.callName;
            return next;
          });
        }
      }
    }
  };

  // 调用名修改
  const handleCallNameChange = (val: string) => {
    setCallName(val);
    setIsManualCallName(true);
    const err = validateCallName(val);
    if (err) {
      setErrors((prev) => ({ ...prev, callName: err }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.callName;
        return next;
      });
    }
  };

  // 添加参数行
  const handleAddParam = () => {
    setParams((prev) => [
      ...prev,
      {
        name: '',
        type: 'string',
        required: false,
        description: '',
      },
    ]);
  };

  // 更新参数行字段
  const handleUpdateParam = (
    index: number,
    field: keyof WebhookParamItem,
    value: unknown
  ) => {
    setParams((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // 删除参数行
  const handleRemoveParam = (index: number) => {
    setParams((prev) => prev.filter((_, i) => i !== index));
  };

  // 执行测试连接（表单内）
  const handleTestConnection = async () => {
    if (!tool?.id) return;
    setTestingStatus('testing');
    setTestResult(null);
    try {
      const res = await testAgentToolConnection(tool.id);
      setTestResult(res);
      setTestingStatus(res.reachable ? 'success' : 'failed');
    } catch {
      setTestingStatus('failed');
      setTestResult({
        reachable: false,
        reason: '探测请求失败，请稍后重试',
      });
    }
  };

  // 前端本地表单校验
  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = '请输入工具名称';
    } else if (name.trim().length > 50) {
      nextErrors.name = '工具名称不能超过 50 个字符';
    }

    const callNameErr = validateCallName(callName);
    if (callNameErr) {
      nextErrors.callName = callNameErr;
    }

    if (!description.trim()) {
      nextErrors.description = '请输入工具描述，告知模型何时调用';
    } else if (description.trim().length > 1000) {
      nextErrors.description = '工具描述不能超过 1000 个字符';
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      nextErrors.url = '请输入 Webhook 网址';
    } else if (!/^https:\/\//i.test(trimmedUrl)) {
      nextErrors.url = 'Webhook 网址必须以 https:// 开头';
    }

    // 鉴权头配对检查
    if (!isEditing) {
      if (authHeaderValue.trim() && !authHeaderName.trim()) {
        nextErrors.authHeaderName = '设置鉴权头取值时必须同时提供鉴权头名称';
      }
    } else {
      if (authHeaderValue.trim() && !authHeaderName.trim()) {
        nextErrors.authHeaderName = '设置鉴权头取值时必须同时提供鉴权头名称';
      }
    }

    // 参数检查
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!p.name.trim()) {
        nextErrors[`param_${i}_name`] = `第 ${i + 1} 个参数名不能为空`;
      } else if (!/^[a-zA-Z0-9_-]+$/.test(p.name.trim())) {
        nextErrors[`param_${i}_name`] = `第 ${i + 1} 个参数名仅支持英文字母、数字、下划线及连字符`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // 保存提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const sanitizedParams = params.map((p) => ({
        name: p.name.trim(),
        type: p.type,
        required: p.required,
        description: p.description?.trim() || '',
      }));

      if (isEditing && tool) {
        // 编辑模式：authHeaderValue 缺省保持不变，空串清除，非空重置
        let valueToSend: string | undefined = undefined;
        if (clearAuthHeader) {
          valueToSend = '';
        } else if (authHeaderValue.trim()) {
          valueToSend = authHeaderValue.trim();
        }

        const updated = await updateAgentTool(tool.id, {
          name: name.trim(),
          callName: callName.trim(),
          description: description.trim(),
          url: url.trim(),
          method,
          authHeaderName: authHeaderName.trim() || null,
          authHeaderValue: valueToSend,
          params: sanitizedParams,
          enabled,
          requiresApproval,
        });

        toast.success('工具更新成功');
        onSaved(updated);
        onOpenChange(false);
      } else {
        // 创建模式
        const created = await createAgentTool({
          name: name.trim(),
          callName: callName.trim(),
          description: description.trim(),
          url: url.trim(),
          method,
          authHeaderName: authHeaderName.trim() || null,
          authHeaderValue: authHeaderValue.trim() || null,
          params: sanitizedParams,
          enabled,
          requiresApproval,
        });

        toast.success('工具创建成功');
        onSaved(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof AgentToolApiError) {
        if (err.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(err.fieldErrors)) {
            if (msgs && msgs.length > 0) {
              mapped[key] = msgs[0];
            }
          }
          setErrors(mapped);
          toast.error('请检查表单中填写的错误项');
        } else {
          toast.error(err.message || '保存失败，请稍后重试');
        }
      } else {
        toast.error(err instanceof Error ? err.message : '保存失败');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        contentAnimation="none"
        // 头部已自带关闭按钮（44px 热区、与标题行对齐），隐藏 DialogContent 默认的
        // 右上角关闭钮，避免两个 × 叠印
        showClose={false}
        overlayClassName={DIALOG_OVERLAY}
        className={cn(
          // 移动端（lg 以下）：底部升起抽屉；lg 及以上：居中对话框
          'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden p-0',
          'rounded-t-[28px] rounded-b-none border border-white/70 pb-[env(safe-area-inset-bottom)]',
          'bg-white/95 backdrop-blur-2xl backdrop-saturate-150',
          'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(59,130,246,0.15)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'duration-300',
          'lg:inset-x-auto lg:bottom-auto lg:left-[50%] lg:top-[50%] lg:w-[calc(100vw-2rem)] lg:max-w-[620px] lg:-translate-x-1/2 lg:-translate-y-1/2',
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

        {/* 抽屉头部 */}
        <div className="border-b border-slate-200/60 px-5 py-4 sm:px-7 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                <Wrench className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-[var(--font-space-grotesk)] text-lg font-bold tracking-tight text-[#0F172A] dark:text-white">
                  {isEditing
                    ? '编辑自定义工具'
                    : initialTemplate
                    ? `从模板创建：${initialTemplate.title}`
                    : '添加自定义工具'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  {initialTemplate
                    ? '已预置请求方法、描述与消息参数，请填入您的 Webhook 网址'
                    : '配置 Webhook 接口供 AI 对话智能体自主调度与执行'}
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭抽屉"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 抽屉内容滚动区域 */}
        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 custom-scrollbar sm:px-7">
            {/* 安全提示条（ADR-0015） */}
            {initialPrefill?.securityWarning && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/90 p-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{initialPrefill.securityWarning}</span>
              </div>
            )}

            {/* 工具名称 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#475569] dark:text-slate-300">
                  工具名称 <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-[#94A3B8] dark:text-slate-500">
                  {name.length}/50
                </span>
              </div>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如：城市天气查询"
                maxLength={50}
                className={cn(
                  'h-11 rounded-xl border-slate-200/90 bg-white px-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100',
                  errors.name && 'border-rose-500/80 focus-visible:ring-rose-500'
                )}
              />
              {errors.name ? (
                <p className="text-xs text-rose-500">{errors.name}</p>
              ) : (
                <p className="text-[11px] text-[#94A3B8] dark:text-slate-500">
                  便于您识别该工具的业务名称
                </p>
              )}
            </div>

            {/* 调用名 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#475569] dark:text-slate-300">
                  调用名（callName） <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                  模型侧：wh_{callName || '...'}
                </span>
              </div>
              <Input
                value={callName}
                onChange={(e) => handleCallNameChange(e.target.value)}
                placeholder="例如：query_weather"
                maxLength={31}
                className={cn(
                  'h-11 font-mono rounded-xl border-slate-200/90 bg-white px-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100',
                  errors.callName && 'border-rose-500/80 focus-visible:ring-rose-500'
                )}
              />
              {errors.callName ? (
                <p className="text-xs text-rose-500">{errors.callName}</p>
              ) : (
                <p className="text-[11px] text-[#94A3B8] dark:text-slate-500">
                  以小写字母开头，仅包含小写字母、数字、下划线及连字符（2-31字符）
                </p>
              )}
            </div>

            {/* 描述 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#475569] dark:text-slate-300">
                工具描述 <span className="text-rose-500">*</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.description;
                      return next;
                    });
                  }
                }}
                rows={3}
                placeholder="告诉模型什么时候该用这个工具（例如：当用户询问某城市的实时天气、气温或穿衣建议时调用该工具）"
                maxLength={1000}
                className={cn(
                  'rounded-xl border-slate-200/90 bg-white p-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100',
                  errors.description && 'border-rose-500/80 focus-visible:ring-rose-500'
                )}
              />
              {errors.description ? (
                <p className="text-xs text-rose-500">{errors.description}</p>
              ) : (
                <p className="text-[11px] text-[#94A3B8] dark:text-slate-500">
                  清晰的描述有助于大模型在对话中精准判断调用时机
                </p>
              )}
            </div>

            {/* 请求方式与 URL */}
            <div className="space-y-3">
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475569] dark:text-slate-300">
                    请求方法
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200/90 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => handleMethodChange('POST')}
                      className={cn(
                        'flex-1 h-full rounded-lg text-xs font-bold transition-all',
                        method === 'POST'
                          ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                          : 'text-[#64748B] hover:text-[#0F172A] dark:text-slate-400'
                      )}
                    >
                      POST
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMethodChange('GET')}
                      className={cn(
                        'flex-1 h-full rounded-lg text-xs font-bold transition-all',
                        method === 'GET'
                          ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                          : 'text-[#64748B] hover:text-[#0F172A] dark:text-slate-400'
                      )}
                    >
                      GET
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[#475569] dark:text-slate-300">
                    Webhook 网址 <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (errors.url) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.url;
                          return next;
                        });
                      }
                    }}
                    placeholder={initialTemplate?.urlPlaceholder || 'https://api.example.com/webhook'}
                    className={cn(
                      'h-11 font-mono rounded-xl border-slate-200/90 bg-white px-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100',
                      errors.url && 'border-rose-500/80 focus-visible:ring-rose-500'
                    )}
                  />
                </div>
              </div>
              {errors.url ? (
                <p className="text-xs text-rose-500">{errors.url}</p>
              ) : (
                <p className="text-[11px] text-[#94A3B8] dark:text-slate-500">
                  出站调用仅允许 HTTPS 地址，禁止重定向；内网与云元数据地址已严格拦截
                </p>
              )}
            </div>

            {/* 鉴权头配置 */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#2563EB] dark:text-[#A8BAFF]" />
                <span className="text-xs font-bold text-[#0F172A] dark:text-white">
                  鉴权凭证（选填）
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#64748B] dark:text-slate-400">
                支持配置一个自定义鉴权请求头。凭证经 AES-256-GCM 高强度加密，页面绝不回显。
              </p>

              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#475569] dark:text-slate-300">
                    鉴权头名称
                  </label>
                  <Input
                    value={authHeaderName}
                    autoComplete="off"
                    onChange={(e) => {
                      setAuthHeaderName(e.target.value);
                      if (errors.authHeaderName) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.authHeaderName;
                          return next;
                        });
                      }
                    }}
                    placeholder="如：Authorization"
                    className="h-10 rounded-xl border-slate-200/90 bg-white text-xs dark:border-white/10 dark:bg-white/[0.06]"
                  />
                  {isEditing && tool?.hasAuthHeaderValue && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      清空名称保存后将同时移除已保存的密钥
                    </p>
                  )}
                  {errors.authHeaderName && (
                    <p className="text-xs text-rose-500">{errors.authHeaderName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#475569] dark:text-slate-300">
                    鉴权头取值（Secret）
                  </label>
                  {isEditing && tool?.hasAuthHeaderValue && !clearAuthHeader ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          value={authHeaderValue}
                          autoComplete="new-password"
                          onChange={(e) => setAuthHeaderValue(e.target.value)}
                          placeholder="已配置，输入新值可覆盖"
                          className="h-10 rounded-xl border-slate-200/90 bg-white text-xs dark:border-white/10 dark:bg-white/[0.06]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setClearAuthHeader(true);
                            setAuthHeaderValue('');
                          }}
                          className="h-10 shrink-0 rounded-xl px-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                        >
                          清除凭证
                        </Button>
                      </div>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        ✓ 已配置加密凭证，留空保持不变
                      </p>
                    </div>
                  ) : clearAuthHeader ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                        <span>保存后将清除已存凭证</span>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setClearAuthHeader(false)}
                          className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          撤销
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Input
                      type="password"
                      value={authHeaderValue}
                      autoComplete="new-password"
                      onChange={(e) => setAuthHeaderValue(e.target.value)}
                      placeholder="如：Bearer my-token-123"
                      className="h-10 rounded-xl border-slate-200/90 bg-white text-xs dark:border-white/10 dark:bg-white/[0.06]"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 参数列表 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#0F172A] dark:text-white">
                    入参声明列表（params）
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8] dark:text-slate-400">
                    平台根据参数声明自动生成 JSON Schema 传递给模型
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddParam}
                  disabled={params.length >= MAX_PARAMS_LIMIT}
                  className="h-11 min-h-[44px] rounded-lg border-slate-200/90 bg-white text-xs font-semibold text-blue-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-blue-300"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  添加参数 ({params.length}/{MAX_PARAMS_LIMIT})
                </Button>
              </div>

              {params.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/80 p-4 text-center text-xs text-[#94A3B8] dark:border-white/10 dark:text-slate-400">
                  暂无参数（若接口不需要参数可留空）
                </div>
              ) : (
                <div className="space-y-2.5">
                  {params.map((p, index) => {
                    const nameErr = errors[`param_${index}_name`];
                    return (
                      <div
                        key={index}
                        className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.2fr)_100px_80px_auto]">
                          <div>
                            <Input
                              value={p.name}
                              onChange={(e) =>
                                handleUpdateParam(index, 'name', e.target.value)
                              }
                              placeholder="参数名（如 city）"
                              className={cn(
                                'h-9 font-mono text-xs rounded-lg',
                                nameErr && 'border-rose-500'
                              )}
                            />
                            {nameErr && (
                              <p className="mt-1 text-[11px] text-rose-500">{nameErr}</p>
                            )}
                          </div>

                          <div>
                            <Select
                              value={p.type}
                              onValueChange={(val) =>
                                handleUpdateParam(
                                  index,
                                  'type',
                                  val as 'string' | 'number' | 'boolean'
                                )
                              }
                            >
                              <SelectTrigger className="h-11 w-full rounded-lg border-slate-200/90 bg-white text-xs shadow-sm dark:border-white/10 dark:bg-slate-800 dark:text-slate-100">
                                <SelectValue placeholder="类型" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="number">number</SelectItem>
                                <SelectItem value="boolean">boolean</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center gap-1.5 px-1">
                            <Switch
                              checked={p.required}
                              onCheckedChange={(checked) =>
                                handleUpdateParam(index, 'required', checked)
                              }
                              id={`param-req-${index}`}
                            />
                            <label
                              htmlFor={`param-req-${index}`}
                              className="text-xs font-medium text-[#475569] dark:text-slate-300 cursor-pointer"
                            >
                              必填
                            </label>
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveParam(index)}
                              className="h-11 w-11 p-0 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
                              aria-label={`删除第 ${index + 1} 个参数`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2">
                          <Input
                            value={p.description || ''}
                            onChange={(e) =>
                              handleUpdateParam(index, 'description', e.target.value)
                            }
                            placeholder="参数说明（如：待查询的目标城市名称，选填）"
                            maxLength={500}
                            className="h-8 text-xs rounded-lg border-slate-200/60 dark:border-white/10"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 启用状态开关 */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
              <div>
                <span className="text-xs font-bold text-[#0F172A] dark:text-white">
                  工具启用状态
                </span>
                <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400">
                  开启后 AI 智能体才可在对话中调用此工具
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {/* 调用前确认开关（AGENT-HITL-ACTION / ADR-0041） */}
            <label
              htmlFor="tool-requires-approval"
              className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
            >
              <div className="min-w-0">
                <span className="text-xs font-bold text-foreground">
                  调用前需要我确认
                </span>
                <p className="mt-0.5 text-[11px] text-day-muted dark:text-slate-400">
                  开启后，智能体想调用此工具时会先在对话中请你确认，确认前不会向外发送请求。会修改外部数据的接口建议保持开启。
                </p>
              </div>
              <Switch
                id="tool-requires-approval"
                checked={requiresApproval}
                aria-label="调用前需要我确认"
                onCheckedChange={(checked) => {
                  setRequiresApproval(checked);
                  setIsManualApproval(true);
                }}
              />
            </label>

            {/* 编辑态内嵌的测试连接 */}
            {isEditing && tool?.id && (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[#0F172A] dark:text-white">
                      连通性测试
                    </h4>
                    <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400">
                      向已保存的目标地址发起握手级健康探测（GET/HEAD）
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingStatus === 'testing'}
                    onClick={handleTestConnection}
                    className="h-9 min-w-[96px] rounded-xl text-xs font-semibold"
                  >
                    {testingStatus === 'testing' ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        测试中…
                      </>
                    ) : (
                      '测试连接'
                    )}
                  </Button>
                </div>

                {testingStatus === 'success' && testResult && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      连接成功 · HTTP {testResult.statusCode ?? 200} · 耗时{' '}
                      {testResult.durationMs ?? 0}ms
                    </span>
                  </div>
                )}

                {testingStatus === 'failed' && testResult && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                    <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span className="break-all">连接失败：{testResult.reason || '网络无法连通'}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部操作条 */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200/60 bg-white/70 px-5 py-4 backdrop-blur-sm sm:px-7 dark:border-white/10 dark:bg-slate-900/70">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-11 min-w-[96px] rounded-xl text-sm"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="h-11 min-w-[112px] rounded-xl text-sm shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  保存中…
                </>
              ) : (
                '保存工具'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
