'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DestinyReport } from './types';

type ZiweiWorkspaceProps = {
  report: DestinyReport | null;
  loading: boolean;
  error: string | null;
  onRecalculate: () => void;
  onRetry: () => void;
};

type PanelTab = 'overview' | 'timeline' | 'relations';

const tabOptions: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: '命理总论' },
  { key: 'timeline', label: '大限流年' },
  { key: 'relations', label: '六亲缘分' },
];

const palaceLabels = [
  '父母宫',
  '福德宫',
  '田宅宫',
  '官禄宫',
  '命宫',
  '兄弟宫',
  '奴仆宫',
  '夫妻宫',
  '迁移宫',
  '子女宫',
  '财帛宫',
  '疾厄宫',
];

const palaceGridAreas = [
  'col-start-1 row-start-1',
  'col-start-2 row-start-1',
  'col-start-3 row-start-1',
  'col-start-4 row-start-1',
  'col-start-1 row-start-2',
  'col-start-1 row-start-3',
  'col-start-4 row-start-2',
  'col-start-4 row-start-3',
  'col-start-1 row-start-4',
  'col-start-2 row-start-4',
  'col-start-3 row-start-4',
  'col-start-4 row-start-4',
];

const palaceToneClasses = [
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#D7C07B]/35 bg-[#FFF9EA]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#E3A59D]/35 bg-[#FFF2F0]/88',
  'border-[#A7B57B]/35 bg-[#F7FAEE]/88',
  'border-[#D7C07B]/30 bg-[#FFF8E6]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C6B6E8]/35 bg-[#F4F0FF]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#A7B57B]/30 bg-[#F7FAEE]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C0C9D8]/35 bg-[#F5F7FB]/88',
];

const palaceLabelToneClasses = [
  'text-[#5E769E]',
  'text-[#A7862B]',
  'text-[#657A96]',
  'text-[#B45A4C]',
  'text-[#6A7F3F]',
  'text-[#A7862B]',
  'text-[#5E769E]',
  'text-[#6956A7]',
  'text-[#5A7391]',
  'text-[#6A7F3F]',
  'text-[#5E769E]',
  'text-[#607089]',
];

const starThemeMap: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-[#5A4BEA]' },
  { names: ['天府'], className: 'text-[#2D7D58]' },
  { names: ['武曲'], className: 'text-[#2F5FAE]' },
  { names: ['太阳'], className: 'text-[#C77A1A]' },
  { names: ['太阴'], className: 'text-[#6B5CA5]' },
  { names: ['天机'], className: 'text-[#1F8A84]' },
  { names: ['天同'], className: 'text-[#329D7C]' },
  { names: ['廉贞'], className: 'text-[#B04A6B]' },
  { names: ['贪狼'], className: 'text-[#8B5E1A]' },
  { names: ['巨门'], className: 'text-[#4E5E7A]' },
  { names: ['天相'], className: 'text-[#3A6AA6]' },
  { names: ['天梁'], className: 'text-[#6D8A2E]' },
  { names: ['七杀'], className: 'text-[#A23A3A]' },
  { names: ['破军'], className: 'text-[#7E4AA1]' },
];

const moduleCardToneClasses = [
  'border-[#CFE0FF] bg-[#F7FAFF] shadow-[0_8px_24px_-18px_rgba(57,79,230,0.35)]',
  'border-[#D6E5F7] bg-[#F7FBFF] shadow-[0_8px_24px_-18px_rgba(37,99,235,0.28)]',
  'border-[#DDD9FF] bg-[#F9F7FF] shadow-[0_8px_24px_-18px_rgba(109,40,217,0.26)]',
];

function getStarColorClass(star: string | undefined): string {
  if (!star) return 'text-slate-800';
  for (const item of starThemeMap) {
    if (item.names.some((name) => star.includes(name))) {
      return item.className;
    }
  }
  return 'text-slate-800';
}

