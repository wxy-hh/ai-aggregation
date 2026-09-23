/**
 * destiny-workspace-store.test.ts —— 星座寰宇工作区具名 Action 契约测试
 *
 * 验证收口的 7 个具名 action 状态转移规范与不变式：
 * 1. beginAstrologySession：全新测算/真值重试重置为仪式态，解读置为待就绪
 * 2. beginAstrologyInterpretationRetry：解读重试仅重置解读为待就绪，冻结星盘与布局
 * 3. failAstrologySession：记录错误与原因档，回退仪式态，保持解读层不动
 * 4. applyAstrologyChartFacts：写入真值数据并清理错误
 * 5. applyAstrologyInterpretationSection：增量合入分区推进为就绪，拒绝非待就绪/就绪态的迟到分区
 * 6. settleAstrologyInterpretation：落定最终解读结论
 * 7. restoreAstrologyWorkspace：从历史回填直达结果页
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useDestinyWorkspaceStore } from './destiny-workspace-store';
import { createDefaultAstrologyFormData } from '@/app/destiny/_components/astrology-types';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';
import type {
  AstrologyBigThree,
  AstrologyHeadline,
  AstrologyTransitsSection,
  ModuleReading,
} from '@/lib/astrology/interpretation';

describe('destiny-workspace-store 星座寰宇具名 action 契约', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
  });

  it('beginAstrologySession：一次性重置为加载仪式态并重置解读为待就绪', () => {
    // 先污染为结果态与错误态
    useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      chartFacts: SAMPLE_CHART_ACCURATE,
      error: '前次错误',
      errorKind: 'model',
      interpretation: {
        status: 'ready',
        reason: null,
        report: {
          headline: { text: '日天秤升天蝎的整合力量', factReferences: ['sun:libra'] },
          bigThree: null,
          modules: [],
          transits: null,
        },
      },
    });

    useDestinyWorkspaceStore.getState().beginAstrologySession();

    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.step).toBe('form');
    expect(state.chartFacts).toBeNull();
    expect(state.entryView).toBe('loading');
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.interpretation).toEqual({
      status: 'pending',
      reason: null,
      report: null,
    });
  });

  it('beginAstrologyInterpretationRetry：仅重置解读为待就绪，冻结既有真值与界面布局', () => {
    // 模拟结果页真值已在、解读降级态
    useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      chartFacts: SAMPLE_CHART_ACCURATE,
      error: null,
      errorKind: null,
      interpretation: {
        status: 'unavailable',
        reason: 'model',
        report: null,
      },
    });

    useDestinyWorkspaceStore.getState().beginAstrologyInterpretationRetry();

    const state = useDestinyWorkspaceStore.getState().astrology;
    // 解读层进入 pending
    expect(state.interpretation).toEqual({
      status: 'pending',
      reason: null,
      report: null,
    });
    // 真值与布局字段保持冻结不动
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.chartFacts).toEqual(SAMPLE_CHART_ACCURATE);
  });

  it('failAstrologySession：记录错误与原因档，回退仪式态，保持解读层不动', () => {
    // 初始状态下解读可能是 pending
    useDestinyWorkspaceStore.getState().beginAstrologySession();

    useDestinyWorkspaceStore.getState().failAstrologySession('星盘计算出现异常，请重试', 'timeout');

    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.step).toBe('form');
    expect(state.chartFacts).toBeNull();
    expect(state.entryView).toBe('loading');
    expect(state.error).toBe('星盘计算出现异常，请重试');
    expect(state.errorKind).toBe('timeout');
    // 解读状态保持原有值（不受 failAstrologySession 覆写）
    expect(state.interpretation).toEqual({
      status: 'pending',
      reason: null,
      report: null,
    });
  });

  it('applyAstrologyChartFacts：写入真值数据并清理错误', () => {
    // 先设置包含旧错误的状态
    useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
      error: '前次错误',
      errorKind: 'validation',
    });

    useDestinyWorkspaceStore.getState().applyAstrologyChartFacts(SAMPLE_CHART_ACCURATE);

    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.chartFacts).toEqual(SAMPLE_CHART_ACCURATE);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  describe('applyAstrologyInterpretationSection 分区累积与迟到保护', () => {
    it('逐区增量合并报告，缺省字段回落原有值，状态推进至 ready', () => {
      // 从待就绪态开始
      useDestinyWorkspaceStore.getState().beginAstrologySession();

      const headline: AstrologyHeadline = {
        text: '日天秤升天蝎的整合力量',
        factReferences: ['sun:libra', 'moon:pisces'],
      };
      useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection({ headline });

      let state = useDestinyWorkspaceStore.getState().astrology;
      expect(state.interpretation.status).toBe('ready');
      expect(state.interpretation.reason).toBeNull();
      expect(state.interpretation.report).toEqual({
        headline,
        bigThree: null,
        modules: [],
        transits: null,
      });

      // 增量送达大三要素
      const bigThree: AstrologyBigThree = {
        sun: { plain: '天秤核心', action: '保持平衡' },
        moon: { plain: '双鱼直觉', action: '接纳感受' },
        ascendant: { plain: '天蝎洞察', action: '信任他人' },
      };
      useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection({ bigThree });

      state = useDestinyWorkspaceStore.getState().astrology;
      expect(state.interpretation.status).toBe('ready');
      expect(state.interpretation.report?.headline).toEqual(headline);
      expect(state.interpretation.report?.bigThree).toEqual(bigThree);
      expect(state.interpretation.report?.modules).toEqual([]);
      expect(state.interpretation.report?.transits).toBeNull();

      // 增量送达生活模块与行运
      const modules: ModuleReading[] = [
        {
          id: 'career',
          title: '事业如何发挥',
          summary: '稳健前行',
          tags: ['稳健', '洞察'],
          action: '规划长期路径',
          factReferences: ['sun:libra'],
        },
      ];
      const transits: AstrologyTransitsSection = {
        weekRange: '9月1日-9月7日',
        transitNote: '木星过境',
        opportunity: '抓住机遇',
        caution: '谨慎决策',
        action: '按部就班',
        transitReferences: ['transit:jupiter:trine:natalSun'],
        keyAspects: [],
      };
      useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection({
        modules,
        transits,
      });

      state = useDestinyWorkspaceStore.getState().astrology;
      expect(state.interpretation.report).toEqual({
        headline,
        bigThree,
        modules,
        transits,
      });
    });

    it('已降级（unavailable）时不接受迟到分区：拒绝覆盖降级结论', () => {
      useDestinyWorkspaceStore.getState().settleAstrologyInterpretation({
        status: 'unavailable',
        reason: 'quota',
        report: null,
      });

      // 模拟迟到的分区
      useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection({
        headline: { text: '迟到主轴', factReferences: ['sun:libra'] },
      });

      const state = useDestinyWorkspaceStore.getState().astrology;
      expect(state.interpretation).toEqual({
        status: 'unavailable',
        reason: 'quota',
        report: null,
      });
    });

    it('未发起（idle）时不接受迟到分区', () => {
      // 默认初始状态为 idle
      const before = useDestinyWorkspaceStore.getState().astrology.interpretation;
      expect(before.status).toBe('idle');

      useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection({
        headline: { text: '迟到主轴', factReferences: ['sun:libra'] },
      });

      const after = useDestinyWorkspaceStore.getState().astrology.interpretation;
      expect(after).toEqual(before);
    });
  });

  it('settleAstrologyInterpretation：准确设置指定的解读最终状态', () => {
    useDestinyWorkspaceStore.getState().settleAstrologyInterpretation({
      status: 'unavailable',
      reason: 'model',
      report: null,
    });

    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.interpretation).toEqual({
      status: 'unavailable',
      reason: 'model',
      report: null,
    });
  });

  it('restoreAstrologyWorkspace：直达结果视图并完整回填真值、解读与表单数据', () => {
    const formData = {
      ...createDefaultAstrologyFormData(),
      name: '测试者',
    };
    const interpretation = {
      status: 'ready' as const,
      reason: null,
      report: {
        headline: { text: '历史报告主轴', factReferences: ['sun:libra'] },
        bigThree: null,
        modules: [],
        transits: null,
      },
    };

    useDestinyWorkspaceStore.getState().restoreAstrologyWorkspace({
      formData,
      chartFacts: SAMPLE_CHART_ACCURATE,
      interpretation,
    });

    const state = useDestinyWorkspaceStore.getState().astrology;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.chartFacts).toEqual(SAMPLE_CHART_ACCURATE);
    expect(state.interpretation).toEqual(interpretation);
    expect(state.formData).toEqual(formData);
    expect(state.fieldErrors).toEqual({});
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });
});
