/**
 * 视频提示词优化 API
 * 使用 AI 模型优化用户输入的视频描述
 */

import { NextRequest, NextResponse } from 'next/server';
import { xunfeiChat } from '@repo/providers';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { prompt, aspectRatio, duration } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 });
    }

    // 构建优化提示词的系统提示
    const systemPrompt = `你是一个专业的视频生成提示词优化专家。你的任务是将用户简单的描述转换为详细、专业的视频生成提示词。

优化规则：
1. 保留用户原始意图和核心内容
2. 添加视觉细节：光影、色彩、质感、氛围
3. 添加镜头语言：运镜方式、景别、角度
4. 添加技术参数：画质、帧率、后期效果
5. 使用专业术语但保持自然流畅
6. 控制在150字以内，简洁有力

示例：
输入："一只猫在草地上玩耍"
输出："一只毛色柔顺的橘猫在阳光明媚的草地上欢快玩耍，镜头采用跟随运动，捕捉猫咪灵动的身姿。柔和的自然光透过树叶洒下斑驳光影，草地翠绿鲜活，背景虚化突出主体。4K超清画质，电影级调色，流畅的慢动作效果展现每一个细节。"

现在请优化以下提示词，只返回优化后的结果，不要解释：`;

    const userPrompt = `原始提示词：${prompt}
${aspectRatio ? `画面比例：${aspectRatio}` : ''}
${duration ? `视频时长：${duration}秒` : ''}

优化后的提示词：`;

    // 调用讯飞 Lite 模型（免费且快速）
    const result = await xunfeiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'lite',
      temperature: 0.7,
      maxTokens: 500,
    });

    const optimizedPrompt = result.content.trim();

    return NextResponse.json({
      optimizedPrompt,
      original: prompt,
    });
  } catch (error) {
    console.error('Prompt optimization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Optimization failed' },
      { status: 500 }
    );
  }
}
