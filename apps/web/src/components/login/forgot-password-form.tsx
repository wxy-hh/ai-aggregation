'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { toast } from 'sonner';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('请输入邮箱');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
      toast.success('如该邮箱已注册，重置链接已发送');
    } catch {
      toast.error('请求失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="rounded-2xl bg-[#eef4ff] px-6 py-10">
          <Mail className="mx-auto h-10 w-10 text-[#3c6df3]" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">邮件已发送</h2>
          <p className="mt-2 text-sm text-slate-500">
            请检查邮箱 <span className="font-medium text-slate-700">{email}</span>，点击邮件中的链接重置密码。
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-sm font-semibold text-[#3c6df3] hover:text-[#2455db]"
        >
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2.5">
        <Label htmlFor="forgot-email" className="text-base font-semibold text-slate-900">
          邮箱
        </Label>
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
          <Mail className="h-5 w-5 text-[#8ea0bc]" />
          <Input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="h-auto border-0 bg-transparent px-0 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
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
