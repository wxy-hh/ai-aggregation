import { NextRequest, NextResponse } from 'next/server';
import {
  validateFile,
  validateFileNameSafe,
  generateSafeFileName,
  getSizeLimitForCategory,
  getFileCategory,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
} from '@repo/shared';
import { getRateLimiter, getQuotaManager } from '@repo/shared';

/**
 * 文件上传 API
 * 接收文件，调用豆包 /api/v3/files 接口上传
 * 返回 { success: boolean, fileId?: string, filename?: string, error?: string }
 *
 * 注意：豆包文件上传只支持 PDF 格式
 */

// 文件上传常量
const MAX_POLLING_TIME = 15000; // 15s
const POLLING_INTERVAL = 500; // 500ms

function createErrorId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

// 获取用户 ID (临时实现，实际应从 session 获取)
async function getUserId(req: NextRequest): Promise<string> {
  // TODO: 从 session 或 JWT token 中获取真实用户 ID
  // 临时使用 IP 地址作为标识
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const remoteAddr = req.headers.get('x-remote-addr') || 'unknown';

  return forwardedFor || realIp || remoteAddr;
}

export async function POST(request: NextRequest) {
  const errorId = createErrorId();
  const startTime = Date.now();
  let userId: string = 'unknown';

  try {
    // 1. 限流和配额检查
    userId = await getUserId(request);
    const rateLimiter = getRateLimiter();
    const quotaManager = getQuotaManager();

    // 检查 API 限流
    const rateLimitResult = await rateLimiter.check(userId);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: '请求过于频繁，请稍后再试',
          errorId,
          retryAfter: 60,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
            'Retry-After': '60',
            'X-Error-ID': errorId,
          },
        }
      );
    }

    // 检查文件上传配额
    const quotaResult = await quotaManager.checkQuota(userId, 'files');
    if (!quotaResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: '今日文件上传次数已达上限',
          errorId,
          remaining: quotaResult.remaining,
          quota: quotaResult.quota,
        },
        {
          status: 429,
          headers: {
            'X-Quota-Remaining': String(quotaResult.remaining),
            'X-Quota-Limit': String(quotaResult.quota),
            'X-Error-ID': errorId,
          },
        }
      );
    }

    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

    if (!arkApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing ARK_API_KEY',
          errorId,
        },
        { status: 500 }
      );
    }

    // 2. 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: '请选择要上传的文件',
          errorId,
        },
        { status: 400 }
      );
    }

    // 3. 文件验证 - 豆包只支持 PDF
    const allowedTypes = ['application/pdf'];

    // 使用文件验证工具
    const validationResult = validateFile(file, {
      allowedMimeTypes: allowedTypes,
      maxSize: FILE_SIZE_LIMITS.DOCUMENT, // 50MB
      validateFileName: true,
      generateSafeName: true,
    });

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error || '文件验证失败',
          errorId,
        },
        { status: 400 }
      );
    }

    // 生成安全文件名
    const safeFileName = generateSafeFileName(file.name);

    console.log('文件验证通过:', {
      originalName: file.name,
      safeName: safeFileName,
      type: file.type,
      size: file.size,
      category: validationResult.category,
      errorId,
    });

    // 构造 FormData 上传到豆包
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'user_data');
    uploadFormData.append('file', file);

    console.log('上传文件到豆包:', {
      filename: file.name,
      safeFilename: safeFileName,
      type: file.type,
      size: file.size,
      userId,
      errorId,
    });

    // 调用豆包文件上传 API
    const response = await fetch(`${arkBaseUrl}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
      },
      body: uploadFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Doubao file upload error:', {
        status: response.status,
        error: errorText,
      });

      // 尝试解析错误信息
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage =
          errorJson?.error?.message || errorJson?.message || `上传失败: ${response.status}`;
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
      } catch {
        return NextResponse.json(
          { success: false, error: `上传失败: ${response.status}` },
          { status: response.status }
        );
      }
    }

    const result = await response.json();
    console.log('Doubao file upload response:', result);

    // 豆包 API 响应格式：
    // 方式1: { object: 'file', id: 'file-xxx', filename: 'xxx', ... }
    // 方式2: { data: [{ id: 'file-xxx', ... }] }
    let fileId: string | undefined;
    let filename: string | undefined;
    let bytes: number | undefined;

    if (result.id) {
      // 直接返回对象格式
      fileId = result.id;
      filename = result.filename;
      bytes = result.bytes;
    } else if (result.data?.[0]?.id) {
      // data 数组格式
      fileId = result.data[0].id;
      filename = result.data[0].filename;
      bytes = result.data[0].bytes;
    }

    if (!fileId) {
      return NextResponse.json({ success: false, error: '无法获取文件 ID' }, { status: 500 });
    }

    // 轮询等待文件处理完成（状态从 processing 变为 active）
    // 大多数文件在 2-5 秒内处理完成，少数大文件需要更长时间
    const pollStartTime = Date.now();

    let fileStatus = result.status || 'processing';
    let pollCount = 0;

    console.log(`[Files API] 开始轮询文件 ${fileId} 状态，初始状态: ${fileStatus}`);

    while (fileStatus === 'processing' && Date.now() - pollStartTime < MAX_POLLING_TIME) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      pollCount++;

      // 查询文件状态
      const statusResponse = await fetch(`${arkBaseUrl}/files/${fileId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
        },
      });

      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        fileStatus = statusResult.status;

        if (pollCount % 3 === 0 || fileStatus !== 'processing') {
          console.log(
            `[Files API] 轮询 #${pollCount}, 文件 ${fileId} 状态: ${fileStatus}, 已耗时: ${Date.now() - pollStartTime}ms`
          );
        }

        // 豆包文档：status 为 active 时表示文件处理完成可用
        if (fileStatus === 'active') {
          console.log(
            `[Files API] 文件 ${fileId} 处理完成(状态: active)，总耗时: ${Date.now() - pollStartTime}ms`
          );
          break; // 文件已就绪
        }
      } else {
        // 查询失败，继续等待
        console.warn(`[Files API] 查询文件 ${fileId} 状态失败: ${statusResponse.status}`);
      }
    }

    // 如果超时了文件还在处理中，返回错误
    if (fileStatus !== 'active') {
      const pollTotalTime = Date.now() - pollStartTime;
      const totalTime = Date.now() - startTime;

      console.warn(
        `[Files API] 文件 ${fileId} 处理超时，已等待 ${pollTotalTime}ms，最终状态: ${fileStatus}`,
        { errorId, userId, totalTime: `${totalTime}ms` }
      );
      return NextResponse.json(
        {
          success: false,
          error: '文件处理超时，请稍后重试',
          errorId,
          totalTime: `${totalTime}ms`,
        },
        { status: 408 }
      );
    }

    // 文件上传成功，更新配额
    const totalTime = Date.now() - startTime;

    console.log('文件上传成功:', {
      fileId,
      filename: filename || file.name,
      safeFilename: safeFileName,
      bytes,
      userId,
      totalTime: `${totalTime}ms`,
      errorId,
      timestamp: new Date().toISOString(),
    });

    // 异步更新配额使用量
    quotaManager.incrementQuota(userId, 'files', 1).catch((err) => {
      console.error('更新文件上传配额失败:', err);
    });

    return NextResponse.json({
      success: true,
      fileId: fileId,
      filename: filename || file.name,
      safeFilename: safeFileName,
      bytes: bytes,
      errorId,
    });
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.error('文件上传错误:', {
      errorId,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      timestamp: new Date().toISOString(),
    });

    // 根据错误类型返回不同的状态码
    if (error instanceof Error) {
      // 网络错误
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return NextResponse.json(
          {
            success: false,
            error: '网络连接失败，请检查网络后重试',
            errorId,
            timestamp: new Date().toISOString(),
          },
          {
            status: 503,
            headers: {
              'X-Error-ID': errorId,
            },
          }
        );
      }

      // 超时错误
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        return NextResponse.json(
          {
            success: false,
            error: '请求超时，请稍后重试',
            errorId,
            timestamp: new Date().toISOString(),
          },
          {
            status: 504,
            headers: {
              'X-Error-ID': errorId,
            },
          }
        );
      }
    }

    // 未知错误
    return NextResponse.json(
      {
        success: false,
        error: '文件上传失败，请稍后重试',
        errorId,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'X-Error-ID': errorId,
        },
      }
    );
  }
}

// DELETE: 删除远程文件
export async function DELETE(request: NextRequest) {
  try {
    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

    if (!arkApiKey) {
      return NextResponse.json({ success: false, error: 'Missing ARK_API_KEY' }, { status: 500 });
    }

    // 从查询参数获取 fileId
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'Missing fileId parameter' },
        { status: 400 }
      );
    }

    console.log('[Files API] 删除远程文件:', fileId);

    // 调用豆包 API 删除文件
    const response = await fetch(`${arkBaseUrl}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Files API] 删除远程文件失败:', {
        status: response.status,
        error: errorText,
      });
      return NextResponse.json(
        { success: false, error: `删除失败: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('[Files API] 远程文件删除成功:', result);

    return NextResponse.json({
      success: true,
      deleted: result.deleted || true,
      fileId: result.id || fileId,
    });
  } catch (error) {
    const errorId = createErrorId();

    console.error('[Files API] 删除文件出错:', {
      errorId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: '文件删除失败，请稍后重试',
        errorId,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'X-Error-ID': errorId,
        },
      }
    );
  }
}
