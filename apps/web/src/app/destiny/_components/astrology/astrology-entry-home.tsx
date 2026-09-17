'use client';

/**
 * astrology-entry-home.tsx —— 星座寰宇入口首页（设计文档 §6.2）
 *
 * 视觉与交互重塑：
 * 1. 标题区去模板化：遵循设计禁忌移除小标，以三色天体光谱大标题直接统领视觉焦点；
 * 2. 天体三律光感徽章：替代生硬的白色功能块，采用半透微晶玻璃质感与柔和引力交互；
 * 3. 超新星聚能主按钮（Supernova CTA）：外附脉冲呼吸星环，流光扫掠与磁吸箭头动效；
 * 4. 时间未知提示折叠胶囊：消除用户心理阻抗，精致融于行动区；
 * 5. 纯正中文注释，遵循全量清洁原则。
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Crosshair, MessageCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useHistoryStore } from '@/stores/history-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import { restoreAstrologyFromHistory } from '@/lib/astrology/history';
import { computeChartFacts, SAMPLE_PROFILE_ACCURATE } from '@/lib/astrology/mock-chart-facts';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyWheel3D } from './astrology-wheel-3d';
import { AstrologyStarfield } from './astrology-starfield';
import { cn } from '@/lib/utils';

/** 示例星盘十星共振微解读字典（点选星体时悬浮呈现，展现真实计算与洞察深度） */
const SAMPLE_PLANET_INSIGHTS: Record<PlanetBody, { title: string; desc: string }> = {
  sun: { title: '太阳 · 天秤座 14°42′', desc: '核心人格：温和优雅的平衡者，在协作与审美追求中映射出自身价值。' },
  moon: { title: '月亮 · 白羊座 06°18′', desc: '内在情绪：直率纯粹的行动力本能，渴望最直接、最真实的真实表达。' },
  mercury: { title: '水星 · 天秤座 20°05′', desc: '思维模式：严谨客观与多重视角权衡，善于换位思考与沟通调解。' },
  venus: { title: '金星 · 天蝎座 27°12′', desc: '情感引力：深邃而专注的灵魂共鸣，追寻毫无保留且纯粹的真实联结。' },
  mars: { title: '火星 · 天蝎座 02°36′', desc: '行动意志：极强的沉淀力与蓄势爆发力，坚韧执着，不达目标誓不罢休。' },
  jupiter: { title: '木星 · 射手座 13°50′', desc: '机遇远见：天生开阔的探索哲学与乐观视野，对知识与未知充满热忱。' },
  saturn: { title: '土星 · 双鱼座 19°24′', desc: '人生课题：将灵性与直觉落地为现实结构，在慈悲中修筑清晰的人生边界。' },
  uranus: { title: '天王星 · 摩羯座 26°44′', desc: '世代特质：在传统体制中发起严谨务实的革新，重塑底层秩序与规则。' },
  neptune: { title: '海王星 · 摩羯座 22°55′', desc: '潜意识流：将深层理想主义注入世俗现实，融化教条冰霜，赋予世界温情。' },
  pluto: { title: '冥王星 · 天蝎座 28°30′', desc: '蜕变动能：直面心智幽暗处后的绝地重生，具备极其强大的自我重构能力。' },
};

/** 三个天体核心价值点（图标 + 标题 + 精炼白话，体现天文学真值与严谨边界） */
const VALUE_POINTS = [
  {
    icon: Crosshair,
    title: '真值先行',
    text: '回归黄道真实天文力学解算，严谨不虚构',
  },
  {
    icon: MessageCircle,
    title: '生活语言',
    text: '先呈生活场景与行动结论，术语收于依据',
  },
  {
    icon: ShieldCheck,
    title: '诚实边界',
    text: '生辰若不全则明确隐藏，拒绝模棱编造',
  },
] as const;

