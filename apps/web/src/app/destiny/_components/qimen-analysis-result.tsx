'use client';

import React, { useState } from 'react';
import { AlertTriangle, CircleDot, Clock3, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  QimenAnalyzeResult,
  QimenBoardCell,
  QimenLockedSections,
  QimenStreamStatus,
} from './qimen-types';
import { QimenLoadingAnimation } from './qimen-loading-animation';

type QimenAnalysisResultProps = {
  result: QimenAnalyzeResult | null;
  sections: QimenLockedSections;
  loading: boolean;
  streaming: boolean;
  streamStatus: QimenStreamStatus | null;
  error: string | null;
  onBackToForm: () => void;
  onRetry: () => void;
};

const palaceOrder = [
  '巽四宫',
  '离九宫',
  '坤二宫',
  '震三宫',
  '中五宫',
  '兑七宫',
  '艮八宫',
  '坎一宫',
  '乾六宫',
];

const palaceLogicMap: Record<string, string> = {
  离九宫: '离九宫属火，主名声与外显势能。景门与天英同宫时，利曝光表达与创意输出，忌情绪化决断。',
  坤二宫: '坤二宫属土，主承载与执行落地。天芮、死门同宫时宜控风险、补短板，不宜冒进扩张。',
  震三宫: '震三宫属木，主启动与突破。值符/值使落宫通常为局中枢纽，适合定主线与先手动作。',
  巽四宫: '巽四宫属木，主渗透与协同。杜门在此宜深度调研、打磨方案，少做高调宣发。',
  中五宫: '中五宫为中枢，传统上常作寄宫处理。用于统摄全局，不作为单独行动方向。',
  乾六宫: '乾六宫属金，主权威与决断。开门与天心同宫时，利制度化推进、签约与定规则。',
  兑七宫: '兑七宫属金，主沟通与反馈。惊门临宫需防口舌争议，重要沟通建议留书面记录。',
  艮八宫: '艮八宫属土，主边界与止损。生门在艮多见稳健收益，宜从“可持续”而非“短线刺激”切入。',
  坎一宫: '坎一宫属水，主信息与不确定。休门临宫利蓄势与观察，适合低成本试探与迭代。',
};

function getCellStyle(cell: QimenBoardCell) {
  if (cell.palace === '中五宫') {
    return 'bg-gradient-to-b from-slate-50/70 to-slate-100/60 border border-dashed border-slate-300 text-slate-400';
  }
  if (cell.isValueSymbol || cell.isValueDoor) {
    return 'bg-gradient-to-b from-amber-50/80 to-white border border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,.22)]';
  }
  if (cell.isVoid) {
    return 'bg-gradient-to-b from-rose-50/70 to-white border border-rose-200/90';
  }
  if (cell.isHorse) {
    return 'bg-gradient-to-b from-sky-50/70 to-white border border-sky-200/90';
  }
  return 'bg-gradient-to-b from-white to-slate-50/70 border border-slate-200/90';
}

function getDoorColor(door: string) {
  if (door.includes('开') || door.includes('生') || door.includes('休')) return 'text-emerald-700';
  if (door.includes('惊') || door.includes('死') || door.includes('伤')) return 'text-rose-700';
  return 'text-indigo-700';
}

function getStarColor(star: string) {
  if (star.includes('英') || star.includes('冲')) return 'text-[#1E2B6D]';
  if (star.includes('芮')) return 'text-[#5A355A]';
  return 'text-[#222D66]';
}

