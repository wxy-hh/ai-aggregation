import { NextRequest, NextResponse } from 'next/server';

/**
 * 文件上传 API
 * 接收文件，调用豆包 /api/v3/files 接口上传
 * 返回 { success: boolean, fileId?: string, filename?: string, error?: string }
 * 
 * 注意：豆包文件上传只支持 PDF 格式
 */

// 文件上传常量
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_POLLING_TIME = 15000;        // 15s
const POLLING_INTERVAL = 500;          // 500ms

export async function POST(request: NextRequest) {
  try {
    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

    if (!arkApiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing ARK_API_KEY' },
        { status: 500 }
      );
    }

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // 验证文件类型 - 豆包只支持 PDF
    const allowedTypes = ['application/pdf'];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `不支持的文件类型: ${file.type}。目前只支持 PDF 文档。` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `文件大小超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制` },
        { status: 400 }
      );
    }

    // 构造 FormData 上传到豆包
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'user_data');
    uploadFormData.append('file', file);

    console.log('Uploading file to Doubao:', {
      filename: file.name,
      type: file.type,
      size: file.size,
    });

    // 调用豆包文件上传 API
    const response = await fetch(`${arkBaseUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${arkApiKey}`,
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
        const errorMessage = errorJson?.error?.message || errorJson?.message || `上传失败: ${response.status}`;
        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        );
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
      return NextResponse.json(
        { success: false, error: '无法获取文件 ID' },
        { status: 500 }
      );
    }

    // 轮询等待文件处理完成（状态从 processing 变为 active）
    // 大多数文件在 2-5 秒内处理完成，少数大文件需要更长时间
    const startTime = Date.now();
    
    let fileStatus = result.status || 'processing';
    let pollCount = 0;
    
    console.log(`[Files API] 开始轮询文件 ${fileId} 状态，初始状态: ${fileStatus}`);
    
    while (fileStatus === 'processing' && Date.now() - startTime < MAX_POLLING_TIME) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      pollCount++;
      
      // 查询文件状态
      const statusResponse = await fetch(`${arkBaseUrl}/files/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${arkApiKey}`,
        },
      });

      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        fileStatus = statusResult.status;

        if (pollCount % 3 === 0 || fileStatus !== 'processing') {
          console.log(`[Files API] 轮询 #${pollCount}, 文件 ${fileId} 状态: ${fileStatus}, 已耗时: ${Date.now() - startTime}ms`);
        }

        // 豆包文档：status 为 active 时表示文件处理完成可用
        if (fileStatus === 'active') {
          console.log(`[Files API] 文件 ${fileId} 处理完成(状态: active)，总耗时: ${Date.now() - startTime}ms`);
          break; // 文件已就绪
        }
      } else {
        // 查询失败，继续等待
        console.warn(`[Files API] 查询文件 ${fileId} 状态失败: ${statusResponse.status}`);
      }
    }
    
    // 如果超时了文件还在处理中，返回错误
    if (fileStatus !== 'active') {
      console.warn(`[Files API] 文件 ${fileId} 处理超时，已等待 ${Date.now() - startTime}ms，最终状态: ${fileStatus}`);
      return NextResponse.json(
        { success: false, error: '文件处理超时，请稍后重试' },
        { status: 408 }
      );
    }

    return NextResponse.json({
      success: true,
      fileId: fileId,
      filename: filename || file.name,
      bytes: bytes,
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// DELETE: 删除远程文件
export async function DELETE(request: NextRequest) {
  try {
    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

    if (!arkApiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing ARK_API_KEY' },
        { status: 500 }
      );
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
        'Authorization': `Bearer ${arkApiKey}`,
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
    console.error('[Files API] 删除文件出错:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
