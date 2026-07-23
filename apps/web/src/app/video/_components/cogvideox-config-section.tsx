'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  CogVideoXConfig,
  COGVIDEOX_RATIOS,
  COGVIDEOX_DURATIONS,
  COGVIDEOX_RESOLUTIONS,
} from '@/lib/constants/video-generation';
import { Image as ImageIcon, Upload, X } from 'lucide-react';

interface CogVideoXConfigSectionProps {
  config: CogVideoXConfig;
  setConfig: (config: CogVideoXConfig) => void;
  referenceImage: string | null;
  setReferenceImage: (url: string | null) => void;
  disabled?: boolean;
}

export function CogVideoXConfigSection({
  config,
  setConfig,
  referenceImage,
  setReferenceImage,
  disabled = false,
}: CogVideoXConfigSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-7">
      {/* 参考图 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <ImageIcon className="h-4 w-4" />
            参考图
          </label>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-500/70 dark:bg-blue-900/20">
            图生视频
          </span>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
          disabled={disabled}
        />
        <div
          onClick={() => !disabled && !referenceImage && fileInputRef.current?.click()}
          className={cn(
            'relative h-32 overflow-hidden rounded-2xl border-2 border-dashed transition-all',
            referenceImage
              ? 'border-solid border-blue-400/50 bg-white/40 dark:border-blue-500/30 dark:bg-slate-900/30'
              : 'cursor-pointer border-white/60 bg-white/40 hover:border-blue-400/60 dark:border-white/10 dark:bg-slate-900/30 dark:hover:border-blue-500/40',
            disabled && 'pointer-events-none opacity-50'
          )}
        >
          {referenceImage ? (
            <>
              <img src={referenceImage} alt="参考图" className="h-full w-full object-cover" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearReferenceImage();
                }}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400 transition-colors group-hover:text-blue-500">
              <div className="rounded-full bg-slate-50 p-3 dark:bg-slate-800">
                <Upload className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">点击上传或拖拽参考图片</span>
            </div>
          )}
        </div>
      </section>

      {/* 规格设置 */}
      <section className="space-y-5">
        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          规格设置
        </label>

        {/* 画面比例 */}
        <div className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            画面比例
          </span>
          <div className="flex gap-2">
            {COGVIDEOX_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setConfig({ ...config, aspectRatio: ratio.id })}
                disabled={disabled}
                className={cn(
                  'flex flex-1 flex-col items-center gap-2.5 rounded-2xl border-2 p-4 transition-all',
                  config.aspectRatio === ratio.id
                    ? 'border-blue-500/60 bg-white/70 shadow-sm backdrop-blur-md dark:bg-blue-500/15'
                    : 'border-white/50 bg-white/40 hover:border-blue-200/60 dark:border-white/10 dark:bg-slate-900/30',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                <RatioIcon active={config.aspectRatio === ratio.id} ratio={ratio.id} />
                <span
                  className={cn(
                    'text-[11px] font-bold',
                    config.aspectRatio === ratio.id
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  )}
                >
                  {ratio.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 时长 & 分辨率 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              时长
            </span>
            <div className="grid grid-cols-2 rounded-xl border border-white/50 bg-white/50 p-1 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
              {COGVIDEOX_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfig({ ...config, duration: d })}
                  disabled={disabled}
                  className={cn(
                    'rounded-lg py-2 text-xs font-bold transition-all',
                    config.duration === d
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              分辨率
            </span>
            <div className="grid grid-cols-2 rounded-xl border border-white/50 bg-white/50 p-1 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
              {COGVIDEOX_RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setConfig({ ...config, resolution: r })}
                  disabled={disabled}
                  className={cn(
                    'rounded-lg py-2 text-xs font-bold transition-all',
                    config.resolution === r
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RatioIcon({ active, ratio }: { active: boolean; ratio: CogVideoXConfig['aspectRatio'] }) {
  const boxClass = cn(
    'rounded-[3px] border-2 transition-colors',
    active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-600'
  );

  if (ratio === '16:9') return <div className={cn('h-4 w-7', boxClass)} />;
  if (ratio === '9:16') return <div className={cn('h-7 w-4', boxClass)} />;
  return <div className={cn('h-5 w-5', boxClass)} />;
}
