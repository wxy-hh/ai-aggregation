'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { StyleSelector } from '@/components/image/style-selector';
import { SettingsPanel } from '@/components/image/settings-panel';
import { CreativeCockpit } from '@/components/image/creative-cockpit';
import { NegativePrompt } from '@/components/image/negative-prompt';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelSwitcher } from '@/components/image/model-switcher';
import { generateKolorsImage, downloadImage } from '@/lib/api/kolors';
import { generateAgnesImage } from '@/lib/api/agnes';
import {
  DEFAULT_PARAMS,
  ASPECT_RATIO_TO_SIZE,
  STYLE_PROMPTS,
  PROMPT_TEMPLATES,
  AGNES_DEFAULT_PARAMS,
  getImagePreviewBoxStyle,
  getRatioLabel,
  ImageModel,
} from '@/lib/constants/image-generation';
import {
  Sparkles,
  Wand2,
  Download,
  Image as ImageIcon,
  Loader2,
  Zap,
  Dice5,
  Pencil,
  Box,
  Palette,
  Trash2,
} from 'lucide-react';
import { useHistoryStore } from '@/stores/history-store';
import { createImageHistoryItem } from '@/lib/utils/history-helpers';
import { blobToDataUrl } from '@/lib/utils/image-url';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
// 跨模态接力：目标侧接收 + 结果源侧发起
import { ReferenceBar } from '@/components/relay/reference-bar';
import { ReferenceSourcePreview } from '@/components/relay/reference-source-preview';
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import { RelayAction } from '@/components/relay/relay-action';
import { RelayMenu } from '@/components/relay/relay-menu';
import { useRelayLauncher } from '@/components/relay/use-relay-launcher';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { DerivationMetadata, RelayReferenceItem } from '@repo/shared';

