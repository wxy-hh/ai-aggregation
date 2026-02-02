import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

const API_KEY = process.env.SILICONFLOW_API_KEY!;
const API_URL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';

export interface TranscribeResult {
  text: string;
}

export interface TranscribeWithTranslationResult {
  text: string;
  translation?: string;
}

// 创建 multipart/form-data
function createFormData(filePath: string, model: string) {
  const boundary = '----Boundary' + Date.now();
  const fileName = basename(filePath);
  const fileContent = readFileSync(filePath);

  const parts: Buffer[] = [];

  // file 字段
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: audio/mpeg\r\n\r\n`,
      'utf8'
    )
  );
  parts.push(fileContent);
  parts.push(Buffer.from('\r\n', 'utf8'));

  // model 字段
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `${model}\r\n` +
        `--${boundary}--\r\n`,
      'utf8'
    )
  );

  return {
    boundary,
    body: Buffer.concat(parts),
  };
}

export async function transcribeAudio(
  filePath: string,
  model: string = 'FunAudioLLM/SenseVoiceSmall'
): Promise<TranscribeResult> {
  if (!API_KEY) {
    throw new Error('SILICONFLOW_API_KEY is not configured');
  }

  try {
    // Verify file exists and get stats
    const stats = statSync(filePath);
    const fileName = basename(filePath);

    console.log('→ 准备文件上传...');
    console.log('  文件路径:', filePath);
    console.log('  文件名:', fileName);
    console.log('  文件大小:', stats.size, 'bytes');

    const { boundary, body } = createFormData(filePath, model);

    console.log('→ 发送请求到 SiliconFlow API...');
    console.log('  URL:', `${API_URL}/audio/transcriptions`);
    console.log('  Model:', model);
    console.log('  Body size:', body.length, 'bytes');

    const response = await fetch(`${API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    console.log('← API 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('← API 错误响应:', errorText);
      throw new Error(`SiliconFlow API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('← API 响应成功, 转录文本长度:', result.text?.length || 0);
    return result;
  } catch (error) {
    console.error('SiliconFlow API 调用失败:', error);
    throw error;
  }
}
