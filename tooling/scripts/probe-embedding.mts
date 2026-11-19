/**
 * 硅基流动 (SiliconFlow) Embedding 接口探针脚本
 * 真实调用一次 embedding API (BAAI/bge-m3)，测量实际返回向量维度与请求耗时，
 * 为全局常量 RAG_EMBEDDING_DIM 与数据库 vector 列维度提供依据。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 加载环境变量（按优先级：当前环境 -> apps/web/.env.local -> .env.local -> apps/worker/.env）
function loadEnv(): void {
  const envPaths = [
    resolve(process.cwd(), 'apps/web/.env.local'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), 'apps/worker/.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function runProbe() {
  loadEnv();

  const apiKey = process.env.SILICONFLOW_API_KEY;
  const baseURL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';
  const model = process.env.SILICONFLOW_EMBEDDING_MODEL || 'BAAI/bge-m3';

  console.log('==============================================');
  console.log('🔍 开始执行 Embedding 真实接口探针 (SiliconFlow)');
  console.log(`目标服务: ${baseURL}`);
  console.log(`目标模型: ${model}`);
  console.log(`API Key 状态: ${apiKey ? '已配置 (长度 ' + apiKey.length + ')' : '未配置'}`);
  console.log('==============================================');

  if (!apiKey) {
    console.error('❌ 未检测到 SILICONFLOW_API_KEY，无法发起真实网络请求');
    process.exit(1);
  }

  const testText = 'AI 聚合平台智能体知识库向量化检索测试样本';
  const requestBody = {
    model,
    input: [testText],
  };

  const startTime = Date.now();
  try {
    const response = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const elapsedMs = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      console.warn(`⚠️ 真实 API 调用返回 HTTP ${response.status} (${elapsedMs}ms)`);
      console.warn(`响应详情: ${responseText}`);

      return {
        success: false,
        status: response.status,
        model,
        dimension: 0,
        elapsedMs,
        error: responseText,
      };
    }

    const data = JSON.parse(responseText);
    const embedding = data?.data?.[0]?.embedding;
    const dimension = Array.isArray(embedding) ? embedding.length : 0;

    console.log('✅ 真实 API 探测成功！');
    console.log(`实测维度: ${dimension}`);
    console.log(`调用耗时: ${elapsedMs}ms`);
    console.log(`样例分量 (前5维): [${embedding.slice(0, 5).map((n: number) => n.toFixed(6)).join(', ')}]`);
    console.log(`建议常量: RAG_EMBEDDING_DIM = ${dimension}`);

    return {
      success: true,
      status: 200,
      model,
      dimension,
      elapsedMs,
      sample: embedding.slice(0, 5),
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error(`❌ 网络请求失败 (${elapsedMs}ms):`, (error as Error).message);
    return {
      success: false,
      status: 0,
      model,
      dimension: 0,
      elapsedMs,
      error: (error as Error).message,
    };
  }
}

// 供 CLI 直接执行
runProbe().then((res) => {
  console.log('探针执行结果摘要:', JSON.stringify({
    model: res.model,
    dimension: res.dimension,
    elapsedMs: res.elapsedMs,
    success: res.success,
  }));
  if (res.dimension !== 1024) {
    console.error(`❌ 严重警告：实测维度 ${res.dimension} 不等于 1024！`);
    process.exit(1);
  }
});
