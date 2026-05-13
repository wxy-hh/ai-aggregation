import { NextRequest, NextResponse } from 'next/server';
import { generateZhipuToken } from '@/lib/zhipu-auth';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

// API 端点
const VIDEO_GENERATION_URL = 'https://open.bigmodel.cn/api/paas/v4/videos/generations';
const ASYNC_RESULT_URL = 'https://open.bigmodel.cn/api/paas/v4/async-result';

/**
 * CogVideoX 视频生成 API
 *
 * 支持的模型:
 * - cogvideox-flash: 免费快速模型，支持文生视频/图生视频
 * - cogvideox-2: 高质量模型，优化大幅度运动、画面稳定性
 * - cogvideox: 基础模型
 *
 * 支持的参数:
 * - prompt: 视频描述文字 (必填)
 * - model: 模型名称 (默认 cogvideox)
 * - image_url: 参考图片 URL (图生视频时使用)
 * - size: 分辨率 "1920x1080" | "1080x1920" | "1280x720" 等
 * - duration: 视频时长秒数 (5 或 10)
 * - fps: 帧率 (通常 16 或 30)
 */

// 请求体接口
interface VideoGenerationRequest {
    prompt: string;
    model?: string;
    imageUrl?: string;
    size?: string;
    duration?: number;
    fps?: number;
}

export async function POST(req: NextRequest) {
    let deducted = false;
    let userId: string | null = null;

    try {
        userId = await getOptionalUserId(req);

        const body: VideoGenerationRequest = await req.json();
        const {
            prompt,
            imageUrl,
            model = 'cogvideox-flash',
            size,
            duration,
            fps
        } = body;

        if (!prompt?.trim()) {
            return NextResponse.json(
                { error: { message: '请输入视频描述' } },
                { status: 400 }
            );
        }

        if (!ZHIPU_API_KEY) {
            return NextResponse.json(
                { error: { message: 'API Key 未配置' } },
                { status: 500 }
            );
        }

        // 已认证的非 admin 用户预扣 1 token
        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { role: true, tokens: true },
            });
            if (user && user.role !== 'admin') {
                if (user.tokens <= 0) {
                    return NextResponse.json({ error: 'Token 额度不足，请联系管理员充值' }, { status: 429 });
                }
                await deductTokens(userId, 1);
                deducted = true;
            }
        }

        const token = generateZhipuToken({ apiKey: ZHIPU_API_KEY });

        // 构建请求体
        const requestBody: Record<string, any> = {
            model,
            prompt,
        };

        // 可选参数
        if (imageUrl) {
            requestBody.image_url = imageUrl;
        }
        if (size) {
            requestBody.size = size;
        }
        if (duration) {
            requestBody.duration = duration;
        }
        if (fps) {
            requestBody.fps = fps;
        }

        const response = await fetch(VIDEO_GENERATION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Video API] 生成请求失败:', data);
            if (userId && deducted) { deducted = false; await refundTokens(userId, 1); }
            return NextResponse.json(
                { error: { message: data.error?.message || '视频生成请求失败' } },
                { status: response.status }
            );
        }

        // 记录用量（无 Token 数据，按次数统计）
        if (userId) {
            await safeRecordAiUsage({
                userId,
                feature: 'video',
                action: 'image-generate',
                provider: 'zhipu',
                model: model,
                endpoint: '/api/video',
                usage: normalizeUsage(null),
                metadata: {
                    promptLength: prompt.length,
                    imageUrl: imageUrl || null,
                    size: size || null,
                    duration: duration || null,
                    fps: fps || null,
                    taskId: data.id,
                },
            });
        }

        return NextResponse.json({
            id: data.id,
            model: data.model,
            taskStatus: data.task_status,
            requestId: data.request_id,
        });

    } catch (error: any) {
        if (userId && deducted) { deducted = false; await refundTokens(userId, 1); }
        console.error('[Video API] 服务器错误:', error);
        return NextResponse.json(
            { error: { message: error.message || '服务器内部错误' } },
            { status: 500 }
        );
    }
}

/**
 * 查询视频生成任务状态
 * GET /api/video?id={taskId}
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: { message: '缺少任务 ID' } },
                { status: 400 }
            );
        }

        if (!ZHIPU_API_KEY) {
            return NextResponse.json(
                { error: { message: 'API Key 未配置' } },
                { status: 500 }
            );
        }

        const token = generateZhipuToken({ apiKey: ZHIPU_API_KEY });
        const resultUrl = `${ASYNC_RESULT_URL}/${id}`;

        const response = await fetch(resultUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Video API] 查询状态失败:', data);
            return NextResponse.json(
                { error: { message: data.error?.message || '查询失败' } },
                { status: response.status }
            );
        }

        // 返回标准化的响应
        return NextResponse.json({
            id: data.id,
            model: data.model,
            task_status: data.task_status, // PROCESSING | SUCCESS | FAIL
            video_result: data.video_result, // 成功时返回 [{ url, cover_image_url }]
            request_id: data.request_id,
        });

    } catch (error: any) {
        console.error('[Video API] 查询状态错误:', error);
        return NextResponse.json(
            { error: { message: error.message || '服务器内部错误' } },
            { status: 500 }
        );
    }
}
