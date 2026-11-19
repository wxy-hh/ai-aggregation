import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { UrlImportDialog } from './url-import-dialog';

const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

describe('UrlImportDialog 组件 (TC05 单元验证)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false 时不渲染弹窗内容', () => {
    render(
      <UrlImportDialog
        open={false}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        onSuccess={vi.fn()}
      />
    );

    expect(screen.queryByText('一键导入网页 / 微信文章')).not.toBeInTheDocument();
  });

  it('open=true 时渲染多行输入框、识别统计与微信专属徽章', async () => {
    render(
      <UrlImportDialog
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('一键导入网页 / 微信文章')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/mp\.weixin\.qq\.com/i);
    expect(textarea).toBeInTheDocument();

    // 粘贴微信文章与普通技术博客
    fireEvent.change(textarea, {
      target: {
        value: `https://mp.weixin.qq.com/s/article_1\nhttps://example.com/blog/article_2`,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('微信文章 × 1')).toBeInTheDocument();
      const stats = screen.getByTestId('url-import-stats');
      expect(stats).toHaveTextContent('已识别 2 个有效网址');
    });
  });

  it('包含内网 IP 时展示风险拦截提示', async () => {
    render(
      <UrlImportDialog
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        onSuccess={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(/mp\.weixin\.qq\.com/i);
    fireEvent.change(textarea, {
      target: {
        value: `https://example.com/ok\nhttp://127.0.0.1:8080/internal`,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/发现 1 行无效或不支持的网址格式/)).toBeInTheDocument();
    });
  });

  it('合法输入点击提交时发送网络请求并调用 onSuccess', async () => {
    const handleSuccess = vi.fn();
    const handleOpenChange = vi.fn();

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { documents: [{ id: 'doc_1' }] },
      }),
    });

    render(
      <UrlImportDialog
        open={true}
        onOpenChange={handleOpenChange}
        knowledgeBaseId="kb_1"
        onSuccess={handleSuccess}
      />
    );

    const textarea = screen.getByPlaceholderText(/mp\.weixin\.qq\.com/i);
    fireEvent.change(textarea, {
      target: {
        value: `https://example.com/valid-article`,
      },
    });

    const submitBtn = screen.getByRole('button', { name: /开始抓取入库/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_1/documents/url',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ urls: ['https://example.com/valid-article'] }),
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
