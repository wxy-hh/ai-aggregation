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
import { useAuthStore } from '@/stores/auth-store';

/**
 * 额度耗尽提示弹框。
 *
 * 监听全局额度不足事件，触发后显示提示。
 * 用户关闭弹框后仍可继续浏览历史记录，但无法发起新的 AI 调用。
 * 匿名用户额外提供跳转到登录页的入口，便于通过账号密码继续使用。
 */
export function QuotaExhaustedDialog() {
  const [open, setOpen] = useState(false);
  const isAnonymous = useAuthStore((s) => s.user?.isAnonymous === true);

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
            {isAnonymous ? ' 如需继续使用，可通过账号密码登录以获得更多额度。' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            我知道了
          </Button>
          {isAnonymous ? (
            <Button asChild onClick={() => setOpen(false)}>
              <Link href="/login">使用账号密码登录</Link>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