export function AstrologyEntryHome({ onStart }: { onStart: () => void }) {
  const reduceMotion = useReducedMotion();
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  /** 首页示例盘探索状态：允许用户自由点选星体体验星盘共振交互 */
  const [sampleSelectedBody, setSampleSelectedBody] = useState<PlanetBody | null>(null);

  /** 示例盘：02 冻结档案（1995-10-08 14:30 上海，真实计算口径），组件级常量 */
  const sampleFacts = useMemo(() => computeChartFacts(SAMPLE_PROFILE_ACCURATE), []);

  /** 低敏最近记录卡：统一历史里的最新星座寰宇记录；匿名会话的临时记录也算（仅当前会话可见） */
  const historyRecord = useHistoryStore((s) =>
    s.items.find((i) => i.type === 'destiny' && i.subType === 'astrology')
  );
  const tempRecord = useAstrologyTempRecordStore((s) => s.tempRecord);
  const recentRecord = historyRecord ?? tempRecord;

  const enter = (delay: number) =>
    reduceMotion
      ? { duration: 0.01 }
      : { duration: 0.6, delay, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <DestinyPageScaffold withNavOffset tone="cosmos">
      <AstrologyStarfield />

      <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-8 sm:px-8 xl:px-10 xl:pb-12">
          <div className="grid items-center gap-x-12 gap-y-8 xl:grid-cols-[1.08fr_0.92fr] xl:grid-rows-[auto_1fr] xl:gap-y-10">
            {/* ═══ 标题区（遵循设计禁忌：无小标 eyebrow，实色主标题主导层级） ═══ */}
            <motion.header
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={enter(0)}
              className="max-w-xl"
            >
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-[52px] lg:leading-[1.12]">
                绘制你的
                <span className="mt-1.5 block text-indigo-600 dark:text-indigo-400">
                  完整本命星盘
                </span>
              </h1>
              <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-indigo-100/80 sm:mt-4 sm:text-lg">
                一分钟，看懂你的性格底色、关系模式与本周行动
              </p>
              <p className="mt-2.5 hidden text-xs leading-relaxed text-slate-400 dark:text-night-faint sm:block">
                星体位置为精密天文计算，解读基于星盘事实生成 · 用于自我探索与娱乐参考
              </p>
            </motion.header>

            {/* ═══ 示例星盘（3D 悬浮天象仪视差容器 + 星体共振探索交互） ═══ */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={enter(0.18)}
              className="relative mx-auto w-full max-w-[290px] sm:max-w-[440px] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:max-w-[490px]"
            >
              {/* 轮底多层微光与深空阴影 */}
              <div
                aria-hidden
                className="absolute inset-[4%] rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/20"
              />
              <AstrologyWheel3D className="relative">
                <AstrologyChartWheel
                  facts={sampleFacts}
                  selectedBody={sampleSelectedBody}
                  onSelectBody={setSampleSelectedBody}
                  className="relative drop-shadow-[0_20px_48px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_24px_56px_rgba(2,6,23,0.65)]"
                />
              </AstrologyWheel3D>

              {/* 右上角交互提示状态胶囊 */}
              <button
                type="button"
                onClick={() => setSampleSelectedBody(null)}
                className="absolute right-2 top-2 z-20 rounded-full border border-indigo-200/90 bg-white/95 px-3 py-1 text-[11px] font-semibold tracking-wider text-indigo-600 shadow-sm backdrop-blur-md transition-all hover:scale-105 dark:border-indigo-300/30 dark:bg-[#0D1230]/90 dark:text-indigo-200"
              >
                {sampleSelectedBody ? '✦ 点击盘面复原' : '✨ 点击宝珠或星座探索'}
              </button>

              {/* 悬浮星体解读 HUD 胶囊卡片（点选任意星曜时从星盘下方优雅弹入） */}
              <AnimatePresence>
                {sampleSelectedBody && (
                  <motion.div
                    initial={{ opacity: 0, y: 14, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    className="absolute -bottom-6 left-1/2 z-20 w-[92%] max-w-[360px] -translate-x-1/2 rounded-2xl border border-indigo-200/90 bg-white/95 p-3.5 shadow-[0_16px_40px_-8px_rgba(79,70,229,0.25)] backdrop-blur-2xl dark:border-indigo-400/30 dark:bg-[#0D122E]/95 dark:shadow-[0_16px_44px_-8px_rgba(2,6,23,0.75)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wide text-indigo-600 dark:text-indigo-300">
                        ✦ {SAMPLE_PLANET_INSIGHTS[sampleSelectedBody].title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSampleSelectedBody(null);
                        }}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        aria-label="关闭星体解读"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-indigo-100/80">
                      {SAMPLE_PLANET_INSIGHTS[sampleSelectedBody].desc}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ═══ 行动与价值区（微晶徽章 + 超新星聚能按钮） ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={enter(0.32)}
              className="flex max-w-xl flex-col xl:col-start-1 xl:row-start-2 xl:self-start"
            >
              {/* 主操作区：超新星聚能按钮 + 计算说明链接 */}
              <div className="order-1 flex flex-col gap-3.5 sm:flex-row sm:items-center xl:order-2 xl:mt-8">
                <div className="group relative inline-flex w-full sm:w-auto">
                  {/* 聚能脉冲微光（深浅双模呼吸） */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r from-[#4969E9] via-[#7C5CF6] to-[#A855F7] opacity-35 blur-md transition-opacity duration-300 group-hover:opacity-70 motion-reduce:hidden"
                  />
                  <button
                    type="button"
                    onClick={onStart}
                    className={cn(
                      'relative inline-flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-8 sm:w-auto',
                      'bg-gradient-to-r from-[#3B5BDB] via-[#5B6BF0] to-[#7C5CF6]',
                      'text-base font-bold text-white tracking-wide',
                      'shadow-[0_12px_30px_-6px_rgba(59,91,219,0.52)]',
                      'transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_16px_38px_-6px_rgba(124,92,246,0.6)]',
                      'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/45 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0'
                    )}
                  >
                    {/* 星光扫掠流光 */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden"
                      style={{ animation: 'acw-cta-shine 3.5s ease-in-out infinite' }}
                    />
                    <span>开始绘制我的星盘</span>
                    <ArrowRight
                      className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-1"
                      strokeWidth={2.4}
                    />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setHowItWorksOpen(true)}
                  className="self-center px-2 py-1 text-sm font-medium text-indigo-500 underline-offset-4 transition-colors hover:text-indigo-600 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  了解计算方式
                </button>
              </div>

              {/* 天体三律微晶徽章（替代呆板白卡片，通透轻盈） */}
              <ul className="order-2 mt-7 grid gap-3 sm:grid-cols-3 sm:gap-3.5 xl:order-1 xl:mt-0">
                {VALUE_POINTS.map((v) => (
                  <li
                    key={v.title}
                    className={cn(
                      'group relative flex items-start gap-3 rounded-2xl border p-3.5 backdrop-blur-md transition-all duration-200 sm:flex-col sm:gap-2.5',
                      'border-white/70 bg-white/50 hover:bg-white/75 hover:shadow-[0_6px_20px_-6px_rgba(99,102,241,0.12)]',
                      'dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:hover:shadow-[0_8px_24px_-6px_rgba(2,6,23,0.5)]'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-100/80 bg-white/90 text-indigo-500 shadow-sm transition-transform duration-200 group-hover:scale-105 dark:border-indigo-300/15 dark:bg-white/10 dark:text-indigo-300">
                      <v.icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                        {v.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                        {v.text}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 时间未知提示：精致的折叠提示胶囊 */}
              <div className="order-3 mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-amber-50/50 px-3.5 py-1.5 backdrop-blur-sm dark:border-amber-400/15 dark:bg-amber-400/[0.05]">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#B4852A] dark:text-[#E7C873]" strokeWidth={2} />
                <span className="text-xs font-medium text-amber-900/80 dark:text-amber-200/90">
                  出生时间未知？太阳与月亮仍精准定位，将智能隐藏上升与十二宫
                </span>
              </div>
            </motion.div>
          </div>

          {/* 最近记录卡：低敏摘要，有记录才展示 */}
          {recentRecord && (
            <div className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-night-faint">
                  星座寰宇 · {recentRecord.date}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {recentRecord.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restoreAstrologyFromHistory(recentRecord.id)}
                className="min-h-11 shrink-0 rounded-full px-3 text-xs font-medium text-indigo-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                继续查看
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 了解计算方式：轻量底部抽屉 */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent
          className={cn(
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 sm:inset-x-6 sm:bottom-6 sm:rounded-[28px]',
            'rounded-t-[28px] border border-white/60 p-0 pb-[env(safe-area-inset-bottom)]',
            'bg-white/90 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0D1226]/[0.92]',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
          )}
        >
          <div className="px-6 py-6">
            <DialogTitle className="font-heading text-lg font-bold text-slate-900 dark:text-white">
              星盘如何计算
            </DialogTitle>
            <DialogDescription className="sr-only">星盘真值的计算口径与降级规则说明</DialogDescription>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <li>· 以出生日期、时间与地点，按回归黄道与地心视角计算十星体的真实位置。</li>
              <li>· 宫位采用整宫制；相位取合相、六合、刑相、拱相与对冲，按固定容许度表判定。</li>
              <li>· 出生时间未知时不计算上升、天顶与宫位，只展示整日内稳定的星座与主要相位。</li>
              <li>· 星体位置为计算结果，解读基于星盘事实生成；用于自我探索与娱乐参考。</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </DestinyPageScaffold>
  );
}

