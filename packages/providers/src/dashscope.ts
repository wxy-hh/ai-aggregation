import { AIProvider, ChatCompletionOptions, ChatCompletionResponse } from './types';

export class DashScopeProvider implements AIProvider {
  name = 'dashscope';
  private apiKey: string;
  private baseUrl = 'https://dashscope.aliyuncs.com/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    // TODO: 实现通义千问 API 调用
    throw new Error('Not implemented');
  }

  async *chatStream(options: ChatCompletionOptions): AsyncIterable<string> {
    // TODO: 实现流式响应
    throw new Error('Not implemented');
  }
}
