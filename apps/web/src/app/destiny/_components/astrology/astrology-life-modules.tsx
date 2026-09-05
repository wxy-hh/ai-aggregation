'use client';

/**
 * astrology-life-modules.tsx —— 五大生活模块与本周行动三角（设计文档 §6.5，07 工单）
 *
 * 位于结果页星盘轮章节带之后（全宽区；桌面两列卡片栅格，本周行动卡通栏）。五模块固定顺序：
 * 我是谁 / 关系如何运作 / 事业如何发挥 / 我的优势与盲点 / 本周宇宙提示。
 *
 * 交互规则：
 * - 移动端默认露出前三张卡的标题与摘要，其余折叠为标题；一次只展开一张（手风琴，状态由结果页托管）。
 * - 每张卡「展开依据」只列出已确认事实，点击事实片可定位回星盘轮对应星体。
 * - 每张卡带 `astrology-module-{id}` 锚点：首屏事实卡的「相关模块」可反向展开并滚动至此（08）。
 * - 本周行动三角含周一～周日起止与依据行运；行运不可用时隐藏三角并说明
 *   「本命盘报告不受影响」（当前 mock 层用真实近似天文计算，始终可得）。
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  Eye,
  Footprints,
  Gem,
  Heart,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import type { ModuleId, ModuleReading } from '@/lib/astrology/mock-interpretation';
import { ASPECT_CN, PLANET_CN, ZODIAC_CN } from '@/lib/astrology/zh-names';

/** 模块图标（lucide，视觉锚点不替代文字） */
const MODULE_ICON: Record<ModuleId, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  who: UserRound,
  love: Heart,
  career: Briefcase,
  strengths: Gem,
  week: CalendarDays,
};

/** 五大切面天象专属色系：以沉静低饱和微光区分生活维度，避免一色到底 */
const MODULE_THEME: Record<
  ModuleId,
  {
    iconWrap: string;
    hoverBorder: string;
    scenarioBg: string;
    badgeBg: string;
  }
> = {
  who: {
    iconWrap: 'bg-amber-100/90 text-amber-700 dark:bg-amber-400/[0.14] dark:text-amber-300',
    hoverBorder: 'hover:border-amber-300/40 dark:hover:border-amber-400/20',
    scenarioBg: 'bg-amber-50/80 text-amber-900 dark:bg-amber-400/[0.07] dark:text-amber-200',
    badgeBg: 'border-amber-200/60 bg-amber-50/70 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
  },
  love: {
    iconWrap: 'bg-rose-100/90 text-rose-700 dark:bg-rose-400/[0.14] dark:text-rose-300',
    hoverBorder: 'hover:border-rose-300/40 dark:hover:border-rose-400/20',
    scenarioBg: 'bg-rose-50/80 text-rose-900 dark:bg-rose-400/[0.07] dark:text-rose-200',
    badgeBg: 'border-rose-200/60 bg-rose-50/70 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300',
  },
  career: {
    iconWrap: 'bg-sky-100/90 text-sky-700 dark:bg-sky-400/[0.14] dark:text-sky-300',
    hoverBorder: 'hover:border-sky-300/40 dark:hover:border-sky-400/20',
    scenarioBg: 'bg-sky-50/80 text-sky-900 dark:bg-sky-400/[0.07] dark:text-sky-200',
    badgeBg: 'border-sky-200/60 bg-sky-50/70 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
  },
  strengths: {
    iconWrap: 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-400/[0.14] dark:text-indigo-300',
    hoverBorder: 'hover:border-indigo-300/40 dark:hover:border-indigo-400/20',
    scenarioBg: 'bg-indigo-50/80 text-indigo-900 dark:bg-indigo-400/[0.07] dark:text-indigo-200',
    badgeBg: 'border-indigo-200/60 bg-indigo-50/70 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300',
  },
  week: {
    iconWrap: 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-400/[0.14] dark:text-emerald-300',
    hoverBorder: 'hover:border-emerald-300/40 dark:hover:border-emerald-400/20',
    scenarioBg: 'bg-emerald-50/80 text-emerald-900 dark:bg-emerald-400/[0.07] dark:text-emerald-200',
    badgeBg: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
};

/** 事实引用键 → 事实片标签与轮上定位目标（angle/house 只滚动不选星体） */
function factChipOf(ref: string, facts: AstrologyChartFacts): { label: string; body: PlanetBody | null } {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = facts.planets.find((p) => p.body === body);
    const base = PLANET_CN[body] ?? body;
    return {
      label: parts[2] === 'retrograde' ? `${base} 逆行` : placement?.sign ? `${base} · ${ZODIAC_CN[placement.sign]}` : base,
      body,
    };
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return {
      label: `${PLANET_CN[source as PlanetBody] ?? source} ${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type} ${PLANET_CN[target as PlanetBody] ?? target}`,
      body: source as PlanetBody,
    };
  }
  if (parts[0] === 'angle') {
    const sign = parts[1] === 'ascendant' ? facts.angles.ascendant.sign : facts.angles.midheaven.sign;
    const base = parts[1] === 'ascendant' ? '上升' : '天顶';
    return { label: sign ? `${base} · ${ZODIAC_CN[sign]}` : base, body: null };
  }
  if (parts[0] === 'house') {
    const house = facts.houses.find((h) => h.number === Number(parts[1]));
    return { label: house ? `第 ${house.number} 宫 · ${ZODIAC_CN[house.sign]}` : `第 ${parts[1]} 宫`, body: null };
  }
  return { label: ref, body: null };
}

