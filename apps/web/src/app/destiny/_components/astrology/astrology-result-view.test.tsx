/**
 * astrology-result-view.test.tsx —— 结果页分区渲染（03 工单）
 *
 * 锁定的外部行为：
 * - 事实层（护照头 / 星盘轮）在解读未到达时照常渲染；解读驱动的区块按分区骨架占位；
 * - 分区逐区到达：主轴先浮现，大三要素与生活模块随后由真实卡替换骨架（不是整页一起亮）；
 * - 本周行动三角在 transits 分区到达后出现，行动文案取自三角；
 * - 解读降级：目标区段收起并落诚实的「解读暂不可用」卡 + 「重试解读」入口，
 *   重试重走报告流且不重算真值（工作区真值保持既有对象，历史锚点不漂移）。
 */

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import { saveAstrologyHistoryRecord } from '@/lib/astrology/history';
import type { AstrologyInterpretationReport } from '@/lib/astrology/interpretation';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';
import { createDefaultAstrologyFormData } from '../astrology-types';
import { AstrologyResultView } from './astrology-result-view';

const authFetchMock = vi.mocked(authFetch);

const HEADLINE = {
  text: '在稳定与自由之间，练习把感受说清楚。',
  factReferences: ['planet:sun:sign', 'planet:moon:sign'],
};

const BIG_THREE = {
  sun: { plain: '你先做再说的底色很明显。', action: '开口前先数三秒。' },
  moon: { plain: '你需要被回应才安心。', action: '先说一句我现在有点急。' },
  ascendant: { plain: '你给人的第一印象是直接有劲。', action: '必要时展示柔软。' },
};

const MODULES = [
  {
    id: 'who' as const,
    title: '先稳后亮的表达者',
    summary: '你的核心气质偏稳，情绪来得直接。',
    tags: ['太阳天秤'],
    action: '每周留一件只为喜欢的小事。',
    factReferences: ['planet:sun:sign'],
  },
  {
    id: 'week' as const,
    title: '本周宇宙提示',
    summary: '本周先把节奏稳住。',
    tags: ['本周'],
    action: '本周写下一件今天做得不错的小事。',
    factReferences: ['planet:moon:sign'],
  },
];

/** 进度控制：用真实定时器渲染，逐字机按 34ms/字推进 */
const TYPEWRITER_WAIT_MS = 1_600;

function primeWorkspace(interpretation: AstrologyInterpretationReport | null, status: 'pending' | 'ready' | 'unavailable', reason: 'model' | null = null) {
  useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
    step: 'result',
    lastView: 'result',
    hasResult: true,
    entryView: 'home',
    chartFacts: SAMPLE_CHART_ACCURATE,
    formData: { ...createDefaultAstrologyFormData(), name: '小宇', topic: 'self' },
    interpretation: { status, reason, report: interpretation },
    error: null,
    errorKind: null,
  });
}

function renderResult() {
  return render(<AstrologyResultView wheelSlot={() => <div data-testid="wheel-slot" />} />);
}

