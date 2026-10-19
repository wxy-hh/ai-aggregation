'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, Sparkles, Cpu, Layers, Zap, ArrowRight } from 'lucide-react';
import qqIcon from '@/assets/image/QQ.svg';
import weixinIcon from '@/assets/image/weixin.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarAppLogoMark } from '@/components/layout/sidebar-app-logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

/**
 * AI 聚合平台多模型卡片配置
 */
const AI_CAPABILITIES = [
  {
    name: '通义千问 Qwen',
    provider: 'DashScope',
    tag: '多模态 · 长文本',
    desc: '全模态深度感知与超长上下文理解',
    accent: 'from-blue-500/20 via-sky-500/10 to-transparent',
    borderHover: 'hover:border-blue-400/40',
    dotColor: 'bg-blue-500',
    icon: Cpu,
  },
  {
    name: '智谱清言 GLM',
    provider: 'Zhipu AI',
    tag: 'CogVideoX · 推理',
    desc: '复杂认知协同与超高清视视频合成',
    accent: 'from-indigo-500/20 via-purple-500/10 to-transparent',
    borderHover: 'hover:border-indigo-400/40',
    dotColor: 'bg-indigo-500',
    icon: Layers,
  },
  {
    name: 'DeepSeek-V3 / R1',
    provider: 'DeepSeek',
    tag: '深度思考 · 代码',
    desc: '开源极限推理链与数学代码攻坚',
    accent: 'from-cyan-500/20 via-blue-500/10 to-transparent',
    borderHover: 'hover:border-cyan-400/40',
    dotColor: 'bg-cyan-500',
    icon: Zap,
  },
];

/**
 * 登录页组件
 * 遵循 DESIGN.md 规范：轻盈通透玻璃工作台 + 深空夜幕适配，移动端优先，移除冗余折叠交互
 */
