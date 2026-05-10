'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { toast } from 'sonner';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error('重置链接无效');
      return;
    }

    if (password.length < 8) {
      toast.error('密码至少 8 位字符');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success('密码已重置，请使用新密码登录');
      router.push('/login');
    } catch {
      toast.error('重置失败，链接可能已过期');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-slate-500">无效的重置链接</p>
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
        <Label htmlFor="reset-password" className="text-base font-semibold text-slate-900">
          新密码
        </Label>
        <div className="relative flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
          <Lock className="h-5 w-5 text-[#8ea0bc]" />
          <Input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位字符"
            className="h-auto border-0 bg-transparent px-0 pr-12 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#97a7bf] transition-colors hover:bg-[#eef4ff] hover:text-[#3c6df3]"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        variant="default"
        disabled={submitting}
        className="h-14 w-full rounded-2xl bg-[#3b6df1] text-base font-semibold text-white shadow-[0_18px_36px_rgba(59,109,241,0.30)] transition-all hover:bg-[#2f62eb] hover:shadow-[0_22px_42px_rgba(59,109,241,0.34)]"
      >
        {submitting ? '重置中...' : '重置密码'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-slate-900 hover:text-[#3c6df3]">
          返回登录
        </Link>
      </p>
    </form>
  );
}
