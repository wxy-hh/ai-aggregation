import { AIProvider, ChatCompletionOptions, ChatCompletionResponse } from './types';

export class ZhipuProvider implements AIProvider {
  name = 'zhipu';
  private apiKey: string;
  private baseUrl = 'https://open.bigmodel.cn/api/paas/v4';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    // TODO: 实现智谱 GLM API 调用
    throw new Error('Not implemented');
  }

  async *chatStream(options: ChatCompletionOptions): AsyncIterable<string> {
    // TODO: 实现流式响应
    throw new Error('Not implemented');
  }
}