export function StaticLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const prefersReducedMotion = Boolean(useReducedMotion());

  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<{ wechat: boolean; qq: boolean } | null>(null);
  const [oauthRedirecting, setOauthRedirecting] = useState<string | null>(null);

  // 检测 OAuth 配置
  useEffect(() => {
    fetch('/api/auth/oauth/config')
      .then((res) => res.json())
      .then((data) => setOauthConfig(data.data ?? { wechat: false, qq: false }))
      .catch(() => setOauthConfig({ wechat: false, qq: false }));
  }, []);

  // 处理 OAuth 回调错误
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setOauthRedirecting(null);
      if (error === 'oauth_state_mismatch') {
        toast.error('OAuth 验证失败，请重试');
      } else if (error === 'oauth_failed') {
        toast.error('第三方登录失败，请重试');
      } else if (error === 'no_code') {
        toast.error('授权已取消');
      }
    }
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      toast.error('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success('登录成功');
      const redirect = searchParams.get('redirect');
      const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/home';
      router.push(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-slate-50/70 p-4 transition-colors duration-300 dark:bg-[#0A0B10] sm:p-6 lg:p-8">
      {/* 背景动态氛围光 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-[10%] -top-[15%] h-[32rem] w-[32rem] rounded-full bg-blue-400/12 blur-[100px] dark:bg-blue-600/15" />
        <div className="absolute -right-[8%] -bottom-[12%] h-[30rem] w-[30rem] rounded-full bg-indigo-400/10 blur-[90px] dark:bg-indigo-600/12" />
        <div className="absolute left-[45%] top-[50%] h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-[80px] dark:bg-cyan-500/10" />
      </div>

      {/* 右上角主题切换快捷开关 */}
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="rounded-full border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-800">
          <ThemeToggle />
        </div>
      </div>

      {/* 统一玻璃双栏卡片主体容器 */}
      <motion.div
        data-testid="login-page-shell"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 grid w-full max-w-[1020px] grid-cols-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-[0_20px_60px_-15px_rgba(70,95,140,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_24px_70px_-15px_rgba(0,0,0,0.55)] lg:grid-cols-12"
      >
        {/* 左侧：科技感 AI 聚合视觉面板（桌面端展示，手机端隐藏以保证首屏一览无余） */}
        <section
          data-testid="login-hero-panel"
          className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200/60 bg-gradient-to-br from-blue-50/60 via-slate-50/40 to-indigo-50/30 p-8 dark:border-white/10 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-blue-950/20 lg:col-span-5 lg:flex xl:col-span-5 xl:p-10"
        >
          {/* 背景微流光与光网装饰 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(93, 124, 250, 0.25) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* 左侧顶部：品牌徽标与标语 */}
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200/60 bg-white/90 shadow-sm backdrop-blur-md dark:border-blue-500/20 dark:bg-slate-800/90">
                <SidebarAppLogoMark className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                    AI 聚合平台
                  </span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
                    Matrix
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  统一 AI 基础设施与多模型中枢
                </p>
              </div>
            </div>
          </div>

          {/* 左侧中部：模型聚合能力卡片阵列 */}
          <div className="relative z-10 my-8 space-y-3.5">
            {AI_CAPABILITIES.map((cap, index) => {
              const IconComp = cap.icon;
              return (
                <motion.div
                  key={cap.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-md transition-all duration-300 dark:border-white/10 dark:bg-slate-800/50 ${cap.borderHover} hover:shadow-md hover:-translate-y-0.5`}
                >
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 bg-gradient-to-r ${cap.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 text-slate-700 shadow-inner dark:bg-slate-700/60 dark:text-slate-200">
                        <IconComp className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {cap.name}
                          </h4>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {cap.provider}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {cap.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pl-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${cap.dotColor} animate-pulse`} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* 左侧底部：核心优势微徽章 */}
          <div className="relative z-10 border-t border-slate-200/60 pt-4 dark:border-white/10">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                秒级跨模型平滑切换
              </span>
              <span>流式 SSE 协议加速</span>
            </div>
          </div>
        </section>

        {/* 右侧：登录表单区域 */}
        <section
          data-testid="login-form-panel"
          className="relative flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 lg:col-span-7 lg:px-10 xl:col-span-7 xl:px-12"
        >
          {/* 移动端专属微型 Logo 标头（仅小屏可见，保证首屏紧凑） */}
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200/60 bg-blue-50/70 shadow-sm dark:border-blue-500/20 dark:bg-slate-800/80">
              <SidebarAppLogoMark className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              AI 聚合平台
            </h2>
          </div>

          {/* 表单标头：彻底避免 1024px 折行 bug */}
          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              欢迎回到 AI 聚合平台
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
              在一个入口中即时调度通义千问、智谱 GLM 与 DeepSeek。
            </p>
          </div>

          {/* 登录表单：结构扁平，消除内外卡片套娃 */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* 用户名 */}
            <div className="space-y-1.5">
              <Label
                htmlFor="login-username"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                用户名
              </Label>
              <div className="flex h-12 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/70 px-3.5 text-sm text-slate-900 shadow-sm transition-all focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-100 dark:focus-within:border-primary dark:focus-within:bg-slate-800">
                <User className="h-4.5 w-4.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <Input
                  id="login-username"
                  type="text"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-full border-0 bg-transparent px-0 text-sm text-slate-900 placeholder:text-slate-400 shadow-none outline-none ring-0 rounded-none focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* 密码 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="login-password"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  密码
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-slate-500 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
                >
                  忘记密码？
                </Link>
              </div>
              <div className="relative flex h-12 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/70 px-3.5 text-sm text-slate-900 shadow-sm transition-all focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-100 dark:focus-within:border-primary dark:focus-within:bg-slate-800">
                <Lock className="h-4.5 w-4.5 text-slate-400 dark:text-slate-500 shrink-0" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入登录密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-full border-0 bg-transparent px-0 pr-9 text-sm text-slate-900 placeholder:text-slate-400 shadow-none outline-none ring-0 rounded-none focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 主提交按钮：对齐全站品牌化 Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="default"
                disabled={submitting}
                className="h-11 w-full rounded-xl text-base font-semibold shadow-md transition-all active:scale-[0.98]"
              >
                {submitting ? '正在验证身份...' : '立即进入'}
                {!submitting && <ArrowRight className="ml-1.5 h-4 w-4" />}
              </Button>
            </div>

            {/* 第三方登录分割线 */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200/80 dark:border-slate-700/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white/80 px-3 text-slate-400 backdrop-blur-sm dark:bg-slate-900/80 dark:text-slate-500">
                  其他登录方式
                </span>
              </div>
            </div>

            {/* 第三方登录图标按钮 */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="使用微信登录"
                disabled={oauthRedirecting !== null}
                className="group flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white/70 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-md disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-800/60 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-950/20"
                onClick={() => {
                  if (!oauthConfig?.wechat) {
                    toast.error('微信登录未配置，请联系管理员');
                    return;
                  }
                  setOauthRedirecting('wechat');
                  toast.info('正在跳转到微信登录...');
                  window.location.href = '/api/auth/oauth/wechat';
                }}
              >
                <img
                  src={typeof weixinIcon === 'string' ? weixinIcon : weixinIcon.src}
                  alt="微信"
                  aria-hidden="true"
                  className="h-5 w-5 object-contain transition-transform group-hover:scale-110"
                />
              </button>

              <button
                type="button"
                aria-label="使用 QQ 登录"
                disabled={oauthRedirecting !== null}
                className="group flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white/70 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/50 hover:shadow-md disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-800/60 dark:hover:border-sky-500/40 dark:hover:bg-sky-950/20"
                onClick={() => {
                  if (!oauthConfig?.qq) {
                    toast.error('QQ 登录未配置，请联系管理员');
                    return;
                  }
                  setOauthRedirecting('qq');
                  toast.info('正在跳转到 QQ 登录...');
                  window.location.href = '/api/auth/oauth/qq';
                }}
              >
                <img
                  src={typeof qqIcon === 'string' ? qqIcon : qqIcon.src}
                  alt="QQ"
                  aria-hidden="true"
                  className="h-5 w-5 object-contain transition-transform group-hover:scale-110"
                />
              </button>
            </div>
          </form>

          {/* 注册引导 */}
          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            还没有账号？
            <Link
              href="/register"
              className="ml-1.5 font-semibold text-primary transition-colors hover:underline"
            >
              立即注册
            </Link>
          </p>
        </section>
      </motion.div>
    </div>
  );
}
