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

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Crosshair, MessageCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useHistoryStore } from '@/stores/history-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import { restoreAstrologyFromHistory } from '@/lib/astrology/history';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';
import { PLANET_CN, ZODIAC_CN } from '@/lib/astrology/zh-names';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { formatDegreeMinute } from './astrology-mappers';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyCtaButton } from './astrology-cta-button';
import { AstrologyWheel3D } from './astrology-wheel-3d';
import { AstrologyStarfield } from './astrology-starfield';
import { cn } from '@/lib/utils';

/** 示例星盘十星共振微解读字典（点选星体时悬浮呈现，展现真实计算与洞察深度）；
 *  标题里的星座与度数一律由冻结事实层实时拼装，避免示例盘与文案漂移 */
const SAMPLE_PLANET_INSIGHTS: Record<PlanetBody, string> = {
  sun: '核心人格：温和优雅的平衡者，在协作与审美追求中映射出自身价值。',
  moon: '内在情绪：直率纯粹的行动力本能，渴望最直接、最真实的真实表达。',
  mercury: '思维模式：严谨客观与多重视角权衡，善于换位思考与沟通调解。',
  venus: '情感引力：以审美与和谐为锚的亲密方式，在关系中寻找不费力的平衡。',
  mars: '行动意志：极强的沉淀力与蓄势爆发力，坚韧执着，不达目标誓不罢休。',
  jupiter: '机遇远见：天生开阔的探索哲学与乐观视野，对知识与未知充满热忱。',
  saturn: '人生课题：将灵性与直觉落地为现实结构，在慈悲中修筑清晰的人生边界。',
  uranus: '世代特质：在传统体制中发起严谨务实的革新，重塑底层秩序与规则。',
  neptune: '潜意识流：将深层理想主义注入世俗现实，融化教条冰霜，赋予世界温情。',
  pluto: '蜕变动能：直面心智幽暗处后的绝地重生，具备极其强大的自我重构能力。',
};

