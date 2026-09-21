'use client';

/**
 * astrology-result-view.tsx —— 结果页首屏：护照、主轴、大三要素与交互星盘轮（设计文档 §6.5，06 工单）
 *
 * 结构（章节式布局：首屏双栏 + 全宽章节带，消灭长页单侧空列）：
 * 1. 宇宙护照头（唯一玻璃 Hero 容器，极淡扫描光入场；昵称/资料摘要/精度标签/盘面依据展开）
 * 2. 一句主轴（clamp(40px,4vw,56px) 阅读焦点；mock 流式逐字浮现，≥2 项真值支持并标注依据）
 * 3. 大三要素三卡（术语层/白话层/行为层，主轴落定后 40ms 间隔上浮；时间未知切「核心要素」+ 资料范围提示）
 *    —— 桌面端 1-3 与右侧 4 栏洞察轨同行（8+4）：洞察轨即首屏仪表盘，不再跟随全文
 * 4. 交互星盘轮（全宽章节带：深色渐变舞台，轮盘主角居左 + 白话清单居右并置；移动端通栏出血；
 *    清单默认只露前 4 颗可展开；点选事实卡落于带内下方，含「相关模块」反向定位，08）
 * 5. 五大生活模块与行动三角（07；全宽两列卡片栅格，本周卡通栏；手风琴状态托管于此供反向定位）
 * 6. P0 深度区（08；全宽两页内标签：星盘轮完整清单 / 关键相位；顶部迷你护照条 sticky）
 * 移动端保持单列叙事：护照 → 主轴 → 大三 → 本周入口 → 星盘轮 → 模块 → 洞察轨 → 深读
 * （DOM 顺序即移动叙事顺序，桌面双栏由 order 工具类重排，读屏顺序不打乱）。
 *
 * 分区加载（02 工单：真值来自报告流，解读层按工作区状态分支）：
 * - 事实层（chartFacts）驱动的区块立即渲染：护照头、交互星盘轮、白话清单、术语表、深度区；
 * - 解读层状态（工作区 interpretation）：在途 → 夜色系呼吸骨架（主轴金句、大三要素、本周行动入口、
 *   生活模块、洞察轨分享与问答卡）；暂不可用（LLM 未接入 / 额度不足 / 未取得结论）→ 文案区落
 *   诚实的「解读暂不可用」卡并把解读驱动区块整块收起，事实层照常可交互；
 * - 金句区按金句档位预留 min-height，骨架替换时不产生布局跳动。
 *
 * 诚实性约束：事实层只读 chartFacts；解读内容只来自解读层事件（03 工单的流式分区），
 * 绝不用模板/mock 文案冒充产出；不可用要素缺项为 null，不预留占位、不伪装待定。
 * 长文区域一律实体高对比底，仅护照头 Hero 用玻璃质感（§6.5 硬规则）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Footprints,
  MessageCircleQuestion,
  Moon as MoonIcon,
  Orbit,
  RotateCcw,
  Share2,
  Sparkles,
  Sunrise,
  Sun as SunIcon,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { AstrologyChartFacts, PlanetBody, ZodiacSign } from '@/lib/astrology/chart-facts';
import {
  ASPECT_PLAIN,
  ASCENDANT_READINGS,
  attachWeeklyGuidance,
  MOON_READINGS,
  moduleIdsForBody,
  orderModulesByTopic,
  planetPlainSentence,
  resolveKeyAspectList,
  SUN_READINGS,
  type ElementReading,
  type ModuleId,
  type ModuleReading,
} from '@/lib/astrology/interpretation';
import { astrologySession } from '@/lib/astrology/chart-request';
import { updateAstrologyHistoryInterpretation } from '@/lib/astrology/history';
import {
  ASPECT_CN,
  PLANET_CN,
  PLANET_GLYPH,
  ZODIAC_CN,
  ZODIAC_GLYPH,
} from './astrology-chart-wheel';
import { AstrologyDeepDive } from './astrology-deep-dive';
import { AstrologyInterpretationNotice } from './astrology-interpretation-notice';
import { AstrologyLifeModules } from './astrology-life-modules';
import { AstrologyQaEntry } from './astrology-qa';
import { AstrologyShareEntry, isAstrologyShareAvailable } from './astrology-share-entry';
import { TypewriterHeadline } from './astrology-typewriter-headline';
import { AstrologyWheel3D } from './astrology-wheel-3d';
import { useWheelSceneAvailable } from './astrology-wheel-scene-switch';
import { formatDegreeMinute } from './astrology-mappers';
import { resetAstrologyScroll } from './astrology-scroll';
import type { AstrologyFormData } from '../astrology-types';
import {
  AstrologyPassportHeader,
  houseSystemLabel,
  placementTermLine,
  precisionBadge,
} from './astrology-passport-header';
import { PlanetFactCard } from './astrology-planet-fact-card';
import {
  HeadlineSkeleton,
  BigThreeSkeleton,
  LifeModulesSkeleton,
  RailCardSkeleton,
  SkeletonBlock,
} from './astrology-skeletons';

/* ---------- 展示层小工具 ---------- */

