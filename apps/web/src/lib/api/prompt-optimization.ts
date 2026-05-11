import { authFetch } from './client';

/**
 * 提示词优化 API
 * 使用 AI 模型优化用户输入的视频描述提示词
 */

export interface OptimizePromptOptions {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
}

export interface OptimizePromptResult {
  optimizedPrompt: string;
  suggestions?: string[];
}

/**
 * 优化视频生成提示词
 * 使用 AI 模型分析用户输入，生成更详细、更专业的提示词
 */
export async function optimizePrompt(
  options: OptimizePromptOptions
): Promise<OptimizePromptResult> {
  const { prompt, aspectRatio, duration } = options;

  try {
    const response = await authFetch('/api/video/optimize-prompt', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        aspectRatio,
        duration,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Prompt optimization failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Prompt optimization error:', error);
    throw error;
  }
}
