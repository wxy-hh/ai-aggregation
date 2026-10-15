/**
 * attachment-preview.test.tsx —— 聊天消息附件预览与原图灯箱（Lightbox）测试
 *
 * 测试覆盖：
 * 1. 点击图片缩略图覆层按钮 → lightbox 打开并展示原图地址；
 * 2. lightbox 内点击「下载」→ fetch 被调用且 URL 命中 /api/image/proxy（验证代理下载、URL.createObjectURL、a.download 属性与延迟注销）；
 * 3. 桌面端 hover 缩略图浮现的操作条可触发查看原图与下载；
 * 4. 按 Esc 或点击关闭按钮 → lightbox 关闭；
 * 5. type==='file' 附件渲染为文件卡片，无 lightbox 行为；
 * 6. 下载失败异常兜底：toast.error 报错且针对 http(s) 地址触发 window.open 兜底，带 noopener,noreferrer；
 * 7. 本地 DataURL 附件（用户上传图/接力图）下载直接取 Blob、不经 BFF 代理；
 * 8. 文件名扩展名去重：attachment.name 为 '风景.jpg' 时下载文件名为 '风景-<时间戳>.jpg'；
 * 9. 安全防护：data: URL 附件下载失败时不会调用 window.open；
 * 10. 下载状态：下载进行中 isDownloading 为 true，下载按钮 disabled 且文案显示「下载中…」，下载完成后恢复。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '@/stores/chat-store';
import { AttachmentPreview } from './attachment-preview';
import { toast } from 'sonner';

// 模拟 sonner 的 toast 通知
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('AttachmentPreview 附件预览组件', () => {
  const imageAttachment: Attachment = {
    id: 'image-1',
    type: 'image',
    name: '测试风景图',
    status: 'ready',
    imageUrl: 'https://storage.googleapis.com/test-bucket/landscape.png',
  };

  const fileAttachment: Attachment = {
    id: 'file-1',
    type: 'file',
    name: '需求规范.pdf',
    status: 'ready',
    size: 4096,
  };

  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockWindowOpen: ReturnType<typeof vi.fn>;
  let mockAnchorClick: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 模拟对象 URL 创建与销毁
    mockCreateObjectURL = vi.fn(() => 'blob:mock-blob-url');
    mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL as unknown as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof window.URL.revokeObjectURL;

    // 模拟新窗口打开
    mockWindowOpen = vi.fn();
    window.open = mockWindowOpen as unknown as typeof window.open;

    // 拦截 a 标签点击，记录实例并避免触发 happy-dom 的导航异常
    mockAnchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {});

    // 模拟成功的图片 fetch（走 BFF 代理）
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['mock-binary-data'], { type: 'image/png' }),
    });
  });

  afterEach(() => {
    mockAnchorClick.mockRestore();
    cleanup();
    vi.clearAllMocks();
  });

  it('点击图片缩略图 → lightbox 打开并展示原图地址', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 初始状态下全屏 lightbox 不存在
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 点击缩略图覆层按钮
    const overlayButton = screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` });
    await user.click(overlayButton);

    // lightbox 打开并展示原图
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // 原图元素具有指定的 imageUrl
    const fullImages = screen.getAllByRole('img', { name: '测试风景图' });
    // 原图在弹层中可见且 src 正确
    const fullImage = fullImages.find((img) => img.getAttribute('src') === imageAttachment.imageUrl);
    expect(fullImage).toBeDefined();
    expect(fullImage).toHaveAttribute('src', imageAttachment.imageUrl);
  });

  it('lightbox 内点击「下载」→ fetch 被调用且 URL 命中 /api/image/proxy（mock fetch 与 URL.createObjectURL）', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 点击缩略图覆层按钮打开 lightbox
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` }));
    await screen.findByRole('dialog');

    // 在弹层内找到下载按钮并点击
    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    // 选择弹层底部操作区的下载按钮（通常带有文字「下载」）
    const dialogDownloadBtn = downloadButtons[downloadButtons.length - 1];
    await user.click(dialogDownloadBtn);

    // 验证调用了 BFF 媒体代理接口
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const expectedProxySubstring = `/api/image/proxy?url=${encodeURIComponent(imageAttachment.imageUrl!)}`;
    expect(global.fetch).toHaveBeenCalledWith(expectedProxySubstring);

    // 验证生成了对象 URL、触发 a 标签点击下载、断言 download 属性并延迟注销对象 URL
    await waitFor(
      () => {
        expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
        expect(mockAnchorClick).toHaveBeenCalledTimes(1);
        const clickedAnchor = mockAnchorClick.mock.instances[0] as HTMLAnchorElement;
        expect(clickedAnchor.download).toMatch(/^.+-\d+\.png$/);
        expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-blob-url');
      },
      { timeout: 2000 }
    );
  });

  it('按 Esc 或点关闭按钮 → lightbox 关闭', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 打开 lightbox
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // 点击关闭按钮关闭
    const closeBtn = screen.getByRole('button', { name: '关闭' });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // 重新打开后，按 Esc 键关闭
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('桌面端 hover 操作条中的「查看」和「下载」按钮行为正确', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 操作条中有查看原图和下载按钮
    const viewButton = screen.getByRole('button', { name: '查看原图' });
    const downloadButton = screen.getByRole('button', { name: '下载图片' });

    expect(viewButton).toBeInTheDocument();
    expect(downloadButton).toBeInTheDocument();

    // 点击缩略图上的直接下载按钮，阻止冒泡且触发下载
    await user.click(downloadButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 点击查看按钮打开 lightbox
    await user.click(viewButton);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('type===\'file\' 附件渲染为文件卡片、无 lightbox 行为', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreview attachment={fileAttachment} />);

    // 渲染文件名与格式化文件大小
    expect(screen.getByText('需求规范.pdf')).toBeInTheDocument();
    expect(screen.getByText('4.0 KB')).toBeInTheDocument();

    // 点击文件卡片不会打开 lightbox
    await user.click(screen.getByText('需求规范.pdf'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('下载失败时 toast.error 提示并回退至 window.open 兜底打开', async () => {
    // 模拟 fetch 失败
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 打开 lightbox 并点击下载
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` }));
    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    const dialogDownloadBtn = downloadButtons[downloadButtons.length - 1];
    await user.click(dialogDownloadBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('下载失败，请稍后重试');
      expect(mockWindowOpen).toHaveBeenCalledWith(
        imageAttachment.imageUrl,
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  it('本地 DataURL 附件（用户上传图）下载不经 BFF 代理、直接取 Blob', async () => {
    const dataUrlAttachment: Attachment = {
      id: 'image-data',
      type: 'image',
      name: '本地上传图',
      status: 'ready',
      // 1x1 透明 PNG 的 DataURL，与用户上传/接力附件的实际形态一致
      imageUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    };

    const user = userEvent.setup();
    render(<AttachmentPreview attachment={dataUrlAttachment} />);

    await user.click(screen.getByRole('button', { name: `查看图片附件 ${dataUrlAttachment.name}` }));
    await screen.findByRole('dialog');

    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    await user.click(downloadButtons[downloadButtons.length - 1]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    // 直接 fetch DataURL 本身，而不是 /api/image/proxy
    expect(global.fetch).toHaveBeenCalledWith(dataUrlAttachment.imageUrl);
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('attachment.name 为 \'风景.jpg\' 时下载文件名为 \'风景-<时间戳>.jpg\'', async () => {
    const user = userEvent.setup();
    const jpgAttachment: Attachment = {
      id: 'image-jpg',
      type: 'image',
      name: '风景.jpg',
      status: 'ready',
      imageUrl: 'https://storage.googleapis.com/test-bucket/landscape.jpg',
    };

    render(<AttachmentPreview attachment={jpgAttachment} />);

    // 点击缩略图覆层按钮打开 lightbox
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${jpgAttachment.name}` }));
    await screen.findByRole('dialog');

    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    const dialogDownloadBtn = downloadButtons[downloadButtons.length - 1];
    await user.click(dialogDownloadBtn);

    await waitFor(
      () => {
        expect(mockAnchorClick).toHaveBeenCalledTimes(1);
        const clickedAnchor = mockAnchorClick.mock.instances[0] as HTMLAnchorElement;
        expect(clickedAnchor.download).toMatch(/^风景-\d+\.jpg$/);
      },
      { timeout: 2000 }
    );
  });

  it('data: URL 附件下载失败时不会调用 window.open', async () => {
    // 模拟 fetch 抛错
    global.fetch = vi.fn().mockRejectedValue(new Error('模拟网络异常'));

    const dataUrlAttachment: Attachment = {
      id: 'image-data-fail',
      type: 'image',
      name: '失败图片',
      status: 'ready',
      imageUrl: 'data:image/png;base64,invalid-data',
    };

    const user = userEvent.setup();
    render(<AttachmentPreview attachment={dataUrlAttachment} />);

    // 打开 lightbox 并点击下载
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${dataUrlAttachment.name}` }));
    await screen.findByRole('dialog');

    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    const dialogDownloadBtn = downloadButtons[downloadButtons.length - 1];
    await user.click(dialogDownloadBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('下载失败，请稍后重试');
    });
    // 断言 mockWindowOpen 未被调用
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('下载中 isDownloading 状态为 true 时按钮处于 disabled 且文案显示「下载中…」', async () => {
    // 模拟一个较长时间的 fetch 操作以观察下载中状态
    let resolveBlob: (value: Blob) => void = () => {};
    const pendingBlobPromise = new Promise<Blob>((resolve) => {
      resolveBlob = resolve;
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => pendingBlobPromise,
    });

    const user = userEvent.setup();
    render(<AttachmentPreview attachment={imageAttachment} />);

    // 打开 lightbox
    await user.click(screen.getByRole('button', { name: `查看图片附件 ${imageAttachment.name}` }));
    await screen.findByRole('dialog');

    // 找到弹层内的下载按钮并点击
    const downloadButtons = screen.getAllByRole('button', { name: /下载/ });
    const dialogDownloadBtn = downloadButtons[downloadButtons.length - 1];
    await user.click(dialogDownloadBtn);

    // 断言下载中按钮被禁用且文案变为「下载中…」
    await waitFor(() => {
      expect(dialogDownloadBtn).toBeDisabled();
      expect(dialogDownloadBtn).toHaveTextContent('下载中…');
    });

    // 结束异步 fetch
    resolveBlob(new Blob(['test-data'], { type: 'image/png' }));

    // 下载完成后按钮恢复非禁用状态与「下载」文案
    await waitFor(() => {
      expect(dialogDownloadBtn).not.toBeDisabled();
      expect(dialogDownloadBtn).toHaveTextContent('下载');
    });
  });
});

