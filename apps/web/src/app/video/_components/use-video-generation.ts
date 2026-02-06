import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

// 视频生成配置接口
export interface VideoConfig {
    model: 'cogvideox-flash' | 'cogvideox' | 'cogvideox-2';
    aspectRatio: '16:9' | '9:16' | '1:1';
    duration: 5 | 10;
    resolution: '720p' | '1080p';
}

// 将配置转换为 API 参数
function configToApiParams(config: VideoConfig) {
    // 根据画面比例和分辨率计算 size
    const sizeMap: Record<string, Record<string, string>> = {
        '16:9': { '720p': '1280x720', '1080p': '1920x1080' },
        '9:16': { '720p': '720x1280', '1080p': '1080x1920' },
        '1:1': { '720p': '720x720', '1080p': '1080x1080' },
    };

    return {
        model: config.model,
        size: sizeMap[config.aspectRatio]?.[config.resolution] || '1920x1080',
        duration: config.duration,
    };
}

export function useVideoGeneration() {
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState<GenerationStatus>('idle');
    const [loadingStep, setLoadingStep] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [taskId, setTaskId] = useState<string | null>(null);

    // 视频配置状态
    const [config, setConfig] = useState<VideoConfig>({
        model: 'cogvideox-flash',
        aspectRatio: '16:9',
        duration: 5,
        resolution: '1080p',
    });

    // 参考图（图生视频）
    const [referenceImage, setReferenceImage] = useState<string | null>(null);

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

        try {
            // 转换配置为 API 参数
            const apiParams = configToApiParams(config);

            const requestBody: Record<string, any> = {
                prompt,
                ...apiParams,
            };

            // 如果有参考图，添加到请求中
            if (referenceImage) {
                requestBody.imageUrl = referenceImage;
            }

            console.log('[VideoGen] 发起生成请求:', requestBody);

            const initRes = await fetch('/api/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const initData = await initRes.json();

            if (!initRes.ok) {
                throw new Error(initData.error?.message || '生成请求失败');
            }

            const newTaskId = initData.id;
            setTaskId(newTaskId);
            setLoadingStep('AI 正在绘制视频帧...');

            console.log('[VideoGen] 任务创建成功:', newTaskId);

            // 模拟进度更新（实际进度由轮询决定）
            let progressInterval: NodeJS.Timeout;
            let currentProgress = 0;

            const updateProgress = () => {
                currentProgress += Math.random() * 3 + 1;
                if (currentProgress > 92) currentProgress = 92; // 保留空间给最终完成
                setProgress(currentProgress);
            };
            progressInterval = setInterval(updateProgress, 1500);

            // 状态消息轮换
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
            const messageInterval = setInterval(updateMessage, 4000);

            // 轮询检查任务状态
            const pollStatus = async (): Promise<void> => {
                try {
                    const statusRes = await fetch(`/api/video?id=${newTaskId}`);
                    const statusData = await statusRes.json();

                    console.log('[VideoGen] 任务状态:', statusData.task_status);

                    if (statusData.task_status === 'SUCCESS') {
                        clearInterval(progressInterval);
                        clearInterval(messageInterval);

                        const resultVideo = statusData.video_result?.[0];
                        if (resultVideo?.url) {
                            setProgress(100);
                            setLoadingStep('视频生成完成！');
                            setVideoUrl(resultVideo.url);
                            setCoverUrl(resultVideo.cover_image_url || null);
                            setStatus('success');
                            toast.success('🎬 视频生成成功！');
                        } else {
                            throw new Error('未找到视频结果');
                        }
                    } else if (statusData.task_status === 'FAIL') {
                        clearInterval(progressInterval);
                        clearInterval(messageInterval);
                        throw new Error('视频生成任务失败');
                    } else {
                        // PROCESSING - 继续轮询
                        setTimeout(pollStatus, 3000);
                    }
                } catch (err: any) {
                    clearInterval(progressInterval);
                    clearInterval(messageInterval);
                    setStatus('error');
                    setLoadingStep('');
                    toast.error(err.message || '查询状态失败');
                }
            };

            // 首次查询延迟 3 秒
            setTimeout(pollStatus, 3000);

        } catch (error: any) {
            setStatus('error');
            setLoadingStep('');
            toast.error(error.message || '生成出错');
        }
    }, [prompt, config, referenceImage]);

    // 重置状态
    const reset = useCallback(() => {
        setStatus('idle');
        setVideoUrl(null);
        setCoverUrl(null);
        setProgress(0);
        setLoadingStep('');
        setTaskId(null);
    }, []);

    return {
        // 基础状态
        prompt,
        setPrompt,
        status,
        loadingStep,
        videoUrl,
        coverUrl,
        progress,
        taskId,

        // 配置
        config,
        setConfig,
        referenceImage,
        setReferenceImage,

        // 操作
        generateVideo,
        reset,
    };
}
