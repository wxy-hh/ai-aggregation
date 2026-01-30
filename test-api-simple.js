// 简单测试 SiliconFlow API
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh';
const API_URL = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const MODEL = 'FunAudioLLM/SenseVoiceSmall';
const TEST_FILE = 'apps/web/src/assets/voice/人保律师-2510291614.mp3';

// 创建 multipart/form-data
function createFormData(filePath, model) {
  const boundary = '----Boundary' + Date.now();
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  const parts = [];

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

async function test() {
  console.log('测试 SiliconFlow API\n');

  if (!fs.existsSync(TEST_FILE)) {
    console.error('文件不存在:', TEST_FILE);
    return;
  }

  const stats = fs.statSync(TEST_FILE);
  console.log('文件:', TEST_FILE);
  console.log('大小:', stats.size, 'bytes\n');

  const { boundary, body } = createFormData(TEST_FILE, MODEL);

  console.log('发送请求到:', API_URL);
  console.log('Model:', MODEL, '\n');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    console.log('状态码:', response.status);
    const text = await response.text();
    console.log('响应:', text, '\n');

    if (response.ok) {
      const result = JSON.parse(text);
      console.log('✓ 成功！');
      console.log('转录文本:', result.text);
    } else {
      console.log('✗ 失败');
    }
  } catch (error) {
    console.error('错误:', error.message);
  }
}

test();