/** 主轴真值引用键 → 中文依据标签（「依据：太阳天秤 × 月亮巨蟹」） */
function refLabel(ref: string, facts: AstrologyChartFacts): string {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = facts.planets.find((p) => p.body === body);
    const name = PLANET_CN[body] ?? body;
    if (parts[2] === 'retrograde') return `${name}逆行`;
    return placement?.sign ? `${name}${ZODIAC_CN[placement.sign]}` : name;
  }
  if (parts[0] === 'angle') {
    return facts.angles.ascendant.sign ? `上升${ZODIAC_CN[facts.angles.ascendant.sign]}` : '上升';
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return `${PLANET_CN[source as PlanetBody] ?? source}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  if (parts[0] === 'transit') {
    // 行运引用（本月天象）：标注「行运」，与本命相位区分
    const [, transiting, type, target] = parts;
    return `行运${PLANET_CN[transiting as PlanetBody] ?? transiting}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  return ref;
}


/* ---------- 移动端折叠 ---------- */

/**
 * 移动端折叠壳（洞察轨密度）：<sm 默认收为一行摘要（标题 + chevron，热区 44px），
 * sm 起摘要行隐藏、内容常显——桌面端保持现状展开，只有移动端默认折叠。
 * hidden：内容自身会整块隐藏时（如主轴缺失的分享入口），摘要行必须同步跳过渲染，
 * 否则移动端点开是一个空壳。
 * className / bodyClassName：给外壳与内容层补桌面端布局类（如星语问答卡在洞察轨里撑满剩余高度）。
 */
