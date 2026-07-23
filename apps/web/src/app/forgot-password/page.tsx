import React from 'react';
import { ForgotPasswordForm } from '@/components/login/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(120deg,#fcfdff_0%,#f5f9ff_38%,#eef5ff_100%)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.96),transparent_24%),radial-gradient(circle_at_78%_8%,rgba(183,211,255,0.34),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(196,230,255,0.22),transparent_20%),radial-gradient(circle_at_28%_88%,rgba(224,240,255,0.68),transparent_22%)]" />

      <div className="relative z-10 w-full max-w-[28rem]">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">忘记密码</h1>
          <p className="mt-2 text-sm text-slate-500">输入注册邮箱，我们将发送重置链接</p>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/75 p-[1px] shadow-[0_26px_80px_rgba(113,145,212,0.22)]">
          <div className="relative rounded-[calc(2rem-1px)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.82)_100%)] px-6 py-7 backdrop-blur-[24px] sm:px-10 sm:py-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