/** 示例盘星体卡标题：由冻结事实层拼装星座与度数（事实缺失时只留星体名） */
function sampleInsightTitle(body: PlanetBody, facts: typeof SAMPLE_CHART_ACCURATE): string {
  const planet = facts.planets.find((p) => p.body === body);
  if (!planet || !planet.sign) return PLANET_CN[body];
  const degree = planet.degree !== null ? ` ${formatDegreeMinute(planet.degree)}` : '';
  return `${PLANET_CN[body]} · ${ZODIAC_CN[planet.sign]}${degree}`;
}

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

  /** 示例盘：真实计算域冻结档案（1995-10-08 14:30 上海，见 lib/astrology/sample-chart.ts），组件级常量 */
  const sampleFacts = SAMPLE_CHART_ACCURATE;

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
              <p className="mt-2.5 hidden text-xs leading-relaxed text-day-muted dark:text-night-faint sm:block">
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
              {/* 示例盘标注：设计文档 §6.2 义务；被动标注而非按钮——它是标签不是任务，做成可点胶囊会与主 CTA 争夺首屏焦点。
                  放在盘面上方而非盘内/盘下：盘下会被点选后的 HUD 弹卡（-bottom-6）遮挡。
                  z-10 必须保留：3D 舞台的磨砂表圈是 -inset-[5.5%]（外扩约 27px），会盖到盘上方的标注，
                  且轮盘在 DOM 顺序上靠后、自带层叠上下文，不抬升就会把标注文字压在弧线下面。
                  盘内点选后可用 Escape / 点击盘面空白 / HUD 关闭按钮复原，无需再由这里承担复位职责 */}
              <span className="relative z-10 mx-auto mb-2.5 block w-fit rounded-full border border-indigo-200/90 bg-white/90 px-3 py-1 text-xs font-semibold tracking-wider text-indigo-600 dark:border-indigo-300/30 dark:bg-[#0D1230]/90 dark:text-indigo-200">
                示例星盘 · 可点选星体体验
              </span>

              <AstrologyWheel3D className="relative">
                <AstrologyChartWheel
                  facts={sampleFacts}
                  selectedBody={sampleSelectedBody}
                  onSelectBody={setSampleSelectedBody}
                  className="relative drop-shadow-[0_20px_48px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_24px_56px_rgba(2,6,23,0.65)]"
                />
              </AstrologyWheel3D>

              {/* 悬浮星体解读 HUD 胶囊卡片（点选任意星曜时从星盘下方优雅弹入）。
                  居中位移必须收进 motion 的 x（framer 内联 transform 会覆盖 Tailwind 的 -translate-x-1/2，
                  实测移动端卡片右溢出至屏外），className 里不能再写 translate-x 工具类 */}
              <AnimatePresence>
                {sampleSelectedBody && (
                  <motion.div
                    initial={{ opacity: 0, y: 14, scale: 0.94, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
                    exit={{ opacity: 0, y: 8, scale: 0.96, x: '-50%' }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    className="absolute -bottom-6 left-1/2 z-20 w-[92%] max-w-[360px] rounded-2xl border border-indigo-200/90 bg-white/95 p-3.5 shadow-[0_16px_40px_-8px_rgba(79,70,229,0.25)] backdrop-blur-2xl dark:border-indigo-400/30 dark:bg-[#0D122E]/95 dark:shadow-[0_16px_44px_-8px_rgba(2,6,23,0.75)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wide text-indigo-600 dark:text-indigo-300">
                        ✦ {sampleInsightTitle(sampleSelectedBody, sampleFacts)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSampleSelectedBody(null);
                        }}
                        className="rounded-full p-1 text-day-muted transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        aria-label="关闭星体解读"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-indigo-100/80">
                      {SAMPLE_PLANET_INSIGHTS[sampleSelectedBody]}
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
              {/* 主操作区：超新星聚能按钮 + 计算说明链接。移动端与桌面端都排第一——CTA 是引导页的首要目标，
                  不能在任何断点被价值卡压后（xl 上原为 order-2） */}
              <div className="order-1 flex flex-col gap-3.5 sm:flex-row sm:items-center">
                <div className="group relative inline-flex w-full sm:w-auto">
                  {/* 聚能脉冲微光（深浅双模呼吸） */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r from-[#4969E9] via-[#7C5CF6] to-[#A855F7] opacity-35 blur-md transition-opacity duration-300 group-hover:opacity-70 motion-reduce:hidden"
                  />
                  <AstrologyCtaButton
                    size="lg"
                    onClick={onStart}
                    className="h-14 w-full gap-2.5 tracking-wide hover:shadow-[0_16px_38px_-6px_rgba(124,92,246,0.6)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0 sm:w-auto"
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
                  </AstrologyCtaButton>
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
              <ul className="order-2 mt-7 grid gap-3 sm:grid-cols-3 sm:gap-3.5">
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
                <p className="text-[11px] font-bold tracking-wider text-day-muted dark:text-night-faint">
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

      {/* 了解计算方式：lg 以下为底部抽屉（抓手 + 安全区），lg 起为居中 Modal（G-3 玻璃 + scale 0.95→1 入场）。
          DESIGN §5 规定 lg(1024) 才是移动/桌面形态切换点，640-1023 的触屏平板保持底部抽屉；
          几何与动效全部走断点类，弹层内容只有一份 */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent
          contentAnimation="none"
          className={cn(
            // lg 以下：底部抽屉
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 p-0',
            'rounded-t-[28px] rounded-b-none border border-white/60 pb-[env(safe-area-inset-bottom)]',
            // lg 起：居中 Modal（列宽 max-w-lg，避免宽屏下信息密度过低）
            'lg:inset-x-auto lg:bottom-auto lg:left-[50%] lg:top-[50%] lg:w-[calc(100%-3rem)] lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[28px] lg:pb-0',
            // G-3 玻璃：自上而下渐隐 + 顶部 1px 高光线（深色档落在星盘深空 #0D1226 一脉）
            'bg-gradient-to-b from-white/95 via-white/85 to-white/70 backdrop-blur-2xl',
            'dark:border-white/10 dark:from-[#0D1226]/[0.96] dark:via-[#0C1124]/[0.93] dark:to-[#0B1020]/[0.90]',
            'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.28)]',
            // 入场 200ms（tailwindcss-animate 的 duration-* 与核心 transition-duration 同名，且被
            // data-[state=open]:animate-in 的属性选择器压过，故用内联样式写死动画时长）
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom',
            // 居中断点：入场关键帧会整体覆盖 -translate-x/y-1/2，居中位移必须烘进关键帧
            // （slide-in-from-left-1/2 + top-[48%]，同 shadcn dialog 标准模式），
            // 否则元素从右下偏半屏滑入再落位
            'lg:data-[state=open]:slide-in-from-left-1/2 lg:data-[state=open]:slide-in-from-top-[48%] lg:data-[state=open]:zoom-in-95',
            'lg:data-[state=closed]:slide-out-to-left-1/2 lg:data-[state=closed]:slide-out-to-top-[48%] lg:data-[state=closed]:zoom-out-95'
          )}
          style={{ animationDuration: '200ms' }}
        >
          {/* lg 以下抓手（仅抽屉形态出现） */}
          <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300/70 dark:bg-white/15 lg:hidden" />
          <div className="relative px-6 pb-6 pt-3 lg:py-6">
            {/* 顶部高光线：G-3 壳层的材质边缘（仅居中 Modal 形态） */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/15 lg:block"
            />
            <DialogTitle className="font-heading text-lg font-bold text-slate-900 dark:text-white">
              星盘如何计算
            </DialogTitle>
            <DialogDescription className="sr-only">星盘真值的计算口径与降级规则说明</DialogDescription>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <li>· 以出生日期、时间与地点，按回归黄道与地心视角计算十星体的真实位置。</li>
              <li>· 宫位采用普拉西德制，高纬出生地无法计算时自动回退整宫制；相位取合相、六合、刑相、拱相与对冲，按固定容许度表判定。</li>
              <li>· 出生时间未知时不计算上升、天顶与宫位，只展示整日内稳定的星座与主要相位。</li>
              <li>· 星体位置为计算结果，解读基于星盘事实生成；用于自我探索与娱乐参考。</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </DestinyPageScaffold>
  );
}

