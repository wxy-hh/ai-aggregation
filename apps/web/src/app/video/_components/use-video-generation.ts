import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api/client';
import { createBillingRequestId } from '@/lib/billing/request-id';
import { stripDataUrlPrefix } from '@/lib/utils/image-url';
import {
  VideoConfig,
  VideoModel,
  createDefaultVideoConfig,
  getProviderByModel,
  isAgnesConfig,
  cogVideoXSize,
  agnesDurationPresetById,
} from '@/lib/constants/video-generation';

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

export interface GenerationResponse {
  id: string;
  videoId?: string;
  provider: 'zhipu' | 'agnes';
  model: string;
  taskStatus: string;
}

export interface StatusResponse {
  id: string;
  model: string;
  task_status: string;
  video_result?: Array<{ url: string; cover_image_url?: string }>;
  videoUrl?: string;
  request_id?: string;
}

// 将配置转换为 API 参数
function configToApiParams(config: VideoConfig, referenceImage: string | null) {
  if (isAgnesConfig(config)) {
    const preset = agnesDurationPresetById(config.durationPreset);
    const body: Record<string, unknown> = {
      model: config.model,
      width: config.width,
      height: config.height,
      num_frames: preset.numFrames,
      frame_rate: preset.frameRate,
      num_inference_steps: config.numInferenceSteps,
    };

    if (config.mode === 'image2video' && config.referenceImages[0]) {
      body.image = stripDataUrlPrefix(config.referenceImages[0]);
    }

    if (
      (config.mode === 'multi-image' || config.mode === 'keyframes') &&
      config.referenceImages.length > 0
    ) {
      const extraBody: Record<string, unknown> = {
        image: config.referenceImages.map(stripDataUrlPrefix),
      };
      if (config.mode === 'keyframes') {
        extraBody.mode = 'keyframes';
      }
      body.extra_body = extraBody;
    }

    if (config.negativePrompt.trim()) {
      body.negative_prompt = config.negativePrompt.trim();
    }

    const seedNum = config.seed.trim() ? parseInt(config.seed.trim(), 10) : NaN;
    if (!Number.isNaN(seedNum)) {
      body.seed = seedNum;
    }

    return body;
  }

  const body: Record<string, unknown> = {
    model: config.model,
    size: cogVideoXSize(config),
    duration: config.duration,
  };

  if (referenceImage) {
    body.imageUrl = referenceImage;
  }

  return body;
}

