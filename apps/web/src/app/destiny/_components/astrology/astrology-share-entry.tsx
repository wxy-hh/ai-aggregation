'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import { destinyPrimaryBtnClass } from '../layout/destiny-result-header';
import { canShareFiles, useShareImage } from '../share/use-share-image';
import { sanitizeShareFileName } from '../share/share-card-data';
import { AstrologyShareCard } from './astrology-share-card';
import {
  buildAstrologyShareCardData,
  type AstrologyShareCardData,
} from './astrology-share-card-data';

/** 卡片逻辑宽度（导出 750px = 375 × 2） */
const CARD_WIDTH = 375;
/** 卡片逻辑高度（竖版 3:4） */
const CARD_HEIGHT = 500;

/** 选项分段控制器（radiogroup 语义，键盘可遍历，热区 ≥44px） */
function OptionSegment<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; text: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-[10px] leading-snug text-slate-400 dark:text-night-faint">
            {hint}
          </p>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'flex shrink-0 rounded-full border border-slate-200/80 bg-slate-100/70 p-0.5',
          'dark:border-white/[0.12] dark:bg-white/5',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium',
                'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                selected
                  ? 'bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] text-white shadow-[0_6px_16px_-6px_rgba(73,105,233,0.55)]'
                  : 'text-slate-500 hover:text-indigo-600 dark:text-night-muted dark:hover:text-indigo-200'
              )}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 星座寰宇 · 分享星语海报入口（洞察轨卡片 + 预览弹层）。
 *
 * 弹层（移动端底部抽屉 / 桌面端居中）内实时预览竖版 3:4 海报卡，
 * 提供「显示昵称/匿名」「大三要素/仅主轴」两档脱敏选项，确认后保存 PNG
 * 或调起系统分享。海报为本地生成、无服务端资产，每次打开都从当前
 * 事实层修订重建 —— 重算后旧图片自然失效（工单 12 criterion 4）。
 */
