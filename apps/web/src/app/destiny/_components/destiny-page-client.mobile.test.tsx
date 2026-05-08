import React, { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DestinyPageClient } from './destiny-page-client';
import {
  createDefaultDestinyWorkspaceState,
  useDestinyWorkspaceStore,
} from '@/stores/destiny-workspace-store';

vi.mock('./bazi-workspace', () => ({
  BaziWorkspace: ({ isActive }: { isActive: boolean }) => {
    const { bazi, setWorkspaceState, markResultReady, resetWorkspace, restoreWorkspace } =
      useDestinyWorkspaceStore();

    useEffect(() => {
      if (isActive) {
        restoreWorkspace('bazi');
      }
    }, [isActive, restoreWorkspace]);

    return (
      <div>
        <div>{bazi.step === 'result' ? '八字结果页' : '八字表单页'}</div>
        <button
          type="button"
          onClick={() => {
            setWorkspaceState('bazi', { step: 'result', lastView: 'result' });
            markResultReady('bazi');
          }}
        >
          设置八字结果
        </button>
        <button
          type="button"
          onClick={() => {
            setWorkspaceState('bazi', { step: 'form', lastView: 'form' });
          }}
        >
          返回八字表单
        </button>
        <button type="button" onClick={() => resetWorkspace('bazi')}>
          清空八字结果
        </button>
      </div>
    );
  },
}));

vi.mock('./ziwei-workspace', () => ({
  ZiweiWorkspace: () => <div>紫微内容</div>,
}));

vi.mock('./qimen-workspace', () => ({
  QimenWorkspace: () => <div>奇门内容</div>,
}));

vi.mock('./qimen-loading-animation', () => ({
  QimenLoadingAnimation: () => <div>加载动画</div>,
}));

describe('DestinyPageClient mobile layout', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.setState(createDefaultDestinyWorkspaceState());
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 375,
    });
    window.dispatchEvent(new Event('resize'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('移动端显示模块切换并默认渲染八字内容', async () => {
    render(<DestinyPageClient />);

    await waitFor(() => {
      expect(screen.getByText('八字')).toBeInTheDocument();
      expect(screen.getByText('紫微')).toBeInTheDocument();
      expect(screen.getByText('奇门')).toBeInTheDocument();
      expect(screen.getByText('八字表单页')).toBeInTheDocument();
    });
  });

  it('点击模块切换后显示对应内容', async () => {
    render(<DestinyPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: '紫微' }));
    await waitFor(() => {
      expect(screen.getByText('紫微内容')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '奇门' }));
    await waitFor(() => {
      expect(screen.getByText('奇门内容')).toBeInTheDocument();
    });
  });

  it('平板宽度仍使用紧凑布局并只渲染当前模块', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 768,
    });
    window.dispatchEvent(new Event('resize'));

    render(<DestinyPageClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '八字' })).toBeInTheDocument();
      expect(screen.getByText('八字表单页')).toBeInTheDocument();
    });

    expect(screen.queryByText('紫微内容')).not.toBeInTheDocument();
    expect(screen.queryByText('奇门内容')).not.toBeInTheDocument();
  });

  it('移动端卸载重建后仍能恢复八字结果页', async () => {
    render(<DestinyPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: '设置八字结果' }));

    await waitFor(() => {
      expect(screen.getByText('八字结果页')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '紫微' }));
    await waitFor(() => {
      expect(screen.getByText('紫微内容')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '八字' }));
    await waitFor(() => {
      expect(screen.getByText('八字结果页')).toBeInTheDocument();
    });
  });

  it('临时回到八字表单后再次切回模块仍优先展示结果页', async () => {
    render(<DestinyPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: '设置八字结果' }));
    fireEvent.click(await screen.findByRole('button', { name: '返回八字表单' }));

    await waitFor(() => {
      expect(screen.getByText('八字表单页')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '奇门' }));
    await waitFor(() => {
      expect(screen.getByText('奇门内容')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '八字' }));
    await waitFor(() => {
      expect(screen.getByText('八字结果页')).toBeInTheDocument();
    });
  });

  it('点击重新摆盘后再次切回模块不会恢复旧结果', async () => {
    render(<DestinyPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: '设置八字结果' }));
    fireEvent.click(await screen.findByRole('button', { name: '清空八字结果' }));

    await waitFor(() => {
      expect(screen.getByText('八字表单页')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '紫微' }));
    await waitFor(() => {
      expect(screen.getByText('紫微内容')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '八字' }));
    await waitFor(() => {
      expect(screen.getByText('八字表单页')).toBeInTheDocument();
    });
  });
});
