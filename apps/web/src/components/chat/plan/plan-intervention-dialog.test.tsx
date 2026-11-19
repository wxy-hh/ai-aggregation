import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PlanInterventionDialog } from './plan-intervention-dialog';
import type { AgentPlan } from '@repo/shared';

describe('PlanInterventionDialog 弹框布局与自适应测试', () => {
  const fiveStepsPlan: AgentPlan = {
    id: 'plan-five-steps',
    title: '5步复杂调研计划',
    steps: [
      { id: 's1', title: '界定调研范围', status: 'completed', summary: '已搜索智谱 GLM' },
      { id: 's2', title: '采集官方定价', status: 'completed', summary: '已抓取 bigmodel.cn' },
      { id: 's3', title: '统一折算基准', status: 'completed', summary: '已抓取 docs.bigmodel.cn' },
      { id: 's4', title: '场景化测算', status: 'completed', summary: '任务交付完成' },
      { id: 's5', title: '输出对比结论', status: 'pending' },
    ],
  };

  it('1. 弹框应当具备弹性布局分层结构：头部与底部操作栏固定(shrink-0)，只有中间步骤列表独立滚动，避免底部操作按钮被推到视口外被遮挡', () => {
    render(
      <PlanInterventionDialog
        open={true}
        onOpenChange={vi.fn()}
        plan={fiveStepsPlan}
        onConfirm={vi.fn()}
      />
    );

    const dialogContent = screen.getByTestId('plan-intervention-dialog');
    expect(dialogContent).toBeInTheDocument();

    // 确认按钮与取消按钮必须在 footer 容器内且 footer 不能混在 step 滚动列表内
    const cancelBtn = screen.getByTestId('plan-intervention-cancel-btn');
    const confirmBtn = screen.getByTestId('plan-intervention-confirm-btn');
    expect(cancelBtn).toBeInTheDocument();
    expect(confirmBtn).toBeInTheDocument();

    // 弹窗本身应当使用 flex-col 布局以便将 header、列表区、footer 明确分层
    expect(dialogContent.className).toContain('flex');
    expect(dialogContent.className).toContain('flex-col');

    // 中间步骤列表必须拥有独立的滚动区域容器 (overflow-y-auto)，且 flex-1 min-h-0
    const stepListContainer = screen.getByTestId('plan-intervention-steps-container');
    expect(stepListContainer).toBeInTheDocument();
    expect(stepListContainer.className).toContain('overflow-y-auto');
    expect(stepListContainer.className).toContain('flex-1');
  });

  it('2. 弹框头部与底部操作栏包含 shrink-0，避免在小屏或多步骤场景下被内容挤压', () => {
    render(
      <PlanInterventionDialog
        open={true}
        onOpenChange={vi.fn()}
        plan={fiveStepsPlan}
        onConfirm={vi.fn()}
      />
    );

    // 检查 header 是否有 shrink-0
    const title = screen.getByText('调整执行计划');
    const header = title.closest('div');
    expect(header?.className).toContain('shrink-0');

    // 检查 footer 是否有 shrink-0
    const cancelBtn = screen.getByTestId('plan-intervention-cancel-btn');
    const footer = cancelBtn.closest('div');
    expect(footer?.className).toContain('shrink-0');
  });
});
