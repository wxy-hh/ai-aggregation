import { NextRequest, NextResponse } from 'next/server';

// 文件上传响应类型
interface UploadResponse {
  success: boolean;
  file?: {
    id: string;
    name: string;
    size: number;
    type: string;
    mimeType: string;
    fileId: string; // 豆包文件ID
  };
  error?: string;
}

// 支持的文件类型配置
const SUPPORTED_FILE_TYPES = {
  // 图片类型
  'image/png': { category: 'image', maxSize: 5 * 1024 * 1024 }, // 5MB
  'image/jpeg': { category: 'image', maxSize: 5 * 1024 * 1024 },
  'image/jpg': { category: 'image', maxSize: 5 * 1024 * 1024 },
  'image/gif': { category: 'image', maxSize: 5 * 1024 * 1024 },
  'image/webp': { category: 'image', maxSize: 5 * 1024 * 1024 },

  // 文档类型
  'application/pdf': { category: 'document', maxSize: 5 * 1024 * 1024 },
  'application/msword': { category: 'document', maxSize: 5 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    category: 'document',
    maxSize: 5 * 1024 * 1024,
  },
  'application/vnd.ms-excel': { category: 'document', maxSize: 5 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    category: 'document',
    maxSize: 5 * 1024 * 1024,
  },
  'application/vnd.ms-powerpoint': { category: 'document', maxSize: 5 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    category: 'document',
    maxSize: 5 * 1024 * 1024,
  },

  // 代码和文本类型
  'text/plain': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/javascript': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'application/javascript': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/typescript': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'application/typescript': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'application/json': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/html': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/css': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/xml': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'application/xml': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/markdown': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'text/x-python': { category: 'code', maxSize: 5 * 1024 * 1024 },
  'application/x-python-code': { category: 'code', maxSize: 5 * 1024 * 1024 },
};

export async function POST(req: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    // 获取豆包API配置
    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

    if (!arkApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少豆包API密钥配置',
        },
        { status: 500 }
      );
    }

    // 解析FormData
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: '未找到上传的文件',
        },
        { status: 400 }
      );
    }

    // 验证文件类型
    const fileConfig = SUPPORTED_FILE_TYPES[file.type as keyof typeof SUPPORTED_FILE_TYPES];
    if (!fileConfig) {
      return NextResponse.json(
        {
          success: false,
          error: `不支持的文件类型: ${file.type}`,
        },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > fileConfig.maxSize) {
      const maxSizeMB = Math.round(fileConfig.maxSize / (1024 * 1024));
      return NextResponse.json(
        {
          success: false,
          error: `文件大小超过限制，最大支持 ${maxSizeMB}MB`,
        },
        { status: 400 }
      );
    }

    console.log('📁 开始上传文件到豆包:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      category: fileConfig.category,
    });

    // 创建上传到豆包的FormData
    const doubaoFormData = new FormData();
    doubaoFormData.append('purpose', 'user_data');
    doubaoFormData.append('file', file);

    // 调用豆包文件上传API
    const response = await fetch(`${arkBaseUrl}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
      },
      body: doubaoFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 豆包文件上传失败:', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });

      return NextResponse.json(
        {
          success: false,
          error: `文件上传失败: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ 豆包文件上传成功:', result);

    // 豆包返回的数据格式: { object: "list", data: [{ id, object, bytes, created_at, filename, purpose }] }
    if (!result.data || !result.data[0] || !result.data[0].id) {
      return NextResponse.json(
        {
          success: false,
          error: '豆包API返回格式异常',
        },
        { status: 500 }
      );
    }

    const uploadedFile = result.data[0];

    // 生成本地文件ID
    const localFileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return NextResponse.json({
      success: true,
      file: {
        id: localFileId,
        name: file.name,
        size: file.size,
        type: fileConfig.category,
        mimeType: file.type,
        fileId: uploadedFile.id, // 豆包文件ID
      },
    });
  } catch (error) {
    console.error('❌ 文件上传处理错误:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '文件上传失败',
      },
      { status: 500 }
    );
  }
}

// 支持的HTTP方法
export const runtime = 'nodejs';