function palaceMarkerList(cell: QimenBoardCell) {
  return [
    cell.isValueSymbol ? '值符落宫' : null,
    cell.isValueDoor ? '值使落宫' : null,
    cell.isVoid ? '旬空宫位' : null,
    cell.isHorse ? '驿马宫位' : null,
  ].filter(Boolean) as string[];
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

function statusLabel(status: QimenStreamStatus | null) {
  switch (status) {
    case 'queued':
      return '请求已创建，正在进入排盘流程';
    case 'charting':
      return '正在整理盘局与首批结论';
    case 'analyzing':
      return '正在补全完整盘局与策略分析';
    case 'finalizing':
      return '正在整理最终结果';
    default:
      return null;
  }
}

export function QimenAnalysisResult({
  result,
  sections,
  loading,
  streaming,
  streamStatus,
  error,
  onBackToForm,
  onRetry,
}: QimenAnalysisResultProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);

  const hasPartialContent =
    Boolean(result) ||
    Boolean(sections.overallAssessment) ||
    Boolean(sections.chartSummary) ||
    Boolean(sections.riskAlerts?.length) ||
    Boolean(sections.actionSuggestions?.length) ||
    Boolean(sections.timingWindows?.length);
  const progressLabel = statusLabel(streamStatus);

  if (loading) {
    return <QimenLoadingAnimation />;
  }

  if (!result && !hasPartialContent && error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
        <div className="text-lg font-bold text-rose-700">演化分析失败</div>
        <p className="mt-2 text-sm text-rose-600">{error}</p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" className="rounded-full" onClick={onRetry}>
            重试分析
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={onBackToForm}>
            返回修改参数
          </Button>
        </div>
      </div>
    );
  }

  if (!result && !hasPartialContent) {
    return (
      <div className="rounded-3xl border border-white/70 bg-white/75 p-8 shadow-sm">
        <div className="text-lg font-bold text-slate-800">暂无分析结果</div>
        <p className="mt-2 text-sm text-slate-500">请先返回输入信息并发起一次分析。</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 rounded-full"
          onClick={onBackToForm}
        >
          返回信息输入
        </Button>
      </div>
    );
  }

  const boardCells = result
    ? palaceOrder.map((palace) => result.board.find((item) => item.palace === palace) ?? result.board[0])
    : [];
  const activeCell = activeTooltipIndex != null ? boardCells[activeTooltipIndex] : null;
  const meta = result?.chartMeta;
  const summary = sections.chartSummary ?? result?.chartSummary ?? null;
  const overallAssessment = sections.overallAssessment ?? result?.overallAssessment ?? null;
  const riskAlerts = sections.riskAlerts ?? result?.riskAlerts ?? [];
  const actionSuggestions = sections.actionSuggestions ?? result?.actionSuggestions ?? [];
  const timingWindows = sections.timingWindows ?? result?.timingWindows ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-white/75 bg-white/55 p-5 md:p-6 backdrop-blur-2xl shadow-[0_18px_40px_rgba(75,92,150,0.15)]">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[30px] font-black tracking-tight text-[#121F5A]">
              {result?.chartTitle ?? '奇门遁甲排盘生成中'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {progressLabel ?? '三奇六仪，八门九星，运筹帷幄之中，决胜千里之外'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta ? (
              <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
                {meta.dun} · {meta.ju}
              </span>
            ) : (
              <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-500">
                盘局整理中
              </span>
            )}
            <span className="rounded-full bg-[#2E4FDF] px-3 py-1 text-xs font-semibold text-white">
              {streaming ? '结果流式生成中' : 'Step 2 / 2'}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_0.95fr]">
          <div className="relative z-30 rounded-[24px] border border-white/70 bg-white/45 p-4 md:p-5 shadow-[inset_1px_1px_0_rgba(255,255,255,0.85)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-wide text-[#1D2B70]">洛书九宫盘</h3>
              <span className="text-[11px] text-slate-500">
                {result ? '点击宫位可查看排盘依据' : '完整盘局完成后展示'}
              </span>
            </div>

            {result ? (
              <>
                <div className="relative z-40 grid grid-cols-3 gap-3 overflow-visible">
                  {boardCells.map((cell, index) => (
                    <article
                      key={`${cell.palace}-${index}`}
                      onClick={() => setActiveTooltipIndex((prev) => (prev === index ? null : index))}
                      className={cn(
                        'group relative flex min-h-[168px] cursor-pointer flex-col rounded-2xl p-3 transition-transform duration-150 hover:-translate-y-0.5',
                        activeTooltipIndex === index && 'ring-2 ring-[#4F6FFF]/35',
                        getCellStyle(cell)
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{cell.palace}</span>
                        <span className="rounded bg-white/70 px-1 py-[1px] text-[10px] font-semibold text-[#2E4FDF]">
                          {cell.god}
                        </span>
                      </div>

                      <div className="absolute right-2.5 top-7 rounded bg-white/70 px-1 py-[1px] text-[10px] text-slate-500">
                        {cell.direction}
                      </div>

                      <div className="mt-3 text-center">
                        <div
                          className={cn(
                            'text-[46px] font-black leading-none tracking-tight',
                            getStarColor(cell.star)
                          )}
                        >
                          {cell.star}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[30px] font-bold leading-none tracking-tight',
                            getDoorColor(cell.door)
                          )}
                        >
                          {cell.door}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between text-[24px] font-bold">
                        <span className="text-slate-500">{cell.earthStem}</span>
                        <span className="text-[#C5583A]">{cell.heavenStem}</span>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1">
                        {cell.isValueSymbol && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            值符
                          </span>
                        )}
                        {cell.isValueDoor && (
                          <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            值使
                          </span>
                        )}
                        {cell.isVoid && (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            空亡
                          </span>
                        )}
                        {cell.isHorse && (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            驿马
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {activeCell && (
                  <div className="mb-4 mt-4 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-3 shadow-md">
                    <div className="text-[11px] font-semibold text-slate-500">排盘逻辑标注</div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-700">
                      宫位：{activeCell.palace}（洛书{activeCell.luoshu}，{activeCell.direction}）
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-700">
                      八神：{activeCell.god} ｜ 九星：{activeCell.star} ｜ 八门：{activeCell.door}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-700">
                      天盘干：{activeCell.heavenStem} ｜ 地盘干：{activeCell.earthStem}
                    </div>
                    {palaceMarkerList(activeCell).length > 0 && (
                      <div className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                        标记：{palaceMarkerList(activeCell).join('；')}
                      </div>
                    )}
                    <div className="mt-2 text-[11px] leading-relaxed text-slate-600">
                      {palaceLogicMap[activeCell.palace] ??
                        '该宫位需结合全局动静、旺衰与问事主题综合判断。'}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={`board-skeleton-${index}`}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 p-3"
                  >
                    <SkeletonBlock className="h-3 w-16" />
                    <SkeletonBlock className="mt-6 h-12 w-16" />
                    <SkeletonBlock className="mt-2 h-8 w-14" />
                    <div className="mt-6 flex justify-between">
                      <SkeletonBlock className="h-6 w-6" />
                      <SkeletonBlock className="h-6 w-6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/90 md:grid-cols-2">
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4">
                <div className="text-xs font-semibold text-slate-500">空亡与马星</div>
                {meta ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400">旬空</div>
                      <div className="text-base font-bold text-[#131D56]">{meta.jiaziXunkong}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">马星</div>
                      <div className="text-base font-bold text-[#131D56]">{meta.horsePosition}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <SkeletonBlock className="h-12 w-full" />
                    <SkeletonBlock className="h-12 w-full" />
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4">
                <div className="text-xs font-semibold text-slate-500">值符值使</div>
                {meta ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3 py-2">
                      <div className="text-[11px] text-indigo-500">值符</div>
                      <div className="text-base font-bold text-indigo-900">{meta.valueSymbol}</div>
                    </div>
                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3 py-2">
                      <div className="text-[11px] text-indigo-500">值使</div>
                      <div className="text-base font-bold text-indigo-900">{meta.valueDoor}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <SkeletonBlock className="h-14 w-full" />
                    <SkeletonBlock className="h-14 w-full" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="relative z-10 rounded-[24px] border border-white/75 bg-white/50 p-4 md:p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-[#3E5BEA]" />
              <h3 className="text-[26px] font-black text-[#121F5A]">AI 战术决策分析</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">基于当前时家奇门局的风险评估与机遇研判</p>

            <section className="mt-4 rounded-2xl border border-white/75 bg-white/70 p-3.5">
              <div className="text-xs font-semibold text-slate-500">综合格局评估</div>
              {overallAssessment ? (
                <div className="mt-2 text-sm leading-relaxed text-slate-700">{overallAssessment}</div>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-5/6" />
                  <SkeletonBlock className="h-4 w-4/6" />
                </div>
              )}
            </section>

            <section className="mt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-500">
                <ShieldAlert className="h-4 w-4" />
                风险预警 (RISK ASSESSMENT)
              </div>
              {riskAlerts.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {riskAlerts.map((risk, idx) => (
                    <li
                      key={`risk-${idx}`}
                      className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-rose-800"
                    >
                      {risk}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-5/6" />
                </div>
              )}
            </section>

            <section className="mt-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                <Sparkles className="h-4 w-4" />
                AI 决策建议
              </div>
              {actionSuggestions.length > 0 ? (
                <ol className="mt-2 space-y-2">
                  {actionSuggestions.map((advice, idx) => (
                    <li
                      key={`advice-${idx}`}
                      className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200/80 text-[11px] font-bold text-indigo-800">
                        {idx + 1}
                      </span>
                      <span>{advice}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-5/6" />
                </div>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-indigo-100 bg-white/75 p-3.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-indigo-700">决策胜算指数</div>
                {typeof result?.score === 'number' ? (
                  <div className="text-2xl font-black text-indigo-700">{result.score}%</div>
                ) : (
                  <SkeletonBlock className="h-8 w-16" />
                )}
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-indigo-100">
                {typeof result?.score === 'number' ? (
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-[#3F60FF] to-[#67A2FF]"
                    style={{ width: `${result.score}%` }}
                  />
                ) : (
                  <div className="h-2 rounded-full bg-indigo-200/70" style={{ width: '35%' }} />
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-4 rounded-2xl border border-white/75 bg-white/65 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#5D56D6]">
            <Clock3 className="h-4 w-4" />
            关键时间窗口
          </div>
          {timingWindows.length > 0 ? (
            <div className="mt-2 space-y-2">
              {timingWindows.map((item, index) => (
                <div
                  key={`window-${index}`}
                  className="rounded-xl border border-violet-100 bg-violet-50/55 px-3 py-2.5"
                >
                  <div className="text-sm font-bold text-violet-800">{item.period}</div>
                  <div className="mt-1 text-sm text-violet-900/90">{item.guidance}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-5/6" />
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white/60 p-4">
          <div className="text-xs font-semibold text-slate-500">盘局摘要</div>
          {summary ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{summary}</p>
          ) : (
            <div className="mt-2 space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
              <SkeletonBlock className="h-4 w-3/4" />
            </div>
          )}
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result?.disclaimer ?? '完整排盘完成后会补充免责声明与盘局细节。'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={onBackToForm}>
              返回修改参数
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#2F6BFF] text-white"
              onClick={onRetry}
              disabled={streaming}
            >
              {streaming ? '分析生成中...' : '重新演化分析'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