function MobileCollapse({
  title,
  hint,
  icon: Icon,
  hidden = false,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  hidden?: boolean;
  /** 外壳附加类（桌面端撑满时用 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col） */
  className?: string;
  /** 内容层附加类（与外壳同为伸缩容器，内容卡才能以 flex-1 占满剩余高度） */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-left transition-colors hover:border-indigo-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-white/10 dark:bg-[#0D1226] sm:hidden"
      >
        <Icon className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-bold',
            open ? 'text-day-muted dark:text-night-faint' : 'text-slate-900 dark:text-white'
          )}
        >
          {open ? '收起' : title}
        </span>
        {!open && hint && (
          <span className="shrink-0 text-[11px] font-medium text-day-muted dark:text-night-faint">
            {hint}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-day-muted transition-transform duration-200 dark:text-night-faint',
            open && 'rotate-180'
          )}
          strokeWidth={2.2}
        />
      </button>
      <div className={cn(open ? 'mt-2.5 sm:mt-0' : 'hidden sm:block', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}


/* ---------- 主组件 ---------- */

export type AstrologyResultViewProps = {
  /** 05 转场插槽：同一 layoutId 的星盘轮在这里落定（附带 06 点选交互参数） */
  wheelSlot: (
    slotClass: string,
    wheelProps?: {
      selectedBody: PlanetBody | null;
      onSelectBody: (body: PlanetBody | null) => void;
    }
  ) => React.ReactNode;
};

export function AstrologyResultView({ wheelSlot }: AstrologyResultViewProps) {
  const reduceMotion = useReducedMotion();
  const {
    formData,
    chartFacts,
    interpretation: interpretationState,
    setWorkspaceState,
  } = useDestinyWorkspaceStore(
    useShallow((s) => ({
      formData: s.astrology.formData,
      chartFacts: s.astrology.chartFacts,
      interpretation: s.astrology.interpretation,
      setWorkspaceState: s.setWorkspaceState,
    }))
  );

  const [selectedBody, setSelectedBody] = useState<PlanetBody | null>(null);
  /** WebGL 星渊场景可用性（null=探测中/不可用 → SVG 轮兜底并保持 DOM 视差） */
  const wheelSceneOk = useWheelSceneAvailable();
  const [showAllTerms, setShowAllTerms] = useState(false);
  /** 白话清单默认只露前 4 颗（防长页）；展开后显示全部行星 */
  const [showAllPlanets, setShowAllPlanets] = useState(false);
  /** 生活模块手风琴（托管在此：事实卡「相关模块」可反向展开定位，08） */
  const [openModuleId, setOpenModuleId] = useState<ModuleId | null>(null);
  /** 移动端校准状态卡的折叠态（<sm 默认收起，桌面端不使用该状态） */
  const [statusOpen, setStatusOpen] = useState(false);

  /** 结果页首次呈现时复位局部与文档滚动位置，保证护照头与主轴处于视口核心 */
  useEffect(() => {
    resetAstrologyScroll();
  }, []);

  /**
   * 解读层内容（主轴 / 大三要素 / 五大模块 / 本周三角与关键相位）：03 工单由报告流分区事件
   * 逐区填充（headline → bigThree → modules → transits 落进工作区 interpretation.report）。
   * 分区未到达时对应区块按骨架占位；解读降级时整块收起并落诚实的「解读暂不可用」卡，
   * 绝不用模板文案冒充产出。
   */
  const interpretation = interpretationState.report;
  /** 五大生活模块（解读分区 + 本周三角组装；关注主题只调整阅读顺序，不改变盘面与文案） */
  const modules = useMemo(() => {
    if (!interpretation) return [];
    const merged = attachWeeklyGuidance(interpretation.modules, interpretation.transits);
    const topicToModule: Record<string, ModuleId> = {
      self: 'who',
      love: 'love',
      career: 'career',
      recent: 'week',
    };
    const priority = formData.topic ? (topicToModule[formData.topic] ?? null) : null;
    return orderModulesByTopic(merged, priority);
  }, [interpretation, formData.topic]);
  /** 大三要素与模块分区是否已到达（未到达时按分区骨架占位） */
  const bigThree = interpretation?.bigThree ?? null;
  const modulesArrived = interpretation !== null && interpretation.modules.length > 0;

  /** 关键相位（深度区）：AI 三段式文案与真值相位按引用键合并，只认盘面稳定存在的相位 */
  const keyAspects = useMemo(() => {
    if (!chartFacts) return { status: 'pending' as const, top: [], rest: [] };
    if (interpretation?.transits) {
      const { top, rest } = resolveKeyAspectList(chartFacts, interpretation.transits.keyAspects);
      return { status: 'ready' as const, top, rest };
    }
    // 分区未到（含已就绪但 transits 仍在途）：按等待态说明；只有解读层确认降级才说不生成
    return {
      status:
        interpretationState.status === 'unavailable'
          ? ('unavailable' as const)
          : ('pending' as const),
      top: [],
      rest: [],
    };
  }, [chartFacts, interpretation, interpretationState.status]);

  /** 解读在途（骨架可展示）与解读降级（诚实卡）的判定：有内容即为就绪，二者互斥 */
  const interpretationPending = interpretation === null && interpretationState.status === 'pending';
  const interpretationUnavailable = interpretation === null && !interpretationPending;

  const headlineReading = interpretation?.headline ?? null;
  const fullHeadline = headlineReading?.text ?? '';

  /** 主轴落定标记：逐字状态由 TypewriterHeadline 自持（隔离 34ms/字的高频重渲染），
   *  父树只在落定那一刻重渲染一次；比对文案而不是布尔值，换主轴文案时自动回到未落定 */
  const [doneHeadline, setDoneHeadline] = useState<string | null>(null);
  const headlineDone = fullHeadline.length > 0 && doneHeadline === fullHeadline;
  /** 落定回调：逐字完成时触发一次，驱动依据 chips 与三要素卡入场 */
  const handleHeadlineDone = useCallback(() => setDoneHeadline(fullHeadline), [fullHeadline]);

  /** 分享入口可用性：与 AstrologyShareEntry 内部同一判定（主轴缺失即整卡隐藏），
   *  折叠壳据此同步跳过渲染，避免移动端留下「点开即空」的死入口 */
  const shareAvailable = useMemo(
    () => (chartFacts ? isAstrologyShareAvailable(chartFacts, fullHeadline, formData.name) : false),
    [chartFacts, fullHeadline, formData.name]
  );

  /** 选中星体的真值与关联相位（白话先行事实卡数据源） */
  const selectedPlacement = useMemo(() => {
    if (!chartFacts || !selectedBody) return null;
    return chartFacts.planets.find((p) => p.body === selectedBody && p.sign !== null) ?? null;
  }, [chartFacts, selectedBody]);
  const selectedAspects = useMemo(() => {
    if (!chartFacts || !selectedBody) return [];
    return chartFacts.aspects
      .filter(
        (a) => a.stability === 'stable' && (a.source === selectedBody || a.target === selectedBody)
      )
      .slice(0, 3);
  }, [chartFacts, selectedBody]);

  /** 选中星体的大三要素解读（若属于日/月则附白话+动作层） */
  const selectedReading: ElementReading | null = useMemo(() => {
    if (!selectedPlacement?.sign) return null;
    if (selectedBody === 'sun') return SUN_READINGS[selectedPlacement.sign];
    if (selectedBody === 'moon') return MOON_READINGS[selectedPlacement.sign];
    return null;
  }, [selectedPlacement, selectedBody]);

  /** 等价文本清单（白话默认；点击行联动轮上选中） */
  const textListItems = useMemo(() => {
    if (!chartFacts) return [];
    return chartFacts.planets
      .filter((p) => p.sign !== null)
      .map((p) => ({
        body: p.body,
        sign: p.sign!,
        degree: p.degree,
        house: p.house,
        retrograde: p.retrograde,
        plain: planetPlainSentence(p.body, p.sign!),
      }));
  }, [chartFacts]);

  /** 解读分区到达即合并进本地统一历史记录（同一条逻辑记录，修订号不动）：
   *  作为兜底与离线恢复接缝，与深模块内部同步保持双保险幂等 */
  useEffect(() => {
    if (!chartFacts || !interpretation) return;
    updateAstrologyHistoryInterpretation(formData, chartFacts, interpretation);
  }, [chartFacts, interpretation, formData]);

  /** 本周行动入口文案（移动端首屏 compact 卡；行运不可用时为 null，入口整块隐藏） */
  const weeklyAction = useMemo(
    () => modules.find((m) => m.id === 'week')?.weekly?.action ?? null,
    [modules]
  );
  /** 选中星体 → 引用它的生活模块（事实卡「相关模块」chips，08 反向定位；解读在途时为空，chips 随解读到达出现） */
  const relatedModuleIds = useMemo(
    () => (selectedBody ? moduleIdsForBody(modules, selectedBody) : []),
    [modules, selectedBody]
  );

  if (!chartFacts) return null;

  const badge = precisionBadge(formData, chartFacts);
  /** 无宫位降级原因：time-unknown（完全未知）/ unstable-in-range（约时不稳定）；含宫位盘为 null */
  const degradeReason = chartFacts.factStability.houses.reason;
  const sunPlacement = chartFacts.planets.find((p) => p.body === 'sun');
  const name = formData.name.trim() || '星盘主人';
  /** 含宫位与否取自事实层（与解读层 withHouses 同源）：解读在途时章节标题与降级说明也已可渲染 */
  const withHouses = chartFacts.dataCompleteness === 'with-houses';

  /** 月亮缺席说明：未知/约时档月亮当日跨座会被整颗隐藏，白话说明「为什么不在名单里」（诚实做到底）。
   *  只在降级原因是已知两种时给对应文案，其余原因不写说明——宁缺毋假，不假定「缺时间」 */
  const moonHiddenNote =
    chartFacts.planets.find((p) => p.body === 'moon')?.sign === null
      ? degradeReason === 'unstable-in-range'
        ? '月亮在所选时段内跨越星座，无法判定，本次未列出。'
        : degradeReason === 'time-unknown'
          ? '月亮在出生当日跨越星座，缺少准确时间无法判定，本次未列出。'
          : null
      : null;

  /** 大三要素卡片数据（分区未到达或不可用项为 null，直接不渲染；分区未到由骨架占位） */
  const bigThreeCards = [
    bigThree?.sun && sunPlacement?.sign
      ? {
          key: 'sun' as const,
          title: '太阳',
          subtitle: '核心气质',
          Icon: SunIcon,
          reading: bigThree.sun,
          term: placementTermLine(chartFacts, 'sun'),
        }
      : null,
    bigThree?.moon
      ? {
          key: 'moon' as const,
          title: '月亮',
          subtitle: '内在情绪',
          Icon: MoonIcon,
          reading: bigThree.moon,
          term: placementTermLine(chartFacts, 'moon'),
        }
      : null,
    bigThree?.ascendant
      ? {
          key: 'ascendant' as const,
          title: '上升',
          subtitle: '外在表达',
          Icon: Sunrise,
          reading: bigThree.ascendant,
          term: placementTermLine(chartFacts, 'ascendant'),
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  /** 降级档只剩 1-2 张要素卡时栅格按数量自适应（单卡横向聚光排版），不留空栅格 */
  const bigThreeCols =
    bigThreeCards.length === 1
      ? 'sm:grid-cols-1'
      : bigThreeCards.length === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-3';
  /** 仅一张要素卡（时间未知档常见）：横向聚光排版开关 */
  const bigThreeSolo = bigThreeCards.length === 1;

  /** 重新测算：回表单并保留已填资料（step 一并回到 form，否则工作区分发仍停在结果页） */
  const recalculate = () =>
    setWorkspaceState('astrology', {
      step: 'form',
      entryView: 'form',
      error: null,
      errorKind: null,
    });

  /** 模块事实片定位：选中星体并平滑滚回星盘轮区（angle/house 类引用仅滚动不选星体） */
  const handleLocateBody = (body: PlanetBody | null) => {
    if (body) setSelectedBody(body);
    document.getElementById('astrology-wheel-section')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  /** 反向定位（08）：展开对应生活模块并平滑滚动到该卡 */
  const handleLocateModule = (id: ModuleId) => {
    setOpenModuleId(id);
    // 等展开高度动画（260ms）落定后再滚动：过早滚动会把收缩态位置当目标，导致定位失效
    const delay = reduceMotion ? 50 : 320;
    window.setTimeout(() => {
      document.getElementById(`astrology-module-${id}`)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, delay);
  };

  /**
   * 重试解读（工单 14：真值不重算）：重走报告流——服务端真值重算结果与本盘确定性一致
   * （单盘约 150ms，近乎零成本），因此工作区保留既有 chartFacts：历史记录合并依赖它的
   * calculatedAt 锚点，重试不应把它换成新一次计算的时间戳。
   */
  const retryInterpretation = () => {
    void astrologySession.retryInterpretation(formData).catch(() => {});
  };

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 xl:max-w-7xl xl:pt-8">
        <div className="grid gap-12 xl:grid-cols-12">
          {/* ═══ 主栏 8 栏（与洞察轨同行构成首屏）：护照头 → 主轴 → 大三要素 ═══ */}
          <div className="order-1 min-w-0 xl:col-span-8">
            {/* ── 1. 宇宙护照头（天命档案微晶印鉴，下沉深组件自闭环依据折叠） ── */}
            <AstrologyPassportHeader
              formData={formData}
              chartFacts={chartFacts}
              reduceMotion={Boolean(reduceMotion)}
            />

            {/* ── 2. 一句主轴（阅读焦点；逐字浮现，≥2 项真值依据标注）。
                    解读降级：诚实的「解读暂不可用」卡 + 重试解读（真值不重算）；
                    分区未到：按金句档位预留 min-height 的呼吸骨架 ── */}
            {interpretationUnavailable ? (
              <div className="mt-12">
                <AstrologyInterpretationNotice
                  reason={interpretationState.reason}
                  onRetry={retryInterpretation}
                />
              </div>
            ) : headlineReading ? (
              <section className="mt-12" aria-label="你的核心主题">
                {/* 逐字机自持状态与定时器（隔离 34ms/字的高频重渲染），落定后回调一次驱动下方依据与三卡。
                      移动端降到 text-xl（字重与琥珀金渐变由组件内部保留），sm 起恢复 clamp(40px,4vw,56px) 原档位 */}
                <div className="max-sm:[&_h2]:text-xl max-sm:[&_h2]:leading-[1.25]">
                  <TypewriterHeadline text={fullHeadline} onDone={handleHeadlineDone} />
                </div>
                {headlineDone && (
                  <motion.div
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.3 }}
                    className="mt-4 flex flex-wrap items-center gap-2"
                  >
                    <span className="text-[11px] font-semibold tracking-wider text-day-muted dark:text-night-faint">
                      依据
                    </span>
                    {headlineReading.factReferences.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80 dark:bg-amber-300" />
                        {refLabel(r, chartFacts)}
                      </span>
                    ))}
                  </motion.div>
                )}
              </section>
            ) : (
              <section className="mt-12" aria-label="你的核心主题">
                <HeadlineSkeleton />
              </section>
            )}

            {/* ── 3. 大三要素（主轴落定后 40ms 间隔上浮；时间未知切「核心要素」）。
                    解读降级时不占据篇幅：事实层说明与星盘轮已完整呈现盘面，解读区由上方的诚实卡统一说明。
                    解读在途：三卡位骨架（完整盘口径）；解读到达即由真实卡替换（含降级档的栏数自适应） ── */}
            {interpretationUnavailable ? null : (
              <section className="mt-12" aria-label={withHouses ? '大三要素' : '核心要素'}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                    {withHouses ? '大三要素' : '核心要素'}
                  </h3>
                  <span className="text-xs text-day-muted dark:text-night-faint">
                    {withHouses ? '太阳 · 月亮 · 上升' : '只展示可计算且稳定的要素'}
                  </span>
                </div>
                {!withHouses && (
                  <p className="mt-2 rounded-2xl border border-violet-300/40 bg-violet-50/70 px-4 py-2.5 text-xs leading-relaxed text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/[0.08] dark:text-violet-200">
                    {degradeReason === 'unstable-in-range'
                      ? '所选时段内上升与宫位不稳定，已按无宫位范围展示——以下结论只基于区间内稳定的事实，不取中点、不补算。'
                      : '出生时间未知，上升与宫位已隐藏——以下结论只基于整日内稳定的事实，不猜测、不补算。'}
                  </p>
                )}
                {/* 分区未到：三卡位骨架（完整盘口径）；分区到达即由真实卡替换（含降级档的栏数自适应） */}
                {bigThree === null ? (
                  <BigThreeSkeleton />
                ) : (
                  <div className={cn('mt-4 grid gap-3', bigThreeCols)}>
                    {bigThreeCards.map((card, i) => (
                      <motion.article
                        key={card.key}
                        initial={reduceMotion || !headlineDone ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduceMotion
                            ? { duration: 0.01 }
                            : {
                                duration: 0.4,
                                delay: headlineDone ? i * 0.04 + 0.05 : 0,
                                ease: 'easeOut',
                              }
                        }
                        className={cn(
                          'group relative rounded-2xl border bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 dark:bg-[#0D1226]',
                          // 太阳为天生主角：鎏金描边 + 金色光晕；其余星卡保持靛紫体系
                          card.key === 'sun'
                            ? 'border-amber-300/70 shadow-[0_10px_30px_-14px_rgba(180,133,42,0.35)] hover:shadow-[0_20px_44px_-14px_rgba(180,133,42,0.45)] dark:border-[#E7C873]/35 dark:shadow-[0_12px_36px_-14px_rgba(231,200,115,0.30)] dark:hover:shadow-[0_22px_50px_-14px_rgba(231,200,115,0.40)]'
                            : 'border-slate-200/80 shadow-[0_10px_30px_-18px_rgba(30,41,82,0.25)] hover:shadow-[0_20px_44px_-18px_rgba(73,105,233,0.35)] dark:border-white/10 dark:hover:border-indigo-300/25',
                          !headlineDone && !reduceMotion && 'opacity-0',
                          // 单卡聚光：横向排版（左识别区 + 右解读区），不留空栅格
                          bigThreeSolo && 'sm:flex sm:items-start sm:gap-6 sm:p-6'
                        )}
                      >
                        <div className={cn(bigThreeSolo && 'sm:w-44 sm:shrink-0')}>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full',
                                card.key === 'sun'
                                  ? 'bg-amber-100/90 text-amber-700 dark:bg-[#E7C873]/[0.14] dark:text-[#E7C873]'
                                  : 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-400/[0.12] dark:text-indigo-300'
                              )}
                            >
                              <card.Icon className="h-4 w-4" strokeWidth={1.9} />
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {card.title}
                              </p>
                              <p className="text-[11px] text-day-muted dark:text-night-faint">
                                {card.subtitle}
                              </p>
                            </div>
                          </div>
                          <p
                            className={cn(
                              'mt-3 text-[11px] font-semibold tracking-wide',
                              card.key === 'sun'
                                ? 'text-amber-700 dark:text-[#E7C873]'
                                : 'text-indigo-500 dark:text-indigo-300/90'
                            )}
                          >
                            {card.term}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200',
                              bigThreeSolo && 'sm:mt-0'
                            )}
                          >
                            {card.reading.plain}
                          </p>
                          <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-white/[0.08] dark:text-night-muted">
                            {card.reading.action}
                          </p>
                        </div>
                        {/* 整卡可点：卡面上浮即承诺可点（DESIGN §4.4 可点击卡片整卡可点），
                            点击在星盘轮上定位这颗星体；上升不是可选星体，只滚到轮盘区不选中 */}
                        <button
                          type="button"
                          onClick={() => handleLocateBody(card.key === 'ascendant' ? null : card.key)}
                          aria-label={`在星盘轮上查看${card.title}`}
                          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                        />
                      </motion.article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── 3.5 本周行动入口（仅移动端 <xl；设计文档 §6.5 移动端顺序：护照 → 主轴 → 大三要素 → 本周行动入口，星盘轮位于首屏下方。
                    点击展开并定位到下方「本周宇宙提示」模块的行动三角；行运不可用时整块隐藏，不假装有数据。
                    解读在途：同高档位骨架占位，避免星盘轮章节带随入口出现而整体下移；解读降级：整块隐藏 ── */}
            {interpretationUnavailable ? null : weeklyAction ? (
              <button
                type="button"
                onClick={() => handleLocateModule('week')}
                className={cn(
                  'mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 text-left shadow-sm backdrop-blur-sm backdrop-saturate-150 xl:hidden',
                  'transition-all duration-200 active:scale-[0.98] hover:border-indigo-300 hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                  'dark:border-white/10 dark:bg-[#0D1226]/80 dark:hover:bg-[#121832]'
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-indigo-600 shadow-sm dark:bg-white/[0.08] dark:text-indigo-300">
                  <Footprints className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold tracking-[0.18em] text-indigo-500 dark:text-indigo-300/90">
                    本周行动
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {weeklyAction}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-indigo-400 dark:text-indigo-300/70"
                  strokeWidth={2.2}
                />
              </button>
            ) : interpretation === null ? (
              <div
                aria-hidden
                className="mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-[#0D1226]/80 xl:hidden"
              >
                <SkeletonBlock className="h-9 w-9 rounded-full" />
                <span className="min-w-0 flex-1">
                  <SkeletonBlock className="h-2.5 w-16" />
                  <SkeletonBlock className="mt-2 h-3 w-2/3" />
                </span>
              </div>
            ) : null}
          </div>

          {/* ── 4. 交互星盘轮（全宽章节带：深邃星空与液态微光渐变舞台；轮盘主角居左 + 白话清单居右，点选事实卡落于带内下方。
                  移动端通栏出血（-mx-5）保证盘面尺寸不被双层内边距压缩） ── */}
          <section
            id="astrology-wheel-section"
            aria-label="交互星盘轮"
            className="order-2 relative -mx-5 overflow-hidden border-y border-indigo-100/80 bg-[radial-gradient(ellipse_at_top_left,rgba(224,231,255,0.7),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(245,243,255,0.8),transparent_50%),linear-gradient(135deg,#F6F8FF_0%,#FFFFFF_50%,#F3F5FF_100%)] p-5 shadow-[0_24px_64px_-32px_rgba(30,41,82,0.15)] dark:border-white/[0.08] dark:bg-[radial-gradient(ellipse_at_20%_20%,rgba(67,56,202,0.18),transparent_48%),radial-gradient(ellipse_at_80%_80%,rgba(147,51,234,0.12),transparent_48%),linear-gradient(155deg,#040711_0%,#090E20_50%,#0C132B_100%)] sm:mx-0 sm:rounded-[32px] sm:border sm:p-8 xl:order-3 xl:col-span-12 xl:p-10"
          >
            {/* 章节带氛围：顶缘微晶星光线 + 轮盘列后方双层液态星云辉光（纯装饰） */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent dark:via-indigo-300/40"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-28 top-1/2 hidden h-[480px] w-[480px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,rgba(147,51,234,0.10)_45%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(129,140,248,0.22)_0%,rgba(168,85,247,0.14)_50%,transparent_72%)] xl:block"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -bottom-20 hidden h-[380px] w-[380px] rounded-full bg-indigo-400/10 blur-3xl dark:bg-sky-500/[0.08] xl:block"
            />

            <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                你的星盘
              </h3>
              <span className="text-xs text-day-muted dark:text-night-faint">
                点选任一星体，查看它在你生活里的样子
              </span>
            </div>

            <div className="relative mt-6 xl:mt-8 xl:grid xl:grid-cols-2 xl:items-center xl:gap-10">
              {/* 左列：轮盘主角 */}
              <div className="relative mx-auto w-full max-w-[min(100%,420px)] sm:max-w-[520px]">
                <div
                  aria-hidden
                  className="absolute inset-[6%] rounded-full bg-indigo-400/10 blur-2xl dark:bg-indigo-500/15"
                />
                {/* 3D 舞台包在 layoutId 穿入元素之外：不影响仪式→结果的穿入测量；
                    WebGL 场景接管后关闭 DOM 指针视差（场景内有相机视差，避免双重倾斜） */}
                <AstrologyWheel3D className="relative" parallax={wheelSceneOk !== true}>
                  {wheelSlot('relative mx-auto w-full', {
                    selectedBody,
                    onSelectBody: setSelectedBody,
                  })}
                </AstrologyWheel3D>
              </div>

              {/* 右列：等价文本清单与星体深度解构台（桌面端原位切换，彻底消除底部撑开与页面跳动） */}
              <div className="mt-6 min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_16px_44px_-24px_rgba(30,41,82,0.25)] dark:border-white/[0.12] dark:bg-[#0D1226]/[0.88] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.85)] sm:p-5 xl:mt-0 xl:flex xl:min-h-[500px] xl:flex-col">
                <AnimatePresence mode="wait" initial={false}>
                  {selectedPlacement?.sign && selectedBody ? (
                    <motion.div
                      key={selectedBody}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                      className="flex-1"
                    >
                      <PlanetFactCard
                        body={selectedBody}
                        placement={
                          selectedPlacement as NonNullable<typeof selectedPlacement> & {
                            sign: ZodiacSign;
                          }
                        }
                        reading={selectedReading}
                        aspects={selectedAspects}
                        relatedModuleIds={relatedModuleIds}
                        modules={modules}
                        allPlanets={textListItems}
                        onSelectBody={(b) => setSelectedBody(b)}
                        onLocateModule={handleLocateModule}
                        onClose={() => setSelectedBody(null)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list-view"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                      className="flex-1"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        看不懂星盘？每一颗星的白话位置都在这里
                      </p>
                      <p className="mt-0.5 text-[11px] text-day-muted dark:text-night-faint">
                        点选星体可在右侧直接查看深度解读与相位
                      </p>
                      <ul className="mt-3 space-y-1">
                        {(showAllPlanets ? textListItems : textListItems.slice(0, 4)).map(
                          (item) => {
                            const Glyph = PLANET_GLYPH[item.body];
                            const active = selectedBody === item.body;
                            return (
                              <li key={item.body}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedBody(active ? null : item.body)}
                                  aria-pressed={active}
                                  className={cn(
                                    'flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                                    active
                                      ? 'bg-indigo-50 dark:bg-indigo-400/10'
                                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                                  )}
                                >
                                  <Glyph
                                    width={15}
                                    height={15}
                                    className={cn(
                                      'mt-1 shrink-0',
                                      active
                                        ? 'stroke-indigo-500 dark:stroke-indigo-300'
                                        : 'stroke-slate-400 dark:stroke-slate-500'
                                    )}
                                  />
                                  <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
                                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                      {PLANET_CN[item.body]}在{ZODIAC_CN[item.sign]}
                                      {item.degree !== null &&
                                        ` ${formatDegreeMinute(item.degree)}`}
                                      {item.house !== null && ` · 第 ${item.house} 宫`}
                                      {item.retrograde === true && ' · 逆行中'}
                                    </span>
                                    <br />
                                    {item.plain}
                                  </span>
                                </button>
                              </li>
                            );
                          }
                        )}
                      </ul>
                      {/* 月亮缺席注明：无宫位档月亮跨座被整颗隐藏，白话说明为什么名单里没有它 */}
                      {moonHiddenNote && (
                        <p className="mt-2 text-[11px] leading-relaxed text-day-muted dark:text-night-faint">
                          {moonHiddenNote}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/* 清单折叠：默认只露前 4 颗，展开看全部行星 */}
                        {textListItems.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setShowAllPlanets((v) => !v)}
                            aria-expanded={showAllPlanets}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                          >
                            {showAllPlanets
                              ? '收起清单'
                              : `展开其余 ${textListItems.length - 4} 颗星`}
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 transition-transform duration-200',
                                showAllPlanets && 'rotate-180'
                              )}
                              strokeWidth={2.2}
                            />
                          </button>
                        )}
                        {/* 术语层折叠：容许度/强度等完整数据 */}
                        <button
                          type="button"
                          onClick={() => setShowAllTerms((v) => !v)}
                          aria-expanded={showAllTerms}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                        >
                          {showAllTerms ? '收起术语数据' : '查看全部术语数据'}
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200',
                              showAllTerms && 'rotate-180'
                            )}
                            strokeWidth={2.2}
                          />
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {showAllTerms && (
                          <motion.div
                            initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <ul className="mt-2 space-y-1.5 rounded-xl bg-slate-50/90 p-3.5 text-[11px] leading-relaxed text-slate-500 dark:bg-[#090E20] dark:text-night-muted">
                              {chartFacts.aspects
                                .filter((a) => a.stability === 'stable')
                                .map((a) => (
                                  <li key={`${a.source}-${a.target}-${a.type}`}>
                                    {PLANET_CN[a.source]} {ASPECT_CN[a.type]} {PLANET_CN[a.target]}
                                    {a.orb !== null && ` · 偏差 ${a.orb.toFixed(1)}°`}
                                    {a.strength !== null &&
                                      ` · 强度 ${Math.round(a.strength * 100)}%`}
                                    ——{ASPECT_PLAIN[a.type]}
                                  </li>
                                ))}
                              <li className="border-t border-slate-200/70 pt-2 dark:border-white/[0.08]">
                                回归黄道 · {withHouses ? houseSystemLabel(chartFacts) : '无宫位'} ·
                                容许度表 {chartFacts.orbTableVersion}
                              </li>
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 移动端专属浮动抽屉（<xl）：悬浮于视口底部，绝不撑大或推挤 DOM 文档流，彻底杜绝跳动 */}
            <AnimatePresence>
              {selectedPlacement?.sign && selectedBody && (
                <div className="xl:hidden">
                  {/* 背景微晶暗色遮罩 */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setSelectedBody(null)}
                    className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-md"
                    aria-hidden
                  />
                  {/* 底部抽屉主体 */}
                  <motion.div
                    key={`mobile-fact-${selectedBody}`}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: '100%' }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.32, 0.72, 0, 1] }}
                    className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[82vh] overflow-y-auto custom-scrollbar rounded-[24px] border border-white/40 bg-white/95 p-5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#0E1430]/[0.92]"
                    role="dialog"
                    aria-label={`${PLANET_CN[selectedBody]}事实卡`}
                  >
                    {/* 顶部手柄条 */}
                    <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-slate-300/80 dark:bg-slate-600/80" />
                    <PlanetFactCard
                      body={selectedBody}
                      placement={
                        selectedPlacement as NonNullable<typeof selectedPlacement> & {
                          sign: ZodiacSign;
                        }
                      }
                      reading={selectedReading}
                      aspects={selectedAspects}
                      relatedModuleIds={relatedModuleIds}
                      modules={modules}
                      allPlanets={textListItems}
                      onSelectBody={(b) => setSelectedBody(b)}
                      onLocateModule={(id) => {
                        setSelectedBody(null);
                        handleLocateModule(id);
                      }}
                      onClose={() => setSelectedBody(null)}
                      isDrawer
                    />
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </section>

          {/* ── 5. 五大生活模块与本周行动三角（07；全宽两列卡片栅格；事实片点击定位回轮；手风琴状态托管）
                  模块分区未到：同构骨架占位（章节标题先立）；分区到达即由真实卡替换；解读降级：整段不渲染 ── */}
          <div className="order-3 min-w-0 xl:order-4 xl:col-span-12">
            {interpretationUnavailable ? null : !modulesArrived ? (
              <LifeModulesSkeleton />
            ) : (
              <AstrologyLifeModules
                facts={chartFacts}
                modules={modules}
                openId={openModuleId}
                onOpenChange={setOpenModuleId}
                onLocateBody={handleLocateBody}
              />
            )}
          </div>

          {/* ═══ 右侧 4 栏洞察轨（桌面与首屏区同行 8+4，内容即首屏仪表盘；移动端单列排在模块后、深读前。
                  移动端三卡默认收为一行摘要（<sm），桌面端保持现状展开——首屏密度只压移动端） ═══ */}
          {/* 桌面端洞察轨为纵向伸缩容器：星语问答卡展开后可撑满本行剩余高度，
              底部与左栏要素卡底部齐平（整轨高度即首屏行高，由左栏内容决定） */}
          <aside
            className="order-4 min-w-0 space-y-4 xl:order-2 xl:col-span-4 xl:flex xl:flex-col"
            aria-label="洞察轨"
          >
            {/* 1. 星盘档案校准状态（合并原盘面范围与重新测算，消除重复卡片与双重紫色按钮） */}
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]">
              {/* 控制台顶缘星光（深色模式的一线辉光） */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent dark:block"
              />
              {/* 移动端折叠摘要行（标题 + 盘面档位 + chevron，热区 44px）；sm 起隐藏，标题回到卡内标题行 */}
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                aria-expanded={statusOpen}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:hidden"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Orbit
                    className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
                    strokeWidth={1.9}
                  />
                  <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    星盘校准状态
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
                    {withHouses ? '完整十二宫' : '稳定行星盘'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-day-muted transition-transform duration-200 dark:text-night-faint',
                      statusOpen && 'rotate-180'
                    )}
                    strokeWidth={2.2}
                  />
                </span>
              </button>
              {/* 卡体：桌面端常显；移动端随摘要行展开（同一份内容，不做两套排版） */}
              <div className={cn('px-5 pb-5 sm:block sm:pt-5', !statusOpen && 'hidden')}>
                <div className="hidden items-center justify-between sm:flex">
                  <div className="flex items-center gap-2">
                    <Orbit
                      className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]"
                      strokeWidth={1.9}
                    />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      星盘校准状态
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
                    {withHouses ? '完整十二宫' : '稳定行星盘'}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                  {withHouses
                    ? '当前为含宫位完整盘：行星、十二宫、轴线与主要相位已全部精确校准。'
                    : degradeReason === 'unstable-in-range'
                      ? '约时已降级为无宫位行星盘：上升、天顶与宫位在所选时段内不稳定，仅呈现高稳定事实。'
                      : '当前为无宫位行星盘：呈现整日内稳定的行星星座与主要相位。补充出生时间可解锁上升与十二宫。'}
                </p>
                <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={recalculate}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-semibold text-slate-700 transition-all duration-150 hover:border-indigo-300/70 hover:bg-slate-100/90 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-indigo-400/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                    {withHouses ? '修改资料重新演算' : '补充资料或重校'}
                  </button>
                </div>
              </div>
            </section>

            {/* 2. 分享星语海报（脱敏海报卡预览弹层；主轴缺失时入口与折叠壳一并隐藏。
                   主轴分区未到：同档卡片骨架占位，避免洞察轨在解读到达时整体下移；解读降级：整卡隐藏
                   ——分享卡的主语是主轴金句，没有解读就没有可分享的一句话，不做空入口） */}
            {interpretationUnavailable ? null : headlineReading === null ? (
              <RailCardSkeleton />
            ) : (
              <MobileCollapse
                title="分享星语海报"
                hint="脱敏海报"
                icon={Share2}
                hidden={!shareAvailable}
              >
                <AstrologyShareEntry
                  facts={chartFacts}
                  headline={fullHeadline}
                  name={formData.name}
                />
              </MobileCollapse>
            )}

            {/* 3. 星语问答（真功能：桌面内联面板 / 移动端底部抽屉，引用可定位）
                摘要文案不计数：剩余次数由面板内徽章呈现（按账号可用额度折算，不设每报告上限），
                静态文案不会与状态失配。
                桌面端展开问答舱后撑满本轨剩余高度：面板底部与左栏要素卡底部齐平（收拢态不撑高，
                卡片保持内容高度）。折叠壳的两层都要参与伸缩，内容卡才能以 flex-1 吃到剩余高度。
                模块分区未到：问答只引用已确认的模块事实，先占位骨架（不出「无模块可引用」的假答案）；
                解读降级：整卡隐藏（模块事实不在，问答无可引用真值） */}
            {interpretationUnavailable ? null : !modulesArrived ? (
              <RailCardSkeleton />
            ) : (
              <MobileCollapse
                title="星语问答"
                hint="AI 解读问答"
                icon={MessageCircleQuestion}
                className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
                bodyClassName="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
              >
                <AstrologyQaEntry
                  facts={chartFacts}
                  modules={modules}
                  onLocateBody={handleLocateBody}
                  onLocateModule={handleLocateModule}
                />
              </MobileCollapse>
            )}
          </aside>
        </div>

        {/* ═══ 6. P0 深度区（08：全宽，星盘轮完整清单 / 关键相位两个页内标签） ═══ */}
        <AstrologyDeepDive
          facts={chartFacts}
          keyAspects={keyAspects}
          passport={{
            name,
            sunSign: sunPlacement?.sign ?? null,
            badgeText: badge.text,
            badgeClassName: badge.className,
          }}
          onLocateBody={handleLocateBody}
        />
      </div>
    </>
  );
}
