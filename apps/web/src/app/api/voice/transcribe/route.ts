import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/siliconflow';
import { saveUploadedFile, deleteFile, validateFile } from '@/lib/file-upload';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { reserveAiQuota, releaseAiQuota, settleAiQuota } from '@/lib/billing/quota-service';
import { createAudioMeasurement } from '@/lib/billing/usage-measurement';
import { getAudioDurationSeconds } from '@/lib/billing/audio-duration';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { safeRecordAiUsage } from '@/lib/ai-usage';

export const runtime = 'nodejs';
export const maxDuration = 60; // 最大 60 秒

// 检查数据库是否可用
const isDatabaseAvailable = !!process.env.DATABASE_URL;

export async function POST(req: NextRequest) {
  return withAuth(req, async (user) => {
    const userId = user.id;
    let tempFilePath: string | null = null;
    let reservation: { id: string } | null = null;
    let billingSettled = false;

    try {
      console.log('=== 开始处理转录请求 ===');

      // 1. 解析表单数据
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch (parseError) {
        console.error('✗ 请求体解析失败:', parseError);
        return NextResponse.json(
          { error: '请求体必须是 multipart/form-data 格式' },
          { status: 400 }
        );
      }
      console.log('✓ FormData 解析成功');

      const file = formData.get('file') as File;
      const model = (formData.get('model') as string) || 'FunAudioLLM/SenseVoiceSmall';

      if (!file) {
        console.error('✗ 缺少文件');
        return NextResponse.json({ error: '缺少文件' }, { status: 400 });
      }

      console.log('✓ 文件信息:', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      // 2. 验证文件
      const validation = validateFile(file);
      if (!validation.valid) {
        console.error('✗ 文件验证失败:', validation.error);
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      console.log('✓ 文件验证通过');

      // 先落盘并读取媒体元数据，禁止使用客户端上报时长或文件体积估算计费。
      console.log('→ 开始保存文件到临时目录...');
      tempFilePath = await saveUploadedFile(file);
      console.log('✓ 文件已保存:', tempFilePath);
      const actualDuration = await getAudioDurationSeconds(tempFilePath);
      const requestId = getBillingRequestId(req);

      if (user.role !== 'admin') {
        const quota = await reserveAiQuota({
          userId,
          requestId,
          feature: 'voice',
          provider: 'siliconflow',
          model,
          estimatedUnits: actualDuration,
          meterType: 'audio_seconds',
          metadata: { fileName: file.name, fileSize: file.size, actualDuration },
        });
        reservation = quota;
      }

      let transcriptionId = 'temp-id';

      // 5. 创建数据库记录（如果数据库可用）
      if (isDatabaseAvailable) {
        console.log('→ 尝试创建数据库记录...');
        try {
          const { prisma } = await import('@repo/db');

          const transcription = await prisma.voiceTranscription.create({
            data: {
              userId,
              fileName: file.name,
              fileSize: file.size,
              duration: actualDuration,
              format: file.type.split('/')[1] || file.name.split('.').pop() || 'unknown',
              model,
              status: 'processing',
            },
          });
          transcriptionId = transcription.id;
          console.log('✓ 数据库记录已创建:', transcriptionId);
        } catch (dbError) {
          console.warn(
            '⚠ 数据库不可用，继续处理:',
            dbError instanceof Error ? dbError.message : dbError
          );
        }
      } else {
        console.log('⚠ 数据库未配置，跳过数据库操作');
      }

      try {
        // 5. 调用 SiliconFlow API
        console.log('→ 开始调用 SiliconFlow API...');
        console.log('  模型:', model);
        console.log('  文件路径:', tempFilePath);

        const result = await transcribeAudio(tempFilePath, model);
        console.log('✓ SiliconFlow API 调用成功');
        console.log('  转录文本长度:', result.text?.length || 0);

        if (reservation) {
          await settleAiQuota({
            reservationId: reservation.id,
            requestId,
            feature: 'voice',
            action: 'voice-transcribe',
            provider: 'siliconflow',
            model,
            endpoint: '/api/voice/transcribe',
            measurement: createAudioMeasurement(actualDuration),
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              actualDuration,
              transcriptionLength: result.text?.length ?? 0,
            },
          });
          billingSettled = true;
        } else {
          // 管理员免扣额度，但仍保留真实媒体计量记录，供审计和运营统计使用。
          await safeRecordAiUsage({
            userId,
            feature: 'voice',
            action: 'voice-transcribe',
            provider: 'siliconflow',
            model,
            endpoint: '/api/voice/transcribe',
            requestId,
            meterType: 'audio_seconds',
            billableUnits: actualDuration,
            billingStatus: 'settled',
            usage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
              cachedTokens: null,
              reasoningTokens: null,
              taskCount: 1,
            },
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              actualDuration,
              transcriptionLength: result.text?.length ?? 0,
            },
          });
        }

        // 6. 更新数据库记录（如果数据库可用）
        if (isDatabaseAvailable && transcriptionId !== 'temp-id') {
          console.log('→ 更新数据库记录...');
          try {
            const { prisma } = await import('@repo/db');
            await prisma.voiceTranscription.update({
              where: { id: transcriptionId },
              data: {
                status: 'completed',
                transcription: result.text,
                completedAt: new Date(),
              },
            });
            console.log('✓ 数据库记录已更新');
          } catch (dbError) {
            console.warn('⚠ 更新数据库失败:', dbError instanceof Error ? dbError.message : dbError);
          }
        }

        // 7. 删除临时文件
        console.log('→ 删除临时文件...');
        await deleteFile(tempFilePath);
        tempFilePath = null;
        console.log('✓ 临时文件已删除');

        console.log('=== 转录请求处理成功 ===');
        return NextResponse.json({
          id: transcriptionId,
          status: 'completed',
          transcription: result.text,
          message: '转录成功',
        });
      } catch (apiError) {
        console.error('=== SiliconFlow API 调用失败 ===');
        console.error('错误类型:', apiError?.constructor?.name);
        console.error('错误信息:', apiError instanceof Error ? apiError.message : apiError);
        console.error('错误堆栈:', apiError instanceof Error ? apiError.stack : '');

        // API 调用失败，更新数据库记录（如果数据库可用）
        if (isDatabaseAvailable && transcriptionId !== 'temp-id') {
          try {
            const { prisma } = await import('@repo/db');
            await prisma.voiceTranscription.update({
              where: { id: transcriptionId },
              data: {
                status: 'failed',
                error: apiError instanceof Error ? apiError.message : '转录失败',
              },
            });
          } catch (dbError) {
            console.warn('⚠ 更新数据库失败:', dbError instanceof Error ? dbError.message : dbError);
          }
        }

        // 删除临时文件
        if (tempFilePath) {
          await deleteFile(tempFilePath);
        }

        throw apiError;
      }
    } catch (error) {
      if (reservation && !billingSettled) {
        await releaseAiQuota({
          reservationId: reservation.id,
          reason: '语音转写请求失败',
          meterType: 'audio_seconds',
        }).catch((releaseError) => console.error('[voice/transcribe] 释放额度失败:', releaseError));
      }
      console.error('=== 转录请求处理失败 ===');
      console.error('错误类型:', error?.constructor?.name);
      console.error('错误信息:', error instanceof Error ? error.message : error);
      console.error('错误堆栈:', error instanceof Error ? error.stack : '');

      // 确保清理临时文件
      if (tempFilePath) {
        await deleteFile(tempFilePath);
      }

      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      if (error instanceof BillingError) {
        return billingErrorResponse(error, 402);
      }

      return NextResponse.json(
        {
          error: '转录失败',
          details: error instanceof Error ? error.message : '未知错误',
        },
        { status: 500 }
      );
    }
  });
}