export function useVideoGeneration() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [loadingStep, setLoadingStep] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [provider, setProvider] = useState<'zhipu' | 'agnes' | null>(null);

  // 视频配置状态
  const [config, setConfig] = useState<VideoConfig>(createDefaultVideoConfig('cogvideox-flash'));

  // CogVideoX 单张参考图
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (messageIntervalRef.current) clearInterval(messageIntervalRef.current);
    };
  }, []);

  const setModel = useCallback((model: VideoModel) => {
    setConfig(createDefaultVideoConfig(model));
    setReferenceImage(null);
  }, []);

  const updateConfig = useCallback((partial: Partial<VideoConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }) as VideoConfig);
  }, []);

  const generateVideo = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('请输入视频描述');
      return;
    }

    setStatus('generating');
    setVideoUrl(null);
    setCoverUrl(null);
    setProgress(0);
    setLoadingStep('正在初始化生成任务...');

    const finishWithSuccess = (url: string, cover?: string | null) => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (messageIntervalRef.current) clearInterval(messageIntervalRef.current);
      setProgress(100);
      setLoadingStep('视频生成完成！');
      setVideoUrl(url);
      setCoverUrl(cover || null);
      setStatus('success');
      toast.success('🎬 视频生成成功！');
    };

    const finishWithError = (message: string) => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (messageIntervalRef.current) clearInterval(messageIntervalRef.current);
      setStatus('error');
      setLoadingStep('');
      toast.error(message);
    };

    try {
      const apiParams = configToApiParams(config, referenceImage);
      const currentProvider = getProviderByModel(config.model);

      const requestBody: Record<string, unknown> = {
        prompt,
        ...apiParams,
      };
      const requestId = createBillingRequestId();
      requestBody.requestId = requestId;

      const initRes = await authFetch('/api/video', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestId },
        body: JSON.stringify(requestBody),
      });

      const initData: GenerationResponse = await initRes.json();

      if (!initRes.ok) {
        throw new Error(
          (initData as unknown as { error?: { message?: string } })?.error?.message ||
            '生成请求失败'
        );
      }

      const newTaskId = initData.id;
      setTaskId(newTaskId);
      setProvider(currentProvider);
      setLoadingStep('AI 正在绘制视频帧...');

      // 模拟进度更新（实际进度由轮询决定）
      let currentProgress = 0;

      const updateProgress = () => {
        currentProgress += Math.random() * 3 + 1;
        if (currentProgress > 92) currentProgress = 92;
        setProgress(currentProgress);
      };
      progressIntervalRef.current = setInterval(updateProgress, 1500);

      const statusMessages = [
        '正在渲染光影细节...',
        '构建时空连续性...',
        '优化物理引擎模拟...',
        '调整镜头运镜...',
        '生成最终视频流...',
        '合成音视频轨道...',
        '应用后期调色...',
      ];
      let messageIndex = 0;

      const updateMessage = () => {
        setLoadingStep(statusMessages[messageIndex % statusMessages.length]);
        messageIndex++;
      };
      messageIntervalRef.current = setInterval(updateMessage, 4000);

      const pollStatus = async (): Promise<void> => {
        try {
          const queryParams = new URLSearchParams({ id: newTaskId, provider: currentProvider });
          if (initData.videoId && currentProvider === 'agnes') {
            queryParams.set('videoId', initData.videoId);
          }

          const statusRes = await authFetch(`/api/video?${queryParams.toString()}`);
          const statusData: StatusResponse = await statusRes.json();

          const pollDelay = currentProvider === 'agnes' ? 5000 : 3000;

          if (statusData.task_status === 'SUCCESS') {
            const url =
              currentProvider === 'zhipu'
                ? statusData.video_result?.[0]?.url
                : statusData.videoUrl || statusData.video_result?.[0]?.url;
            const cover =
              currentProvider === 'zhipu' ? statusData.video_result?.[0]?.cover_image_url : null;
            if (url) {
              finishWithSuccess(url, cover);
            } else {
              finishWithError('未找到视频结果');
            }
          } else if (statusData.task_status === 'FAIL') {
            finishWithError('视频生成任务失败');
          } else {
            setTimeout(pollStatus, pollDelay);
          }
        } catch (err: any) {
          finishWithError(err.message || '查询状态失败');
        }
      };

      setTimeout(pollStatus, currentProvider === 'agnes' ? 5000 : 3000);
    } catch (error: any) {
      finishWithError(error.message || '生成出错');
    }
  }, [prompt, config, referenceImage]);

  const reset = useCallback(() => {
    setStatus('idle');
    setVideoUrl(null);
    setCoverUrl(null);
    setProgress(0);
    setLoadingStep('');
    setTaskId(null);
    setProvider(null);
  }, []);

  const setReferenceImages = useCallback(
    (images: string[]) => {
      updateConfig({ referenceImages: images } as Partial<VideoConfig>);
    },
    [updateConfig]
  );

  return useMemo(
    () => ({
      prompt,
      setPrompt,
      status,
      loadingStep,
      videoUrl,
      coverUrl,
      progress,
      taskId,
      provider,
      config,
      setConfig,
      setModel,
      updateConfig,
      referenceImage,
      setReferenceImage,
      referenceImages: isAgnesConfig(config) ? config.referenceImages : [],
      setReferenceImages,
      generateVideo,
      reset,
    }),
    [
      prompt,
      status,
      loadingStep,
      videoUrl,
      coverUrl,
      progress,
      taskId,
      provider,
      config,
      setModel,
      updateConfig,
      setReferenceImages,
      referenceImage,
      generateVideo,
      reset,
    ]
  );
}