describe('AstrologyResultView（解读分区渲染）', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
    authFetchMock.mockReset();
  });

  afterEach(() => {
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  it('解读未到达：事实层照常渲染，解读区块按分区骨架占位（不冒充产出）', () => {
    primeWorkspace(null, 'pending');
    renderResult();

    // 事实层：护照头与交互星盘轮立即可见
    expect(screen.getByText('小宇的宇宙护照')).toBeInTheDocument();
    expect(screen.getByLabelText('交互星盘轮')).toBeInTheDocument();
    // 解读分区未到：生活模块骨架在占位（aria-busy），主轴与三卡文案均未出现
    expect(screen.getByLabelText('五个生活模块')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(HEADLINE.text)).toBeNull();
    expect(screen.queryByText(BIG_THREE.sun.plain)).toBeNull();
    // 未降级 → 不出现「解读暂不可用」卡
    expect(screen.queryByText('AI 解读没有完成')).toBeNull();
  });

  it('结果页可切换模型：切换写回工作区（重试解读与后续提问随新模型）', async () => {
    primeWorkspace(null, 'pending');
    renderResult();

    // 入口在护照头附近（与八字/紫微/奇门同一控制器：分段单选，默认豆包）
    const switcher = screen.getByRole('radiogroup', { name: '选择测算模型' });
    expect(switcher).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '豆包' })).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'DeepSeek' }));
    });

    expect(screen.getByRole('radio', { name: 'DeepSeek' })).toHaveAttribute('aria-checked', 'true');
    // 工作区 provider 即请求携带的模型口径：重试解读 / 提问随切换生效
    expect(useDestinyWorkspaceStore.getState().provider).toBe('deepseek');
  });

  it('分区逐区到达：主轴先浮现，大三要素与生活模块随后替换骨架', async () => {
    primeWorkspace({ headline: HEADLINE, bigThree: null, modules: [], transits: null }, 'ready');
    renderResult();

    // 主轴分区：逐字浮现后完整呈现，并给出可定位的依据片
    await screen.findByText(HEADLINE.text, {}, { timeout: TYPEWRITER_WAIT_MS });
    await screen.findByText('太阳天秤座', {}, { timeout: TYPEWRITER_WAIT_MS });
    // 三要素与模块分区仍未到 → 仍是骨架
    expect(screen.queryByText(BIG_THREE.sun.plain)).toBeNull();
    expect(screen.getByLabelText('五个生活模块')).toHaveAttribute('aria-busy', 'true');

    // 三要素与模块分区到达
    act(() => {
      primeWorkspace(
        {
          headline: HEADLINE,
          bigThree: BIG_THREE,
          modules: MODULES,
          transits: {
            weekRange: '9 月 1 日 – 9 月 7 日',
            transitNote: '行运太阳正与本命金星成合相（偏差约 1.2°）',
            opportunity: '顺相位适合把一件事往前推一步。',
            caution: '紧张相位出现时先照顾情绪。',
            action: '本周写下一件今天做得不错的小事。',
            transitReferences: ['transit:sun:conjunction:venus'],
            keyAspects: [],
          },
        },
        'ready'
      );
    });

    await screen.findByText(BIG_THREE.sun.plain);
    expect(screen.getByText(BIG_THREE.ascendant.action)).toBeInTheDocument();
    expect(screen.getByText('先稳后亮的表达者')).toBeInTheDocument();
    expect(screen.getByText('你的核心气质偏稳，情绪来得直接。')).toBeInTheDocument();
    // 模块骨架退场（真实卡替换）；本周行动三角出现且行动文案取自三角
    await screen.findByText('顺相位适合把一件事往前推一步。');
    expect(screen.getByText('紧张相位出现时先照顾情绪。')).toBeInTheDocument();
    expect(screen.getAllByText('本周写下一件今天做得不错的小事。').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('五个生活模块')?.getAttribute('aria-busy')).not.toBe('true');
    // 分享入口随主轴恢复（解读就绪）
    expect(screen.getAllByText('分享星语海报').length).toBeGreaterThan(0);
  });

  it('解读降级：落诚实失败卡与重试入口，重试重走报告流且不重算真值', async () => {
    // 重试请求：返回一条不关闭的流（真值帧先到，解读随流继续）
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    authFetchMock.mockResolvedValue(new Response(stream, { status: 200 }));

    primeWorkspace(null, 'unavailable', 'model');
    renderResult();

    // 诚实失败卡：说明解读未完成，并给重试入口；不出现任何模板文案
    expect(screen.getByText('AI 解读没有完成')).toBeInTheDocument();
    expect(screen.queryByText(HEADLINE.text)).toBeNull();
    expect(screen.queryByText('先稳后亮的表达者')).toBeNull();
    // 事实层照常可看
    expect(screen.getByLabelText('交互星盘轮')).toBeInTheDocument();

    const factsBefore = useDestinyWorkspaceStore.getState().astrology.chartFacts;
    fireEvent.click(screen.getByRole('button', { name: /重试解读/ }));

    // 重走报告流：发新请求，解读回「在途」
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(useDestinyWorkspaceStore.getState().astrology.interpretation).toEqual({
      status: 'pending',
      reason: null,
      report: null,
    });
    // 真值不重算：工作区保留既有真值对象（历史合并依赖它的 calculatedAt 锚点）
    expect(useDestinyWorkspaceStore.getState().astrology.chartFacts).toBe(factsBefore);

    // 清理悬挂的流，避免测试收尾时残留 reader
    act(() => {
      controller.close();
    });
  });

  it('解读主轴到达：低敏摘要合并进本地历史记录（同一条记录，不新增修订）', async () => {
    const formData = { ...createDefaultAstrologyFormData(), name: '小宇', topic: 'self' as const };
    // 真值先落记录（匿名用户走会话级临时记录，与提交链路同口径）
    useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', { formData });
    saveAstrologyHistoryRecord(formData, SAMPLE_CHART_ACCURATE);
    const before = useAstrologyTempRecordStore.getState().tempRecord!;
    expect(before.preview).not.toBe(HEADLINE.text);

    primeWorkspace({ headline: HEADLINE, bigThree: null, modules: [], transits: null }, 'ready');
    renderResult();
    await screen.findByText(HEADLINE.text, {}, { timeout: TYPEWRITER_WAIT_MS });

    const after = useAstrologyTempRecordStore.getState().tempRecord!;
    expect(after.id).toBe(before.id);
    expect(after.preview).toBe(HEADLINE.text);
    // 不是新一次测算：修订号与快照不动，创建时间保持不变
    const payload = (p: typeof before) => p.reportData as unknown as { revision: number; revisions: unknown[] };
    expect(payload(after).revision).toBe(payload(before).revision);
    expect(payload(after).revisions).toHaveLength(payload(before).revisions.length);
    expect(after.createdAt).toBe(before.createdAt);
  });
});
