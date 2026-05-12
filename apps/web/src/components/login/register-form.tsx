'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const USERNAME_REGEX = /^[a-z0-9_]+$/;

export function RegisterForm() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = username.trim();

    if (!trimmed || !password) {
      toast.error('请填写用户名和密码');
      return;
    }

    if (trimmed.length < 3) {
      toast.error('用户名至少 3 个字符');
      return;
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      toast.error('用户名只能包含英文字母、数字和下划线');
      return;
    }

    if (password.length < 8) {
      toast.error('密码至少 8 位字符');
      return;
    }

    setSubmitting(true);
    try {
      await register(trimmed, password);
      toast.success('注册成功');
      router.push('/home');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2.5">
        <Label htmlFor="register-username" className="text-base font-semibold text-slate-900">
          用户名
        </Label>
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
          <User className="h-5 w-5 text-[#8ea0bc]" />
          <Input
            id="register-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            className="h-auto border-0 bg-transparent px-0 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-xs text-slate-400">3-30 个字符，仅支持英文字母、数字和下划线</p>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="register-password" className="text-base font-semibold text-slate-900">
          密码
        </Label>
        <div className="relative flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
          <Lock className="h-5 w-5 text-[#8ea0bc]" />
          <Input
            id="register-password"
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
        {submitting ? '注册中...' : '创建账号'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        已有账号？
        <Link href="/login" className="ml-1 font-semibold text-slate-900 hover:text-[#3c6df3]">
          立即登录
        </Link>
      </p>
    </form>
  );
}
