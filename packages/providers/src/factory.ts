import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';

export type ProviderName = 'xunfei' | 'doubao' | 'deepseek';

const providerConfigs: Record<
  ProviderName,
  { baseURL: string | (() => string); envKey: string }
> = {
  xunfei: {
    baseURL: 'https://spark-api-open.xf-yun.com/v1',
    envKey: 'XUNFEI_API_PASSWORD',
  },
  doubao: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    envKey: 'ARK_API_KEY',
  },
  deepseek: {
    baseURL: () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_MODEL',
  },
};

const providerCache = new Map<string, OpenAIProvider>();

/**
 * doubao 自定义 fetch：兼容 Ark 与 OpenAI 的两处协议差异。
 * 1) 剥除 SDK 自动附加的 OpenAI 专属 include 值：
 *    tools 含 webSearch 时 @ai-sdk/openai 会自动给 /responses 请求体加
 *    include:["web_search_call.action.sources"]（OpenAI 专属枚举），Ark 不识别直接 400。
 *    只剥该值（其它 include 取值原样保留，避免误伤未来合法用法）。
 * 2) 给缺 type 的 message 输入项补 type:"message"：
 *    SDK 生成的历史消息项本就不带 type（OpenAI 宽松接受），Ark 对缺 type 的
 *    assistant 项直接 400（missing input.type，四期①真机验收实测；user 项可豁免）。
 *    只补「有 role 且无 type」的项，已有 type 的项（function_call_output 等）原样保留。
 * 仅处理 POST /responses 且 body 为 JSON 字符串的请求，其余原样透传。
 */
const doubaoFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (
    init?.method?.toUpperCase() === 'POST' &&
    url.includes('/responses') &&
    typeof init.body === 'string'
  ) {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      let changed = false;
      if (Array.isArray(body.include)) {
        const kept = body.include.filter((v) => v !== 'web_search_call.action.sources');
        if (kept.length !== body.include.length) {
          if (kept.length === 0) delete body.include;
          else body.include = kept;
          changed = true;
        }
      }
      if (Array.isArray(body.input)) {
        for (const item of body.input as Record<string, unknown>[]) {
          if (item && typeof item === 'object' && item.role && !item.type) {
            item.type = 'message';
            changed = true;
          }
        }
      }
      if (changed) {
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // body 非 JSON：原样透传
    }
  }
  return fetch(input, init);
};

/**
 * deepseek 自定义 fetch：
 * 捕获 x-deepseek-thinking 请求头并注入官方 thinking 参数，随后清理该内部请求头。
 */
const deepseekFetch: typeof fetch = async (input, init) => {
  let finalInit = init;
  if (
    init?.method?.toUpperCase() === 'POST' &&
    typeof init.body === 'string'
  ) {
    try {
      const headers = new Headers(init.headers);
      const thinkingHeader = headers.get('x-deepseek-thinking');
      if (thinkingHeader) {
        headers.delete('x-deepseek-thinking');
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (thinkingHeader === 'enabled') {
          body.thinking = { type: 'enabled' };
        } else if (thinkingHeader === 'disabled') {
          body.thinking = { type: 'disabled' };
        }
        finalInit = {
          ...init,
          headers,
          body: JSON.stringify(body),
        };
      }
    } catch {
      // body 非 JSON：原样透传
    }
  }
  return fetch(input, finalInit);
};

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

  const apiKey =
    process.env[config.envKey] ||
    (name === 'deepseek' ? process.env.DEEPSEEK_API_KEY : undefined);
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${name}. Please set ${config.envKey} environment variable.`
    );
  }

  const baseURL = typeof config.baseURL === 'function' ? config.baseURL() : config.baseURL;

  const rawProvider = createOpenAI({
    baseURL,
    apiKey,
    ...(name === 'doubao' ? { fetch: doubaoFetch } : {}),
    ...(name === 'deepseek' ? { fetch: deepseekFetch } : {}),
  });

  // DeepSeek 官方为标准 Chat Completions API（不支持 /responses 端点）
  // 将 callable 默认代理至 rawProvider.chat，保证 provider(model) 调用直接命中 /chat/completions
  const provider: OpenAIProvider =
    name === 'deepseek'
      ? (Object.assign(
          (modelId: string) => rawProvider.chat(modelId),
          rawProvider
        ) as OpenAIProvider)
      : rawProvider;

  providerCache.set(name, provider);
  return provider;
}

/** 仅供单测隔离使用：清空 Provider 单例缓存 */
export function _clearProviderCacheForTest(): void {
  providerCache.clear();
}

/**
 * 获取默认模型名称
 */
export function getDefaultModel(providerName: ProviderName): string {
  switch (providerName) {
    case 'xunfei':
      return 'lite'; // 讯飞星火 Lite 免费模型
    case 'doubao':
      return 'doubao-seed-evolving'; // 豆包最新模型
    case 'deepseek':
      return 'deepseek-flash'; // DeepSeek 最新高性价比模型
    default:
      return 'lite';
  }
}
