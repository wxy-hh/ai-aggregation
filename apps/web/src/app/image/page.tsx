'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { StyleSelector } from '@/components/image/style-selector';
import { SettingsPanel } from '@/components/image/settings-panel';
import { AssetSidebar } from '@/components/image/asset-sidebar';
import { NegativePrompt } from '@/components/image/negative-prompt';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { generateKolorsImage, downloadImage } from '@/lib/api/kolors';
import {
  DEFAULT_PARAMS,
  ASPECT_RATIO_TO_SIZE,
  STYLE_PROMPTS,
  PROMPT_TEMPLATES,
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
} from 'lucide-react';

export default function ImagePage() {
  // Generation parameters
  const [prompt, setPrompt] = useState<string>(PROMPT_TEMPLATES[0]);
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [style, setStyle] = useState<string>(DEFAULT_PARAMS.style);
  const [ratio, setRatio] = useState<string>(DEFAULT_PARAMS.aspectRatio);
  const [steps, setSteps] = useState<number>(DEFAULT_PARAMS.steps);
  const [cfg, setCfg] = useState<number>(DEFAULT_PARAMS.guidanceScale);
  const [seed, setSeed] = useState<string>('');
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_PARAMS.batchSize);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setProgress(0);
    setError(null);
    setCurrentStep('准备生成...');

    try {
      // Build enhanced prompt with style
      const styleConfig = STYLE_PROMPTS[style as keyof typeof STYLE_PROMPTS];
      const enhancedPrompt = styleConfig
        ? `${styleConfig.prefix}${prompt}${styleConfig.suffix}`
        : prompt;

      setCurrentStep('正在扩散生成...');
      setProgress(10);

      // Call API
      const response = await generateKolorsImage({
        prompt: enhancedPrompt,
        negativePrompt: negativePrompt || styleConfig?.negativePrompt,
        imageSize: ASPECT_RATIO_TO_SIZE[ratio],
        steps,
        guidanceScale: cfg,
        batchSize,
        seed: seed ? parseInt(seed) : undefined,
        style,
      });

      setProgress(80);
      setCurrentStep('下载图片...');

      // Download images
      const imageUrls = await Promise.all(
        response.images.map(async (img) => {
          const blob = await downloadImage(img.url);
          return URL.createObjectURL(blob);
        })
      );

      setProgress(100);
      setCurrentStep('完成！');
      setGeneratedImages(imageUrls);

      // Reset after a delay
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
  }, [prompt, negativePrompt, style, ratio, steps, cfg, seed, batchSize]);

  // Random inspiration
  const handleRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * PROMPT_TEMPLATES.length);
    setPrompt(PROMPT_TEMPLATES[randomIndex]);
  };

  // Get aspect ratio class based on selected ratio
  const getAspectRatioClass = () => {
    switch (ratio) {
      case '1:1':
        return 'aspect-square';
      case '3:4':
        return 'aspect-[3/4]';
      case '4:3':
        return 'aspect-[4/3]';
      case '16:9':
        return 'aspect-[16/9]';
      case '9:16':
        return 'aspect-[9/16]';
      case '3:2':
        return 'aspect-[3/2]';
      default:
        return 'aspect-[16/9]';
    }
  };

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

          {/* 头部 */}
          <header className="flex-none px-6 py-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-white/20 dark:border-white/5 flex items-center justify-between z-10">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Ai 创作工坊
                <Badge className="px-2 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] rounded-full font-bold uppercase border-0 shadow-lg shadow-indigo-500/20">
                  READY
                </Badge>
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs font-semibold text-orange-500 flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-full border border-orange-100 dark:border-orange-900/50">
                <Box className="w-3.5 h-3.5" />
                124 点数
              </div>
            </div>
          </header>

          {/* 内容区域：拆分视图 */}
          <div className="flex-1 flex overflow-hidden z-10">
            {/* 左侧面板：设置与提示词 */}
            <div className="w-80 md:w-96 flex-none flex flex-col border-r border-white/20 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl overflow-y-auto custom-scrollbar">
              <div className="p-6 space-y-8">
                {/* 提示词输入 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                        提示词 (PROMPT)
                      </h3>
                    </div>
                  </div>
                  <div className="relative group">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="w-full h-32 px-4 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-2 border-slate-200/60 dark:border-slate-700/60 rounded-2xl resize-none focus-visible:ring-0 focus-visible:border-indigo-500 transition-all text-sm leading-relaxed text-slate-700 dark:text-slate-200 shadow-sm group-hover:bg-white/80 dark:group-hover:bg-slate-800/80"
                      placeholder="描述你想要生成的画面..."
                    />
                    <div className="absolute right-3 bottom-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={handleRandomPrompt}
                        className="p-1.5 text-slate-400 hover:text-indigo-500 bg-white/80 dark:bg-slate-700/80 rounded-lg backdrop-blur-md shadow-sm transition-colors"
                        title="随机灵感"
                      >
                        <Dice5 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 负面提示词 */}
                  <NegativePrompt value={negativePrompt} onChange={setNegativePrompt} />
                </div>

                <div className="bg-slate-200/50 dark:bg-slate-800/50 h-px w-full"></div>

                <StyleSelector selected={style} onStyleChange={setStyle} />

                <div className="bg-slate-200/50 dark:bg-slate-800/50 h-px w-full"></div>

                <SettingsPanel
                  ratio={ratio}
                  steps={steps}
                  cfg={cfg}
                  seed={seed}
                  batchSize={batchSize}
                  onRatioChange={setRatio}
                  onStepsChange={setSteps}
                  onCfgChange={setCfg}
                  onSeedChange={setSeed}
                  onBatchSizeChange={setBatchSize}
                />
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
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center relative">
              {/* 背景网格纹理 - 更淡 */}
              <div
                className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              ></div>

              <div
                className={cn(
                  'relative transition-all duration-500 ease-in-out',
                  generatedImages.length > 0 ? 'w-full max-w-4xl' : 'w-full max-w-lg'
                )}
              >
                {generatedImages.length > 0 ? (
                  <div
                    className={cn(
                      'relative rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/10 border-4 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-900 group transition-all duration-300',
                      getAspectRatioClass()
                    )}
                  >
                    {/* 图片内容 */}
                    <div
                      className={cn(
                        'absolute inset-0 bg-cover bg-center transition-all duration-1000',
                        isGenerating
                          ? 'scale-110 blur-xl opacity-80'
                          : 'scale-100 blur-0 opacity-100'
                      )}
                      style={{
                        backgroundImage: `url('${generatedImages[0]}')`,
                      }}
                    ></div>

                    {/* 下载按钮 */}
                    {!isGenerating && (
                      <div className="absolute bottom-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedImages[0];
                            link.download = `kolors-${Date.now()}.png`;
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
                  // 空状态 - 准备好开始创作了吗？
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center text-center py-20 px-8 rounded-3xl border-4 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 transition-all duration-300',
                      getAspectRatioClass()
                    )}
                  >
                    <div className="w-24 h-24 mb-6 rounded-3xl bg-white dark:bg-slate-800 shadow-xl shadow-blue-500/10 flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Sparkles className="w-10 h-10 text-indigo-500" />
                      <div className="absolute -top-1 -right-1 w-8 h-8 bg-blue-500/20 blur-xl rounded-full" />
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
                      准备好开始创作了吗？
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-10 leading-relaxed">
                      在左侧输入提示词，选择风格并点击"立即生成"开始您的艺术之旅。
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
                    {generatedImages.map((img, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          const newImages = [...generatedImages];
                          [newImages[0], newImages[i]] = [newImages[i], newImages[0]];
                          setGeneratedImages(newImages);
                        }}
                        className={cn(
                          'w-20 h-20 rounded-2xl shrink-0 overflow-hidden border-2 cursor-pointer shadow-md transition-all hover:scale-105 active:scale-95',
                          i === 0
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

        {/* 右侧边栏：资产停靠区 - 移动端隐藏，lg 屏幕可见 */}
        <AssetSidebar />
      </div>
    </AppLayout>
  );
}
