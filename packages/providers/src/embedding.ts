import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import { RAG_EMBEDDING_MODEL } from '@repo/shared';

/**
 * 支持的 Embedding 提供商标识联合类型
 * 默认使用硅基流动 (SiliconFlow)，保留火山方舟豆包供对照
 */
export type EmbeddingProviderName = 'siliconflow' | 'doubao';

interface EmbeddingProviderConfig {
  baseURL: string | (() => string);
  envKey: string;
  defaultModel: string;
}

const embeddingConfigs: Record<EmbeddingProviderName, EmbeddingProviderConfig> = {
  siliconflow: {
    baseURL: () => process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1',
    envKey: 'SILICONFLOW_API_KEY',
    defaultModel: RAG_EMBEDDING_MODEL,
  },
  doubao: {
    baseURL: () => process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    envKey: 'ARK_API_KEY',
    defaultModel: 'doubao-embedding-large',
  },
};

const embeddingModelCache = new Map<string, EmbeddingModel>();

/**
 * 创建通用 Embedding 模型实例（带缓存）
 * 返回 AI SDK 的标准 EmbeddingModel，业务层统一使用 embed / embedMany 消费
 *
 * @param providerName 提供商名称（默认 'siliconflow'）
 * @param modelId 可选的模型标识符（默认取环境变量或对应配置的 defaultModel）
 */
export function createEmbeddingModel(
  providerName: EmbeddingProviderName = 'siliconflow',
  modelId?: string
): EmbeddingModel {
  const config = embeddingConfigs[providerName];
  if (!config) {
    throw new Error(`未知的 Embedding 提供商: ${providerName}`);
  }

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    throw new Error(
      `缺少提供商 ${providerName} 的 API 密钥，请配置 ${config.envKey} 环境变量。`
    );
  }

  const envModel =
    providerName === 'siliconflow'
      ? process.env.SILICONFLOW_EMBEDDING_MODEL
      : process.env.ARK_EMBEDDING_MODEL;

  const actualModel = modelId || envModel || config.defaultModel;

  const cacheKey = `${providerName}:${actualModel}`;
  if (embeddingModelCache.has(cacheKey)) {
    return embeddingModelCache.get(cacheKey)!;
  }

  const baseURL = typeof config.baseURL === 'function' ? config.baseURL() : config.baseURL;

  const client = createOpenAI({
    baseURL,
    apiKey,
  });

  const model = client.textEmbeddingModel(actualModel);
  embeddingModelCache.set(cacheKey, model);
  return model;
}

/**
 * 仅供测试环境隔离使用：清空 Embedding 模型缓存
 */
export function _clearEmbeddingModelCacheForTest(): void {
  embeddingModelCache.clear();
}
