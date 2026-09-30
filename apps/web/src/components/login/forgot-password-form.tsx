'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MailCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { toast } from 'sonner';

/** 接口不可用时的兜底文案：与接口恒定口径保持一致，避免前端暗示账号是否存在 */
const FALLBACK_MESSAGE =
  '若账号已绑定邮箱，重置邮件已发送（链接 5 分钟内有效）；未绑定邮箱的账号请使用微信/QQ 登录或重新注册';

export function ForgotPasswordForm() {
  const [account, setAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account.trim()) {
      toast.error('请输入用户名或邮箱');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword(account.trim());
      setSentMessage(res.message || FALLBACK_MESSAGE);
      toast.success('重置请求已提交');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '请求失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (sentMessage) {
    return (
      <div className="space-y-5 text-center">
        <div className="rounded-2xl bg-[#eef4ff] px-6 py-10">
          <MailCheck className="mx-auto h-10 w-10 text-[#3c6df3]" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">重置请求已提交</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{sentMessage}</p>
        </div>
        <div className="flex items-center justify-center gap-4 text-sm">
          <Link
            href="/login"
            className="font-semibold text-[#3c6df3] hover:text-[#2455db]"
          >
            返回登录
          </Link>
          <span className="text-slate-300">|</span>
          <Link
            href="/register"
            className="font-semibold text-[#3c6df3] hover:text-[#2455db]"
          >
            重新注册
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2.5">
        <Label htmlFor="forgot-account" className="text-base font-semibold text-slate-900">
          用户名或邮箱
        </Label>
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/[0.74] px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/[0.88]">
          <User className="h-5 w-5 text-[#8ea0bc]" />
          <Input
            id="forgot-account"
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="your_username 或 you@example.com"
            autoComplete="username"
            className="h-auto border-0 bg-transparent px-0 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-xs text-day-muted">
          未绑定邮箱的账号请使用微信/QQ 登录，或重新注册
        </p>
      </div>

      <Button
        type="submit"
        variant="default"
        disabled={submitting}
        className="h-14 w-full rounded-2xl bg-[#3b6df1] text-base font-semibold text-white shadow-[0_18px_36px_rgba(59,109,241,0.30)] transition-all hover:bg-[#2f62eb] hover:shadow-[0_22px_42px_rgba(59,109,241,0.34)]"
      >
        {submitting ? '发送中...' : '发送重置链接'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-slate-900 hover:text-[#3c6df3]">
          返回登录
        </Link>
      </p>
    </form>
  );
}
