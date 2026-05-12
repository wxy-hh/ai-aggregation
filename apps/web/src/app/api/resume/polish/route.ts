import { PolishRequestSchema } from '@/schemas/resume-editor.schema';
import { ZodError } from 'zod';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';

/**
 * POST /api/resume/polish
 * 简历文本润色 API
 * 使用 Doubao-Seed-2.0-Pro (火山方舟 ARK) 进行智能优化
 */

export async function POST(req: Request) {
  try {
    const userId = await getOptionalUserId(req);
    const body = await req.json();

    // 使用 Zod schema 校验请求体
    const validationResult = PolishRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));

      return new Response(
        JSON.stringify({
          error: '请求参数校验失败',
          details: errors,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const {
      target,
      text,
      context,
      style = 'professional',
      language = 'zh-CN',
      privacy = { allowContactFields: false },
    } = validationResult.data;

    // 检查环境变量
    const arkApiKey = process.env.ARK_API_KEY;
    // 豆包 Responses API Base URL
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    // 使用 Lite 轻量模型（更快，成本更低）
    const arkModel = process.env.ARK_MODEL || 'doubao-seed-2.0-lite';

    if (!arkApiKey) {
      console.error('ARK_API_KEY 未配置');
      return new Response(JSON.stringify({ error: 'AI 服务配置错误' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 构建提示词
    const systemPrompt = buildSystemPrompt(style, language);
    const userPrompt = buildUserPrompt(text, context, target);

    // 调用 ARK Responses API
    const controller = new AbortController();
    // Vercel 免费版 Serverless Functions 限制 10 秒，设置 8 秒留 2 秒缓冲
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${arkBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: arkModel,
          input: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          max_output_tokens: 800, // 限制输出长度
          temperature: 0.7,
          top_p: 0.9,
          // 关键：禁用推理，直接输出结果
          reasoning: {
            effort: 'minimal', // minimal = 不思考，直接输出
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ARK API 错误:', response.status, errorText);

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: 'AI 服务暂时不可用' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await response.json();
      console.log('ARK API 完整响应:', JSON.stringify(result, null, 2));

      // 临时：写入文件以便调试
      try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(process.cwd(), 'ark-response-debug.json');
        fs.writeFileSync(logPath, JSON.stringify(result, null, 2));
        console.log('✅ 响应已保存到:', logPath);
      } catch (e) {
        console.error('写入调试文件失败:', e);
      }

      // 解析 ARK 响应
      const optimizedText = extractOptimizedText(result);
      console.log('提取的优化文本:', optimizedText);

      const highlights = extractHighlights(optimizedText, text);

      if (userId) {
        await safeRecordAiUsage({
          userId,
          feature: 'resume',
          action: 'resume-polish',
          provider: 'doubao',
          model: arkModel,
          endpoint: '/api/resume/polish',
          usage: normalizeUsage(result.usage ?? result.response?.usage),
          metadata: {
            target,
            textLength: text.length,
            style,
            language,
          },
        });
      }

      return new Response(
        JSON.stringify({
          optimizedText,
          highlights,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ error: '请求超时，请重试' }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw fetchError;
    }
  } catch (error) {
    console.error('Polish API 错误:', error);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 构建系统提示词（扩展润色版：丰富内容细节）
 */
function buildSystemPrompt(style: string, language: string): string {
  return `你是简历优化助手。根据用户的简短描述，扩展并丰富内容，补充合理的细节。

重要：直接输出优化后的文本，不要输出思考过程、不要解释、不要分析。

输出格式要求：
- 必须使用列表格式（1. 2. 3.）呈现内容
- 每个要点独立成行，条理清晰
- 每条内容要凝练简洁，一句话说清一个技能点
- 可以根据内容拆分或合并条目，不必与原文条数一致
- 如果原文内容较少，可以适当扩展为多条；如果原文冗长，可以精简合并

优化策略:
1. 凝练表达：每条控制在 20-40 字，突出核心能力
2. 拆分技能：将复杂技能拆分为多个独立要点
3. 补充细节：添加具体的技术栈、工具、场景
4. 量化成果：补充合理的数据（如项目数量、覆盖场景等）
5. 动词开头：使用"掌握"、"熟练运用"、"精通"等专业动词
6. 保持真实：不夸大，补充的内容要合理可信
7. ${style === 'professional' ? '专业正式' : '简洁清晰'}风格

示例 1（拆分扩展）：
输入：熟悉 Vue.js 与 React.js 两大前端框架
输出：
1. 熟练掌握 Vue.js 框架，精通 Vue Router、Pinia/Vuex 状态管理
2. 熟练掌握 React.js 及 Hooks 开发模式
3. 熟悉 React Router、Redux Toolkit 等生态工具
4. 结合 Ant Design、Material UI 完成企业级项目开发
5. 参与过大型数据可视化平台与后台管理系统开发

示例 2（精简合并）：
输入：会用 vue，做过一些项目，用过 vue-router 和 vuex，还用过 element-ui 组件库，做过后台管理系统
输出：
1. 掌握 Vue.js 全家桶（Vue Router、Vuex）
2. 熟悉 Element UI 组件库，完成过后台管理系统开发
3. 可独立完成中小型前端项目

示例 3（技能拆分）：
输入：做过后端开发，用过 Node.js 和数据库
输出：
1. 具备 Node.js 后端开发经验
2. 熟悉 Express/Koa 框架，完成过 RESTful API 设计
3. 掌握 MySQL/MongoDB 数据库设计与优化
4. 了解后端业务逻辑开发与接口联调`;
}

/**
 * 构建用户提示词（扩展润色版）
 */
function buildUserPrompt(
  text: string,
  context?: { position?: string; industry?: string; company?: string },
  target?: string
): string {
  let prompt = `请扩展并优化以下简历内容，补充合理的细节和具体技术栈，直接输出结果：\n\n${text}`;

  if (context) {
    const parts: string[] = [];
    if (context.position) parts.push(context.position);
    if (context.industry) parts.push(context.industry);
    if (context.company) parts.push(context.company);
    if (parts.length > 0) {
      prompt += `\n\n参考背景：${parts.join('，')}`;
    }
  }

  return prompt;
}

/**
 * 从 ARK 响应中提取优化后的文本
 * 支持 /responses 端点格式
 */
function extractOptimizedText(result: any): string {
  console.log('🔍 开始解析 ARK 响应');
  console.log('📦 响应顶层键:', Object.keys(result));

  // Responses API 格式: output 是数组
  if (Array.isArray(result.output)) {
    console.log('✓ output 是数组，长度:', result.output.length);

    // 查找 type='message' 的元素（这是最终答案）
    for (let i = 0; i < result.output.length; i++) {
      const outputItem = result.output[i];
      console.log(`📦 output[${i}] 的 type:`, outputItem.type);

      // 处理 message 类型（最终答案）
      if (outputItem.type === 'message') {
        console.log(`✅ 找到 message 类型的输出`);

        // 检查 content 数组
        if (Array.isArray(outputItem.content)) {
          console.log(`✓ output[${i}].content 是数组，长度:`, outputItem.content.length);
          for (let j = 0; j < outputItem.content.length; j++) {
            const contentItem = outputItem.content[j];
            console.log(`📦 output[${i}].content[${j}] 的 type:`, contentItem.type);

            // 查找 text 类型的内容
            if (contentItem.type === 'text' && contentItem.text) {
              console.log(`✅ 成功：使用 output[${i}].content[${j}].text 路径`);
              return contentItem.text.trim();
            }

            // 兼容其他可能的字段名
            if (contentItem.text) {
              console.log(`✅ 成功：使用 output[${i}].content[${j}].text 路径（无 type 检查）`);
              return contentItem.text.trim();
            }
          }
        }

        // 检查直接的 text 字段
        if (outputItem.text) {
          console.log(`✅ 成功：使用 output[${i}].text 路径`);
          return outputItem.text.trim();
        }
      }
    }

    // 如果没有找到 message 类型，再处理其他类型
    for (let i = 0; i < result.output.length; i++) {
      const outputItem = result.output[i];

      // 跳过 reasoning 类型（推理过程，不是最终答案）
      if (outputItem.type === 'reasoning') {
        console.log(`⏭️  跳过 output[${i}]（类型为 reasoning，这是推理过程）`);
        continue;
      }

      // 跳过 summary 类型的元素
      if (outputItem.type === 'summary') {
        console.log(`⏭️  跳过 output[${i}]（类型为 summary）`);
        continue;
      }

      // 跳过 system 角色的元素
      if (outputItem.role === 'system') {
        console.log(`⏭️  跳过 output[${i}]（角色为 system）`);
        continue;
      }

      // 检查 content 数组
      if (Array.isArray(outputItem.content)) {
        console.log(`✓ output[${i}].content 是数组，长度:`, outputItem.content.length);
        for (let j = 0; j < outputItem.content.length; j++) {
          const contentItem = outputItem.content[j];
          console.log(`📦 output[${i}].content[${j}] 的 type:`, contentItem.type);

          // 查找 text 类型的内容
          if (contentItem.type === 'text' && contentItem.text) {
            console.log(`✅ 成功：使用 output[${i}].content[${j}].text 路径`);
            return contentItem.text.trim();
          }

          // 兼容其他可能的字段名
          if (contentItem.text) {
            console.log(`✅ 成功：使用 output[${i}].content[${j}].text 路径（无 type 检查）`);
            return contentItem.text.trim();
          }
        }
      }

      // 检查直接的 text 字段
      if (outputItem.text) {
        console.log(`✅ 成功：使用 output[${i}].text 路径`);
        return outputItem.text.trim();
      }
    }
  }

  // 格式 3: output 是对象
  if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
    console.log('✓ output 是对象，键:', Object.keys(result.output));
    if (result.output.text) {
      console.log('✅ 成功：使用 output.text 路径');
      return result.output.text.trim();
    }
  }

  // 格式 4: 直接是字符串
  if (typeof result === 'string') {
    console.log('✅ 成功：结果本身是字符串');
    return result.trim();
  }

  // 兜底：打印完整结构
  console.error('❌ 失败：未知的 ARK 响应格式');
  console.error('完整响应（前 1000 字符）:', JSON.stringify(result).substring(0, 1000));

  // 如果响应未完成，给出更友好的错误提示
  if (result.status === 'incomplete') {
    return '[响应未完成] 模型输出被截断，请尝试缩短输入文本或稍后重试';
  }

  return '[解析失败] 无法从响应中提取文本内容';
}

/**
 * 提取优化亮点
 */
function extractHighlights(optimizedText: string, originalText: string): string[] {
  const highlights: string[] = [];

  // 检测是否添加了量化数据
  const hasNumbers = /\d+%|\d+[万千百十]|\d+[个项次]/.test(optimizedText);
  const originalHasNumbers = /\d+%|\d+[万千百十]|\d+[个项次]/.test(originalText);
  if (hasNumbers && !originalHasNumbers) {
    highlights.push('补充量化成果');
  }

  // 检测是否使用了动作动词
  const actionVerbs = ['主导', '推动', '优化', '设计', '实现', '提升', '降低', '负责', '完成'];
  const hasActionVerb = actionVerbs.some((verb) => optimizedText.startsWith(verb));
  const originalHasActionVerb = actionVerbs.some((verb) => originalText.startsWith(verb));
  if (hasActionVerb && !originalHasActionVerb) {
    highlights.push('强化动作表达');
  }

  // 检测长度变化
  if (optimizedText.length > originalText.length * 1.2) {
    highlights.push('补充细节描述');
  }

  // 检测业务价值关键词
  const businessKeywords = ['业务', '用户', '效率', '成本', '收入', '体验', '质量'];
  const hasBusinessKeyword = businessKeywords.some((kw) => optimizedText.includes(kw));
  const originalHasBusinessKeyword = businessKeywords.some((kw) => originalText.includes(kw));
  if (hasBusinessKeyword && !originalHasBusinessKeyword) {
    highlights.push('强化业务价值表达');
  }

  return highlights.length > 0 ? highlights : ['优化表达方式'];
}