export type AstrologyLifeModulesProps = {
  facts: AstrologyChartFacts;
  /** 模块解读（由结果页统一计算并下传，供事实卡反向定位复用同一数据） */
  modules: ModuleReading[];
  /** 手风琴状态由结果页托管（事实卡「相关模块」可反向展开定位） */
  openId: ModuleId | null;
  onOpenChange: (id: ModuleId | null) => void;
  /** 点击事实片定位回星盘轮：选中星体并滚动回轮区（angle/house 传 null 仅滚动） */
  onLocateBody: (body: PlanetBody | null) => void;
};

export function AstrologyLifeModules({ facts, modules, openId, onOpenChange, onLocateBody }: AstrologyLifeModulesProps) {
  const reduceMotion = useReducedMotion();
  // 降级档会缺模块卡（如无宫位档缺关系模块）：非周卡数为奇时桌面改三列，避免两列栅格留出半格空白
  const oddNonWeek = modules.filter((m) => m.id !== 'week').length % 2 === 1;
  /** 本周卡通栏跨度随列数联动（三列时跨三列） */
  const weekSpanClass = oddNonWeek ? 'xl:col-span-3' : 'xl:col-span-2';

  return (
    <section aria-label="五个生活模块">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">生活的五个切面</h3>
        <span className="text-xs text-slate-400 dark:text-night-faint">每张卡都能展开依据，回看它来自盘面的哪个位置</span>
      </div>

      {/* 桌面卡片栅格（非周卡奇数时三列、偶数时两列，本周卡通栏）；移动端单列 */}
      <div className={cn('mt-5 grid gap-3 xl:gap-4', oddNonWeek ? 'xl:grid-cols-3' : 'xl:grid-cols-2')}>
        {modules.map((m, i) => (
          <ModuleCard
            key={m.id}
            module={m}
            facts={facts}
            index={i}
            open={openId === m.id}
            onToggle={() => onOpenChange(openId === m.id ? null : m.id)}
            onLocateBody={onLocateBody}
            reduceMotion={Boolean(reduceMotion)}
            weekSpanClass={weekSpanClass}
          />
        ))}
      </div>
    </section>
  );
}

/* ---------- 单张模块卡 ---------- */