export default function ImagePage() {
  // 历史记录状态
  const addHistoryItem = useHistoryStore((state) => state.addItem);

  // 生成参数
  const [prompt, setPrompt] = useState<string>(PROMPT_TEMPLATES[0]);
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [style, setStyle] = useState<string>(DEFAULT_PARAMS.style);
  const [ratio, setRatio] = useState<string>(DEFAULT_PARAMS.aspectRatio);
  const [steps, setSteps] = useState<number>(DEFAULT_PARAMS.steps);
  const [cfg, setCfg] = useState<number>(DEFAULT_PARAMS.guidanceScale);
  const [seed, setSeed] = useState<string>('');
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_PARAMS.batchSize);

  // 模型选择
  const [model, setModel] = useState<ImageModel>('kolors');
  // Agnes 专属参数
  const [quality, setQuality] = useState<string>(AGNES_DEFAULT_PARAMS.quality);

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  // 与 generatedImages 同序的可恢复 DataURL（接力快照用，禁 objectURL）
  const [generatedDataUrls, setGeneratedDataUrls] = useState<string[]>([]);
  const [generatedRatio, setGeneratedRatio] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // 跨模态接力：图像目标接收（REQ-004/005/006）
  const relay = useRelayReceive('image');
  const [relayPreviewOpen, setRelayPreviewOpen] = useState(false);
  const relayDraftText = relay.bundle?.items[0]?.snapshotText ?? '';
  // 到达时：prompt 目标且当前 prompt 为初始模板则预填；不自动发送（REQ-005）
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (relayDraftText && !relay.draft) {
      setPrompt(relayDraftText);
      relay.setDraft(relayDraftText);
    }
     
  }, [relay.initialized, relay.bundle?.id]);
  // 记录本次生成是否来自接力（成功后写入历史，REQ-016）
  const relayDerivationRef = useRef<DerivationMetadata | undefined>(undefined);

  // 结果源侧接力：把当前生成图作为来源（REQ-002/007）。快照含图片 dataURL 与原 Prompt。
  // 快照用可恢复 DataURL（禁 objectURL：刷新/跨页后 objectURL 失效，REQ §4.3.3）
  const activeGeneratedImage = generatedImages[activeImageIndex];
  const activeGeneratedDataUrl = generatedDataUrls[activeImageIndex];
  const canRelayResult = !isGenerating && Boolean(activeGeneratedImage);
  const resultRelay = useRelayLauncher({
    sourceType: 'image',
    disabledReason: !canRelayResult
      ? isGenerating
        ? RELAY_COPY.disabled.generating
        : RELAY_COPY.disabled.empty
      : undefined,
    buildItem: () => {
      if (!canRelayResult) return null;
      const partial: Omit<RelayReferenceItem, 'id' | 'createdAt'> = {
        sourceModule: 'image',
        sourceType: 'image',
        sourceId: `image-result-${activeImageIndex}`,
        sourceTitle: prompt.slice(0, 30) || '生成图片',
        sourceModel: model === 'kolors' ? 'Kolors' : 'Agnes Image 2.1 Flash',
        snapshotText: prompt,
        snapshotMediaUrl: activeGeneratedDataUrl,
      };
      return partial;
    },
  });

  // 处理图片生成
  const handleGenerate = useCallback(async () => {
    // 接力两阶段（REQ-016）：生成前只读派生元数据（不清引用），成功才 commit 清引用与草稿；
    // 失败时引用与草稿原样保留，允许原地重试
    relayDerivationRef.current = relay.prepareExecution();
    setIsGenerating(true);
    setProgress(0);
    setError(null);
    setCurrentStep('准备生成...');

    try {
      let response;
      if (model === 'kolors') {
        // 根据风格补全提示词
        const styleConfig = STYLE_PROMPTS[style as keyof typeof STYLE_PROMPTS];
        const enhancedPrompt = styleConfig
          ? `${styleConfig.prefix}${prompt}${styleConfig.suffix}`
          : prompt;

        setCurrentStep('正在扩散生成...');
        setProgress(10);

        // 调用 Kolors 生成接口
        response = await generateKolorsImage({
          prompt: enhancedPrompt,
          negativePrompt: negativePrompt || styleConfig?.negativePrompt,
          imageSize: ASPECT_RATIO_TO_SIZE[ratio],
          steps,
          guidanceScale: cfg,
          batchSize,
          seed: seed ? parseInt(seed) : undefined,
          style,
        });
      } else {
        setCurrentStep('正在生成...');
        setProgress(10);

        // 调用 Agnes 生成接口
        response = await generateAgnesImage({
          prompt,
          negativePrompt: negativePrompt || undefined,
          size: ratio,
          n: 1,
          seed: seed ? parseInt(seed) : undefined,
          style: style || undefined,
          quality: quality as 'standard' | 'hd',
        });
      }

      setProgress(80);
      setCurrentStep('下载图片...');

      // 下载图片并分别生成页面预览地址与可持久化历史地址
      const images = await Promise.all(
        response.images.map(async (img: { url: string }) => {
          const blob = await downloadImage(img.url);
          return {
            previewUrl: URL.createObjectURL(blob),
            historyUrl: await blobToDataUrl(blob),
          };
        })
      );
      const imageUrls = images.map((item) => item.previewUrl);

      setProgress(100);
      setCurrentStep('完成！');
      setGeneratedImages(imageUrls);
      setGeneratedDataUrls(images.map((item) => item.historyUrl));
      setGeneratedRatio(ratio);
      setActiveImageIndex(0);

      // 保存到历史记录
      if (images.length > 0) {
        const modelName = model === 'kolors' ? 'Kolors' : 'Agnes Image 2.1 Flash';
        const params = model === 'kolors'
          ? { steps, cfg, seed: seed || 'random', batchSize }
          : { quality, seed: seed || 'random' };
        const historyItem = {
          id: `image-${Date.now()}`,
          ...createImageHistoryItem(prompt, images[0].historyUrl, modelName, {
            negativePrompt,
            style,
            aspectRatio: ratio,
            parameters: params,
          }),
          // 接力派生：成功才记录（REQ-016「由某来源接力生成」）
          ...(relayDerivationRef.current ?? {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addHistoryItem(historyItem);
        // 成功才完成接力：清活动引用与草稿（REQ-016）
        relay.commitExecution();
        // 清派生暂存，避免残留错配到下一次无关生成
        relayDerivationRef.current = undefined;
      }

      // 稍后重置生成状态
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
        setCurrentStep('');
      }, 1000);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : '生成失败，请重试');
      setIsGenerating(false);
      setProgress(0);
      setCurrentStep('');
    }
  }, [prompt, negativePrompt, style, ratio, steps, cfg, seed, batchSize, model, quality, addHistoryItem, relay]);

  // 随机灵感提示词
  const handleRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * PROMPT_TEMPLATES.length);
    setPrompt(PROMPT_TEMPLATES[randomIndex]);
  };

  // 模型切换时重置相关参数
  const handleModelChange = useCallback((newModel: ImageModel) => {
    setModel(newModel);
    if (newModel === 'agnes') {
      setStyle(AGNES_DEFAULT_PARAMS.style);
      setRatio(AGNES_DEFAULT_PARAMS.size);
      setQuality(AGNES_DEFAULT_PARAMS.quality);
    } else {
      setStyle(DEFAULT_PARAMS.style);
      setRatio(DEFAULT_PARAMS.aspectRatio);
      setSteps(DEFAULT_PARAMS.steps);
      setCfg(DEFAULT_PARAMS.guidanceScale);
    }
    setBatchSize(DEFAULT_PARAMS.batchSize);
    setSeed('');
  }, []);

  // 预览框始终跟随当前选中的比例，生成 API 仍使用 ratio 参数
  const previewBoxStyle = getImagePreviewBoxStyle(ratio);
  const previewRatioMismatch =
    generatedImages.length > 0 && generatedRatio != null && generatedRatio !== ratio;
  // 仅当当前比例与生成图一致时才展示主预览，避免旧图在新比例框内留白
  const showGeneratedPreview = generatedImages.length > 0 && !previewRatioMismatch;

  // Quick Start Actions
  const quickStarts = [
    {
      label: '赛博朋克城市',
      style: 'cyberpunk',
      icon: <Zap className="w-4 h-4 text-purple-500" />,
      prompt: '未来的赛博朋克城市街道，霓虹灯光，雨夜，高分辨率，电影质感',
    },
    {
      label: '梵高风格星空',
      style: 'oil-painting',
      icon: <Palette className="w-4 h-4 text-orange-500" />,
      prompt: '梵高风格的星空，旋转的星云，深蓝色的夜空，金黄色的星星，油画质感',
    },
    {
      label: '极简 3D 渲染',
      style: '3d-render',
      icon: <Box className="w-4 h-4 text-blue-500" />,
      prompt: '极简主义风格的3D几何图形，柔和的灯光，淡雅的色彩，高质量渲染',
    },
  ];

  const handleQuickStart = (item: (typeof quickStarts)[0]) => {
    setPrompt(item.prompt);
    setStyle(item.style);
  };

  const renderParameterPanel = () => (
    <>
      {/* 接力引用条：位于 Prompt 上方（REQ-004）。参考图目标展示媒体快照，再次绘图/Prompt 目标展示文本快照。 */}
      {relay.replaceCandidate ? (
        <ReferenceBar
          bundle={relay.replaceCandidate.incoming}
          isReplaceCandidate
          onConfirmReplace={relay.confirmReplace}
          onCancelReplace={relay.cancelReplace}
          onRemove={relay.remove}
        />
      ) : relay.bundle ? (
        <ReferenceBar
          bundle={relay.bundle}
          onRemove={relay.remove}
          onViewSource={() => setRelayPreviewOpen(true)}
          showFill={Boolean(relayDraftText) && prompt !== relayDraftText}
          fillLabel={RELAY_COPY.referenceBar.fillPrompt}
          onFill={() => {
            setPrompt(relayDraftText);
            relay.setDraft(relayDraftText);
          }}
        />
      ) : relay.isInvalid ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">{RELAY_COPY.referenceBar.invalid}</p>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">提示词 (PROMPT)</h3>
          </div>
        </div>
        <div className="relative group">
          <Textarea
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
            className="w-full h-32 px-4 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-2 border-slate-200/60 dark:border-slate-700/60 rounded-2xl resize-none focus-visible:ring-0 focus-visible:border-indigo-500 transition-all text-sm leading-relaxed text-slate-700 dark:text-slate-200 shadow-sm group-hover:bg-white/80 dark:group-hover:bg-slate-800/80"
            placeholder="描述你想要生成的画面..."
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setPrompt('')}
              className="p-1.5 text-slate-400 hover:text-red-500 bg-white/80 dark:bg-slate-700/80 rounded-lg backdrop-blur-md shadow-sm transition-colors"
              title="清空提示词"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRandomPrompt}
              className="p-1.5 text-slate-400 hover:text-indigo-500 bg-white/80 dark:bg-slate-700/80 rounded-lg backdrop-blur-md shadow-sm transition-colors"
              title="随机灵感"
            >
              <Dice5 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <NegativePrompt value={negativePrompt} onChange={setNegativePrompt} />
      </div>

      <div className="bg-slate-200/50 dark:bg-slate-800/50 h-px w-full"></div>

      <StyleSelector selected={style} onStyleChange={setStyle} model={model} />

      <div className="bg-slate-200/50 dark:bg-slate-800/50 h-px w-full"></div>

      <SettingsPanel
        model={model}
        ratio={ratio}
        steps={steps}
        cfg={cfg}
        seed={seed}
        batchSize={batchSize}
        quality={quality}
        onRatioChange={setRatio}
        onStepsChange={setSteps}
        onCfgChange={setCfg}
        onSeedChange={setSeed}
        onBatchSizeChange={setBatchSize}
        onQualityChange={setQuality}
      />
    </>
  );

  return (
    <AppLayout>
      <div className="flex w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 overflow-hidden">
        {/* 主工作区 */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {/* 装饰性背景元素 */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-400/10 blur-[100px]" />
            <div className="absolute top-[40%] -left-[10%] w-[40%] h-[40%] rounded-full bg-purple-400/10 blur-[100px]" />
          </div>

          {/* 头部：透明磨砂，与页面径向渐变融为一体，避免白底拼接感 */}
          <header className="relative z-10 flex flex-none items-center justify-between px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/20 md:px-6 dark:supports-[backdrop-filter]:bg-slate-950/15">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Ai 创作工坊
                <Badge className="px-2 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] rounded-full font-bold uppercase border-0 shadow-lg shadow-indigo-500/20">
                  READY
                </Badge>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <ModelSwitcher model={model} onModelChange={handleModelChange} />
              <Button
                type="button"
                variant="outline"
                aria-label="打开参数面板"
                onClick={() => setShowMobileSettings(true)}
                className="lg:hidden rounded-xl border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
              >
                <Pencil className="w-4 h-4 mr-2" />
                参数设置
              </Button>
            </div>
          </header>

          {/* 内容区域：拆分视图 */}
          <div className="flex-1 flex overflow-hidden z-10">
            {/* 左侧面板：设置与提示词 */}
            <div className="hidden lg:flex w-80 md:w-96 flex-none flex-col border-r border-white/20 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl overflow-y-auto custom-scrollbar">
              <div className="p-6 space-y-8">
                {renderParameterPanel()}
              </div>

              {/* 吸底生成按钮 */}
              <div className="p-6 pt-0 mt-auto sticky bottom-0 bg-gradient-to-t from-white/90 via-white/80 to-transparent dark:from-slate-900/90 dark:via-slate-900/80 dark:to-transparent backdrop-blur-sm z-10 pb-8">
                {error && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className={cn(
                    'w-full py-6 rounded-2xl font-bold flex items-center justify-center gap-2 text-white shadow-xl shadow-blue-500/20 transition-all text-md cursor-pointer border border-white/20',
                    isGenerating || !prompt.trim()
                      ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-90'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]'
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white/90" />
                      生成中 {progress}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 fill-white/20" />
                      立即生成
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* 中间：预览区域 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-start lg:justify-center relative">
              {/* 背景网格纹理 - 更淡 */}
              <div
                className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              ></div>

              <div className="w-full max-w-3xl lg:hidden mb-6 relative z-10">
                <div className="space-y-4 rounded-3xl border border-white/40 bg-white/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <h2 className="text-sm font-bold text-slate-800 dark:text-white">提示词</h2>
                    </div>
                    <Textarea
                      value={prompt}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setPrompt(e.target.value)
                      }
                      className="w-full min-h-[112px] px-4 py-3 bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 rounded-2xl resize-none focus-visible:ring-0 focus-visible:border-indigo-500 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                      placeholder="描述你想要生成的画面..."
                    />
                  </div>

                  {error ? (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className={cn(
                      'w-full py-6 rounded-2xl font-bold flex items-center justify-center gap-2 text-white shadow-xl shadow-blue-500/20 transition-all text-md cursor-pointer border border-white/20',
                      isGenerating || !prompt.trim()
                        ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-90'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/40'
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-white/90" />
                        生成中 {progress}%
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 fill-white/20" />
                        立即生成
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div
                className="relative mx-auto transition-all duration-500 ease-in-out"
                style={previewBoxStyle}
              >
                {showGeneratedPreview ? (
                  <div
                    className={cn(
                      'relative w-full h-full min-h-0 rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/10 border-4 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-900 group transition-all duration-300'
                    )}
                    onContextMenu={resultRelay.onContextMenu}
                    {...resultRelay.longPressProps}
                  >
                    <img
                      src={generatedImages[activeImageIndex]}
                      alt="生成结果"
                      className={cn(
                        'absolute inset-0 w-full h-full object-cover transition-all duration-1000',
                        isGenerating
                          ? 'scale-105 blur-xl opacity-80'
                          : 'scale-100 blur-0 opacity-100'
                      )}
                    />

                    {!isGenerating && (
                      <div className="absolute bottom-6 right-6 flex gap-2 opacity-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                        {/* 接力：移动端常显（无 hover），桌面 hover 渐显（REQ-002 显式入口） */}
                        <RelayAction
                          ref={resultRelay.triggerRef}
                          iconOnly
                          disabled={resultRelay.disabled}
                          disabledReason={resultRelay.disabledReason}
                          onClick={resultRelay.openAtTrigger}
                          className="h-11 w-11 rounded-full border border-white/20 bg-white/20 p-3 text-white shadow-lg backdrop-blur-md hover:bg-white/30"
                        />
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedImages[activeImageIndex];
                            link.download = `${model}-${Date.now()}.png`;
                            link.click();
                          }}
                          className="p-3 bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full text-white transition-colors cursor-pointer shadow-lg border border-white/20"
                          title="下载图片"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'absolute inset-0 flex flex-col items-center justify-center text-center py-12 px-6 rounded-3xl border-4 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 transition-all duration-300'
                    )}
                  >
                    <div className="w-24 h-24 mb-6 rounded-3xl bg-white dark:bg-slate-800 shadow-xl shadow-blue-500/10 flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Sparkles className="w-10 h-10 text-indigo-500" />
                      <div className="absolute -top-1 -right-1 w-8 h-8 bg-blue-500/20 blur-xl rounded-full" />
                    </div>

                    {previewRatioMismatch ? (
                      <>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                          已切换至 {getRatioLabel(ratio)} 比例
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6 leading-relaxed text-sm">
                          当前预览框已按新比例调整。点击「立即生成」将输出对应尺寸的图片，下方缩略图可查看上次结果。
                        </p>
                        <Button
                          onClick={handleGenerate}
                          disabled={isGenerating || !prompt.trim()}
                          className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-white shadow-lg"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          按 {getRatioLabel(ratio)} 重新生成
                        </Button>
                      </>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
                          准备好开始创作了吗？
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-10 leading-relaxed">
                          在左侧输入提示词，选择风格并点击「立即生成」开始您的艺术之旅。
                        </p>

                        <div className="flex flex-wrap justify-center gap-3">
                          {quickStarts.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => handleQuickStart(item)}
                              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 rounded-full shadow-sm hover:shadow-md border border-slate-100 dark:border-slate-700 transition-all hover:-translate-y-0.5"
                            >
                              {item.icon}
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {item.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 生成中遮罩 */}
                {isGenerating && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl overflow-hidden">
                    {/* 背景模糊 */}
                    <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md" />

                    {/* 进度环 */}
                    <div className="relative z-10 w-40 h-40 mb-8">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          className="text-white/20"
                          strokeWidth="6"
                          stroke="currentColor"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                        ></circle>
                        <circle
                          className="text-indigo-500 filter drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                          strokeWidth="6"
                          strokeDasharray={440}
                          strokeDashoffset={440 - (440 * progress) / 100}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                        ></circle>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl font-bold text-white tracking-tighter drop-shadow-lg">
                          {progress}%
                        </span>
                      </div>
                    </div>

                    {/* 状态徽章 */}
                    <div className="relative z-10 flex items-center gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-6 py-3 rounded-full shadow-2xl border border-white/20 ring-1 ring-black/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
                        <span className="font-bold text-slate-800 dark:text-white text-sm">
                          {currentStep || '正在扩散生成中...'}
                        </span>
                      </div>
                      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>
                      <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400 font-bold">
                        {progress}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 历史记录条 */}
              {generatedImages.length > 0 && (
                <div className="mt-8 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between mb-4">
                    {/* 缩略图留空，或者加点简单的装饰 */}
                  </div>
                  <div className="flex lg:flex-wrap gap-4 justify-center overflow-x-auto pb-4 custom-scrollbar">
                    {generatedImages.map((img: string, i: number) => (
                      <div
                        key={i}
                        onClick={() => {
                          setActiveImageIndex(i);
                          if (generatedRatio) setRatio(generatedRatio);
                        }}
                        className={cn(
                          'w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-2 cursor-pointer shadow-md transition-all hover:scale-105 active:scale-95',
                          i === activeImageIndex
                            ? 'border-indigo-500 ring-2 ring-indigo-500/20 ring-offset-2 dark:ring-offset-slate-950'
                            : 'border-white dark:border-slate-700 bg-slate-200 dark:bg-slate-800'
                        )}
                        style={{
                          backgroundImage: `url('${img}')`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧边栏：创作灵感舱 */}
        <div className="hidden xl:block">
          <CreativeCockpit
            onPromptAppend={(text) => {
              setPrompt((prev) => (prev ? `${prev}，${text}` : text));
            }}
            onStyleApply={(params) => {
              if (params.ratio) setRatio(params.ratio);
              if (params.steps) setSteps(params.steps);
              if (params.style) setStyle(params.style);
              if (params.cfg) setCfg(params.cfg);
              // Optionally show a toast here
            }}
          />
        </div>
      </div>

      <Dialog open={showMobileSettings} onOpenChange={setShowMobileSettings}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950 lg:hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              参数设置
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              调整风格、排除内容和生成参数
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto p-4 space-y-6">{renderParameterPanel()}</div>
        </DialogContent>
      </Dialog>

      {/* 接力：结果源侧菜单（显式按钮/右键/长按复用） */}
      <RelayMenu
        open={resultRelay.menuOpen}
        onOpenChange={resultRelay.setMenuOpen}
        targets={resultRelay.targets}
        onSelect={resultRelay.onSelect}
        anchorPoint={resultRelay.anchorPoint}
        triggerRef={resultRelay.triggerRef}
      />

      {/* 接力来源只读预览 */}
      <ReferenceSourcePreview
        open={relayPreviewOpen}
        onOpenChange={setRelayPreviewOpen}
        item={relay.bundle?.items[0] ?? null}
      />
    </AppLayout>
  );
}
