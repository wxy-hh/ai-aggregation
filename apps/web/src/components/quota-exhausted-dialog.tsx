'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * 额度耗尽提示弹框。
 *
 * 监听全局额度不足事件，触发后显示提示。
 * 用户关闭弹框后仍可继续浏览历史记录，但无法发起新的 AI 调用。
 */
export function QuotaExhaustedDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleQuotaExhausted = () => {
      setOpen(true);
    };

    window.addEventListener('quota-exhausted', handleQuotaExhausted);
    return () => window.removeEventListener('quota-exhausted', handleQuotaExhausted);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>文本或语音额度不足</DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            当前文本或语音额度不足。您可以继续查看历史记录，图片和视频任务统计不受此额度影响。
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end pt-2">
          <Button onClick={() => setOpen(false)}>我知道了</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
