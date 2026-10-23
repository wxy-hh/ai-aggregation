import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import { RAG_EMBEDDING_MODEL } from '@repo/shared';

/**
 * 支持的 Embedding 提供商标识联合类型
 * 首发仅火山方舟豆包，接口预留后续扩展
 */
export type EmbeddingProviderName = 'doubao';

interface EmbeddingProviderConfig {
  baseURL: string | (() => string);
  envKey: string;
  defaultModel: string;
}

const embeddingConfigs: Record<EmbeddingProviderName, EmbeddingProviderConfig> = {
  doubao: {
    baseURL: () => process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    envKey: 'ARK_API_KEY',
    defaultModel: RAG_EMBEDDING_MODEL,
  },
};

const embeddingModelCache = new Map<string, EmbeddingModel>();

/**
 * 创建通用 Embedding 模型实例（带缓存）
 * 返回 AI SDK 的标准 EmbeddingModel，业务层统一使用 embed / embedMany 消费
 *
 * @param providerName 提供商名称（默认 'doubao'）
 * @param modelId 可选的模型标识符（默认取环境变量 ARK_EMBEDDING_MODEL 或 doubao-embedding-large）
 */
export function createEmbeddingModel(
  providerName: EmbeddingProviderName = 'doubao',
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

  const actualModel =
    modelId ||
    (providerName === 'doubao' ? process.env.ARK_EMBEDDING_MODEL : undefined) ||
    config.defaultModel;

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