export function ZiweiWorkspace({
  report,
  loading,
  error,
  onRecalculate,
  onRetry,
}: ZiweiWorkspaceProps) {
  const [tab, setTab] = useState<PanelTab>('overview');
  const [activePalaceLabel, setActivePalaceLabel] = useState<string>('命宫');

  const palaceData = useMemo(() => {
    if (!report?.ziweiPalaces?.length) return [];

    const byLabel = new Map(report.ziweiPalaces.map((item) => [item.label, item]));
    return palaceLabels
      .map((label, index) => {
        const fallback = report.ziweiPalaces?.[index];
        const palace = byLabel.get(label) ?? fallback;
        if (!palace) return null;
        return {
          key: palace.key ?? `palace-${index + 1}`,
          label,
          branch: palace.branch ?? '',
          stars: palace.stars?.slice(0, 3) ?? [],
          dominant: palace.dominant ?? palace.stars?.[0] ?? '',
          summary: palace.summary ?? '',
          suggestions: palace.suggestions?.slice(0, 4) ?? [],
        };
      })
      .filter(Boolean);
  }, [report]);

  const timeline = report?.timeline ?? [];
  const activePalace = palaceData.find((item) => item.label === activePalaceLabel) ?? palaceData[0];

  const overviewOpportunities = activePalace?.suggestions?.slice(0, 3) ?? [];
  const overviewRisks = [
    `留意${activePalace?.label ?? '当前宫位'}主题下的情绪波动与冲动决策。`,
    '避免在同一周期内同时推进过多关键事项。',
  ];
  const overviewActions = [
    `围绕${activePalace?.label ?? '当前宫位'}设定本月一到两项核心目标。`,
    '每周复盘一次进度并修正执行节奏。',
  ];

  const relationOpportunities = report?.modules.love.bullets.slice(0, 3) ?? [];
  const relationRisks = report?.modules.health.bullets.slice(0, 3) ?? [];
  const relationActions = report?.modules.personality.bullets.slice(0, 3) ?? [];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundColor: '#F8F8FC',
          backgroundImage:
            'radial-gradient(at 0% 0%, #f8f8fc 0%, transparent 50%), radial-gradient(at 100% 0%, #8cb1f1 0%, transparent 50%), radial-gradient(at 100% 100%, #c4bfea 0%, transparent 50%), radial-gradient(at 0% 100%, #ffffff 0%, transparent 50%)',
        }}
      />

      <div className="h-full w-full overflow-y-auto p-6 xl:pl-[320px]">
        <div className="flex flex-col gap-6">
          <header className="flex justify-between items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#08134D]">
                AI 紫微斗数{' '}
                <span className="text-base text-[#394FE6] font-medium">星盘全景视图</span>
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                基于十四主星与宫位逻辑的深度人生轨迹预测
              </p>
            </div>
            <Button
              type="button"
              onClick={onRecalculate}
              className="rounded-full bg-[#394FE6] text-white hover:brightness-110"
            >
              重新排盘
            </Button>
          </header>

          {loading && (
            <div className="rounded-3xl border border-white/70 bg-white/75 p-8 shadow-sm">
              <div className="text-lg font-bold text-slate-800">正在生成紫微斗数排盘...</div>
              <p className="mt-2 text-sm text-slate-500">模型：doubao-seed-2-0-lite-260215</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
              <div className="text-lg font-bold text-rose-700">紫微测算失败</div>
              <p className="mt-2 text-sm text-rose-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-full"
                onClick={onRetry}
              >
                重试测算
              </Button>
            </div>
          )}

          {!loading && !error && report && (
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
                <div className="rounded-3xl border border-[#D8DFF2]/80 bg-[rgba(244,247,255,0.82)] p-5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                  <div className="grid grid-cols-4 grid-rows-4 gap-3 aspect-square">
                    {palaceData.map((palace, index) => {
                      const isActive = palace.label === activePalaceLabel;
                      const toneClass = palaceToneClasses[index % palaceToneClasses.length];
                      const labelToneClass =
                        palaceLabelToneClasses[index % palaceLabelToneClasses.length];
                      const dominantColorClass = getStarColorClass(
                        palace.dominant || palace.stars[0]
                      );
                      return (
                        <button
                          key={palace.key}
                          type="button"
                          onClick={() => setActivePalaceLabel(palace.label)}
                          className={[
                            palaceGridAreas[index],
                            'rounded-2xl p-3.5 flex flex-col justify-between text-left transition border shadow-[0_6px_18px_-14px_rgba(30,41,59,0.45),inset_0_1px_0_rgba(255,255,255,0.75)]',
                            toneClass,
                            isActive
                              ? 'ring-2 ring-[#4A63EE]/35 border-[#4A63EE]/45 shadow-[0_10px_26px_-14px_rgba(59,91,246,0.46),inset_0_1px_0_rgba(255,255,255,0.84)]'
                              : 'hover:border-[#5D74EA]/35 hover:shadow-[0_12px_30px_-18px_rgba(59,91,246,0.35),inset_0_1px_0_rgba(255,255,255,0.84)]',
                          ].join(' ')}
                        >
                          <div>
                            <div className={`text-[11px] font-extrabold ${labelToneClass}`}>
                              {palace.label}
                            </div>
                            <div
                              className={`mt-1 text-xl font-black tracking-tight ${dominantColorClass}`}
                            >
                              {palace.dominant || palace.stars[0] || '主星'}
                            </div>
                            {palace.stars.length > 1 && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {palace.stars.slice(1).join(' · ')}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">{palace.branch}</span>
                          </div>
                        </button>
                      );
                    })}

                    <div className="col-start-2 col-span-2 row-start-2 row-span-2 rounded-3xl border border-[#D8DFF2]/80 bg-white/90 p-4 flex flex-col items-center justify-center text-center shadow-[0_12px_36px_-24px_rgba(59,91,246,0.5),inset_0_1px_0_rgba(255,255,255,0.85)]">
                      <div className="text-[42px] leading-none font-black text-[#111F6D]">
                        {report.ziweiCenter?.chartTitle ?? report.profile.name}
                      </div>
                      <div className="text-sm text-slate-500 mt-2">
                        {report.profile.lunarText || report.profile.birthText}
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="rounded-2xl border border-[#4A63EE]/20 bg-[#4A63EE]/8 px-4 py-2">
                          <div className="text-xs font-bold text-[#4A63EE]">命主</div>
                          <div className="text-2xl font-black text-[#1A2C8A] mt-0.5">
                            {report.ziweiCenter?.mingZhu ?? '紫微'}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[#D7B853]/24 bg-[#F9F4DD] px-4 py-2">
                          <div className="text-xs font-bold text-[#B38921]">身主</div>
                          <div className="text-2xl font-black text-[#6E5312] mt-0.5">
                            {report.ziweiCenter?.shenZhu ?? '天相'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {[report.modules.personality, report.modules.career, report.modules.wealth].map(
                    (module, index) => {
                      const toneClass = moduleCardToneClasses[index % moduleCardToneClasses.length];
                      return (
                        <div
                          key={module.title}
                          className={`rounded-2xl border p-5 backdrop-blur-xl transition-shadow ${toneClass} hover:shadow-[0_14px_30px_-20px_rgba(30,41,59,0.35)]`}
                        >
                          <div className="text-sm font-bold text-slate-900">{module.title}</div>
                          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                            {module.summary}
                          </p>
                          <ul className="mt-3 space-y-1.5">
                            {module.bullets.slice(0, 3).map((item, i) => (
                              <li
                                key={`${module.title}-${i}`}
                                className="text-xs text-slate-500 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="col-span-12 xl:col-span-4">
                <section className="rounded-3xl border border-white/70 bg-[rgba(232,238,255,0.72)] backdrop-blur-xl overflow-hidden h-full min-h-[760px] flex flex-col">
                  <div className="grid grid-cols-3 gap-1 p-2 bg-white/50">
                    {tabOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTab(option.key)}
                        className={[
                          'rounded-xl text-xs font-bold py-2.5 transition',
                          tab === option.key
                            ? 'bg-white text-[#394FE6] shadow-sm'
                            : 'text-slate-500 hover:text-slate-700',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-5 space-y-3 flex-1 min-h-[520px] overflow-y-auto custom-scrollbar">
                    {tab === 'overview' && (
                      <>
                        <div className="text-xs font-bold text-[#394FE6]">
                          当前宫位 · {activePalace?.label ?? '命宫'}
                        </div>
                        <div className="text-sm font-bold text-slate-900">AI 紫微格局深度解析</div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {activePalace?.summary || report.modules.personality.summary}
                        </p>

                        <details
                          open
                          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                        >
                          <summary className="cursor-pointer text-xs font-bold text-emerald-700">
                            机会建议
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {overviewOpportunities.map((item, i) => (
                              <li
                                key={`ov-op-${i}`}
                                className="text-xs text-emerald-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>

                        <details open className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <summary className="cursor-pointer text-xs font-bold text-rose-700">
                            风险预警
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {overviewRisks.map((item, i) => (
                              <li
                                key={`ov-risk-${i}`}
                                className="text-xs text-rose-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>

                        <details open className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <summary className="cursor-pointer text-xs font-bold text-blue-700">
                            行动清单
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {overviewActions.map((item, i) => (
                              <li
                                key={`ov-action-${i}`}
                                className="text-xs text-blue-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}

                    {tab === 'timeline' && (
                      <div className="space-y-3">
                        {timeline.map((item) => (
                          <details
                            key={item.year}
                            open
                            className="rounded-xl border border-white/80 bg-white/70 p-3"
                          >
                            <summary className="cursor-pointer">
                              <div className="text-xs text-slate-400">{item.year}</div>
                              <div className="text-sm font-bold text-slate-900 mt-1">
                                {item.title}
                              </div>
                              <p className="mt-1 text-xs text-slate-600">{item.summary}</p>
                            </summary>
                            <div className="mt-3 grid grid-cols-1 gap-2">
                              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                                <div className="text-[11px] font-bold text-emerald-700">机会</div>
                                <ul className="mt-1 space-y-1">
                                  {item.detail.opportunities.map((x, i) => (
                                    <li
                                      key={`t-op-${item.year}-${i}`}
                                      className="text-xs text-emerald-700 list-disc ml-4"
                                    >
                                      {x}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
                                <div className="text-[11px] font-bold text-rose-700">风险</div>
                                <ul className="mt-1 space-y-1">
                                  {item.detail.risks.map((x, i) => (
                                    <li
                                      key={`t-risk-${item.year}-${i}`}
                                      className="text-xs text-rose-700 list-disc ml-4"
                                    >
                                      {x}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="rounded-lg bg-blue-50 border border-blue-200 p-2">
                                <div className="text-[11px] font-bold text-blue-700">行动</div>
                                <ul className="mt-1 space-y-1">
                                  {item.detail.actions.map((x, i) => (
                                    <li
                                      key={`t-action-${item.year}-${i}`}
                                      className="text-xs text-blue-700 list-disc ml-4"
                                    >
                                      {x}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}

                    {tab === 'relations' && (
                      <>
                        <div className="text-sm font-bold text-slate-900">六亲关系建议</div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {report.modules.love.summary}
                        </p>

                        <details
                          open
                          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                        >
                          <summary className="cursor-pointer text-xs font-bold text-emerald-700">
                            机会建议
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {relationOpportunities.map((item, i) => (
                              <li
                                key={`rel-op-${i}`}
                                className="text-xs text-emerald-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>

                        <details open className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <summary className="cursor-pointer text-xs font-bold text-rose-700">
                            风险预警
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {relationRisks.map((item, i) => (
                              <li
                                key={`rel-risk-${i}`}
                                className="text-xs text-rose-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>

                        <details open className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <summary className="cursor-pointer text-xs font-bold text-blue-700">
                            行动清单
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {relationActions.map((item, i) => (
                              <li
                                key={`rel-action-${i}`}
                                className="text-xs text-blue-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>

                        <details className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                          <summary className="cursor-pointer text-xs font-bold text-violet-700">
                            宫位联动建议 · {activePalace?.label ?? '命宫'}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {(activePalace?.suggestions ?? []).map((item, i) => (
                              <li
                                key={`palace-link-${i}`}
                                className="text-xs text-violet-700 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {!loading && !error && !report && (
            <div className="rounded-3xl border border-white/70 bg-white/70 p-8 shadow-sm">
              <div className="text-lg font-bold text-slate-800">暂无紫微排盘数据</div>
              <p className="mt-2 text-sm text-slate-500">
                点击“重新排盘”可基于当前信息发起紫微斗数分析。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
