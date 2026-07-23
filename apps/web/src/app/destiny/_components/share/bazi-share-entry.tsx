'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { destinyPrimaryBtnClass, destinySecondaryBtnClass } from '../layout/destiny-result-header';
import type { DestinyReport } from '../types';
import { BaziShareCard } from './bazi-share-card';
import {
  buildBaziShareCardData,
  sanitizeShareFileName,
  type BaziShareCardData,
} from './share-card-data';
import { canShareFiles, useShareImage } from './use-share-image';

/** 卡片逻辑宽度（导出 750px = 375 × 2） */
const CARD_WIDTH = 375;
/** 卡片逻辑高度 */
const CARD_HEIGHT = 667;

/**
 * 八字结果页分享入口：
 * 结果页头部「分享」按钮 + 卡片预览弹层（移动端底部抽屉 / 桌面端居中），
 * 支持保存图片与系统分享。
 */
export function BaziShareEntry({ report }: { report: DestinyReport }) {
  const [open, setOpen] = useState(false);
  const [cardData, setCardData] = useState<BaziShareCardData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  // 系统分享能力只需在客户端挂载后探测一次
  const [fileShareSupported, setFileShareSupported] = useState(false);
  useEffect(() => {
    setFileShareSupported(canShareFiles());
  }, []);

  // 数据不完整（如五维缺失）时整个入口不渲染，避免生成半成品卡片
  const available = useMemo(
    () => buildBaziShareCardData(report, { origin: 'https://placeholder.invalid' }) !== null,
    [report]
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  // null = 尚未完成测量；测量完成前不渲染卡片，避免瞬时溢出导致容器滚动
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 预览容器测量：必须用 callback ref 而非 useEffect——Radix Portal 的容器在
  // 第二帧才挂载，open 翻转后的 effect 里取 ref 恒为 null。
  // 宽高考量取较小缩放比，保证整张卡片在可视区域内完整呈现。
  const measurePreviewBox = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) {
      setPreviewScale(null);
      return;
    }
    const updateScale = () => {
      setPreviewScale(Math.min(1, node.clientWidth / CARD_WIDTH, node.clientHeight / CARD_HEIGHT));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);
  const { state: exportState, downloadPng, sharePng } = useShareImage();
  const exporting = exportState === 'exporting';

  // 弹层打开时：构建卡片数据并生成二维码（origin 延迟到此时读取，避开 SSR）
  useEffect(() => {
    if (!open) return;

    const data = buildBaziShareCardData(report, { origin: window.location.origin });
    setCardData(data);
    setQrDataUrl(null);
    setQrError(false);

    if (data) {
      // qrcode 库按需动态加载，避免进入 destiny 主包
      void import('qrcode')
        .then((mod) =>
          mod.default.toDataURL(data.shareUrl, {
            width: 288,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0F172A', light: '#FFFFFF' },
          })
        )
        .then(setQrDataUrl)
        .catch(() => setQrError(true));
    }
  }, [open, report]);

  const fileName = cardData
    ? `八字命盘-${sanitizeShareFileName(cardData.nickname)}.png`
    : '八字命盘.png';

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      await downloadPng(cardRef.current, fileName);
      toast.success('卡片已保存，快去分享吧');
    } catch {
      toast.error('卡片生成失败，请重试');
    }
  }, [downloadPng, fileName]);

  const handleSystemShare = useCallback(async () => {
    if (!cardRef.current || !cardData) return;
    try {
      const shared = await sharePng(
        cardRef.current,
        fileName,
        `${cardData.nickname} 的八字命盘：${cardData.headline}`
      );
      if (!shared) {
        // 环境不支持文件分享：回退为下载
        await downloadPng(cardRef.current, fileName);
        toast.success('当前环境不支持系统分享，已为你保存图片');
      }
    } catch (error) {
      // 用户取消分享属于正常操作，不提示错误
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('卡片生成失败，请重试');
    }
  }, [sharePng, downloadPng, fileName, cardData]);

  if (!available) return null;

  // 卡片可导出 = 数据、二维码与预览测量均就绪（此时导出节点已挂载）
  const previewReady = Boolean(cardData && qrDataUrl && previewScale !== null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={destinySecondaryBtnClass}
      >
        <Share2 className="mr-2 h-4 w-4" />
        分享
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          contentAnimation="none"
          className={cn(
            // 移动端：底部抽屉；桌面端：居中弹层
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 p-0',
            'rounded-t-[28px] rounded-b-none border border-white/60 pb-[env(safe-area-inset-bottom)]',
            'bg-white/80 backdrop-blur-2xl',
            'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(59,130,246,0.15)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-auto sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-[32px] sm:pb-0',
            'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
            'dark:border-white/10 dark:bg-slate-900/85'
          )}
        >
          <div className="border-b border-slate-200/50 px-4 py-4 sm:px-6 dark:border-white/10">
            <DialogTitle className="text-left font-heading text-base font-semibold text-slate-900 dark:text-white">
              分享命盘卡片
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-left text-sm text-slate-500 dark:text-slate-400">
              生成专属命盘卡片，好友扫码即可测算自己的八字
            </DialogDescription>
          </div>

          <div className="max-h-[92vh] overflow-y-auto px-4 py-4 sm:px-6">
            {/* 预览容器：按可用宽高取较小缩放比，导出节点保持 375×667 原始尺寸 */}
            <div
              ref={measurePreviewBox}
              className="flex h-[52vh] w-full items-center justify-center sm:h-[62vh]"
            >
              {previewReady && cardData && qrDataUrl && previewScale !== null ? (
                <div
                  style={{
                    width: CARD_WIDTH * previewScale,
                    height: CARD_HEIGHT * previewScale,
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <BaziShareCard ref={cardRef} data={cardData} qrDataUrl={qrDataUrl} />
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-[28px] bg-slate-100/70 dark:bg-slate-800/50"
                  style={{
                    width: CARD_WIDTH * (previewScale ?? 0.8),
                    height: CARD_HEIGHT * (previewScale ?? 0.8),
                  }}
                >
                  {qrError ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      二维码生成失败，请关闭后重试
                    </p>
                  ) : (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-[#5D7CFA]" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">正在准备卡片…</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200/50 px-4 py-3.5 sm:px-6 dark:border-white/10">
            <p className="mb-3 text-center text-xs text-slate-400 dark:text-slate-500">
              分享给朋友，看看你们八字合不合
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <Button
                type="button"
                onClick={() => {
                  void handleDownload();
                }}
                disabled={!previewReady || exporting}
                className={cn(destinyPrimaryBtnClass, 'min-w-[128px]')}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {exporting ? '生成中…' : '保存图片'}
              </Button>
              {fileShareSupported ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleSystemShare();
                  }}
                  disabled={!previewReady || exporting}
                  className={cn(destinySecondaryBtnClass, 'min-w-[112px]')}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  系统分享
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
