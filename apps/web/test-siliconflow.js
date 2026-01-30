// 测试 SiliconFlow API 的脚本
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

const API_KEY = 'sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh';
const API_URL = 'https://api.siliconflow.cn/v1';

async function testTranscription() {
  try {
    const filePath = '/tmp/voice-uploads/1769764319736-____-2510291614.mp3';

    console.log('测试文件:', filePath);
    console.log('文件是否存在:', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      console.error('文件不存在！');
      return;
    }

    const stats = fs.statSync(filePath);
    console.log('文件大小:', stats.size, 'bytes');

    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);

    formData.append('file', fileStream, {
      filename: '人保律师-2510291614.mp3',
      contentType: 'audio/mpeg',
      knownLength: stats.size,
    });
    formData.append('model', 'FunAudioLLM/SenseVoiceSmall');

    console.log('\n发送请求到 SiliconFlow API...');
    console.log('URL:', `${API_URL}/audio/transcriptions`);

    const response = await fetch(`${API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    console.log('\n响应状态:', response.status);
    console.log('响应头:', response.headers.raw());

    const responseText = await response.text();
    console.log('\n响应内容:', responseText);

    if (response.ok) {
      const result = JSON.parse(responseText);
      console.log('\n✓ 转录成功！');
      console.log('转录文本:', result.text);
    } else {
      console.log('\n✗ 转录失败');
    }
  } catch (error) {
    console.error('\n错误:', error);
  }
}

testTranscription();
