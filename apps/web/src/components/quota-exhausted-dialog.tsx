'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * 额度耗尽提示弹框。
 *
 * 监听全局额度不足事件，触发后显示提示。
 * 用户关闭弹框后仍可继续浏览历史记录，但无法发起新的 AI 调用。
 *
 * Agent 场景（ADR-0012 / 工单 04）：
 * 当触发时 agentModeEnabled 为 true，展示专用文案变体：
 * 「额度不足以开启联网查询，可充值后重试；或关闭 Agent 模式直接对话」，
 * 普通对话（agentModeEnabled 为 false）保持通用文案不变。
 */
export function QuotaExhaustedDialog() {
  const [open, setOpen] = useState(false);
  const [isAgentQuota, setIsAgentQuota] = useState(false);

  useEffect(() => {
    const handleQuotaExhausted = () => {
      // 记录触发时是否处于 Agent 模式
      const isAgent = useSettingsStore.getState().agentModeEnabled;
      setIsAgentQuota(isAgent);
      setOpen(true);
    };

    window.addEventListener('quota-exhausted', handleQuotaExhausted);
    return () => window.removeEventListener('quota-exhausted', handleQuotaExhausted);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* 遮罩对齐 DESIGN.md §8.4（bg-slate-950/50 + blur）：压暗并模糊底层内容 */}
      <DialogContent
        className="sm:max-w-md"
        overlayClassName="bg-slate-950/50 backdrop-blur-md"
      >
        <DialogHeader>
          <DialogTitle>{isAgentQuota ? '额度不足' : '文本或语音额度不足'}</DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            {isAgentQuota
              ? '额度不足以开启联网查询，可充值后重试；或关闭 Agent 模式直接对话'
              : '当前文本或语音额度不足。您可以继续查看历史记录，图片和视频任务统计不受此额度影响。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            我知道了
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href="/profile">查看我的额度</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
