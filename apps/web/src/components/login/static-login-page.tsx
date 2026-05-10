'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';
import qqIcon from '@/assets/image/QQ.svg';
import weixinIcon from '@/assets/image/weixin.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

/**
 * 登录页，支持账号密码登录和微信/QQ OAuth 登录。
 */
export function StaticLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const prefersReducedMotion = Boolean(useReducedMotion());
  const heroRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeField, setActiveField] = useState<'email' | 'password' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<{ wechat: boolean; qq: boolean } | null>(null);
  const [oauthRedirecting, setOauthRedirecting] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [hasManualLeftPanelPreference, setHasManualLeftPanelPreference] = useState(false);
  const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState(false);

  const motionTransition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0 }
        : {
            duration: 0.8,
            ease: 'easeOut' as const,
          },
    [prefersReducedMotion]
  );

  useEffect(() => {
    const updateViewport = () => {
      const nextDesktopState = window.innerWidth >= 1024;
      setIsDesktopViewport(nextDesktopState);

      if (!hasManualLeftPanelPreference) {
        setIsLeftPanelExpanded(nextDesktopState);
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, [hasManualLeftPanelPreference]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const updatePointer = (clientX: number, clientY: number) => {
      if (!heroRef.current) {
        return;
      }

      const rect = heroRef.current.getBoundingClientRect();
      const relativeX = (clientX - rect.left) / rect.width;
      const relativeY = (clientY - rect.top) / rect.height;

      setPointer({
        x: clamp(relativeX * 2 - 1, -1, 1),
        y: clamp(relativeY * 2 - 1, -1, 1),
      });
    };

    const handleMouseMove = (event: MouseEvent) => {
      updatePointer(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        updatePointer(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [prefersReducedMotion]);

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

  const isTypingEmail = activeField === 'email';
  const isTypingPassword = activeField === 'password';
  const isPasswordWatching = isTypingPassword && !showPassword;
  const isPasswordVisible = password.length > 0 && showPassword;
  const isLookingAtEachOther = isTypingEmail;
  const leftPanelContentMaxHeight = isLeftPanelExpanded ? (isDesktopViewport ? 1200 : 720) : 0;
  const isLeftPanelCollapsed = !isLeftPanelExpanded;
  const borderSweepTransition = prefersReducedMotion
    ? undefined
    : {
        duration: 7.6,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear' as const,
      };

  return (
    <div className="h-[100dvh] min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[linear-gradient(120deg,#fcfdff_0%,#f5f9ff_38%,#eef5ff_100%)] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.96),transparent_24%),radial-gradient(circle_at_78%_8%,rgba(183,211,255,0.34),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(196,230,255,0.22),transparent_20%),radial-gradient(circle_at_28%_88%,rgba(224,240,255,0.68),transparent_22%)]" />
      <motion.div
        data-testid="login-page-shell"
        className="relative z-10 grid min-h-[100dvh] grid-cols-1 gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:h-[100dvh] lg:gap-6 lg:px-8 lg:py-6 xl:px-10"
        initial={false}
        animate={{
          gridTemplateColumns: isDesktopViewport
            ? isLeftPanelExpanded
              ? 'minmax(0, 1.08fr) minmax(0, 0.92fr)'
              : '0rem minmax(0, 1fr)'
            : 'minmax(0, 1fr)',
          columnGap: isDesktopViewport ? (isLeftPanelExpanded ? '2.5rem' : '0rem') : '1.5rem',
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : {
                duration: 0.52,
                ease: [0.22, 1, 0.36, 1],
              }
        }
      >
        <motion.section
          data-testid="login-hero-panel"
          initial={prefersReducedMotion ? false : { opacity: 0, x: -32 }}
          animate={{
            opacity: isLeftPanelExpanded ? 1 : 0,
            x: isLeftPanelExpanded ? 0 : 28,
            scale: isLeftPanelExpanded ? 1 : 0.98,
            maxHeight: isLeftPanelExpanded ? (isDesktopViewport ? 1600 : 820) : 0,
            clipPath: isLeftPanelExpanded
              ? 'inset(0% 0% 0% 0% round 2rem)'
              : 'inset(0% 0% 0% 100% round 2rem)',
          }}
          transition={motionTransition}
          className={cn(
            'relative overflow-hidden rounded-[2rem] border border-white/85 text-slate-950 shadow-[0_28px_90px_rgba(113,155,223,0.24),0_6px_24px_rgba(255,255,255,0.52)_inset]',
            isLeftPanelExpanded
              ? 'min-h-[320px] px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] sm:min-h-[420px] sm:px-8 sm:pb-10 lg:flex lg:h-[calc(100dvh-3rem)] lg:min-h-0 lg:flex-col lg:justify-between lg:px-8 lg:py-8'
              : 'pointer-events-none min-h-0 border-transparent px-0 py-0 shadow-none'
          )}
        >
          <motion.div
            aria-hidden="true"
            animate={prefersReducedMotion ? undefined : { rotate: 360, scale: [1, 1.03, 1] }}
            transition={borderSweepTransition}
            className="absolute -inset-[24%] opacity-70"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(142,188,255,0.12) 76deg, rgba(255,255,255,0) 132deg, rgba(125,164,255,0.16) 214deg, rgba(255,255,255,0) 286deg, rgba(171,226,255,0.14) 334deg, rgba(255,255,255,0) 360deg)',
            }}
          />
          <div className="absolute inset-[1px] rounded-[calc(2rem-1px)] bg-[linear-gradient(145deg,rgba(255,255,255,0.66)_0%,rgba(243,248,255,0.54)_24%,rgba(215,233,255,0.48)_52%,rgba(201,225,255,0.42)_100%)] backdrop-blur-[34px]" />
          <div className="absolute inset-[1px] rounded-[calc(2rem-1px)] bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.82),transparent_18%),radial-gradient(circle_at_76%_18%,rgba(198,226,255,0.34),transparent_24%),radial-gradient(circle_at_64%_72%,rgba(96,166,255,0.18),transparent_30%),radial-gradient(circle_at_36%_80%,rgba(255,255,255,0.3),transparent_22%)] opacity-95" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.08)_18%,rgba(255,255,255,0.04)_40%,rgba(132,181,255,0.12)_100%)]" />
          <div className="absolute inset-[1px] rounded-[calc(2rem-1px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_0_0_1px_rgba(255,255,255,0.24),inset_0_-18px_32px_rgba(96,154,236,0.10)]" />
          <motion.div
            aria-hidden="true"
            animate={
              prefersReducedMotion
                ? undefined
                : {
                    opacity: [0.42, 0.56, 0.42],
                    scale: [1, 1.06, 1],
                  }
            }
            transition={{
              duration: 7.2,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
            className="absolute left-1/2 top-[44%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#9ec4ff]/26 blur-3xl xl:h-[28rem] xl:w-[28rem]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.46)_0%,rgba(255,255,255,0.12)_22%,transparent_42%,transparent_62%,rgba(145,188,255,0.22)_100%)]" />
          <div className="absolute inset-x-[8%] top-0 h-[26%] rounded-b-[3rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0))] blur-2xl opacity-90" />

          <div
            className={cn(
              'relative z-10 flex gap-4',
              isLeftPanelCollapsed && isDesktopViewport
                ? 'flex-col items-center justify-start'
                : 'items-start justify-between'
            )}
          >
            <div
              className={cn(
                'inline-flex items-center gap-3',
                isLeftPanelCollapsed && isDesktopViewport ? 'flex-col gap-2' : ''
              )}
            ></div>
          </div>

          <motion.div
            id="login-left-panel-content"
            data-testid="login-left-panel-content"
            initial={false}
            animate={{
              maxHeight: leftPanelContentMaxHeight,
              opacity: isLeftPanelExpanded ? 1 : 0,
              marginTop: isLeftPanelExpanded ? 40 : 0,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    duration: 0.52,
                    ease: [0.22, 1, 0.36, 1],
                  }
            }
            className="relative z-10 overflow-visible"
          >
            <div
              ref={heroRef}
              className="flex min-h-[320px] items-end justify-center overflow-visible px-3 sm:min-h-[420px] lg:mt-4 lg:flex-1 lg:items-end lg:px-5 lg:pb-6"
            >
              <motion.div
                animate={{
                  scale: isLeftPanelExpanded ? 1 : 0.94,
                  x: isLeftPanelExpanded ? 0 : 28,
                  y: isLeftPanelExpanded ? 0 : -8,
                  filter: isLeftPanelExpanded ? 'blur(0px)' : 'blur(4px)',
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : {
                        duration: 0.44,
                        ease: [0.22, 1, 0.36, 1],
                      }
                }
                className="relative h-[18rem] w-full max-w-[22rem] overflow-visible sm:h-[22rem] sm:max-w-[27rem] xl:h-[24rem] xl:max-w-[29rem]"
              >
                <AnimatedCharacter
                  className="left-[15%] top-[-6%] z-10 h-[88%] w-[37%] rounded-[2.1rem] bg-[linear-gradient(180deg,#5a97f6_0%,#366fe8_100%)]"
                  delay={0}
                  prefersReducedMotion={prefersReducedMotion}
                  variant="purple"
                  gaze={resolveCharacterGaze(pointer, {
                    scaleX: 0.95,
                    scaleY: 0.85,
                    override: isPasswordVisible
                      ? { x: -0.52, y: -0.34 }
                      : isLookingAtEachOther
                        ? { x: 0.4, y: -0.08 }
                        : undefined,
                  })}
                  body={resolveBodyMotion(pointer, {
                    shiftX: isPasswordWatching ? 16 : 8,
                    shiftY: 8,
                    skew: isPasswordWatching ? -11 : 5.5,
                    extraShiftX: isPasswordWatching ? 18 : 0,
                    overrideSkew: isPasswordVisible ? 0 : undefined,
                  })}
                  stretch={isTypingEmail || isPasswordWatching ? 1.08 : 1}
                />
                <AnimatedCharacter
                  className="left-[58%] top-[8%] z-20 h-[78%] w-[25%] rounded-[1.4rem] bg-[linear-gradient(180deg,#30c3e6_0%,#1ea8cf_100%)]"
                  delay={0.2}
                  prefersReducedMotion={prefersReducedMotion}
                  variant="black"
                  gaze={resolveCharacterGaze(pointer, {
                    scaleX: 0.8,
                    scaleY: 0.9,
                    override: isPasswordVisible
                      ? { x: -0.45, y: -0.3 }
                      : isLookingAtEachOther
                        ? { x: -0.1, y: -0.42 }
                        : undefined,
                  })}
                  body={resolveBodyMotion(pointer, {
                    shiftX: 7,
                    shiftY: 7,
                    skew: isLookingAtEachOther ? 9 : 6.5,
                    extraShiftX: isLookingAtEachOther ? 12 : 0,
                    overrideSkew: isPasswordVisible ? 0 : undefined,
                  })}
                />
                <AnimatedCharacter
                  className="left-[30%] top-[40%] z-30 h-[58%] w-[54%] rounded-[3.5rem] bg-[linear-gradient(180deg,#ffffff_0%,#eef4ff_100%)]"
                  delay={0.35}
                  prefersReducedMotion={prefersReducedMotion}
                  variant="orange"
                  gaze={resolveCharacterGaze(pointer, {
                    scaleX: 0.88,
                    scaleY: 0.8,
                    override: isPasswordVisible ? { x: -0.52, y: -0.24 } : undefined,
                  })}
                  body={resolveBodyMotion(pointer, {
                    shiftX: 6,
                    shiftY: 5,
                    skew: 3.5,
                    overrideSkew: isPasswordVisible ? 0 : undefined,
                  })}
                />
                <div className="absolute bottom-[10%] left-[14%] right-[14%] h-12 rounded-full bg-[radial-gradient(circle,rgba(92,139,232,0.14)_0%,rgba(92,139,232,0.02)_66%,transparent_78%)] blur-xl" />
              </motion.div>
            </div>
          </motion.div>
        </motion.section>

        <motion.section
          data-testid="login-form-panel"
          initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={motionTransition}
          className="relative flex items-center overflow-hidden rounded-[2rem] border border-white/60 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_22px_70px_rgba(126,160,220,0.14)] sm:px-8 lg:h-[calc(100dvh-3rem)] lg:min-h-0 lg:items-stretch lg:overflow-x-hidden lg:overflow-y-auto lg:px-8 lg:py-8 xl:px-10"
        >
          {isDesktopViewport ? (
            <motion.button
              type="button"
              aria-expanded={isLeftPanelExpanded}
              aria-controls="login-left-panel-content"
              aria-label={isLeftPanelExpanded ? '收起左侧区域' : '展开左侧区域'}
              className="absolute left-0 top-1/2 z-20 flex h-12 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#eef4ff]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(244,249,255,0.58))] px-0 text-[#7588ab] shadow-[0_8px_18px_rgba(120,153,218,0.08),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl transition-all hover:border-white/88 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,251,255,0.68))] hover:text-slate-900"
              onClick={() => {
                setHasManualLeftPanelPreference(true);
                setIsLeftPanelExpanded((value) => !value);
              }}
            >
              <motion.div
                initial={false}
                animate={{
                  x: 0,
                  opacity: 1,
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : {
                        duration: 0.28,
                        ease: [0.22, 1, 0.36, 1],
                      }
                }
                className="flex items-center justify-center pl-2"
              >
                {isLeftPanelExpanded ? (
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                )}
              </motion.div>
            </motion.button>
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,rgba(255,255,255,0.96),transparent_26%),radial-gradient(circle_at_92%_2%,rgba(120,165,255,0.16),transparent_24%),radial-gradient(circle_at_78%_88%,rgba(167,193,255,0.18),transparent_26%),linear-gradient(140deg,rgba(255,255,255,0.76),rgba(247,250,255,0.84)_52%,rgba(240,245,255,0.9))]" />
          <div className="relative z-10 mx-auto flex w-full max-w-[34rem] shrink-0 flex-col justify-center lg:min-h-full lg:py-1">
            <div className="mb-5 text-center lg:mb-6">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.65rem]">
                欢迎回到 AI 聚合平台
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">
                在一个入口中切换通义千问、智谱 GLM、DeepSeek 等多种能力。
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-white/75 p-[1px] shadow-[0_26px_80px_rgba(113,145,212,0.22)]">
              <motion.div
                aria-hidden="true"
                animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                transition={borderSweepTransition}
                className="absolute -inset-[40%] opacity-80"
                style={{
                  background:
                    'conic-gradient(from 120deg, rgba(255,255,255,0) 0deg, rgba(160,207,255,0.10) 70deg, rgba(255,255,255,0) 128deg, rgba(95,135,255,0.14) 204deg, rgba(255,255,255,0) 286deg, rgba(173,226,255,0.12) 334deg, rgba(255,255,255,0) 360deg)',
                }}
              />
              <div className="relative rounded-[calc(2rem-1px)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.82)_100%)] px-6 py-7 backdrop-blur-[24px] sm:px-10 sm:py-8 lg:py-6">
                <form
                  className="space-y-5"
                  onSubmit={async (event) => {
                    event.preventDefault();

                    if (!email.trim() || !password) {
                      toast.error('请输入邮箱和密码');
                      return;
                    }

                    setSubmitting(true);
                    try {
                      await login(email.trim(), password);
                      toast.success('登录成功');
                      router.push('/home');
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : '登录失败，请重试');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  <div className="space-y-2.5">
                    <Label htmlFor="login-email" className="text-base font-semibold text-slate-900">
                      邮箱 / 账号
                    </Label>
                    <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
                      <Mail className="h-5 w-5 text-[#8ea0bc]" />
                      <Input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onFocus={() => setActiveField('email')}
                        onBlur={() => setActiveField(null)}
                        className="h-auto border-0 bg-transparent px-0 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <Label
                      htmlFor="login-password"
                      className="text-base font-semibold text-slate-900"
                    >
                      密码
                    </Label>
                    <div className="relative flex h-14 items-center gap-3 rounded-2xl border border-[#d7e2f3] bg-white/74 px-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_24px_rgba(122,154,218,0.06)] transition-colors focus-within:border-[#92b4ff] focus-within:bg-white/88">
                      <Lock className="h-5 w-5 text-[#8ea0bc]" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onFocus={() => setActiveField('password')}
                        onBlur={() => setActiveField(null)}
                        className="h-auto border-0 bg-transparent px-0 pr-12 text-base text-slate-900 shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                        className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#97a7bf] transition-colors hover:bg-[#eef4ff] hover:text-[#3c6df3]"
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={() => setRememberMe((value) => !value)}
                        className="h-5 w-5 rounded border-[#c8d6eb] text-[#3c6df3] focus:ring-[#3c6df3]/20"
                      />
                      <span className="text-base text-slate-700">30 天内记住我</span>
                      <span className="sr-only">继续使用</span>
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-base font-medium text-[#3c6df3] hover:text-[#2455db]"
                    >
                      忘记密码？
                    </Link>
                  </div>

                  <div className="space-y-5 lg:space-y-4">
                    <Button
                      type="submit"
                      variant="default"
                      disabled={submitting}
                      className="h-14 w-full rounded-2xl bg-[#3b6df1] text-base font-semibold text-white shadow-[0_18px_36px_rgba(59,109,241,0.30)] transition-all hover:bg-[#2f62eb] hover:shadow-[0_22px_42px_rgba(59,109,241,0.34)]"
                    >
                      {submitting ? '登录中...' : '立即进入'}
                      {!submitting && (
                        <span aria-hidden="true" className="ml-2 text-lg">
                          →
                        </span>
                      )}
                    </Button>

                    <div className="space-y-3">
                        <div className="flex items-center gap-4 text-sm text-[#a1adbf]">
                          <span className="h-px flex-1 bg-[#d9e3f2]" />
                          <span>其他登录方式</span>
                          <span className="h-px flex-1 bg-[#d9e3f2]" />
                        </div>

                      <div className="flex items-center justify-center gap-5">
                        <button
                            type="button"
                            aria-label="使用微信登录"
                            disabled={oauthRedirecting !== null}
                            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d7e2f3] bg-white/82 text-[#10b555] shadow-[0_10px_24px_rgba(122,154,218,0.10)] transition-transform hover:-translate-y-0.5 hover:bg-white disabled:opacity-50"
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
                              alt=""
                              aria-hidden="true"
                              className="h-6 w-6 object-contain"
                            />
                          </button>
                        <button
                            type="button"
                            aria-label="使用 QQ 登录"
                            disabled={oauthRedirecting !== null}
                            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d7e2f3] bg-white/82 text-[#24a7ef] shadow-[0_10px_24px_rgba(122,154,218,0.10)] transition-transform hover:-translate-y-0.5 hover:bg-white disabled:opacity-50"
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
                              alt=""
                              aria-hidden="true"
                              className="h-6 w-6 object-contain"
                            />
                          </button>
                      </div>
                    </div>
                  </div>
                </form>

                <p className="mt-4 text-center text-sm text-slate-500 lg:mt-3">
                  还没有账号？
                  <Link href="/register" className="ml-1 font-semibold text-slate-900 hover:text-[#3c6df3]">
                    立即注册
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}

interface AnimatedCharacterProps {
  className: string;
  delay: number;
  prefersReducedMotion: boolean;
  variant: 'purple' | 'black' | 'orange';
  gaze: {
    x: number;
    y: number;
  };
  body: {
    x: number;
    y: number;
    skew: number;
  };
  stretch?: number;
}

/**
 * 角色图形使用纯 CSS 绘制，便于保持轻量与响应式适配。
 */
function AnimatedCharacter({
  className,
  delay,
  prefersReducedMotion,
  variant,
  gaze,
  body,
  stretch = 1,
}: AnimatedCharacterProps) {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion || variant === 'orange') {
      return;
    }

    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleBlink = () => {
      blinkTimer = setTimeout(
        () => {
          setIsBlinking(true);
          resetTimer = setTimeout(() => {
            setIsBlinking(false);
            scheduleBlink();
          }, 140);
        },
        2600 + Math.random() * 2600
      );
    };

    scheduleBlink();

    return () => {
      if (blinkTimer) {
        clearTimeout(blinkTimer);
      }
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
    };
  }, [prefersReducedMotion, variant]);

  const animationY = prefersReducedMotion ? 0 : [0, -8, 0];
  const eyeContainerClass = {
    purple: 'top-[14%] left-[26%] gap-[24%]',
    black: 'top-[12%] left-[17%] gap-[20%]',
    orange: 'top-[45%] left-[31%] gap-[18%]',
  }[variant];
  const pupilOnly = variant === 'orange';
  const showDefaultEyes = variant !== 'orange';
  const eyeSizeClass = variant === 'black' ? 'h-5 w-5' : 'h-7 w-7';
  const pupilSizeClass = variant === 'black' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const pupilDistance = variant === 'purple' ? 5.5 : variant === 'black' ? 4.5 : 5;

  return (
    <motion.div
      className={cn('absolute shadow-[0_20px_60px_rgba(0,0,0,0.12)]', className)}
      style={{
        x: body.x,
        y: body.y,
        skewX: body.skew,
        scaleY: stretch,
        transformOrigin: 'bottom center',
      }}
    >
      <motion.div
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: animationY,
              }
        }
        transition={{
          duration: 3.8,
          delay,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
        className="relative h-full w-full"
      >
        {showDefaultEyes ? (
          <div
            className={cn(
              'absolute flex transition-transform duration-200 ease-out',
              eyeContainerClass
            )}
            style={{
              transform: `translate(${gaze.x * 9}px, ${gaze.y * 7}px)`,
            }}
          >
            <EyePair
              blink={isBlinking}
              pupilOnly={pupilOnly}
              eyeSizeClass={eyeSizeClass}
              pupilSizeClass={pupilSizeClass}
              pupilDistance={pupilDistance}
              gaze={gaze}
            />
          </div>
        ) : null}

        {variant === 'orange' ? (
          <>
            <span
              className="absolute left-[39%] top-[41%] h-2.5 w-2.5 rounded-full bg-[#20283a]"
              style={{
                transform: `translate(${gaze.x * 4}px, ${gaze.y * 3}px)`,
              }}
            />
            <span
              className="absolute left-[53%] top-[41%] h-2.5 w-2.5 rounded-full bg-[#20283a]"
              style={{
                transform: `translate(${gaze.x * 4}px, ${gaze.y * 3}px)`,
              }}
            />
            <span
              className="absolute left-1/2 top-[54%] h-[0.24rem] w-[18%] -translate-x-1/2 rounded-full bg-[#20283a] transition-transform duration-200 ease-out"
              style={{
                transform: `translateX(-50%) translate(${gaze.x * 4}px, ${gaze.y * 2}px) scaleX(${
                  prefersReducedMotion ? 1 : 0.98 + Math.abs(gaze.x) * 0.05
                })`,
              }}
            />
          </>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

interface EyePairProps {
  blink: boolean;
  pupilOnly: boolean;
  eyeSizeClass: string;
  pupilSizeClass: string;
  pupilDistance: number;
  gaze: {
    x: number;
    y: number;
  };
}

function EyePair({
  blink,
  pupilOnly,
  eyeSizeClass,
  pupilSizeClass,
  pupilDistance,
  gaze,
}: EyePairProps) {
  const pupilTransform = `translate(${gaze.x * pupilDistance}px, ${gaze.y * pupilDistance}px)`;

  return (
    <>
      <span
        className={cn(
          'flex items-center justify-center transition-all duration-150',
          pupilOnly ? 'bg-transparent shadow-none' : 'rounded-full bg-white shadow-sm',
          eyeSizeClass
        )}
        style={{
          height: blink && !pupilOnly ? '2px' : undefined,
          overflow: 'hidden',
        }}
      >
        {blink && !pupilOnly ? null : (
          <span
            className={cn(
              'rounded-full bg-[#2f3137] transition-transform duration-100 ease-out',
              pupilSizeClass
            )}
            style={{ transform: pupilTransform }}
          />
        )}
      </span>
      <span
        className={cn(
          'flex items-center justify-center transition-all duration-150',
          pupilOnly ? 'bg-transparent shadow-none' : 'rounded-full bg-white shadow-sm',
          eyeSizeClass
        )}
        style={{
          height: blink && !pupilOnly ? '2px' : undefined,
          overflow: 'hidden',
        }}
      >
        {blink && !pupilOnly ? null : (
          <span
            className={cn(
              'rounded-full bg-[#2f3137] transition-transform duration-100 ease-out',
              pupilSizeClass
            )}
            style={{ transform: pupilTransform }}
          />
        )}
      </span>
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveCharacterGaze(
  pointer: { x: number; y: number },
  options: {
    scaleX: number;
    scaleY: number;
    override?: { x: number; y: number };
  }
) {
  if (options.override) {
    return options.override;
  }

  return {
    x: clamp(pointer.x * options.scaleX, -1, 1),
    y: clamp(pointer.y * options.scaleY, -1, 1),
  };
}

function resolveBodyMotion(
  pointer: { x: number; y: number },
  options: {
    shiftX: number;
    shiftY: number;
    skew: number;
    extraShiftX?: number;
    overrideSkew?: number;
  }
) {
  return {
    x: pointer.x * options.shiftX + (options.extraShiftX ?? 0),
    y: pointer.y * options.shiftY,
    skew: options.overrideSkew ?? pointer.x * options.skew,
  };
}
