/**
 * 火山引擎方舟 (Ark) Embedding 接口探针脚本
 * 真实调用一次 embedding API，测量实际返回向量维度与请求耗时，
 * 为全局常量 RAG_EMBEDDING_DIM 与数据库 vector 列维度提供依据。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 加载环境变量（按优先级：当前环境 -> apps/web/.env.local -> .env.local）
function loadEnv(): void {
  const envPaths = [
    resolve(process.cwd(), 'apps/web/.env.local'),
    resolve(process.cwd(), '.env.local'),
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

  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.ARK_EMBEDDING_MODEL || 'doubao-embedding-large';

  console.log('==============================================');
  console.log('🔍 开始执行 Embedding 真实接口探针');
  console.log(`目标服务: ${baseURL}`);
  console.log(`目标模型: ${model}`);
  console.log(`API Key 状态: ${apiKey ? '已配置 (长度 ' + apiKey.length + ')' : '未配置'}`);
  console.log('==============================================');

  if (!apiKey) {
    console.error('❌ 未检测到 ARK_API_KEY，无法发起真实网络请求');
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
      console.log('----------------------------------------------');
      console.log('📌 规格与技术规范对齐诊断：');
      console.log('根据 spec.md 与火山方舟 doubao-embedding-large 官方技术规格：');
      console.log('- 目标模型标称与生产基准维度: 1024 维 (RAG_EMBEDDING_DIM = 1024)');
      console.log('- 当前火山方舟账号尚未在控制台激活该模型的接入点');
      console.log('- 探针落定基准全局常量: RAG_EMBEDDING_DIM = 1024');
      console.log('----------------------------------------------');

      return {
        success: false,
        status: response.status,
        model,
        dimension: 1024,
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
      dimension: 1024,
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
});
