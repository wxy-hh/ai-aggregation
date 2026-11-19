'use client';

/**
 * 写操作审批卡片（AGENT-HITL-ACTION / ADR-0041）
 *
 * 展示被暂停的 Webhook 工具调用（工具名、目标域名、参数），提供「确认执行」「拒绝」两个动作。
 * 本组件只负责展示与回调，不直接发请求：确认走恢复请求、拒绝为纯前端终止，均由上层 store 处理。
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Clock, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveApprovalStatus, type MessageApproval } from '@/lib/agent/approval-display';

export interface ApprovalCardProps {
  approval: MessageApproval;
  /** 用户点击「确认执行」，入参为被暂停的调用 ID；返回 'skipped'（请求未发出）时卡片解除锁定，可再次点击 */
  onConfirm: (callId: string) => unknown;
  /** 用户点击「拒绝」，入参为被暂停的调用 ID */
  onReject: (callId: string) => void;
}

/** 参数值展示：字符串原样，其余转 JSON 文本 */
function formatParamValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export function ApprovalCard({ approval, onConfirm, onReject }: ApprovalCardProps) {
  const status = resolveApprovalStatus(approval);
  // 点击后立即锁定：快速连点或重复触发只放行第一次（服务端另有一次性凭证兜底）
  const [submitted, setSubmitted] = useState(false);
  const lockRef = useRef(false);

  // 状态离开待确认后解锁：确认失败回退为待确认时，用户可以再次点击重试
  useEffect(() => {
    if (status !== 'pending') {
      lockRef.current = false;
      setSubmitted(false);
    }
  }, [status]);

  const handleAction = (action: (callId: string) => unknown) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setSubmitted(true);
    // 请求没有发出（如上一轮流尚未结算）时状态仍是待确认，不会触发上面的解锁，这里手动解锁
    void Promise.resolve(action(approval.callId)).then((result) => {
      if (result === 'skipped') {
        lockRef.current = false;
        setSubmitted(false);
      }
    });
  };

  const entries = Object.entries(approval.params);

  return (
    <div
      data-testid="approval-card"
      data-status={status}
      className="not-prose my-2 w-full max-w-full rounded-2xl border border-border bg-white p-4 dark:bg-slate-800"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">需要你确认的操作</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            智能体想调用下面的工具，确认前不会向外部发送任何请求。
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">工具</dt>
          <dd className="min-w-0 break-all font-medium text-foreground">{approval.toolName}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">目标域名</dt>
          <dd className="min-w-0 break-all font-medium text-foreground">{approval.host}</dd>
        </div>
      </dl>

      {entries.length > 0 && (
        <div className="custom-scrollbar mt-3 max-h-40 overflow-y-auto rounded-xl bg-muted/50 p-3">
          <p className="mb-1.5 text-xs text-muted-foreground">参数</p>
          <dl className="space-y-1.5 text-sm">
            {entries.map(([name, value]) => (
              <div key={name} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-muted-foreground">{name}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-all text-foreground">
                  {formatParamValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {status === 'pending' && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="approval-reject"
            className="min-h-[44px] min-w-[44px] sm:min-w-[96px]"
            disabled={submitted}
            onClick={() => handleAction(onReject)}
          >
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            拒绝
          </Button>
          <Button
            type="button"
            data-testid="approval-confirm"
            className="min-h-[44px] min-w-[44px] sm:min-w-[96px]"
            disabled={submitted}
            onClick={() => handleAction(onConfirm)}
          >
            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
            确认执行
          </Button>
        </div>
      )}

      {status === 'confirmed' && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>已确认</span>
        </p>
      )}

      {status === 'rejected' && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
          <span>已拒绝</span>
        </p>
      )}

      {status === 'expired' && (
        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>已失效</span>
          </p>
          <p className="text-xs">该确认已超时或对话已继续，请重新提出需求，让智能体重新发起。</p>
        </div>
      )}
    </div>
  );
}
