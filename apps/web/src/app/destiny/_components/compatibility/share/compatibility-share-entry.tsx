'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  destinyPrimaryBtnClass,
  destinySecondaryBtnClass,
} from '../../layout/destiny-result-header';
import type { CompatibilityReport, RelationType } from '../types';
import { canShareFiles, useShareImage } from '../../share/use-share-image';
import { CompatibilityShareCard } from './compatibility-share-card';
import {
  buildCompatibilityShareCardData,
  type CompatibilityShareCardData,
} from './compatibility-share-card-data';

const CARD_WIDTH = 375;
const CARD_HEIGHT = 667;

type Props = {
  report: CompatibilityReport;
  activeRelation: RelationType;
  /** 当前视角是否仍在加载 */
  loadingView?: boolean;
  /** 覆盖触发器外观（合盘顶栏主按钮） */
  triggerClassName?: string;
  triggerLabel?: string;
};

/**
 * 合盘「生成缘分卡」入口：
 * 预览弹层（移动底抽屉 / 桌面居中）+ 保存图片 + 系统分享。
 * 完全替换纯文本 share；卡面为固定浅色印刷稿，按关系类型换肤。
 */
export function CompatibilityShareEntry({
  report,
  activeRelation,
  loadingView = false,
  triggerClassName,
  triggerLabel = '生成缘分卡',
}: Props) {
  const [open, setOpen] = useState(false);
  const [cardData, setCardData] = useState<CompatibilityShareCardData | null>(
    null
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [fileShareSupported, setFileShareSupported] = useState(false);

  useEffect(() => {
    setFileShareSupported(canShareFiles());
  }, []);

  const available = useMemo(
    () =>
      !loadingView &&
      buildCompatibilityShareCardData(report, activeRelation, {
        origin: 'https://placeholder.invalid',
      }) !== null,
    [report, activeRelation, loadingView]
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const measurePreviewBox = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) {
      setPreviewScale(null);
      return;
    }
    const updateScale = () => {
      setPreviewScale(
        Math.min(1, node.clientWidth / CARD_WIDTH, node.clientHeight / CARD_HEIGHT)
      );
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  const { state: exportState, downloadPng, sharePng } = useShareImage();
  const exporting = exportState === 'exporting';

  useEffect(() => {
    if (!open) return;

    const data = buildCompatibilityShareCardData(report, activeRelation, {
      origin: window.location.origin,
    });
    setCardData(data);
    setQrDataUrl(null);
    setQrError(false);

    if (data) {
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
  }, [open, report, activeRelation]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || !cardData) return;
    try {
      await downloadPng(cardRef.current, cardData.fileName);
      toast.success('缘分卡已保存，快去分享吧');
    } catch {
      toast.error('缘分卡生成失败，请重试');
    }
  }, [downloadPng, cardData]);

  const handleSystemShare = useCallback(async () => {
    if (!cardRef.current || !cardData) return;
    try {
      const shared = await sharePng(
        cardRef.current,
        cardData.fileName,
        cardData.shareText
      );
      if (!shared) {
        await downloadPng(cardRef.current, cardData.fileName);
        toast.success('当前环境不支持系统分享，已为你保存图片');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('缘分卡生成失败，请重试');
    }
  }, [sharePng, downloadPng, cardData]);

  const handleOpen = () => {
    if (!available) {
      toast.message('当前视角内容准备中，稍后再试');
      return;
    }
    setOpen(true);
  };

  const previewReady = Boolean(cardData && qrDataUrl && previewScale !== null);

  return (
    <>
      <Button
        type="button"
        onClick={handleOpen}
        disabled={loadingView}
        className={cn(
          destinyPrimaryBtnClass,
          'h-10 gap-1.5 px-4 text-xs sm:px-5 sm:text-sm',
          loadingView && 'cursor-not-allowed opacity-55',
          triggerClassName
        )}
      >
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          contentAnimation="none"
          className={cn(
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 p-0',
            'rounded-t-[28px] rounded-b-none border border-white/60 pb-[env(safe-area-inset-bottom)]',
            'bg-white/80 backdrop-blur-2xl',
            'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(244,63,94,0.12)]',
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
              缘分卡预览
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-left text-sm text-slate-500 dark:text-slate-400">
              脱敏分享，不含双方出生资料
            </DialogDescription>
          </div>

          <div className="max-h-[92vh] overflow-y-auto px-4 py-4 sm:px-6">
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
                    <CompatibilityShareCard
                      ref={cardRef}
                      data={cardData}
                      qrDataUrl={qrDataUrl}
                    />
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
                  {qrError || (!cardData && open) ? (
                    <p className="px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      {qrError
                        ? '二维码生成失败，请关闭后重试'
                        : '当前视角内容准备中，稍后再试'}
                    </p>
                  ) : (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-rose-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        正在准备缘分卡…
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200/50 px-4 py-3.5 sm:px-6 dark:border-white/10">
            <p className="mb-3 text-center text-xs text-slate-400 dark:text-slate-500">
              保存后可发到微信 / 朋友圈
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