export function AstrologyShareEntry({
  facts,
  headline,
  name,
}: {
  facts: AstrologyChartFacts;
  /** 主轴金句（mock 解读层 headline；缺失则整个入口不渲染） */
  headline: string;
  /** 用户昵称（表单 name，可为 null） */
  name: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [cardData, setCardData] = useState<AstrologyShareCardData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  // 脱敏选项：默认显示昵称与全部已确定要素（弹层打开时按数据可用性重置）
  const [showNickname, setShowNickname] = useState(true);
  const [showElements, setShowElements] = useState(true);
  // 系统分享能力只需在客户端挂载后探测一次
  const [fileShareSupported, setFileShareSupported] = useState(false);
  useEffect(() => {
    setFileShareSupported(canShareFiles());
  }, []);

  // 主轴标语缺失时整个入口不渲染，避免生成半成品卡片（构建器同步返回空）
  const available = useMemo(
    () =>
      buildAstrologyShareCardData(facts, {
        name,
        headline,
        origin: 'https://placeholder.invalid',
      }) !== null,
    [facts, headline, name]
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  // 空值 = 尚未完成测量；测量完成前不渲染卡片，避免瞬时溢出导致容器滚动
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 预览容器测量：必须使用回调引用而非副作用监听——浮层容器在
  // 第二帧才挂载，打开状态翻转后的副作用中读取引用恒为空（同八字分享卡工法）。
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

  // 弹层打开时：从当前事实层重建卡片数据并生成二维码（页面域名延迟到此时读取，避开服务端渲染）
  useEffect(() => {
    if (!open) return;

    const data = buildAstrologyShareCardData(facts, {
      name,
      headline,
      origin: window.location.origin,
    });
    setCardData(data);
    setQrDataUrl(null);
    setQrError(false);
    // 大三要素不可用（无已确定要素）时禁用该选项并回退仅主轴
    setShowElements((data?.elements.length ?? 0) > 0);
    setShowNickname(true);

    if (data) {
      // 二维码生成库按需动态加载，避免进入主包体积
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
  }, [open, facts, headline, name]);

  const fileName = cardData?.nickname
    ? `星座寰宇-${sanitizeShareFileName(cardData.nickname)}.png`
    : '星座寰宇-星语海报.png';

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      await downloadPng(cardRef.current, fileName);
      toast.success('海报已保存，快去分享吧');
    } catch {
      toast.error('海报生成失败，请重试');
    }
  }, [downloadPng, fileName]);

  const handleSystemShare = useCallback(async () => {
    if (!cardRef.current || !cardData) return;
    try {
      const shared = await sharePng(cardRef.current, fileName, `我的星语：${cardData.headline}`);
      if (!shared) {
        // 环境不支持文件分享：回退为下载
        await downloadPng(cardRef.current, fileName);
        toast.success('当前环境不支持系统分享，已为你保存图片');
      }
    } catch (error) {
      // 用户取消分享属于正常操作，不提示错误
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('海报生成失败，请重试');
    }
  }, [sharePng, downloadPng, fileName, cardData]);

  if (!available) return null;

  // 预览就绪 = 卡片数据与测量就绪；二维码失败仍允许预览，仅禁用保存按钮
  const previewReady = Boolean(cardData && previewScale !== null);
  const exportReady = Boolean(previewReady && qrDataUrl);
  const elementsAvailable = (cardData?.elements.length ?? 0) > 0;

  return (
    <>
      {/* 洞察轨入口卡片（与相邻卡片同一容器语言） */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]">
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent dark:block" />
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]" strokeWidth={1.9} />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">分享星语海报</h3>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
          生成脱敏分享卡：只含昵称、核心要素与一句主轴。
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-indigo-200/90 bg-indigo-50/70 text-sm font-semibold text-indigo-700 transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-100/80 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
        >
          <Share2 className="h-4 w-4" strokeWidth={2} />
          生成分享卡
        </button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          contentAnimation="none"
          className={cn(
            // 移动端：底部抽屉；桌面端：居中弹层（与八字分享卡同一布局模式）
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 p-0',
            'rounded-t-[28px] rounded-b-none border border-white/60 pb-[env(safe-area-inset-bottom)]',
            'bg-white/85 backdrop-blur-2xl',
            'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(73,105,233,0.18)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-auto sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-[32px] sm:pb-0',
            'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
            // 暗色玻璃：透明度必须方括号写法（Tailwind v3 裸 /92 不生成 CSS）
            'dark:border-white/10 dark:bg-[#0D1226]/[0.92]'
          )}
        >
          <div className="border-b border-slate-200/50 px-4 py-4 sm:px-6 dark:border-white/10">
            <DialogTitle className="text-left font-heading text-base font-semibold text-slate-900 dark:text-white">
              分享星语海报
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-left text-sm text-slate-500 dark:text-night-muted">
              默认脱敏：不含出生时间、地点与度数
            </DialogDescription>
          </div>

          <div className="max-h-[92vh] overflow-y-auto px-4 py-4 sm:px-6">
            {/* 预览容器：按可用宽高取较小缩放比，导出节点保持 375×500 原始尺寸 */}
            <div
              ref={measurePreviewBox}
              className="flex h-[46vh] w-full items-center justify-center sm:h-[56vh]"
            >
              {previewReady && cardData && previewScale !== null ? (
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
                    <AstrologyShareCard
                      ref={cardRef}
                      data={cardData}
                      qrDataUrl={qrDataUrl}
                      showNickname={showNickname}
                      showElements={showElements}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-[24px] bg-slate-100/70 dark:bg-slate-800/50"
                  style={{
                    width: CARD_WIDTH * (previewScale ?? 0.8),
                    height: CARD_HEIGHT * (previewScale ?? 0.8),
                  }}
                >
                  <Loader2 className="h-6 w-6 animate-spin text-[#4969E9]" />
                  <p className="text-sm text-slate-500 dark:text-night-muted">正在准备海报…</p>
                </div>
              )}
            </div>

            {/* 脱敏选项：实时更新预览（display-side，无需重建卡片数据） */}
            <div className="mt-4 space-y-3 border-t border-slate-200/50 pt-4 dark:border-white/10">
              <OptionSegment
                label="昵称"
                value={showNickname ? 'show' : 'hide'}
                options={[
                  { value: 'show', text: '显示昵称' },
                  { value: 'hide', text: '匿名' },
                ]}
                onChange={(v) => setShowNickname(v === 'show')}
              />
              <OptionSegment
                label="内容"
                value={showElements ? 'full' : 'headline'}
                options={[
                  { value: 'full', text: '大三要素' },
                  { value: 'headline', text: '仅主轴' },
                ]}
                onChange={(v) => setShowElements(v === 'full')}
                disabled={!elementsAvailable}
                hint={elementsAvailable ? undefined : '当前星盘无已确定要素，海报仅显示主轴'}
              />
            </div>
          </div>

          <div className="border-t border-slate-200/50 px-4 py-3.5 sm:px-6 dark:border-white/10">
            {qrError ? (
              <p className="mb-3 text-center text-xs text-amber-500 dark:text-amber-300/80">
                二维码生成失败，可预览但暂不能保存，请关闭后重试
              </p>
            ) : null}
            <div className="flex items-center justify-center gap-2.5">
              <Button
                type="button"
                onClick={() => {
                  void handleDownload();
                }}
                disabled={!exportReady || exporting}
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
                  disabled={!exportReady || exporting}
                  className={cn(
                    'min-h-11 min-w-[112px] rounded-full border-indigo-300/60 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-300/30 dark:text-indigo-200 dark:hover:bg-indigo-400/10'
                  )}
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
