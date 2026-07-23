'use client';

import { useCallback, useState } from 'react';

/**
 * 分享图片导出 hook：
 * 负责把卡片 DOM 节点渲染为 PNG（2 倍像素 → 750×1334），
 * 并提供「下载保存」与「系统分享」两种出口。
 * html-to-image 体积较大且仅在导出时使用，按需动态导入。
 */

/** 生成中状态的极简公开接口 */
export type ShareImageExportState = 'idle' | 'exporting';

/** 等待字体就绪，避免导出图片字体回退 */
async function waitForFonts(): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // 字体等待失败不阻塞导出（回退系统字体仍可接受）
  }
}

/** 把 PNG dataURL 转成 File（系统分享用） */
async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: 'image/png' });
}

/** 当前环境是否支持分享文件（移动端 Safari/Chrome） */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File([''], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function useShareImage() {
  const [state, setState] = useState<ShareImageExportState>('idle');

  /** 导出卡片节点为 PNG dataURL */
  const exportPng = useCallback(async (node: HTMLElement): Promise<string> => {
    setState('exporting');
    try {
      await waitForFonts();
      const { toPng } = await import('html-to-image');
      return await toPng(node, {
        pixelRatio: 2,
        // 卡片无任何外部图片资源（二维码为 dataURL），无需 cacheBust
        cacheBust: false,
      });
    } finally {
      setState('idle');
    }
  }, []);

  /** 下载保存 PNG */
  const downloadPng = useCallback(
    async (node: HTMLElement, fileName: string): Promise<void> => {
      const dataUrl = await exportPng(node);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [exportPng]
  );

  /** 调起系统分享（不支持文件分享的环境返回 false，由调用方回退下载） */
  const sharePng = useCallback(
    async (node: HTMLElement, fileName: string, text: string): Promise<boolean> => {
      if (!canShareFiles()) return false;
      const dataUrl = await exportPng(node);
      const file = await dataUrlToFile(dataUrl, fileName);
      if (!navigator.canShare({ files: [file] })) return false;
      await navigator.share({ files: [file], text });
      return true;
    },
    [exportPng]
  );

  return { state, exportPng, downloadPng, sharePng };
}
