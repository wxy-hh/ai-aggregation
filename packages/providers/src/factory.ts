import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';

export type ProviderName = 'zhipu' | 'deepseek' | 'dashscope' | 'xunfei';

const providerConfigs: Record<ProviderName, { baseURL: string; envKey: string }> = {
    zhipu: {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
        envKey: 'ZHIPU_API_KEY',
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com',
        envKey: 'DEEPSEEK_API_KEY',
    },
    dashscope: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        envKey: 'DASHSCOPE_API_KEY',
    },
    xunfei: {
        baseURL: 'https://spark-api-open.xf-yun.com/v1',
        envKey: 'XUNFEI_API_PASSWORD',
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
        case 'zhipu':
            return 'glm-4-flash'; // 免费模型
        case 'deepseek':
            return 'deepseek-chat';
        case 'dashscope':
            return 'qwen-turbo';
        case 'xunfei':
            return 'lite'; // 讯飞星火 Lite 免费模型
        default:
            return 'glm-4-flash';
    }
}
