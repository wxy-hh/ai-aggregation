import { AIProvider, ChatCompletionOptions, ChatCompletionResponse } from './types';

export class DeepSeekProvider implements AIProvider {
  name = 'deepseek';
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    // TODO: 实现 DeepSeek API 调用
    throw new Error('Not implemented');
  }

  async *chatStream(options: ChatCompletionOptions): AsyncIterable<string> {
    // TODO: 实现流式响应
    throw new Error('Not implemented');
  }
}