function ModuleCard({
  module: m,
  facts,
  index,
  open,
  onToggle,
  onLocateBody,
  reduceMotion,
  weekSpanClass,
}: {
  module: ModuleReading;
  facts: AstrologyChartFacts;
  index: number;
  open: boolean;
  onToggle: () => void;
  onLocateBody: (body: PlanetBody | null) => void;
  reduceMotion: boolean;
  /** 本周卡通栏跨度（随父栅格列数联动：两列跨 2、三列跨 3） */
  weekSpanClass: string;
}) {
  const Icon = MODULE_ICON[m.id];
  /** 移动端第 4/5 张折叠为标题（一次一张）；桌面端全部常显 */
  const collapsedOnMobile = index >= 3;

  const theme = MODULE_THEME[m.id];

  return (
    <motion.article
      id={`astrology-module-${m.id}`}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: (index % 3) * 0.06, ease: 'easeOut' }}
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 shadow-[0_10px_30px_-20px_rgba(30,41,82,0.25)] hover:shadow-[0_18px_40px_-20px_rgba(79,70,229,0.28)] dark:border-white/10 dark:bg-[#0D1226] dark:hover:border-indigo-400/25 dark:hover:shadow-[0_20px_48px_-20px_rgba(0,0,0,0.85)]',
        theme.hoverBorder,
        // 本周卡通栏：行动三角三栏需要完整宽度
        m.id === 'week' && weekSpanClass
      )}
    >
      {/* 头部：图标 + 标题 + 标签 + 展开钮（整行可点，热区 ≥44） */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 sm:px-5"
      >
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', theme.iconWrap)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{m.title}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {m.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-night-muted"
              >
                {t}
              </span>
            ))}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')}
          strokeWidth={2.2}
        />
      </button>

      {/* 正文区：桌面常显；移动端前三张常显、后两张随展开（一次一张） */}
      <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', !open && collapsedOnMobile && 'hidden xl:block')}>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{m.summary}</p>
        {m.scenario && (
          <p className={cn('mt-2 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed', theme.scenarioBg)}>
            {m.scenario}
          </p>
        )}

        {/* 本周行动三角（week 模块正文本体；行运不可用时隐藏并说明） */}
        {m.id === 'week' &&
          (m.weekly ? (
            // 周区间与行运说明已并入主摘要，此处只保留行动三角本体
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  { Icon: Sparkles, label: '机会', text: m.weekly.opportunity, tone: 'text-emerald-600 dark:text-emerald-300' },
                  { Icon: Eye, label: '留意', text: m.weekly.caution, tone: 'text-amber-600 dark:text-amber-300' },
                  { Icon: Footprints, label: '行动', text: m.weekly.action, tone: 'text-indigo-600 dark:text-indigo-300' },
                ].map(({ Icon: TIcon, label, text, tone }) => (
                  <div key={label} className="rounded-xl bg-slate-50/90 p-3 dark:bg-white/[0.04]">
                    <p className={cn('flex items-center gap-1.5 text-xs font-bold', tone)}>
                      <TIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      {label}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{text}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50/90 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500 dark:bg-white/[0.04] dark:text-night-muted">
              本周行运数据暂不可用——你的本命盘报告不受影响，以上结论依然成立。
            </p>
          ))}

        {/* 行动建议（week 模块的行动即三角之「行动」，不重复显示） */}
        {m.id !== 'week' && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 dark:border-white/[0.08] dark:text-night-muted">
            {m.action}
          </p>
        )}

        {/* 展开依据：只列已确认事实，点击定位回星盘轮 */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.26, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl bg-slate-50/90 p-3.5 dark:bg-[#0B1020]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-night-muted">
                  依据（点击可在星盘轮上定位）
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.factReferences.map((ref) => {
                    const chip = factChipOf(ref, facts);
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => onLocateBody(chip.body)}
                        className="inline-flex min-h-8 items-center rounded-full border border-indigo-200/70 bg-white px-3 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-indigo-300/20 dark:bg-white/[0.04] dark:text-indigo-200 dark:hover:bg-indigo-400/10"
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
