'use client';

/**
 * 纯多模态实验室主页面 (/labs)
 *
 * 页面契约：
 * 1. 采用 AppLayout 全局布局规范，适配桌面端悬浮侧边栏与移动端自适应流式容器。
 * 2. 聚焦纯粹的前沿多模态生成模型试验田：
 *    - Agnes 独立服务驱动的 AI 灵感生图（文生图/图生图）；
 *    - 智谱 CogVideoX 模型驱动的 AI 视频生成（异步队列管线）。
 * 3. 遵从双轨制冷冻原则，全页面严禁出现任何命理排盘相关词汇与入口。
 */

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Sparkles, Video, Image as ImageIcon, ArrowRight, Cpu, Layers, ShieldCheck } from 'lucide-react';

export default function LabsPage() {
  return (
    <AppLayout>
      <div className="flex h-full w-full flex-col overflow-y-auto bg-slate-50/50 dark:bg-[#0A0B10] px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto w-full max-w-5xl space-y-8">
          {/* 页面主标题区 */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>前沿多模态生成模型试验田</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              多模态实验室
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
              聚焦前沿视觉与时空生成算法。提供基于独立 Agnes 服务的高清图像生成与智谱 CogVideoX 异步视频合成试验环境，验证多模态生成在真实业务场景中的交付潜力。
            </p>
          </div>

          {/* 核心实验特性卡片矩阵 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 卡片 1: Agnes 图像生成 */}
            <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-fuchsia-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-fuchsia-800">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    在线就绪 · Agnes
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Agnes 文生图与灵感绘图
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    接入独立高性能图像生成微服务，具备精准的自然语言 Prompt 解析能力，支持高分辨率文生图、垫图参考重绘与风格迁移，为创意设计提供生产级视觉素材。
                  </p>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-slate-400" />
                    <span>底层引擎：Agnes Image Microservice</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    <span>输出格式：高保真 PNG（支持 1024x1024 / 16:9 / 9:16）</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  asChild
                  className="w-full min-h-[44px] h-11 rounded-xl bg-fuchsia-600 font-medium text-white transition-colors hover:bg-fuchsia-700 dark:bg-fuchsia-700 dark:hover:bg-fuchsia-600"
                >
                  <Link href="/image">
                    <span>进入图像工作台</span>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* 卡片 2: CogVideoX 视频生成 */}
            <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-800">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                    <Video className="h-6 w-6" />
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    异步队列 · CogVideoX
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    智谱 CogVideoX 视频生成
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    基于智谱开源时空扩散大模型 CogVideoX 构建。依托分布式 BullMQ 任务队列与状态轮询机制，实现长文本到连贯动态视频的高质量异步渲染与持久化流媒体播放。
                  </p>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-slate-400" />
                    <span>底层引擎：Zhipu AI CogVideoX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    <span>渲染管线：BullMQ 异步持久化任务 + 状态轮询回溯</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  asChild
                  className="w-full min-h-[44px] h-11 rounded-xl bg-indigo-600 font-medium text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                >
                  <Link href="/video">
                    <span>进入视频工作台</span>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* 架构演进与安全说明 */}
          <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1 text-sm">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  多模态架构设计说明与工程收敛
                </h4>
                <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                  多模态实验室致力于为企业级 Agent 提供多模态交付物支持。根据最新产品收敛规范，已彻底剥离所有非核心娱乐与测试原型入口，所有生成服务均由鉴权凭据与真实计算 Worker 守护，保障生产环境的高可用与低噪音。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
