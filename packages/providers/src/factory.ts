import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';

export type ProviderName = 'xunfei' | 'doubao';

const providerConfigs: Record<ProviderName, { baseURL: string; envKey: string }> = {
  xunfei: {
    baseURL: 'https://spark-api-open.xf-yun.com/v1',
    envKey: 'XUNFEI_API_PASSWORD',
  },
  doubao: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    envKey: 'ARK_API_KEY',
  },
};

const providerCache = new Map<string, OpenAIProvider>();

/**
 * 创建 AI Provider 实例（带缓存）
 * 所有 provider 均使用 OpenAI 兼容接口
 */
export function createProvider(name: ProviderName): OpenAIProvider {
  if (providerCache.has(name)) {
    return providerCache.get(name)!;
  }

  const config = providerConfigs[name];
  if (!config) {
    throw new Error(`Unknown provider: ${name}`);
  }

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${name}. Please set ${config.envKey} environment variable.`
    );
  }

  const provider = createOpenAI({
    baseURL: config.baseURL,
    apiKey,
  });

  providerCache.set(name, provider);
  return provider;
}

/**
 * 获取默认模型名称
 */
export function getDefaultModel(providerName: ProviderName): string {
  switch (providerName) {
    case 'xunfei':
      return 'lite'; // 讯飞星火 Lite 免费模型
    case 'doubao':
      return 'doubao-seed-2-0-lite-260215'; // 豆包轻量级模型
    default:
      return 'lite';
  }
}
