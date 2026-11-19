import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaqManagementPanel } from './faq-management-panel';

const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

describe('FaqManagementPanel 组件单元与交互测试 (ADR-0027)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. 初始渲染与空状态：呈现搜索框、新建问答、导入导出按钮及空状态引导', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { faqs: [] } }),
    });

    render(<FaqManagementPanel knowledgeBaseId="kb_test_1" />);

    expect(screen.getByPlaceholderText(/搜索标准问题/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建问答/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导入 CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导出 CSV/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('暂无问答对 (FAQ)')).toBeInTheDocument();
    });
  });

  it('2. 列表渲染：正确呈现已有 FAQ、相似问标签与启用状态', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: {
          faqs: [
            {
              id: 'faq_1',
              knowledgeBaseId: 'kb_test_1',
              userId: 'user_1',
              question: '如何申请退款？',
              answer: '请在订单中心点击退款。',
              enabled: true,
              hitCount: 3,
              similarQuestions: ['怎么退钱', '退货流程'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      }),
    });

    render(<FaqManagementPanel knowledgeBaseId="kb_test_1" />);

    await waitFor(() => {
      expect(screen.getByText('如何申请退款？')).toBeInTheDocument();
      expect(screen.getByText('请在订单中心点击退款。')).toBeInTheDocument();
      expect(screen.getByText('怎么退钱')).toBeInTheDocument();
      expect(screen.getByText('退货流程')).toBeInTheDocument();
      expect(screen.getByText('已启用')).toBeInTheDocument();
    });
  });

  it('3. 状态切换：点击 Switch 触发 toggle 接口', async () => {
    const user = userEvent.setup();
    mockFetchWithAuth
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            faqs: [
              {
                id: 'faq_1',
                knowledgeBaseId: 'kb_test_1',
                userId: 'user_1',
                question: '如何申请退款？',
                answer: '请在订单中心点击退款。',
                enabled: true,
                hitCount: 0,
                similarQuestions: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ success: true }),
      });

    render(<FaqManagementPanel knowledgeBaseId="kb_test_1" />);

    await waitFor(() => {
      expect(screen.getByText('如何申请退款？')).toBeInTheDocument();
    });

    const toggleSwitch = screen.getByRole('switch');
    await user.click(toggleSwitch);

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb_test_1/faqs/faq_1/toggle',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('4. 新建问答弹窗交互：输入标准问、答案、相似问回车添加并保存', async () => {
    const user = userEvent.setup();
    mockFetchWithAuth
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: { faqs: [] } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            faq: {
              id: 'faq_new',
              question: '怎么开发票？',
              answer: '在财务面板索取发票。',
              similarQuestions: ['发票抬头怎么填'],
              enabled: true,
              hitCount: 0,
            },
          },
        }),
      });

    render(<FaqManagementPanel knowledgeBaseId="kb_test_1" />);

    await waitFor(() => {
      expect(screen.getByText('暂无问答对 (FAQ)')).toBeInTheDocument();
    });

    // 点击新建按钮
    const createBtn = screen.getByRole('button', { name: /新建问答/ });
    await user.click(createBtn);

    // 弹窗出现
    expect(screen.getByText('新建标准问答 (FAQ)')).toBeInTheDocument();

    const qInput = screen.getByPlaceholderText(/例如：如何申请退款？/);
    const aInput = screen.getByPlaceholderText(/输入该问题的权威口径答案/);
    const simInput = screen.getByPlaceholderText(/例如：退钱流程是什么/);

    await user.type(qInput, '怎么开发票？');
    await user.type(aInput, '在财务面板索取发票。');
    await user.type(simInput, '发票抬头怎么填{enter}');

    // 相似问 Tag 出现
    expect(screen.getByText('发票抬头怎么填')).toBeInTheDocument();

    // 点击提交按钮
    const submitBtn = screen.getByRole('button', { name: /创建并向量化/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_test_1/faqs',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  it('5. 批量导入弹窗：点击导入 CSV 弹出导入对话框', async () => {
    const user = userEvent.setup();
    mockFetchWithAuth.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { faqs: [] } }),
    });

    render(<FaqManagementPanel knowledgeBaseId="kb_test_1" />);

    const importBtn = screen.getByRole('button', { name: /导入 CSV/ });
    await user.click(importBtn);

    expect(screen.getByText('批量导入问答对 (CSV)')).toBeInTheDocument();
    expect(screen.getByText('下载标准模板')).toBeInTheDocument();
  });
});
