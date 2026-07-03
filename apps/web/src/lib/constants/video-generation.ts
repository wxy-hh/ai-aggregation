import { Zap, Sparkles } from 'lucide-react';

export type VideoModel = 'cogvideox-flash' | 'agnes-video-v2.0';

export interface CogVideoXConfig {
  model: 'cogvideox-flash';
  aspectRatio: '16:9' | '9:16' | '1:1';
  duration: 5 | 10;
  resolution: '720p' | '1080p';
}

export type AgnesMode = 'text2video' | 'image2video' | 'multi-image' | 'keyframes';

export interface AgnesConfig {
  model: 'agnes-video-v2.0';
  mode: AgnesMode;
  width: number;
  height: number;
  numFrames: number;
  frameRate: number;
  durationPreset: '3s' | '5s' | '10s' | '18s';
  negativePrompt: string;
  seed: string;
  numInferenceSteps: number;
  referenceImages: string[];
}

export type VideoConfig = CogVideoXConfig | AgnesConfig;

export interface VideoModelMeta {
  id: VideoModel;
  name: string;
  label: string;
  icon: 'Zap' | 'Sparkles';
  description: string;
  credits: number;
  provider: 'zhipu' | 'agnes';
}

export const VIDEO_MODELS: VideoModelMeta[] = [
  {
    id: 'cogvideox-flash',
    name: 'CogVideoX-Flash',
    label: 'CogVideoX',
    icon: 'Zap',
    description: '免费快速',
    credits: 0,
    provider: 'zhipu',
  },
  {
    id: 'agnes-video-v2.0',
    name: 'Agnes Video V2.0',
    label: 'Agnes V2',
    icon: 'Sparkles',
    description: '高质量多模态',
    credits: 2,
    provider: 'agnes',
  },
];

export const AGNES_DURATION_PRESETS: {
  id: AgnesConfig['durationPreset'];
  label: string;
  numFrames: number;
  frameRate: number;
  seconds: number;
}[] = [
  { id: '3s', label: '3秒', numFrames: 81, frameRate: 24, seconds: 3 },
  { id: '5s', label: '5秒', numFrames: 121, frameRate: 24, seconds: 5 },
  { id: '10s', label: '10秒', numFrames: 241, frameRate: 24, seconds: 10 },
  { id: '18s', label: '18秒', numFrames: 441, frameRate: 24, seconds: 18 },
];

export const AGNES_SIZE_PRESETS: {
  id: string;
  label: string;
  width: number;
  height: number;
}[] = [
  { id: '16:9', label: '16:9', width: 1152, height: 648 },
  { id: '9:16', label: '9:16', width: 648, height: 1152 },
  { id: '1:1', label: '1:1', width: 768, height: 768 },
  { id: '4:3', label: '4:3', width: 1024, height: 768 },
  { id: '3:4', label: '3:4', width: 768, height: 1024 },
];

export const AGNES_MODES: { id: AgnesMode; label: string }[] = [
  { id: 'text2video', label: '文生视频' },
  { id: 'image2video', label: '图生视频' },
  { id: 'multi-image', label: '多图视频' },
  { id: 'keyframes', label: '关键帧' },
];

export const COGVIDEOX_RATIOS: {
  id: CogVideoXConfig['aspectRatio'];
  label: string;
}[] = [
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
];

export const COGVIDEOX_DURATIONS: CogVideoXConfig['duration'][] = [5, 10];
export const COGVIDEOX_RESOLUTIONS: CogVideoXConfig['resolution'][] = ['720p', '1080p'];

export function getVideoModelMeta(model: VideoModel): VideoModelMeta {
  return VIDEO_MODELS.find((m) => m.id === model) || VIDEO_MODELS[0];
}

export function getProviderByModel(model: VideoModel): 'zhipu' | 'agnes' {
  return getVideoModelMeta(model).provider;
}

export function createDefaultCogVideoXConfig(): CogVideoXConfig {
  return {
    model: 'cogvideox-flash',
    aspectRatio: '16:9',
    duration: 5,
    resolution: '1080p',
  };
}

export function createDefaultAgnesConfig(): AgnesConfig {
  return {
    model: 'agnes-video-v2.0',
    mode: 'text2video',
    width: 1152,
    height: 648,
    numFrames: 121,
    frameRate: 24,
    durationPreset: '5s',
    negativePrompt: '',
    seed: '',
    numInferenceSteps: 25,
    referenceImages: [],
  };
}

export function createDefaultVideoConfig(model: VideoModel): VideoConfig {
  return model === 'agnes-video-v2.0' ? createDefaultAgnesConfig() : createDefaultCogVideoXConfig();
}

export function cogVideoXSize(config: CogVideoXConfig): string {
  const sizeMap: Record<string, Record<string, string>> = {
    '16:9': { '720p': '1280x720', '1080p': '1920x1080' },
    '9:16': { '720p': '720x1280', '1080p': '1080x1920' },
    '1:1': { '720p': '720x720', '1080p': '1080x1080' },
  };
  return sizeMap[config.aspectRatio]?.[config.resolution] || '1920x1080';
}

export function agnesDurationPresetById(id: AgnesConfig['durationPreset']) {
  return AGNES_DURATION_PRESETS.find((p) => p.id === id) || AGNES_DURATION_PRESETS[1];
}

export function agnesSizePresetById(id: string) {
  return AGNES_SIZE_PRESETS.find((p) => p.id === id) || AGNES_SIZE_PRESETS[0];
}

export function isAgnesConfig(config: VideoConfig): config is AgnesConfig {
  return config.model === 'agnes-video-v2.0';
}

export function isCogVideoXConfig(config: VideoConfig): config is CogVideoXConfig {
  return config.model === 'cogvideox-flash';
}

export const videoModelIcons = {
  Zap,
  Sparkles,
};
